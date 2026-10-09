# How Streams Are Derived From the Career List

This explains how the Stream recommendation (`/streams`) uses the student's Career recommendations. It covers the data, the loading step and the scoring step, and it ends with a worked example.

## 1. The idea in one paragraph

A stream is not scored from careers alone. It starts with the student's RIASEC profile, segment and marks. On top of that, each stream gets a **career alignment** score. Alignment is high when the student's top-ranked careers are careers that stream leads to. The link between the two is a hand-reviewed mapping table, `knowledge.career_streams`. It says, for each career, which streams a student would need to take to reach it.

```
Career recommendation run (stored)
        │  ranked career ids, best first
        ▼
knowledge.career_streams  ── career ↔ stream links with weight 0–1
        │
        ▼
loadStreams()  ── builds candidate streams (RIASEC-pair ∪ career-linked)
        │
        ▼
scoreStreams() ── fitScore = RIASEC + careerAlignment + segment + marks + priority
        │
        ▼
Ranked streams
```

Everything downstream is deterministic TypeScript. No LLM runs at request time. Gemini is used only once, offline, to draft the mapping table, and a person reviews that draft (see §6).

## 2. The data: `knowledge.career_streams`

Migration: [20260921000100_knowledge_career_streams.sql](../supabase/migrations/20260921000100_knowledge_career_streams.sql)

| Column | Meaning |
| --- | --- |
| `career_id` | FK to `knowledge.careers` |
| `stream_option_id` | FK to `knowledge.stream_options` |
| `relationship_type` | `primary` (the standard stream for the career), `alternative` (a less obvious but valid route) or `cross_disciplinary` (an unconventional but real path) |
| `weight` | 0–1 strength of the link. It is used directly as a scoring multiplier. |
| `source` | Provenance, for example `gemini_drafted` or `curated` |
| `display_order` | Tiebreak for display |

The primary key is `(career_id, stream_option_id)`. One career can link to several streams, and one stream can serve many careers.

Current coverage, as of the 2026-09-23 fill: 1,319 links across 447 of 923 careers. That includes all 229 careers that can ever appear in a student's top-18. The remaining careers can never be recommended today, so they were left unlinked on purpose.

## 3. Step 1 — Get the student's ranked careers

In [recommendation-routes.ts](../packages/recommendations/src/http/recommendation-routes.ts) (the `/streams` handler):

```ts
const rankedCareerIds =
  body.rankedCareerIds ??
  (await dataSource.loadLatestRankedEntityIds(profile.profileSnapshotId, "career"));
```

- `loadLatestRankedEntityIds` reads the **most recent completed** Career run for that profile snapshot. It orders the rows by `rank asc`, so index 0 is the best match.
- It never recomputes careers on the fly. Stream is a cheap read of stored results. The `/pathways` route does the same thing.
- The Career run itself keeps only the **top 18** careers (`scoredCareers.slice(0, 18)` in `career-matching.ts`). So `rankedCareerIds` has at most 18 entries.
- If the student has never had Career recommendations computed, the list is empty. The next steps then behave exactly as they did before this feature existed (see §5).

## 4. Step 2 — Build candidate streams (`loadStreams`)

In [recommendation-data-source.ts](../packages/recommendations/src/application/recommendation-data-source.ts), `loadStreams(profile, limit, rankedCareerIds)` builds a set of candidates in two parts. **The second part only adds candidates. It never removes any.**

**Part A — RIASEC-pair candidates (the original path).**
It looks up the published `stream_maps` row for the student's top-two RIASEC code (and segment). Those rows produce the base candidate streams.

**Part B — career-linked candidates (skipped when `rankedCareerIds` is empty).**

```sql
select stream.id, stream.title, stream.description, link.career_id, link.weight
from knowledge.career_streams link
join knowledge.stream_options stream on stream.id = link.stream_option_id
where stream.status = 'active'
  and link.career_id = any($1::uuid[])   -- the student's ranked careers
```

Each returned row is handled in one of two ways:

- **The stream is already a Part A candidate.** The row's `{careerId, weight}` is appended to that stream's `careerLinks`.
- **The stream is not in Part A.** A new candidate is created from it. It has `riasecLetters: []` (it has no RIASEC map of its own) and all segments allowed. Its `priority` is 100, so it sorts last on ties. Its `careerLinks` holds the link. This is how a stream can appear even though the student's RIASEC pair does not point to it, for example Commerce for a student whose top careers are finance roles.

The result is that every candidate stream carries the list of ranked careers that lead to it.

## 5. Step 3 — Score (`scoreStreams`)

In [stream-recommendations.ts](../packages/recommendations/src/domain/stream-recommendations.ts).

### 5.1 Career alignment (`careerStreamAlignment`)

Careers are weighted by rank with the same `1/(rank+1)` shape used elsewhere. Rank 0 counts 1, rank 1 counts ½, rank 2 counts ⅓, and so on.

```
totalWeight   = Σ over all ranked careers   1 / (index + 1)
matchedWeight = Σ over this stream's linked careers that the student ranked
                    link.weight × 1 / (rank + 1)
careerAlignment = matchedWeight / totalWeight        (0–1)
```

- A stream scores high when it is linked to the student's **top** careers and the links are strong.
- A link to a career the student did not rank contributes nothing.
- It returns 0 when there are no ranked careers or the stream has no links. The stream's explanation then omits `careerAlignment`.

### 5.2 Final `fitScore`

```ts
fitScore = careerAlignment > 0
  ? riasecOverlap*0.30 + careerAlignment*0.35 + segmentFit*0.20 + marksFit*0.10 + priorityFit*0.05
  : riasecOverlap*0.55 + segmentFit*0.25 + marksFit*0.15 + priorityFit*0.05
```

| Factor | How it is computed |
| --- | --- |
| `riasecOverlap` | Share of the student's top-3 RIASEC letters that appear in the stream's letters |
| `segmentFit` | 1 if the stream recommends the student's segment (explorer/pathfinder/launcher), else 0 |
| `marksFit` | 1 if the student's marks band is in the stream's bands, 0 if not, 0.5 when either side is unknown |
| `priorityFit` | `1 / (priority + 1)` |
| `careerAlignment` | §5.1 |

**Weights move only when a career signal exists for that specific stream.** With no signal, the formula is the original one, unchanged. With `careerAlignment > 0`, the weight given to RIASEC drops from 0.55 to 0.30 and 0.35 goes to career alignment.

Ties are broken by fitScore, then lower `priority`, then title, then id. Ranks are assigned after sorting.

The explanation returned to the client includes `careerAlignment` and `matchedCareerIds` (only when `careerAlignment > 0`), so the response records which careers drove a stream's score.

## 6. How the mapping table gets filled (offline)

The table was not written by hand. A pipeline drafts it, a person reviews it, and then it is promoted:

1. **Draft** with `pnpm ai-catalog:generate --target career_streams`.
   - For each career, Gemini is given the career and the list of valid streams.
   - It proposes up to 3 links, each with a `relationshipType` and a `weight`.
   - Streams are matched by code, so the model cannot invent a stream.
   - Drafts go to the staging tables `ai_generation_runs` and `ai_generation_items`, not to the live table.
   - Calls are paced, and 429/503 responses are retried with backoff.
2. **Review** with `pnpm ai-catalog:review`. `--approve-all` bulk-approves the items, except any flagged as duplicates of an existing row.
3. **Promote** with `pnpm ai-catalog:promote --all`. This writes approved items into `knowledge.career_streams` with `source = 'gemini_drafted'`.

Per [AGENTS.md](../AGENTS.md), the hosted database changes only through migrations in `supabase/migrations`. Promoting is a data load into an existing table.

## 7. Worked example

The student's ranked careers, best first: `[Chartered Accountant, Financial Analyst, Data Analyst]`.
`totalWeight = 1 + 1/2 + 1/3 = 1.833`.

The **Commerce** stream has these links:
- Chartered Accountant, weight 0.9 (student rank 0)
- Data Analyst, weight 0.6 (student rank 2)

```
matchedWeight   = 0.9×1 + 0.6×(1/3) = 1.10
careerAlignment = 1.10 / 1.833      = 0.60
```

Assume the student's top-3 RIASEC letters include 2 of the stream's letters (`riasecOverlap ≈ 0.67`), the segment matches, marks match and priority is 1 (`priorityFit = 0.5`):

```
fitScore = 0.67×0.30 + 0.60×0.35 + 1×0.20 + 1×0.10 + 0.5×0.05 ≈ 0.74
```

If a stream had no link to any of the student's careers, `careerAlignment` would be 0 and the original formula would apply.

## 8. Things to know

- **The two formulas are not directly comparable.** A stream with a weak career link (say `careerAlignment` about 0.1) is scored by the career formula, which can give it a lower `fitScore` than an identical stream with no link at all. This is because RIASEC's weight drops from 0.55 to 0.30. It is the current design. If that ordering ever looks wrong, this is the place to look.
- **The weights are constants in code**, not database config. This is the same for the other recommendation stages.
- **A stream reached only through careers** has no RIASEC letters and priority 100, so it scores on career alignment, segment, marks and priority only.
- **Coverage limit:** about 476 long-tail careers have no stream link. They cannot currently appear in any student's top 18, so this has no effect today. If Career scoring changes to reach them, they will need links.
- **Downstream:** the ranked streams are what the Pathway step reads (`rankedStreamIds`, through `knowledge.stream_pathways`). Part 2 below covers how pathways are then scored.

## 9. Where to look in the code

| Concern | File |
| --- | --- |
| Table definition | `supabase/migrations/20260921000100_knowledge_career_streams.sql` |
| Route: resolve stored career ranking | `packages/recommendations/src/http/recommendation-routes.ts` |
| Candidate loading (SQL + union) | `packages/recommendations/src/application/recommendation-data-source.ts` (`loadStreams`) |
| Scoring | `packages/recommendations/src/domain/stream-recommendations.ts` |
| Contracts (`careerLinks`, `careerAlignment`) | `packages/contracts/src/catalog.ts`, `recommendations.ts` |
| Gemini drafting | `packages/knowledge/src/infrastructure/gemini-catalog-drafter.ts` (`draftCareerStreams`) |
| Draft / review / promote CLIs | `scripts/ingest/generate-ai-catalog-drafts.ts`, `review-ai-catalog.ts`, `promote-ai-catalog.ts` |

---

# Part 2 — How Pathways Are Suggested

Part 1 covered Career → Stream. This part covers the next stage, `/pathways`. The pathway ranking uses **both** the student's ranked careers and their ranked streams, so it sits downstream of everything above.

```
Stored Career run ──► rankedCareerIds ──┐
                                        ├──► scorePathways() ──► top 18 ──► 3 rings (inner 4 / middle 6 / outer 6)
Stored Stream run ──► rankedStreamIds ──┘        ▲
                                                 │
        knowledge.pathways + career_pathways + stream_pathways + college programs
```

Like Streams, this is deterministic TypeScript. There is no LLM at request time.

## 10. The data

A pathway is a row in `knowledge.pathways`, for example "B.Com in Commerce & Accounting". Two junction tables link it to the earlier stages.

| Table | Links | Notes |
| --- | --- | --- |
| `knowledge.career_pathways` | career → pathway | Existing table. It has no weight, so a link is either there or not. |
| `knowledge.stream_pathways` | stream → pathway | Migration [20260921000200_knowledge_stream_pathways.sql](../supabase/migrations/20260921000200_knowledge_stream_pathways.sql). It has `relationship_type` and `weight`, like `career_streams`. |

Coverage: `stream_pathways` had 108 links covering all 27 active streams when it was seeded on 2026-09-21. Gemini drafted them and a person reviewed them, using the same draft / review / promote pipeline as §6 (`--target stream_pathways`). It has a `no_pathway_for_stream` gap check.

## 11. Step 1 — Get the two ranked lists

In the `/pathways` handler in [recommendation-routes.ts](../packages/recommendations/src/http/recommendation-routes.ts):

```ts
rankedCareerIds: body.rankedCareerIds ?? await loadLatestRankedEntityIds(profileSnapshotId, "career"),
rankedStreamIds: body.rankedStreamIds ?? await loadLatestRankedEntityIds(profileSnapshotId, "stream"),
```

Both come from the student's **most recent completed run** of that kind, ordered best first. Nothing is recomputed. If the student has never opened Stream, `rankedStreamIds` is empty and stream alignment is 0 for every pathway.

## 12. Step 2 — Load the pathway catalogue (`loadPathways`)

In [recommendation-data-source.ts](../packages/recommendations/src/application/recommendation-data-source.ts). It loads **every published pathway** with no cap, so no pathway is hidden by an alphabetical cutoff before scoring. One query returns each pathway with:

- `careerIds`: aggregated from `career_pathways`
- `streamOptionIds`: aggregated from `stream_pathways`
- `reachability`: derived from the education route level:

| Route level | Reachability |
| --- | --- |
| `degree`, `school_stream` | 1.0 |
| `diploma`, `iti`, `certificate`, `open` | 0.65 |
| anything else | 0.5 |

- `hasBackupRoute`: true when the pathway has a backup-route note
- `collegeCount`: the number of Tamil Nadu colleges whose programmes match the pathway's discipline **and** its own qualification. That qualification is parsed from the title, so "B.E./B.Tech. in Visual Communication" and "B.Sc in Visual Communication" no longer share one count.

A pathway with no career links or no stream links gets a placeholder id (`00000000-0000-4000-8000-000000000000`) in that list. This keeps "no links exist" from looking the same as "the links exist but the student matched none".

## 13. Step 3 — Score (`scorePathways`)

In [pathway-recommendations.ts](../packages/recommendations/src/domain/pathway-recommendations.ts).

### 13.1 The formula

```
fitScore = careerAlignment       × 0.40
         + streamAlignment       × 0.30
         + collegeAvailability   × 0.15
         + segmentFit            × 0.06
         + marksFit              × 0.04
         + reachability          × 0.045
         + backupRouteFit        × 0.005          (weights sum to 1.0)
```

The weights are named constants in code, not database config. The formula is version 2 (`schemaVersion: 2` in the explanation).

| Factor | How it is computed |
| --- | --- |
| `careerAlignment` | Rank-weighted overlap between the student's ranked careers and the pathway's `careerIds` |
| `streamAlignment` | The same calculation against the student's ranked streams and the pathway's `streamOptionIds` |
| `collegeAvailability` | `min( ln(collegeCount+1) / ln(1501), 1 )`. It is log-scaled because counts run from 1 to about 1,287 and are heavily skewed. |
| `segmentFit` | 1 if the pathway recommends the student's segment, else 0 |
| `marksFit` | 1 if the marks band matches, 0 if not, 0.5 when either side is unknown |
| `reachability` | See the table in §12 |
| `backupRouteFit` | 1 if the pathway has a backup route, else 0 |

### 13.2 Alignment (`rankedAlignment`)

```
totalWeight   = Σ over ranked ids                              1 / (index + 1)
matchedWeight = Σ over ranked ids the pathway is linked to     1 / (rank + 1)
alignment     = matchedWeight / totalWeight
```

This is the same rank-weighted shape as Stream's career alignment, with one difference. **Pathway alignment ignores the link's `weight`** and counts only whether a link exists. A link to the student's top career or top stream counts most, and a link further down counts less. The `weight` column in `stream_pathways` is stored but not used in scoring today.

### 13.3 Ordering

Sort by `fitScore` descending. Ties go to higher `reachability`, then lower `priority`, then title, then id. Ranks are assigned after sorting.

## 14. Step 4 — Pick the shortlist and rings (`partitionPathwayRings`)

The catalogue has about 158 pathways, and the student is shown only 16. The top 18 by `fitScore` are the candidates. Those candidates are split into three rings, filled in this order:

| Ring | Size | Who qualifies |
| --- | --- | --- |
| **inner** | 4 | Pathways linked to one of the student's ranked careers **or** ranked streams. This is the strongest "suits you" signal. |
| **middle** | 6 | Widely available pathways (`collegeAvailability >= 0.5`) not already in inner. This is the "safe, easy to find" tier. |
| **outer** | 6 | Filled from the remaining top-scored candidates. |

If a ring has too few qualifying pathways, it is topped up from the remaining candidates, so all three rings are always full. A student with no career or stream matches therefore still gets 16 pathways, and none of them are in the inner ring for a real reason.

The response includes the flat ranked list, the `rings` object, and an explanation for each pathway with `matchedCareerIds` and `matchedStreamOptionIds`.

## 15. Worked example

The student's ranked careers are `[Chartered Accountant, Financial Analyst, Data Analyst]`, so `totalWeight = 1.833`. Their ranked streams are `[Commerce, Arts]`, so `totalWeight = 1.5`.

The pathway **B.Com in Commerce & Accounting**:
- is linked to Chartered Accountant, the student's rank 0 career
- is linked to the Commerce stream, the student's rank 0 stream
- is a degree route (`reachability = 1`) with a backup route
- has 136 matching colleges
- matches the student's segment, and has no marks-band data (`marksFit = 0.5`)

```
careerAlignment     = 1/1.833                  = 0.545
streamAlignment     = 1/1.5                    = 0.667
collegeAvailability = ln(137)/ln(1501)         = 0.673

fitScore = 0.545×0.40 + 0.667×0.30 + 0.673×0.15 + 1×0.06 + 0.5×0.04 + 1×0.045 + 1×0.005
         = 0.218 + 0.200 + 0.101 + 0.060 + 0.020 + 0.045 + 0.005
         ≈ 0.65
```

Because it matches both a career and a stream, it qualifies for the **inner** ring if it is among the top 4 such pathways.

## 16. Things to know for pathways

- **Career and stream carry 70% of the score.** A pathway with no link to either can reach at most about 0.30 (all the other factors at 1.0). It will still appear in the shortlist if fewer than 16 pathways have a real match.
- **Unmatched pathways are not re-weighted.** Unlike Stream (§5.2), a pathway with `streamAlignment = 0` simply scores 0 on that 30%. This was a deliberate choice when the formula was rebalanced.
- **Stream link weights are not used.** `stream_pathways.weight` exists and its column comment says it is a scoring multiplier, but `rankedAlignment` never reads it. Today it only matters for review. If you want strong links to count more than weak ones, that is a scoring change, not a data change.
- **`segmentFit` and `marksFit` carry almost no signal today.** `loadPathways` sets every pathway's recommended segments to all three segments, so `segmentFit` is always 1. It also never fills `marksBands`, so `marksFit` is always 0.5.
- **Order of visits matters.** Pathway reads the *stored* Career and Stream runs. If a student opens Pathway before Stream, `rankedStreamIds` is empty and their pathways are scored without stream alignment until they open Stream and Pathway is run again.

## 17. Where to look in the code (pathways)

| Concern | File |
| --- | --- |
| Table definition | `supabase/migrations/20260921000200_knowledge_stream_pathways.sql` |
| Route: resolve stored career and stream rankings | `packages/recommendations/src/http/recommendation-routes.ts` |
| Catalogue loading (`loadPathways`, `routeReachability`, `collegeCount`) | `packages/recommendations/src/application/recommendation-data-source.ts` |
| Scoring and rings | `packages/recommendations/src/domain/pathway-recommendations.ts` |
| Gemini drafting (`draftStreamPathways`) | `packages/knowledge/src/infrastructure/gemini-catalog-drafter.ts` |
