# AI-Assisted Temporary Catalog — Implementation Plan

> **Status (updated 2026-09-11): implemented AND executed against the live database/Gemini
> API**, at the user's explicit request. See the "Implementation status" section at the very
> end for what was built, and the new "Live execution results" section right after it for what
> was actually run and promoted. Nothing was committed to git (per `[[no-git-commit-during-dev]]`);
> the one thing still requiring a manual step per `[[db-migrations-manual-apply]]` is regenerating
> `packages/database/src/database.types.ts` (`pnpm db:types`) — the migration itself was already
> applied directly, at the user's request, since it was the fastest path to actually running the
> rest of the pipeline live. The rest of this document is the original plan, left intact for
> reference.

Three findings surfaced only while re-reading files for *this* plan (not in the earlier
investigation) materially change the design and are used throughout below:

1. **The college dataset importer cannot carry `admission_route`, `fees_band`, or
   `external_code` at all today** — `packages/knowledge/src/infrastructure/postgres-college-dataset-publisher.ts`
   hardcodes those three columns to `null` on every insert (lines ~129-137), because
   `CollegeSchema`/`CollegeDatasetRecordsSchema` in `packages/contracts/src/catalog.ts` simply
   don't have those fields. This is *why* the real TN DCE colleges were inserted via a raw SQL
   migration instead of the importer — the importer structurally can't carry them yet. Reusing
   the importer for AI-drafted colleges needs a small additive contract+publisher change first
   (§22, §23).
2. **There is no dataset-import pipeline for pathways at all** — `knowledge.pathways` and
   `knowledge.career_pathways` have no `PathwayDatasetManifestSchema`, no
   `import-pathway-dataset.ts`, no publisher (confirmed by grep: "pathway" only appears nested
   inside the *college* dataset as `pathwayDisciplines`, never as its own dataset). Every
   `pathways` row in the repo today came from a raw SQL migration. This is a real gap in
   *existing infrastructure*, independent of AI, and the plan below builds the missing piece
   using the exact same shape as the streams/colleges importers (§22, §23).
3. **`recommendation-data-source.ts`'s `topRiasecCode()` can produce two different strings for
   the same unordered RIASEC pair** (`"RI"` vs `"IR"`, depending on which of the two scored
   higher), but the seeded `stream_maps.top_two_code` values only ever use one canonical
   ordering (`R` before `I` before `A`... per `RIASEC_TIE_ORDER`). Since `loadStreams()` does an
   **exact string match** on `top_two_code`, any student whose higher-scoring letter of their
   top pair happens to be the alphabetically/tie-order-later one gets **zero stream
   candidates** — a real, silent, order-dependent bug, not a data-coverage problem. It sits in
   the exact same function this plan already has to touch for the segment-loader fix (§14), so
   it's folded into that same phase rather than treated as a separate catalog problem.

---

## 1. Executive Summary

**What we are building:** an offline, human-reviewed pipeline that uses Gemini to draft
`knowledge.*` catalog rows (pathways, colleges, college programs, and — carefully, see §6 — a
controlled discipline/stream vocabulary), stages them for review, and publishes them through
(mostly) the *existing* dataset-import pipeline, so the *already-built* deterministic
recommendation engine has enough real-shaped data to produce non-empty, segment-varied
Stream/Pathway/College output. Gemini never runs in the student request path and never produces
a score, rank, ring, tier, or eligibility label.

**Why this way:** every alternative (runtime Gemini, a parallel catalog-writing mechanism, a new
AI abstraction) either breaks something already built and tested (deterministic, replayable
scoring; the enforced "no LLM score" API shape) or duplicates something that already works
(the Gemini client pattern, the dataset-import/publish pipeline, the Postgres recommendation
cache). This plan's guiding rule: **touch the deterministic scoring code in
`packages/recommendations/src/domain/*` for exactly zero lines.** Every change is either (a) new
catalog content flowing through existing/extended loaders, or (b) two small, independent,
non-AI deterministic bugfixes (geo-scope resolution, segment/ordering-aware stream lookup) that
the catalog work would otherwise silently inherit.

**What already exists (reused, not rebuilt):**
- `GeminiAiProvider` request/response/schema/Zod pattern (`packages/counselor/src/infrastructure/`)
- Dataset manifest → checksum → Zod validate → publish pipeline, for careers/streams/colleges/aid
  (`packages/knowledge/src/application/import-*-dataset.ts` + `postgres-*-dataset-publisher.ts`)
- `verification_status`/`publication_status` gating in every recommendation catalog loader
- `dataset_version_id` provenance/versioning on every catalog table
- Postgres-backed `RecommendationStore` with input-hash dedupe (`recommendation-store.ts`),
  already wired at boot
- Deterministic scoring in `packages/recommendations/src/domain/*` (career/stream/pathway/
  college/aid/plan) — untouched by this plan

**What must be added:**
- A pathway dataset-import pipeline (contract + validator + publisher) — doesn't exist at all
- A small extension to the college dataset contract+publisher so `admissionRoute`/`feesBand`/
  `externalCode` can flow through it (currently hardcoded to `null`)
- A staging mechanism for unreviewed Gemini drafts (`knowledge.ai_generation_runs`/
  `ai_generation_items` — new tables, since the existing manifest `reviewStatus` is a hardcoded
  `"approved"` literal and cannot hold a draft)
- A Gemini catalog-drafting module (new prompts/schemas, reusing the existing provider pattern)
  plus offline CLI scripts for generate → review → promote
- A curated (not Gemini-generated) discipline and stream-option vocabulary, authored once
- A `resolveGeoScope()` function + static state-adjacency data (independent of Gemini)
- A `location_preference` intake question for Pathfinder (currently Launcher-only)

**What must be fixed first** (both are pre-existing deterministic bugs the catalog work would
otherwise inherit and that block correct behavior regardless of how much catalog data exists):
- `loadStreams()`/`loadPathways()` hardcoding `recommendedSegments` to all three segments
- `topRiasecCode()`'s order-dependent lookup key vs. the loader's exact-match query

**What must NOT be changed:**
- Anything in `packages/recommendations/src/domain/*` (scoring math, ring partitioning, hashing)
- The `recommendation.*` schema (already fits, per the investigation)
- `recommendation-service.ts` / `recommendation-store.ts` (already correct and durable)
- The `AiProvider` port or `GeminiAiProvider` class itself (extend its *usage*, not its shape)
- Plan generation logic (`plan-generation.ts`) — plans are out of scope for AI, see §15

**Module boundaries:**

| Module | Role in this plan |
|---|---|
| Module 1 (assessment) | One new intake question (Pathfinder `location_preference`). No other change. |
| Module 2 (recommendations) | Two bugfixes (segment/ordering-aware stream+pathway loading; geo-scope resolution). No scoring changes. |
| Module 3 (knowledge) | Where almost all new work lives: pathway importer, college-importer extension, AI staging tables, Gemini catalog-drafting module, CLI scripts. |
| Module 4 (counselor/AI) | Untouched. The existing `GeminiAiProvider` pattern is *copied in spirit*, not modified; catalog drafting gets its own module in `packages/knowledge`, since it's Module 3's concern. |
| Frontend | Out of scope for this plan entirely — no Stream/Pathway/College screens are built here; this plan only ensures the data they'd read is real. |

---

## 2. Current Repository Capabilities

(Full detail in the investigation report; summarized here as the baseline this plan builds on.)

- Deterministic scoring for career/stream/pathway/college/aid/plan: **done, tested, untouched
  by this plan.**
- Postgres-backed recommendation persistence with input-hash dedupe: **done, wired at boot.**
- Dataset import pipeline (manifest+checksum+Zod+publish) for careers, streams, colleges, aid:
  **done for those four**, **missing entirely for pathways.**
- Gemini client with schema-constrained JSON + Zod double-validation: **done**, used only for
  counselor chat today.
- Catalog verification/publication gating: **done**, enforced in every recommendation loader.
- Seed data: real for careers (923 O*NET rows) and partially for TN colleges/aid; synthetic or
  mock everywhere else (full inventory in the investigation report §6).
- Segment-aware scoring math: **done** in the domain layer; **not honored** by the stream/
  pathway catalog loaders (bugfix, §14).
- Geo-band scoring: **done** in `college-recommendations.ts`; **no caller ever computes** the
  inputs it needs (bugfix, §13).

---

## 3. Target Architecture

```
                    REAL / RESEARCHED DATA (FUTURE)
                               │  same manifest+records shape,
                               │  new dataset_version_id
                               ▼
   ┌───────────────────────────────────────────────────────────┐
   │            knowledge.* catalog tables (unchanged shape)     │
   │  colleges · college_programs · disciplines · pathways ·     │
   │  career_pathways · pathway_disciplines · stream_options ·   │
   │  stream_maps · stream_map_items                             │
   └───────────────────────────────────────────────────────────┘
        ▲ publish (existing importer, extended for colleges;      ▲ read (existing loaders in
        │ new for pathways)                                       │ recommendation-data-source.ts,
        │                                                         │ two bugfixed)
   ┌─────────────────────────────┐                     ┌──────────────────────────────┐
   │ approved dataset manifest    │                     │ existing deterministic        │
   │ (reviewer-authored, reuses   │                     │ recommendation engine          │
   │ existing Zod contracts)      │                     │ (packages/recommendations)     │
   └─────────────────────────────┘                     └──────────────────────────────┘
        ▲ promote (human decision,                                 │
        │ CLI script)                                              ▼
   ┌─────────────────────────────┐                     segment-specific student output
   │ knowledge.ai_generation_runs │                     (Explorer/Pathfinder/Launcher —
   │ knowledge.ai_generation_items│                      unchanged scoring, richer input)
   │ (new staging tables)         │
   └─────────────────────────────┘
        ▲ write (offline CLI, batched, never in request path)
        │
   ┌─────────────────────────────┐
   │ Gemini catalog-drafting      │
   │ module (new, in packages/    │
   │ knowledge, reuses provider   │
   │ pattern from packages/       │
   │ counselor)                   │
   └─────────────────────────────┘
        ▲ triggered by
   ┌─────────────────────────────┐
   │ offline gap list             │  ← produced by a deterministic, non-Gemini
   │ (state × discipline, or      │    coverage check (§9) — never runs inside
   │ RIASEC-pair × segment gaps)  │    a live student request
   └─────────────────────────────┘
```

**Recommendation persistence, reused unchanged (answers the user's §17):** the existing
Postgres `RecommendationStore` (`createPostgresRecommendationStore`) needs no new store, no new
cache. Every domain builder's `stableHash()` already folds each catalog entity's `id` **and**
`datasetVersion` into `inputHash` (verified in `college-recommendations.ts`,
`stream-recommendations.ts`, etc.). Consequence, already true today with zero new code: the
moment a new `dataset_version_id` is published (whether it's an AI-drafted batch or, later, an
official replacement), `inputHash` changes for any student whose candidate set includes a
changed row, `findByInputHash()` misses, and a fresh run is computed and stored — old runs stay
resolvable by their original id. This is exactly the replay/history guarantee
`module-2-recommendation-data-model.md` §9 requires, and it already works.

---

## 4. Data Flow

**End-to-end, one entity type (college), from gap to student-visible result:**

1. Deterministic gap check (batch job, §9) notices Karnataka has 0 verified colleges for the
   `computing` discipline.
2. A gap record is written (a plain row/queue entry — see §9 — not a live API call).
3. Offline CLI (`scripts/ingest/generate-ai-college-drafts.ts`, new) reads pending gaps, builds a
   Gemini request per gap (state + discipline + a few already-published discipline/education-route
   names for context), checks `knowledge.ai_generation_runs` for an existing input-hash match
   first.
4. On a cache miss, calls Gemini (new catalog-drafting module, §16) with a schema-constrained
   prompt. Response is Zod-validated, normalized, and cross-references (discipline names →
   discipline codes) are resolved against already-published rows.
5. Each proposed college + its programs is written as one `ai_generation_items` row, status
   `pending_review`, linked to the `ai_generation_runs` row (status `pending_review`).
6. A human runs the review CLI (§12), inspects proposed items (name/city/institution type,
   *never* a proposed tier), approves or rejects, optionally hand-edits obviously-fixable text
   (e.g. a truncated program name).
7. On approval, a promotion script assembles the approved items into the **existing**
   college-dataset manifest+records shape, mints a new `dataset_version_id`, and calls the
   **existing** `importCollegeDataset()` → `PostgresCollegeDatasetPublisher` — with the small
   extension from finding (1) above so `admissionRoute`/`feesBand` actually persist.
   Every inserted college row is `verification_status = 'unverified'`
   (deliberately, until a human separately marks it `'verified'` — see §13).
8. `recommendation-data-source.ts`'s `loadColleges()` — **unchanged** — will not surface it until
   `verification_status = 'verified'`. That second flip is a deliberate separate human action
   (§13), not automatic on promotion.
9. Once verified, the next student recommendation request for that state/discipline gets a fresh
   `inputHash` (new dataset version in the candidate set) and a new run is computed by the
   **unchanged** `college-recommendations.ts`.

Streams and pathways follow the identical shape (§5–§7), swapping the target table and Gemini
schema.

---

## 5. Catalog Dependency Graph

Verified against actual FKs in `supabase/migrations/20260727000100_phase_a_mvp.sql`, not assumed
from the user's example ordering.

```
education_routes  (fixed, curated — see below, NOT generated per-request)
disciplines        (fixed vocabulary, curated once — shared by colleges AND pathways)
       │                              │
       │                              ▼
       │                     pathways ──────────────┐
       │                        │   (career_pathways) │ (pathway_disciplines)
       ▼                        ▼                     ▼
knowledge.education_routes  knowledge.careers    knowledge.disciplines
  (education_route_id FK)   (already real, 923     (already curated above)
                             O*NET rows — no
                             new work needed)

colleges ──(college_programs.discipline_id)──> disciplines
college_programs.college_id ──> colleges

stream_options (fixed vocabulary, curated once)
       ▲
stream_map_items.stream_option_id
       ▲
stream_maps (top_two_code × segment-or-null)
```

**What must exist before a pathway can be created:** an `education_route_id` (from the fixed
list) and, if the pathway is meant to link to specific careers, those careers already published
(true today for all O*NET careers) and their `id`s resolvable. A pathway does **not** need a
discipline or a college to exist first — `pathway_disciplines` and `college_programs` both
reference pathways/disciplines, not the other way around.

**What must exist before college programs can be created:** the college row itself and a
`discipline_id` from the fixed discipline vocabulary. Nothing about a pathway is required to
create a college program directly — `pathway_disciplines` is the only bridge between pathways
and disciplines, and it's independent of any specific college.

**Corrected dependency order for this plan** (the user's example was close but treats
`disciplines` as downstream of `education_routes`/`pathways`; the schema shows disciplines are
actually a **sibling** root, not a child):

```
1. education_routes   (fixed/curated, ~7 rows — route_level enum is closed)
2. disciplines         (fixed/curated, ~40-60 rows — shared root, no dependency on 1 or 3)
3. stream_options      (fixed/curated, ~10-12 rows — independent root)
   stream_maps + stream_map_items   (Gemini-assisted OK — low factual risk, pure taxonomy text)
4. pathways + career_pathways + pathway_disciplines
   (Gemini-drafted per career; needs 1 [route] and 2 [discipline] to already exist;
    career_pathways/pathway_disciplines generated in the SAME Gemini call as the pathway)
5. colleges + college_programs
   (Gemini-drafted per state×discipline; needs 2 [discipline] to already exist;
    college_programs generated in the SAME Gemini call as the college that offers them)
```

**Relationships — same call or separate?**
- **Same call as the parent entity:** any relationship that is inherent to describing the entity
  itself — a pathway's linked career(s) and target discipline(s); a college's own programs.
  Splitting these into separate Gemini calls would only add cost and risk inconsistency (e.g. a
  college drafted without knowing what programs it offers, then a second call inventing programs
  that don't match the college's stated type).
- **Deterministic backend resolution, never Gemini:** the actual foreign key on the other side of
  every relationship. Gemini must return **natural keys/titles** (e.g. `"relatedCareerOnetCode":
  "15-1252.00"` or `"disciplineCode": "computing"`), never invent a UUID. The normalization step
  (§6, §10) looks up the real `id` for that natural key against already-published rows and
  **rejects the item** if no match exists — it never lets Gemini create a new discipline/route
  inline unreviewed. This is the same reason `disciplines`/`education_routes`/`stream_options`
  are curated once up front (§6 matrix): they need to be a small, stable, already-published set
  *before* any pathway/college generation runs, so Gemini always has real codes to reference
  rather than needing to invent them.

---

## 6. Gemini Responsibility Matrix

| Field | Table | Classification | Notes |
|---|---|---|---|
| `discipline_code`, `title`, `domain_code` | disciplines | **Human/reviewer-curated (once)** | Small, stable, permanent join-key vocabulary (~40-60 rows). Gemini may be used **once, offline, as a brainstorming aid** to propose a candidate list for human review, but the *published* list is finalized by a human in one pass, not regenerated per gap. Everything else FKs into this — instability here is expensive. |
| `stream_code`, `title`, `description` | stream_options | **Human/reviewer-curated (once)** | Same reasoning; India's school-stream taxonomy (PCM/PCB/Commerce/Humanities/vocational tracks) is small and well-known, not something to "discover." |
| `route_code`, `title`, `route_level`, `description` | education_routes | **Human/reviewer-curated (once)** | `route_level` enum is closed (7 values); this table is essentially fully enumerable already. |
| `top_two_code`, `segment` | stream_maps | **Deterministically derived by backend** | `top_two_code` must be the canonical (tie-order-sorted) 2-letter key, not Gemini's choice; `segment` is either `NULL` (general) or one of the three fixed values — backend assigns based on which gap is being filled, never inferred by Gemini. |
| stream ranking/`reason_key` text | stream_map_items | **Gemini-generated (text only)**, rank = **deterministic** | Gemini may draft the human-readable `reason_key`/description content explaining *why* a stream fits a RIASEC pair; the numeric `rank` ordering is either backend-assigned by a fixed rule (alphabetical/priority) or human-confirmed, never Gemini-decided as a "recommendation." |
| `pathway_code`, `title`, `description`, `duration_band`, `backup_route_note` | pathways | **Gemini-generated** | Descriptive/structural content — this is exactly the "draft/discover catalog entities" use case. |
| `education_route_id` | pathways | **Deterministically resolved** | Gemini returns `routeCode` (natural key from the fixed list); backend resolves to `id`. |
| `relationship_type`, `career_id` | career_pathways | **Gemini proposes career-natural-key + relationship_type; backend resolves career_id** | Gemini returns `onetCode` or career `title`; backend looks up the real `careers.id`, rejects if unmatched. |
| `discipline_id`, `relevance_weight` | pathway_disciplines | **Gemini proposes disciplineCode + a bounded relevance value; backend resolves id and clamps weight** | `relevance_weight` is a `numeric(6,5)` describing structural affinity (e.g. "this pathway is 0.9-relevant to Computing"), not a fit score for a *student* — still descriptive of the catalog, not of a person, so this is safe for Gemini to *propose* as a starting value, but the backend should clamp/round it and a human should sanity-check outliers before publish. |
| `name`, `city`, `institution_type`, `admission_route`, `fees_band` | colleges | **Gemini-generated**, but see §22/§23 caveat | Descriptive/structural. `admission_route`/`fees_band` are free-text summaries, not verified claims — must carry an explicit "unverified, confirm with institution" framing (matches the existing seed convention: `"See the synthetic college fees band"`, `"Confirm with the institution"`). |
| `state` | colleges | **Deterministically supplied by backend (the gap being filled), not Gemini** | Gemini should be *told* the target state as trusted context, not asked to invent it — eliminates an entire class of hallucination (wrong-state colleges). |
| `external_code` | colleges | **External source required, or left null** | Real government college codes (like the TN DCE `external_code`) are official identifiers Gemini cannot legitimately know are real — leave `null` for AI-drafted rows; only a real source import (like TN DCE) should populate it. |
| `website_url` | colleges | **Must NEVER be Gemini-asserted as fact without a human check** | Highest hallucination risk field (a plausible-looking but wrong/dead URL is actively harmful). Treat as Gemini-*suggested*, human-*verified-before-publish*, or omit (`null`) entirely for v1 — recommend omit (§23). |
| `tier` | colleges | **MUST NEVER be generated by Gemini** | Explicit, pre-existing schema-comment rule (`"never inferred by AI"`); stays `NULL` for every AI-drafted row until a human sets it. |
| `verification_status` | colleges/college_programs | **Deterministically set by the publish step** | Always `'unverified'` on promotion from an AI draft, never anything else, never Gemini's choice (§13). |
| `publication_status` | pathways | **Deterministically set by the publish step** | `'draft'` or `'review'` until a human flips it; never Gemini's choice. |
| `dataset_version_id` | all | **Deterministically minted by backend** | One new `dataset_versions` row per promoted batch, per existing convention. |
| `program_name`, `qualification_level`, `duration_band`, `admission_route`, `fees_band` | college_programs | **Gemini-generated** | Same descriptive-content reasoning as colleges. |
| `discipline_id` | college_programs | **Deterministically resolved** | Gemini returns `disciplineCode`; backend resolves. |
| `last_verified_at` | colleges/programs | **NEVER set by Gemini or by the promotion script** | Only set the moment a human actually verifies, matching the existing `CollegeProgramSchema` rule (verified status *requires* a verification date — a Zod `superRefine` already enforces this). |
| **Fit score / rank / ring / tier / eligibility (any table)** | — | **MUST NEVER be generated by Gemini** | Structurally impossible today anyway — no request schema in `packages/contracts` for any Module 2 route accepts these as input; they are always computed output. |

---

## 7. Deterministic Backend Responsibility Matrix

(The flip side of §6 — what the *existing, unchanged* engine keeps owning.)

| Responsibility | Owner (unchanged) | Confirms |
|---|---|---|
| Career fit (Pearson correlation on RIASEC) | `career-matching.ts` `scoreCareers()` | untouched |
| Stream fit (RIASEC overlap + segment + marks) | `stream-recommendations.ts` `scoreStreams()` | untouched — only its **inputs** get fixed (§14) |
| Pathway fit (career/stream alignment + segment + reachability) | `pathway-recommendations.ts` `scorePathways()` | untouched — same input fix |
| College fit (discipline + tier + state-band + access-route) | `college-recommendations.ts` `scoreColleges()` | untouched — only geo inputs get fixed (§13) |
| Ring/tier partitioning | `partitionCollegeRings()`, career/aid equivalents | untouched |
| Eligibility/feasibility | `recommendation.feasibility_rules` + `career-matching.ts` | untouched |
| Segment-specific behavior | `deriveSegment()` (assessment) + `segmentFit` (domain scorers) | untouched logic; loader bugfix only |
| Geographic scoring | `resolveStateBand()` in `college-recommendations.ts` | untouched; caller-side bugfix only (§13) |
| Plan generation/templates | `plan-generation.ts` | untouched, no AI (§15) |
| Recommendation persistence/replay | `recommendation-store.ts` | untouched, already correct (§3) |

---

## 8. Initial Seed Strategy

**Not full-India.** Concrete, justified MVP scope:

| Entity | Target coverage | Why this number |
|---|---|---|
| `education_routes` | ~7 (one per `route_level` enum value) | The enum is closed; more rows add nothing. |
| `disciplines` | ~40-60 | Broad enough to cover the major domains already present in the career catalog's `domain_code` values (`engineering, healthcare, technology, education, design, ...` — visible in the O*NET import) plus commerce/humanities/agriculture/law, narrow enough to hand-review in one sitting. |
| `stream_options` | ~10-12 | Matches India's actual well-known school-stream taxonomy (already prototyped in the existing "realistic" synthetic seed: PCM, PCB, Commerce+Math, Commerce, Humanities, 3 vocational tracks, Design, Agriculture) — this is close to a complete real list already, just needs to be un-synthetic-ified and connected via `stream_maps`. |
| `stream_maps` (+ items) | 15 rows (one per unordered RIASEC pair, `segment = NULL`) | 6 letters → C(6,2) = 15 unordered pairs. One row each, general (not per-segment) is enough for v1 correctness (§14); segment-specific *variation* is a content-quality enhancement, not a coverage requirement, and can be gap-filled later only where a real content reason exists to differ per segment. |
| `pathways` (+ `career_pathways`, `pathway_disciplines`) | ~40-60, one per "seed career" | Driven **by career**, not by geography or RIASEC — pick the highest-priority/most-recommended careers (reuse the ~30 hand-picked careers from `scripts/ingest/generate-onet-career-migration.ts`'s original `selections` array as the starting list, extend to ~50-60 to cover a few careers per RIASEC letter) and draft one primary + (where sensible) one backup/vocational pathway each. |
| `colleges` + `college_programs` | ~90-150 colleges across **3 states**, ~5-8 target disciplines per state | State-by-state, not simultaneous nationwide. Start with Tamil Nadu (already has 10 real rows to build on/around) plus two more states chosen for population/geographic spread (e.g. Karnataka, Maharashtra, or per product priority) — enough to make the college-ring "selected/neighboring/other" state-band logic actually exercise all three bands for students from those states or their neighbors, without attempting exhaustive coverage. |

**Why career-driven for pathways, state-driven for colleges:** pathways are conceptually
attached to a career (a pathway *is* "how you get to" some set of careers) — driving generation
by career guarantees every generated pathway is immediately useful to the already-real 923-career
catalog. Colleges have no such natural one-per-parent anchor; they're inherently geographic, so
driving by state (further scoped by discipline, since a college draft without a target discipline
in mind produces generic, low-value program lists) is the only ordering that produces coherent
state-band variety, which is the entire point of the college ring logic.

**Segment- or RIASEC-cluster-driven generation?** Not for the initial bootstrap. Segment only
matters for `stream_maps`/`pathways` recommendation weighting (§6, §7), not for what content
needs to *exist* — the same pathway can serve Pathfinder and Launcher equally well; only the
*plan* wrapped around it differs (§15, unrelated to catalog). RIASEC-cluster-driven generation
would only make sense if streams/pathways needed genuinely different *content* per cluster
beyond what `stream_maps.top_two_code` already captures structurally — they don't, per the
schema. So: career-driven and state-driven, not segment- or RIASEC-cluster-driven, is the
efficient choice for this MVP.

**Recommended concrete bootstrap sequence** (dependency-ordered, matches §5):
1. Hand-curate `education_routes` (~7), `disciplines` (~40-60), `stream_options` (~10-12) in one
   authored batch — optionally Gemini-assisted as a brainstorming pass over a list a human then
   finalizes, but published as a human-reviewed batch either way, not a repeatable job.
2. Hand-author `stream_maps`/`stream_map_items` for all 15 RIASEC pairs (`segment = NULL`) —
   small enough (15 rows) to write directly or Gemini-draft-then-approve in one pass.
3. Gemini-draft pathways for ~50-60 seed careers, one gap-fill batch (all 50-60 in one offline
   run, reviewed together).
4. Gemini-draft colleges+programs for Tamil Nadu (extending the existing 10 real rows), then
   Karnataka, then a third state — three separate offline batches, reviewed and published one
   state at a time so problems in an early batch don't block the others.

---

## 9. Gap Detection Strategy

**Deterministic, never Gemini-dependent, and never inline in the student request path.**

Where it lives: a new, small, read-only application-layer function in `packages/knowledge`
(e.g. `packages/knowledge/src/application/detect-catalog-gaps.ts`) that runs as a **scheduled
offline batch job** (same execution model as `scripts/ingest/*` — a Node script run on a
schedule or by hand, not a request handler) — never invoked from `apps/api`'s request path.

**Deterministic conditions to check** (all simple counting queries against already-published,
`verified`/`published` rows — no Gemini, no heuristics that could vary run to run):

| Signal | Condition | Configurable threshold |
|---|---|---|
| No stream candidates | zero `stream_maps` rows (segment-specific or `NULL`-general) for a `top_two_code` | n/a (binary) |
| Thin stream candidates | fewer than N published stream options reachable for a `top_two_code` | N, default small (e.g. 2) |
| No pathway for a career | a published career has zero `career_pathways` rows | n/a |
| No discipline mapping | a pathway has zero `pathway_disciplines` rows | n/a |
| No verified colleges for a target discipline+state | zero `colleges`×`college_programs` rows matching `verification_status='verified'` for that pair | n/a |
| Thin colleges in geographic scope | fewer than N verified colleges within a student's resolved geo scope (§13) for their target discipline | N, default e.g. 5 |
| Missing college programs | a verified college has zero verified `college_programs` | n/a |
| Segment coverage gap | (once §14 ships) a `top_two_code` has no `stream_maps` row for a specific segment **and** no `NULL`-general fallback | n/a |

**What happens when a gap is hit at request time (student-facing behavior — this is the
important part):** the live recommendation **never blocks, never calls Gemini, never degrades
its determinism**. `scoreStreams()`/`scoreColleges()`/etc. already handle empty/thin candidate
arrays gracefully (they just produce a shorter or empty `items`/`rings` result — no exception
path exists in the domain code for "not enough data"). So: **the request returns whatever the
current published catalog supports, exactly as it does today.** The *only* new behavior is
**offline**: the same gap-detection queries, run periodically (or after any student session,
async, non-blocking, if product wants freshness) — not to block that student's response, but to
build the list the offline Gemini generator (§10) consumes on its next scheduled run. A thin
result for one student today may be a rich result for the next student tomorrow, once that
gap's batch has been reviewed and published — never faster than that, by design.

---

## 10. Gap-Fill Workflow

```
(async/offline, not in the request path)
recommendation requests over a window
        │
        ▼
deterministic gap-detection batch (§9)  ──writes──▶  a plain gap queue/table
        │                                              (state × discipline, or
        │                                               career-without-pathway, etc.)
        ▼
offline generator script reads pending gaps
        │
        ▼
for each gap: build Gemini input (§19) ──▶ check knowledge.ai_generation_runs
        │                                    for an existing input_hash match
        │                                         │ hit → reuse existing draft,
        │                                         │        skip the Gemini call
        │                                         ▼ miss
        ▼
   call Gemini (new catalog-drafting module, §16)
        │
        ▼
   JSON-schema-constrained response → Zod validation → normalize
   (resolve natural keys to real FK ids; reject unresolvable references)
        │
        ▼
   duplicate detection against already-published + already-staged rows (§10 dedupe, below)
        │
        ▼
   write knowledge.ai_generation_runs (status=pending_review)
   write knowledge.ai_generation_items (one per proposed row, status=pending_review)
        │
        ▼
   human review (§12) → approve/reject/edit
        │
        ▼
   promotion script: approved items → existing manifest+records shape → existing importer (§22)
        │
        ▼
   new dataset_version_id published, rows verification_status='unverified'
        │
        ▼
   (separate, later, human action) verification_status → 'verified'
        │
        ▼
   next matching student recommendation picks up the new catalog automatically
   (unchanged loaders, unchanged scoring, new inputHash → fresh run)
```

**Gap-request payload — exactly what should (and should not) be captured**, per the user's
explicit instruction not to over-share personal data:

| Included | Excluded |
|---|---|
| Missing entity type (stream/pathway/college/program) | Student user ID / name / contact info |
| Target discipline code(s) (from the fixed vocabulary) | Raw RIASEC scores of any individual student |
| Target education route level | Free-text intake answers (`favorite_subject`, `flow_activity`, etc.) |
| Target state (for colleges) | Marks band of any individual student |
| Existing catalog IDs already considered (for context/dedupe) | Any profile snapshot ID or hash |
| Current dataset version (for cache/versioning context) | Segment (not needed — catalog content doesn't vary by segment per §6/§8) |

The gap record is an **aggregate signal** ("Karnataka + computing is thin", "career X has no
pathway") derived from many requests, never a single student's personal payload forwarded to
Gemini. This is stricter than the earlier planning doc's sketch (which listed RIASEC/marks band
as candidate gap-request fields) — on review, none of that is actually needed for the *content*
of a pathway/college/stream draft, only for which coverage cell is thin, so it's dropped here.

---

## 11. Staging/Data Model

Using the richer staging-table approach, as directed, since the alternative (a draft-file
directory) has no queryable review state, no dedupe index, and no audit trail with a real key —
worse fit for a system meant to run repeatedly over time, not once.

### `knowledge.ai_generation_runs` — one row per Gemini call (or cache reuse)

| Purpose | Notes |
|---|---|
| Identifier | `id` (uuid, PK) |
| What was asked for | `target_table` (`pathways`\|`colleges`\|`college_programs`\|`stream_map_items`), `input_params_json` (the gap's structured context — state/discipline/route, matching §10's payload table, never personal data) |
| Reproducibility/cache key | `input_hash` = `sha256(target_table + prompt_version + input_params_json)`, **unique** with `target_table` — this is the dedupe-before-calling-Gemini check |
| Model/prompt provenance | `provider` (`'gemini'`, kept generic per the existing pattern's own comment), `model`, `prompt_version` |
| Raw + parsed output | `raw_response_json` (exactly what came back, for audit/re-parsing without re-calling Gemini), `status` (`pending_review`\|`approved`\|`rejected`\|`superseded`\|`failed`) |
| Error path | a nullable `error_code`/`error_message` pair so a failed call (timeout/rate-limit/malformed JSON) is recorded, not silently dropped — mirrors `AiProviderResult`'s existing `timed_out`/`failed` shape from `packages/counselor` |
| Review metadata | `reviewed_by` (nullable staff id), `reviewed_at` (nullable) |
| Timestamps | `created_at` |

### `knowledge.ai_generation_items` — one row per proposed catalog row inside a run

| Purpose | Notes |
|---|---|
| Identifier | `id` (uuid, PK), `generation_run_id` (FK) |
| What kind of row this is | `proposed_entity_type` (`college`\|`college_program`\|`pathway`\|`career_pathway`\|`pathway_discipline`\|`stream_map_item`) |
| The draft itself | `proposed_payload_json` — shaped exactly like the target table's insertable columns, using natural keys for cross-references (per §5's rule), never raw FK UUIDs Gemini invented |
| Duplicate detection | `natural_key` (a normalized deterministic string — e.g. `lower(trim(name)) + '|' + city + '|' + state` for a college, `lower(trim(title)) + '|' + education_route_code` for a pathway) with a **unique index on `(proposed_entity_type, natural_key)` scoped to non-rejected items**, so the same gap generating twice (or two different gaps producing the "same" college) collides at write time instead of silently duplicating |
| Cross-reference to existing catalog | `matched_existing_id` (nullable) — set during normalization if the natural key already matches a *published* row, so review can immediately reject-as-duplicate instead of re-approving something that already exists |
| Outcome | `promoted_entity_id` (nullable, filled in once actually inserted into the real table), `review_status` (mirrors the run's status at the item level, since a run can be partially approved — e.g. 8 of 10 proposed colleges look good, 2 get rejected individually) |
| Reviewer notes | a free-text `reviewer_note` field for why something was rejected/edited — useful audit trail, cheap to add |
| Timestamps | `created_at` |

**Why staging tables instead of writing drafts directly into `knowledge.colleges`/`pathways`
with `verification_status='unverified'`:** it's tempting to skip the staging tables and just
insert straight into the production tables as `'unverified'`, since that status already hides
them from recommendations. Rejected, for three concrete reasons: (1) production tables have no
place to store `raw_response_json`/`prompt_version`/`input_hash` — that's not what those tables
are for, and adding AI-specific columns to every catalog table is far more invasive than two new
tables; (2) the natural-key uniqueness/dedupe check needs a place to live *before* something
becomes a real row with a real `dataset_version_id` — doing it against production rows directly
means a rejected duplicate has already consumed a real primary key; (3) partial approval (some
items in a batch good, some not) is much cleaner against a staging row than against a production
row that would otherwise need an extra "still draft" status layered onto the existing
`verification_status` enum, changing its meaning for every other consumer of that column.

**Idempotency strategy:** the `(target_table, input_hash)` unique constraint on
`ai_generation_runs` is the job-level idempotency guard — re-running the generator over the same
gap list is always safe, a hit short-circuits before any Gemini call. The
`(proposed_entity_type, natural_key)` constraint on `ai_generation_items` is the entity-level
duplicate guard — even if two *different* gaps (e.g. "Tamil Nadu + computing" and "Tamil Nadu +
engineering") both cause Gemini to independently draft the same real college, the second
insert collides and surfaces for a reviewer to merge/reject rather than silently creating two
rows.

---

## 12. Review & Promotion Workflow

**Recommended for now: Option A, CLI-based.** An admin UI is premature — this repo's own
maturity precedent (per the investigation, Module 4's counselor tooling is at the same
CLI/script level today) and the expected review volume (tens of items per batch, not hundreds
per day) don't justify a screen yet.

- **What a reviewer sees:** running `pnpm review:ai-catalog` (new script) prints each
  `pending_review` `ai_generation_items` row grouped by run — proposed entity type, the full
  `proposed_payload_json`, and (if set) `matched_existing_id` flagged prominently as "looks like
  a duplicate of {existing title}".
- **Approve:** `--approve <item-id>` flips `review_status` to `approved`.
- **Reject:** `--reject <item-id> --note "..."` flips to `rejected`, records the note.
- **Edit:** the script supports `--edit <item-id> <field>=<value>` for small text corrections
  (e.g. fixing a truncated program name) — rewrites `proposed_payload_json` before approval;
  anything needing a bigger rewrite is rejected and re-queued as a fresh gap instead.
- **After approval:** a second script (`pnpm promote:ai-catalog <run-id>`) collects every
  `approved` item in a run, groups by `proposed_entity_type`, assembles the existing manifest +
  records JSON shape per type, mints one new `dataset_versions` row, and calls the existing (or,
  for pathways, newly-built per §22) importer. On success, each promoted item's
  `promoted_entity_id` is filled in and the run's status becomes `approved`.
- **After rejection:** the item stays `rejected` permanently (never deleted — it's useful history
  for "Gemini keeps proposing this wrong thing, fix the prompt"); the run only moves to fully
  `approved`/`superseded` once every item in it has a terminal status.
- **Provenance retained:** every promoted row's `dataset_version_id` traces back through
  `knowledge.dataset_versions.source_id` → a `knowledge.knowledge_sources` row whose
  `trust_level` is explicitly `'ai_generated_unreviewed_then_human_approved'` (or similar,
  finalized in §13) — so a query against production data can always answer "was this row
  AI-assisted, and who approved it" via `ai_generation_items.promoted_entity_id` without needing
  a new column on the catalog tables themselves.

---

## 13. Geography Work

Independent of Gemini entirely — a pure deterministic gap, confirmed still unbuilt.

- **Pathfinder intake:** add `location_preference` to `packages/assessment/scripts/seed-intake.ts`'s
  `pathfinder` array — identical `question_key`, identical options
  (`same_city|same_state|anywhere_in_india|remote|not_sure`), next `display_order` after
  `constraints` (i.e. after 16, so `17`, renumbering `support_needed` to `18`). No schema
  migration — `assessment.intake_questions` already supports arbitrary single-choice questions.
- **`resolveGeoScope(locationPreference, homeState)`** — one new pure function (new file, e.g.
  `packages/recommendations/src/domain/geo-scope.ts`, since it's Module 2's concern — it feeds
  `college-recommendations.ts`'s existing parameters, doesn't belong in assessment or knowledge):

  | `location_preference` | `selectedState` | `neighboringStates` |
  |---|---|---|
  | `same_city` / `same_state` | home state | `[]` |
  | `not_sure` / unanswered | home state | looked up from the state-adjacency constant |
  | `anywhere_in_india` / `remote` | home state | every other Indian state/UT (so nothing scores `'other'`) |

- **State adjacency:** a plain TS constant, `packages/recommendations/src/domain/state-adjacency.ts`
  — geography doesn't need review/LLM-assistance, doesn't change, and isn't sensitive; a static
  map is simpler and more auditable than a database table for v1 (promote to a
  `knowledge.state_adjacency` table later only if it ever needs non-developer edits).
- **How the result feeds the existing scorer:** at the HTTP layer (wherever
  `/api/v1/recommendations/colleges` is called from — today that's whatever assembles the
  request body, since `recommendation-routes.ts` only forwards `selectedState`/
  `neighboringStates` if supplied), compute `resolveGeoScope()` from the profile's
  `location_preference` intake answer and home state, and pass the result into the existing
  request shape. **Zero changes to `college-recommendations.ts` itself** — it already accepts
  exactly these two parameters.
- **Explicitly not using Gemini here**, per the user's instruction and because it would be a
  regression: this is closed-form, exhaustively enumerable, static data — an LLM call for it
  would only add latency, cost, and a nondeterminism risk for zero benefit.

---

## 14. Segment-Aware Work

Two fixes, same function family, same phase — both are prerequisites the AI-catalog work would
otherwise silently inherit as broken regardless of how good the new catalog content is.

**Fix 1 — segment filtering.** `recommendation-data-source.ts`'s `loadStreams()`:
- Current: queries `stream_maps` by `top_two_code` only, then hardcodes
  `recommendedSegments: ["explorer", "pathfinder", "launcher"]` on every returned row.
- Target: query should prefer an exact `(top_two_code, segment = profile.segment)` match, and
  **fall back** to `(top_two_code, segment IS NULL)` when no segment-specific row exists (this is
  exactly what the `segment is null or segment in (...)` check constraint on `stream_maps` was
  built to support, per `20260731000100_m3_stream_map_segment.sql`'s own column comment). The
  returned `recommendedSegments` should reflect which case matched: `[profile.segment]` if a
  segment-specific row was used, `["explorer","pathfinder","launcher"]` only if the `NULL`
  general row was used (a `NULL` mapping is, by definition, for everyone).
- Same change, same shape, in `loadPathways()` for `pathway.recommendedSegments` — though
  pathways have no `segment` column today; if segment-specific pathway variation is ever needed,
  it would need the same kind of column `stream_maps` already has. **Not adding that column now**
  — nothing in the investigation shows pathway content needing to differ by segment the way
  stream framing might; defer until a real content reason appears (open decision, §28).

**Fix 2 — canonical ordering** (found while drafting this plan, §"three findings" above):
`topRiasecCode()`'s selection of *which two letters* stays exactly as-is (score-driven — this is
correct and must not change), but the **string it builds from those two letters** must be
canonicalized into `RIASEC_TIE_ORDER` sequence (`R` before `I` before `A`...) before it's used as
a lookup key — matching the ordering convention the existing mock seed already happens to use.
Concretely: after picking the top two letters by score, re-sort just those two by their position
in `RIASEC_TIE_ORDER` before `.join("")`. This is a one-function change, purely a lookup-key
fix, with **zero effect on which letters are selected or how fit is scored** — `segmentFit`,
`riasecOverlap`, and every other score stay bit-for-bit identical for a given student; only
whether the catalog query finds the row that should already match them changes.

**How NULL/general mappings should behave:** as designed into the schema already — `NULL`
means "applies to every segment," and per Fix 1, is the fallback whenever no segment-specific
override exists. This lets §8's MVP seed (`segment = NULL` for all 15 initial `stream_maps` rows)
be immediately fully functional across all three segments without needing 45 rows on day one.

**Tests:**
- `loadStreams()`/`loadPathways()` gain a test double/fixture case with **both** a segment-
  specific row and a `NULL`-general row for the same `top_two_code`, asserting the segment-
  specific one wins when present and the general one is used when it's the only match.
- A regression test asserting `topRiasecCode()` returns the same canonical string regardless of
  which of the two top letters scored higher (i.e. a profile with `I=0.9,R=0.8,...` and one with
  `R=0.9,I=0.8,...` — all else equal — produce the identical lookup key), paired with an
  assertion that the *scored, ranked* output for each profile is otherwise unaffected (proving
  Fix 2 only changes the lookup key, not the score).
- No scoring-weight test changes — `career-matching.test.ts`, `stream-recommendations.test.ts`
  etc.'s existing assertions about fit-score math are untouched, confirming the "don't change
  scoring weights" instruction is honored.

---

## 15. Plan/Mission Work

Confirmed from the code (§8 of the investigation report, re-verified while drafting this plan by
re-reading `plan-generation.ts` in full): plan generation is 100% deterministic template
selection + placeholder substitution; no AI is used or needed anywhere in it.

**A. Required for AI-catalog infrastructure: nothing.** Plans only ever consume a `PlanTarget`
(a title/entity-type/entity-id already chosen by the student from career/stream/pathway results)
— they never read `knowledge.colleges`/`pathways` rows directly for template content, so richer
AI-assisted catalog data does not require any plan-generation change to take advantage of it (a
richer pathway just becomes a better `target.title` string automatically).

**B. Required for complete product behavior, independent of AI (explicitly out of scope for
this plan's implementation phases, listed here only so it isn't lost or conflated with the AI
catalog work):**
- Change `planTypeForSegment()` so Pathfinder also resolves to `"career_90_day"` (currently
  `"pathway"`), and author real 90-day template content for Pathfinder.
- Author non-placeholder-quality template step content for all three segments.
- Build `deriveMissionsFromPlan()` + wherever generated plans are persisted, so Explorer's steps
  actually produce `recommendation.missions` rows (confirmed by grep: no writer exists today).

These are legitimate, separately-schedulable product work; nothing about them blocks or is
blocked by the catalog work in this plan, and they should not be bundled into the same
implementation phases (§24) to keep review/rollout of each independently simple.

---

## 16. Gemini Integration Design

**Reuse, don't rebuild.** No new `AiProvider` abstraction — `packages/counselor/src/application/ports/ai-provider.ts`'s
shape (`generateDraft(request): Promise<result>` with a `completed|disabled|timed_out|failed`
union) and `GeminiAiProvider`'s HTTP mechanics (fetch-based, `responseJsonSchema`-constrained,
`AbortSignal.timeout`) are exactly right for this — only the *prompt* and *response schema* are
target-specific.

**Where it lives:** a new module in `packages/knowledge/src/infrastructure/` (Module 3's
concern, not Module 4's) — e.g. `gemini-catalog-drafter.ts` — implementing a small
`CatalogDrafter` interface with one method per target
(`draftPathways(input)`, `draftColleges(input)`, `draftCollegeProgramsForCollege(input)`,
`draftStreamMapItems(input)`). Internally, each method builds a target-specific system
instruction + `responseJsonSchema` and calls the **same** Gemini HTTP request shape
`GeminiAiProvider` already uses — either by depending on a shared low-level request helper
extracted from `gemini-ai-provider.ts` (preferred, avoids duplicating the fetch/timeout/error-
mapping logic), or by constructing its own thin client using the identical pattern if extracting
a shared helper turns out to touch `packages/counselor` more than is worth it for this phase —
final call belongs at implementation time after looking at how cleanly the extraction goes, not
decided here.

**Different targets, different prompts/schemas:** exactly as `ai-provider-shared.ts` defines one
`counselorSystemPrompt` + `counselorDraftJsonSchema` pair, the new module defines one
system-prompt+schema pair *per target table* (§19 covers the shared architecture across all of
them, not the literal text).

**Schema-constrained JSON + Zod validation:** same double-check pattern — `responseJsonSchema`
in the request, then a hand-written Zod schema (in `packages/contracts`, alongside the existing
`*DatasetRecordsSchema`s, e.g. a new `PathwayDraftSchema`/`CollegeDraftSchema`) re-validates the
parsed response before it's allowed anywhere near `ai_generation_items`.

**Timeouts/retries:** reuse `GEMINI_TIMEOUT_MS` (already configured); **no retry loop**, matching
`GeminiAiProvider`'s current behavior exactly — a `timed_out`/`failed` result is recorded on the
`ai_generation_runs` row (`status='failed'`, `error_code` set) and the gap stays pending for the
*next* scheduled offline run, which is a perfectly adequate retry story for a batch job (unlike
the live chat path, there's no user waiting).

**Rate limits:** the offline generator processes gaps sequentially (not in parallel) within a
single script invocation specifically to stay well under Gemini's rate limits without needing new
limiter infrastructure — a `rate_limited` result (already a distinct `errorCode` in
`GeminiAiProvider`) just stops that run early with whatever's left marked for the next
scheduled invocation.

**Logging:** reuse whatever logger `apps/api`/`scripts/ingest/*` already use for their console
output (no elaborate logging platform, per instruction) — the CLI scripts print progress
per-gap, and the durable record of what happened is `ai_generation_runs` itself, not a log file.

**Raw-response storage:** `ai_generation_runs.raw_response_json`, as specified in §11.

**Prompt/model versioning:** `ai_generation_runs.prompt_version` (bumped by hand whenever a
target's prompt template changes — a simple string constant per drafter method, not a managed
prompt registry) and `.model` (whatever `GEMINI_MODEL` resolved to at call time) — both already
in the staging schema in §11.

---

## 17. Source/Research Strategy

**Precise distinction, as instructed — this is not "scraping."** Gemini, as used here, answers
from its own trained knowledge plus whatever trusted context the prompt supplies (already-
published discipline/route/career names, the target state) — it does not fetch live web pages,
and this repository has **no existing web-retrieval infrastructure** to fetch and parse live
sources (confirmed: no HTTP-fetch-and-parse utility, no HTML/PDF scraping library, anywhere in
`packages/knowledge` or `scripts/`; the TN DCE "official" data was hand-collected into a SQL
migration by a person, per that migration's own header comment — *"Generated from official
Tamil Nadu Directorate of Collegiate Education pages captured 2026-08-05"* — not by any
automated crawler in this codebase).

**Therefore, for this MVP:** catalog drafting is **structured extraction from Gemini's own
knowledge, clearly labeled as such**, not "research" or "scraping." Every AI-drafted row's
provenance (`knowledge_sources.trust_level`, §13) must say exactly this — something like
`ai_generated_unverified`, never `authoritative`/`official_government_directory` (those values
stay reserved for hand-verified imports like TN DCE). Fields most likely to be stale or wrong
(fees, admission routes, URLs) are exactly the ones flagged `unverified` and, for `website_url`
specifically, recommended to be **omitted** rather than asserted (§6, §23).

**Should the MVP add real web retrieval?** No — not required by anything in this plan, and
explicitly out of scope per the user's instruction not to introduce a crawler unless the
repository requires it. It doesn't: gap-filling with clearly-labeled, human-reviewed,
`unverified` AI content is sufficient for "enough temporary catalog to make the experience work,"
and real web retrieval would only be worth adding later if/when product wants "AI-assisted but
sourced-from-live-pages" content specifically — a materially bigger feature (fetch, parse,
attribute per-field) than what's needed here.

**If a future need for real sources arises:** the existing pattern to extend is exactly what TN
DCE already demonstrates — a **manually collected** source file/URL list feeding a
**human-authored or human-reviewed** ingestion script, using `knowledge.entity_source_links`
(already in the schema, unused by any current code, `supports_fields: text[]` lets a future
importer record *which* fields a given source actually verified) to attach real citations per
field. This plan does not build that now; it only confirms the schema already has room for it
later without changes.

---

## 18. API vs Offline Boundaries

| Component | Runs where | Depends on Gemini? |
|---|---|---|
| `POST /api/v1/recommendations/{career,streams,pathways,colleges,aid,plans}` | Live API (`apps/api`) | **No — never.** Unchanged handlers, unchanged domain scorers. |
| `resolveGeoScope()` | Live API, called synchronously before the college recommendation request is built | No — pure function |
| Segment/ordering-aware `loadStreams()`/`loadPathways()` (§14) | Live API | No — pure SQL query change |
| Gap-detection batch (§9) | Offline, scheduled job/script | No (it only *reads* published catalog + counts) |
| Gemini catalog-drafting module (§16) | Offline CLI script only | Yes, by design — this is the *only* place Gemini appears |
| `knowledge.ai_generation_runs`/`items` writes | Offline CLI only | Yes (writes what Gemini returned) |
| Review CLI (§12) | Run by a human, on demand | No |
| Promotion script → existing/new importer | Run by a human or a follow-on script step, on demand | No — pure validate+publish |
| Pathway dataset importer (new, §22) | Offline CLI, same execution model as existing `scripts/ingest/import-*.ts` | No |
| Admin/review UI | **Not built in this plan** (§12 decision) | N/A |

**The load-bearing guarantee:** nothing in the first two rows' code path can throw, block, or
slow down because Gemini is down, rate-limited, or slow — because nothing in that path ever
calls it. This is structurally true today (verified: `apps/api`'s only Gemini caller is the
counselor chat route) and this plan adds no new call site inside `apps/api`.

---

## 19. Gemini Prompt Architecture (structure only — not the prompts)

For each target (`stream_map_items`, `pathways`, `colleges`, `college_programs`), the request
built by the new catalog-drafting module (§16) follows this shape, mirroring
`ai-provider-shared.ts`'s existing `buildCounselorPrompt`/`counselorSystemPrompt` split:

- **System instruction** (fixed per target, versioned as `prompt_version`): states the drafter's
  role, explicitly lists forbidden output (no scores/ranks/rings/tiers/eligibility — same
  sentence pattern as the existing `counselorSystemPrompt`'s *"Never calculate or change
  scores, ranks, rings, eligibility..."*), states the required output shape, states that
  cross-references must use natural keys/codes, not invented UUIDs.
- **Task instruction**: which entity type, how many items to propose (a small bounded count per
  call, e.g. 5-10 colleges per state+discipline gap, not "generate everything you know").
- **Trusted context block**: the specific gap being filled (state/discipline/route/career —
  exactly §10's payload table, nothing more) plus a short list of already-published natural keys
  the model may reference (discipline codes, route codes, career titles/O*NET codes relevant to
  the request) — this is what makes cross-reference resolution possible without Gemini inventing
  new ones.
- **Existing-catalog context** (for dedupe guidance, not authority): a short list of already-
  published or already-staged item titles/natural-keys "in this same scope" so the model is
  nudged away from re-proposing something that already exists — a *hint*, not a substitute for
  the deterministic natural-key uniqueness check in §11, which is the actual guarantee.
- **Allowed output fields**: exactly the "Gemini-generated" row from §6's matrix for that target,
  named explicitly in the schema (the JSON schema itself is the enforcement mechanism, same as
  `counselorDraftJsonSchema`'s `additionalProperties: false`).
- **Forbidden output fields**: named explicitly in the system instruction as a belt-and-braces
  measure even though the JSON schema's `additionalProperties: false` already structurally
  excludes them.
- **Source-expectation framing**: instruct the model to mark any field it isn't confident about
  (especially fees/admission-route/website) as `null`/omitted rather than inventing a plausible-
  sounding value — "uncertain → omit" as an explicit instruction, not just hoped-for behavior.
- **Duplication guidance**: instructed to skip proposing an item whose title clearly matches
  something in the existing-catalog context block.
- **Structured JSON output**: `responseMimeType: application/json` + `responseJsonSchema`,
  exactly as today.

The actual prompt text and JSON schemas are explicitly **not** produced in this plan, per
instruction — this section only fixes their shape so implementation can proceed directly to
writing them once approved.

---

## 20. Testing Strategy

**Unit tests** (colocated `*.test.ts`, matching existing convention):
- Generation input hashing: same `(target_table, prompt_version, input_params_json)` input
  always produces the same `input_hash`; different `input_params_json` always differs.
- Draft schema validation: valid payload passes; payload with a forbidden field
  (`tier`/`fitScore`/etc.) is rejected by the Zod schema, proving the "never" fields in §6 are
  enforced in code, not just policy.
- Normalization/FK resolution: a natural key that matches an existing published row resolves to
  its real id; one that doesn't match is rejected with a clear reason, never silently dropped or
  silently inventing a new row.
- Duplicate detection: two items with the same normalized natural key collide (whether from the
  same run or different runs); a near-miss (different casing/whitespace) still normalizes to the
  same key and still collides.
- Gap detection: each condition in §9's table has its own test with a fixture catalog crossing
  the threshold on each side (e.g. exactly at N, N-1, N+1 candidate colleges).
- `resolveGeoScope()`: all five `location_preference` values, including `not_sure`/unanswered,
  against a fixture state-adjacency map.
- Segment filtering (§14): as already specified in §14's own test list.

**Integration tests:**
- Gemini draft → staging: a fixture `AiProvider`-shaped fake (same pattern as
  `packages/counselor/src/infrastructure/fixtures/fixture-ai-provider.ts`) returns a canned
  draft; assert it lands correctly in `ai_generation_runs`/`items` with the right status.
- Staging → approved dataset: an approved `ai_generation_items` batch produces a manifest+records
  payload that itself passes the **existing** `validateCollegeRecords`/`validateStreamRecords`
  Zod validators unchanged — proving the promotion step genuinely reuses the existing contract
  rather than a parallel one.
- Approved dataset → knowledge: run the (extended) importer against a test Postgres instance
  (same pattern as any existing `postgres-*-dataset-publisher` test, if one exists — check at
  implementation time) and assert the rows land with `verification_status='unverified'`.
- Knowledge → recommendation engine: after publishing, calling `loadColleges()`/`loadPathways()`
  does **not** surface the new rows until a separate `verification_status='verified'` update, and
  **does** surface them (correctly scored) immediately after.

**Regression tests** (run against the *existing* domain test suites, asserting no change):
- `career-matching.test.ts`, `stream-recommendations.test.ts`, `pathway-recommendations.test.ts`,
  `college-recommendations.test.ts`, `plan-generation.test.ts`, `aid-recommendations.test.ts` —
  all pass unmodified (proves zero scoring-code regressions).
- A new explicit test: no request schema anywhere in `packages/contracts`'s recommendation routes
  accepts a client-supplied `fitScore`/`rank`/`ring`/`tier` (a static/schema-shape assertion, not
  just relying on the absence of a code path).
- Catalog-version-changes-hash: publishing a new `dataset_version_id` for a catalog table changes
  `inputHash` for a fixture profile whose candidate set includes an affected row (proves §3's
  cache-invalidation claim rather than just asserting it).
- Unverified-excluded: an `ai_generation_items`-sourced row with `verification_status='unverified'`
  never appears in any recommendation output (already implied by existing loader `where` clauses,
  worth a dedicated regression test specifically naming AI-sourced rows given how easy this would
  be to accidentally break).
- Retired-excluded-from-new-but-resolvable-in-old: a retired AI-drafted row doesn't appear in a
  fresh run but is still resolvable by a stored historical `recommendation_items` reference (same
  test shape as any existing "retired catalog entity" test, if present — align with it).

**Failure tests:**
- Gemini timeout / rate-limit → `ai_generation_runs.status='failed'`, gap remains pending, no
  partial/corrupt items written.
- Malformed JSON / schema mismatch → rejected before ever reaching `ai_generation_items`, run
  marked `failed` with the specific Zod issue captured.
- Duplicate entity (natural key collision) → the later item is flagged (`matched_existing_id` or
  a rejected-as-duplicate outcome), never silently inserted twice.
- Duplicate generation (same gap run twice) → second run short-circuits on the `input_hash` cache,
  zero Gemini calls made.
- Empty response → treated the same as `failed`, not as "zero items proposed = success."
- Failed promotion (e.g. importer rejects on a checksum/count mismatch after a hand-edit) → the
  run stays `approved`-but-not-yet-published rather than silently marked complete; the operator
  sees the importer's own rejection report (reusing the existing `CollegeImportReport`/
  `StreamImportReport` shape verbatim).

---

## 21. Security/Safety

- **Gemini API key handling:** unchanged — `GEMINI_API_KEY` stays server/script-side only, read
  from env exactly as `apps/api` already does; the offline CLI scripts load it the same way
  `scripts/ingest/generate-onet-career-*.ts` already load `DATABASE_URL` (`process.loadEnvFile()`).
  Never logged, never included in `raw_response_json` (that field stores the *response*, not the
  request headers).
- **Prompt injection from catalog/source text:** the trusted-context block (§19) only ever
  includes *already-published, already-reviewed* natural keys/titles — never raw student input,
  never unreviewed prior AI output, never arbitrary external text. Since this repo has no web-
  retrieval step (§17), there is no untrusted scraped-page text that could carry an injection
  payload into the prompt in the first place — this risk is structurally smaller here than in a
  system that does fetch external pages.
- **Untrusted URLs:** per §6, `website_url` is recommended to be omitted from AI-drafted rows
  entirely for v1, which sidesteps the entire "Gemini asserts a URL, is it safe/real" question.
  If a future revision does let Gemini propose a URL, it must never be surfaced to students until
  a human has actually visited and confirmed it (an explicit reviewer checklist item, §12).
- **Malicious generated content:** the JSON-schema-constrained response plus `additionalProperties:
  false` plus Zod re-validation (identical layered defense to the existing counselor path) means
  anything outside the exact expected shape is rejected before it's stored, let alone published.
  Free-text fields (descriptions, program names) are still just text stored in `jsonb`/`text`
  columns rendered as plain text to students, not executed/rendered as HTML/markup anywhere in
  the current frontend rendering path (verify at implementation time if that assumption changes).
- **Accidental publication:** the promotion script is the *only* code path that can move a
  staged item into a real catalog table, and it always sets `verification_status='unverified'`
  — never a flag/parameter that lets a script or a reviewer accidentally publish as `'verified'`
  in the same step. Verification is a deliberate, separate, explicit action (§13/§12).
- **Hallucinated facts (college info/fees/admission routes/tier/eligibility):** covered
  field-by-field in §6's matrix; the two structural backstops are (a) `tier`/eligibility/
  score/rank/ring have no field in the draft schema at all — not just "discouraged," physically
  absent from what Gemini is even asked to return — and (b) `verification_status='unverified'`
  keeps everything else invisible to students until a human confirms it.
- **Personal student information sent to Gemini:** per §10's explicit include/exclude table —
  catalog-generation prompts receive only aggregate gap signals (discipline/state/route codes),
  never a student ID, name, RIASEC scores, marks band, or free-text intake answer. This is
  stricter than what a naive read of the earlier planning doc's gap-request sketch would have
  sent, and is called out as a deliberate tightening in §10.

---

## 22. Observability

Minimal, reusing existing patterns — no new platform.

| What | Where recorded |
|---|---|
| Generation run (model, prompt version, input hash, target, status) | `knowledge.ai_generation_runs` row itself — the durable record *is* the observability data, not a separate log stream |
| Validation errors | `ai_generation_runs.error_code`/message, or per-item rejection reason on `ai_generation_items` |
| Latency | not specially tracked beyond what a script's own console timing prints (per instruction: don't build an elaborate observability platform) — `created_at` on the run row is enough to reconstruct batch cadence after the fact |
| Rate-limit failures | `error_code = 'rate_limited'` on the run row (the exact code `GeminiAiProvider` already produces) |
| Reviewer action | `ai_generation_items.review_status`, `reviewer_note`, `ai_generation_runs.reviewed_by`/`reviewed_at` |
| Promotion / dataset version | `ai_generation_items.promoted_entity_id` + the new `dataset_versions` row's own `id`/`created_by` |
| Console/script logging | plain `console.log` progress output in the CLI scripts, matching every existing `scripts/ingest/*.ts` script's style — no structured logging library introduced |

---

## 23. Database Migration Plan (conceptual — no SQL)

Kept minimal, three migrations, each independently revertable:

**Migration A — AI generation staging tables**
- New tables: `knowledge.ai_generation_runs`, `knowledge.ai_generation_items` (columns exactly
  as designed in §11).
- Indexes: unique `(target_table, input_hash)` on `ai_generation_runs`; unique
  `(proposed_entity_type, natural_key)` on `ai_generation_items` scoped to non-`rejected` rows
  (a partial unique index, so a rejected duplicate doesn't permanently block a corrected retry);
  a plain index on `ai_generation_items.generation_run_id` for the review-CLI's per-run listing.
- Foreign keys: `ai_generation_items.generation_run_id` → `ai_generation_runs.id`.
- Status values: as enumerated in §11 (`pending_review|approved|rejected|superseded|failed` for
  runs; item-level `review_status` mirrors a subset of the same).
- Audit fields: `created_at` on both; `reviewed_by`/`reviewed_at` on runs.
- No changes to any existing table.

**Migration B — college dataset contract/publisher extension** (code change with a matching,
very small migration if any column needs a default/backfill — likely none, since the columns
`admission_route`/`fees_band`/`external_code` already exist on `knowledge.colleges`; this is
primarily a **contract + publisher code change**, not a schema migration — flagged here so it
isn't lost, but it may turn out to need zero DDL at all).
- No new columns (they exist already); the fix is `CollegeSchema`/`CollegeDatasetRecordsSchema`
  in `packages/contracts` gaining optional `admissionRoute`/`feesBand`/`externalCode` fields, and
  `postgres-college-dataset-publisher.ts` reading them instead of hardcoding `null`. **`tier`
  stays absent from the schema on purpose** — never added here.

**Migration C — pathway dataset support** (new capability, not a bugfix)
- No new tables/columns in `knowledge.*` — `pathways`/`career_pathways`/`pathway_disciplines`
  already exist with the right shape (per the investigation). This migration is really "new
  contract + importer code," parallel to Migration B, listed here because it's the same class of
  work (extending the *import-side* capability, not the schema) and belongs in the same review
  pass as Migration B.

**Explicitly not migrated/changed:** `recommendation.*` schema (confirmed already fits),
`assessment.*` schema (the new Pathfinder intake question is a data row via `seed-intake.ts`, not
a schema change), any existing `knowledge.*` table's columns beyond what Migration B needs.

---

## 24. File-Level Change Map

No code is written in this plan — this is the intended-change inventory for implementation.

| Category | Path | Change |
|---|---|---|
| migration | `supabase/migrations/<date>_ai_generation_staging.sql` | new — Migration A (§23) |
| contract | `packages/contracts/src/catalog.ts` | modify — extend `CollegeSchema`/`CollegeDatasetRecordsSchema` (Migration B); add `PathwayDatasetManifestSchema`/`PathwayDatasetRecordsSchema` (Migration C, new, modeled on `StreamDatasetManifestSchema`) |
| contract | `packages/contracts/src/catalog.ts` (or a new `packages/contracts/src/ai-generation.ts`) | new — `AiGenerationRunSchema`/`AiGenerationItemSchema` types + per-target draft schemas (`PathwayDraftSchema`, `CollegeDraftSchema`, `CollegeProgramDraftSchema`, `StreamMapItemDraftSchema`) |
| infrastructure | `packages/knowledge/src/infrastructure/postgres-college-dataset-publisher.ts` | modify — stop hardcoding `admission_route`/`fees_band`/`external_code` to `null` |
| application | `packages/knowledge/src/application/import-pathway-dataset.ts` | new — modeled directly on `import-stream-dataset.ts` |
| application | `packages/knowledge/src/application/validate-pathway-records.ts` | new — modeled on `validate-stream-records.ts` |
| infrastructure | `packages/knowledge/src/infrastructure/postgres-pathway-dataset-publisher.ts` | new — modeled on `postgres-stream-dataset-publisher.ts` |
| infrastructure | `packages/knowledge/src/infrastructure/gemini-catalog-drafter.ts` | new — the `CatalogDrafter` module (§16) |
| application | `packages/knowledge/src/application/detect-catalog-gaps.ts` | new — deterministic gap queries (§9) |
| application | `packages/knowledge/src/application/ai-generation-store.ts` (or similar) | new — read/write helpers for `ai_generation_runs`/`items`, used by both the generator and review scripts |
| CLI script | `scripts/ingest/generate-ai-catalog-drafts.ts` | new — the offline generator (§10) |
| CLI script | `scripts/ingest/review-ai-catalog.ts` | new — the review CLI (§12) |
| CLI script | `scripts/ingest/promote-ai-catalog.ts` | new — the promotion script (§12), calls existing + new importers |
| CLI script | `scripts/ingest/import-pathways.ts` | new — modeled on `scripts/ingest/import-streams.ts`, drives the new Migration C importer |
| domain | `packages/recommendations/src/domain/geo-scope.ts` | new — `resolveGeoScope()` (§13) |
| domain | `packages/recommendations/src/domain/state-adjacency.ts` | new — static constant (§13) |
| infrastructure | `packages/recommendations/src/application/recommendation-data-source.ts` | modify — `loadStreams()`/`loadPathways()` segment+fallback query (§14); `topRiasecCode()` canonicalization fix |
| seed | `packages/assessment/scripts/seed-intake.ts` | modify — add `location_preference` to `pathfinder` array (§13) |
| seed data | `data/seed/knowledge/{education-routes,disciplines,stream-options}/<date>/` | new — the curated §8-step-1 batch, same manifest+records shape as existing seed dirs (education-routes/disciplines are new dataset kinds; confirm at implementation time whether these warrant their own manifest type or fold into an extended stream dataset, since `StreamDatasetRecordsSchema` already carries `educationRoutes`) |
| seed data | `data/seed/knowledge/stream-maps/<date>/` | new — the §8-step-2 batch (or folded into the streams dataset, since `StreamDatasetRecordsSchema` already includes `streamMaps`/`streamMapItems`) |
| test | `packages/knowledge/src/application/*.test.ts` | new — for every new application file above |
| test | `packages/recommendations/src/domain/geo-scope.test.ts` | new |
| test | `packages/recommendations/src/application/recommendation-data-source.test.ts` | new/modify — segment+ordering fix coverage (check if this file exists today; if not, this is the first test for this file) |
| documentation | `docs/data-model/module-3-knowledge-data-model.md` | modify — document `ai_generation_runs`/`items`, the `stream_maps.segment` column (currently undocumented, per the investigation), and the extended college/new pathway dataset contracts |
| documentation | `docs/poc/stream-college-plan-ai-integration.md` | modify — mark superseded/reconciled by this plan where they diverge (the Postgres-store correction, the reviewStatus-literal finding, the missing-pathway-importer finding) |

---

## 25. Implementation Phases

Dependency-ordered, not alphabetical — each phase is independently shippable and testable.

### Phase 0 — Deterministic prerequisite fixes (no Gemini, no new tables)
- **Goal:** stop the catalog work from inheriting two pre-existing bugs.
- **Files:** `recommendation-data-source.ts` (segment+fallback query, canonicalization fix),
  `state-adjacency.ts` + `geo-scope.ts` (new), `seed-intake.ts` (Pathfinder question).
- **Schema changes:** none.
- **Tests:** §14's and §13's unit tests; full existing recommendation domain suite re-run green.
- **Dependencies:** none — can start immediately.
- **Acceptance criteria:** a fixture profile with `I` scoring higher than `R` retrieves the same
  stream candidates as one with `R` scoring higher (same underlying pair); a `NULL`-segment
  `stream_maps` row is retrieved for every segment when no segment-specific row exists; a
  Pathfinder profile with `location_preference=anywhere_in_india` produces
  `neighboringStates` covering all other states/UTs when fed through `resolveGeoScope()`.

### Phase 1 — Curated base vocabulary (no Gemini required, optionally Gemini-assisted drafting)
- **Goal:** publish `education_routes`, `disciplines`, `stream_options`, and the 15
  `stream_maps`/`stream_map_items` rows described in §8.
- **Files:** seed data directories (§24), run through existing `import-stream-dataset.ts` for
  the stream-related pieces; education_routes/disciplines need a decision (§28) on whether they
  ride along inside the streams dataset shape or need their own.
- **Schema changes:** none.
- **Tests:** existing `validateStreamRecords` coverage extended with the new fixture data;
  `loadStreams()` integration test against the newly seeded 15 rows.
- **Dependencies:** Phase 0 (so the loader fix is in place before this data is exercised).
- **Acceptance criteria:** every RIASEC pair returns at least one verified, correctly-scored
  stream candidate for all three segments.

### Phase 2 — AI generation staging infrastructure
- **Goal:** land Migration A and the read/write helpers, with no Gemini calls yet — testable with
  fixture data end to end.
- **Files:** `supabase/migrations/<date>_ai_generation_staging.sql`,
  `ai-generation-store.ts`, contract types.
- **Schema changes:** Migration A.
- **Tests:** dedupe/uniqueness constraint tests, CRUD-shape tests against a fixture run/item.
- **Dependencies:** none beyond Phase 0/1 being conceptually understood (no code dependency).
- **Acceptance criteria:** inserting two items with the same natural key for the same entity
  type fails at the DB constraint level, exactly as designed.

### Phase 3 — Gemini catalog-drafting module + pathway generation (first real end-to-end slice)
- **Goal:** the smallest full loop — pathways only (career-driven, no geography, no college
  complexity) — proving the whole pipeline works before adding colleges.
- **Files:** `gemini-catalog-drafter.ts` (pathway method only), `import-pathway-dataset.ts` +
  publisher (Migration C), `generate-ai-catalog-drafts.ts` (pathway mode),
  `review-ai-catalog.ts`, `promote-ai-catalog.ts`.
- **Schema changes:** Migration C (contract/importer code, likely no DDL).
- **Tests:** full §20 integration-test list for the pathway target specifically.
- **Dependencies:** Phase 1 (disciplines/routes must exist to reference), Phase 2 (staging
  tables), the O*NET career catalog (already real, no dependency work needed).
- **Acceptance criteria:** running the generator against the ~50-60 seed careers produces
  reviewable drafts; approving and promoting a batch results in `knowledge.pathways` rows
  visible to `loadPathways()` only after `publication_status`/`verification_status` are flipped
  correctly; a re-run over the same careers makes zero new Gemini calls (cache hit).

### Phase 4 — College + college-program generation (state-by-state)
- **Goal:** extend the same pipeline to colleges, exercising the state/geography dimension.
- **Files:** `gemini-catalog-drafter.ts` (college + program methods), Migration B (contract/
  publisher extension), generator/review/promote scripts extended for the college target.
- **Schema changes:** Migration B (likely code-only).
- **Tests:** full §20 integration-test list for colleges; the geo-band regression test (§20) now
  has real multi-state data to exercise all three bands.
- **Dependencies:** Phase 1 (disciplines), Phase 2 (staging), Phase 0 (geo-scope, so the new
  colleges are immediately useful to a real request).
- **Acceptance criteria:** for each of the 3 seed states, at least one discipline has ≥5 verified
  colleges after promotion+verification; a student from a neighboring state sees the
  `'neighboring'` ring populated where it was previously empty.

### Phase 5 — Gap detection (offline batch)
- **Goal:** turn §9's deterministic checks into a scheduled job feeding Phase 3/4's generator
  automatically instead of manually curated gap lists.
- **Files:** `detect-catalog-gaps.ts`, a gap-queue table or reused staging convention (decide at
  implementation time whether this needs its own table or can be a computed view over
  `ai_generation_runs` absence — open decision, §28).
- **Schema changes:** possibly none (if implemented as a query, not a stored queue) or one small
  table (if a persistent queue is preferred for auditability of "we knew about this gap since
  X").
- **Tests:** §20's gap-detection unit tests.
- **Dependencies:** Phases 1-4 (needs real published data to have thresholds to compare against
  meaningfully).
- **Acceptance criteria:** the job correctly identifies at least the intentionally-left-thin 4th
  state as a college gap, and does not flag any of the 3 already-seeded states as gaps for their
  seeded disciplines.

Plan/mission work (§15, "B") is explicitly **not** a phase in this sequence — it's independent
product work that can proceed in parallel on its own timeline without blocking or being blocked
by Phases 0-5.

---

## 26. Acceptance Criteria (rollup)

- Zero changes to any file under `packages/recommendations/src/domain/`.
- Every existing test in the repository still passes unmodified.
- A student's stream/pathway results now vary correctly by which of two tied-adjacent RIASEC
  letters scored higher (Phase 0) and, where a segment-specific mapping exists, by segment
  (Phase 0 fix, populated as real segment-specific content only if a future gap-fill batch
  chooses to add one — the MVP ships general/`NULL` mappings only, which is itself correct
  per §8/§14).
- A Pathfinder student can express a location preference and have it affect college ring
  placement identically to how Launcher's already does (Phase 0).
- At least 3 states have real, `verified`, Gemini-drafted-then-human-approved college+program
  coverage across several disciplines (Phase 4).
- At least ~50 careers have a real, published, Gemini-drafted-then-human-approved pathway
  (Phase 3).
- No AI-drafted row is ever visible to a student before a human has explicitly verified it.
- No API request schema anywhere accepts a client/AI-supplied score, rank, ring, or tier.
- Re-running the generator over already-processed gaps makes no new Gemini calls and creates no
  duplicate rows.

---

## 27. Rollback Strategy

| Component | How to roll back |
|---|---|
| AI-drafted catalog rows | Set `verification_status`/`publication_status` back to `'retired'`/`'stale'` for the affected `dataset_version_id` — the exact same mechanism already used for any catalog swap (§29); loaders exclude them immediately, no code change needed. |
| A whole dataset version | `knowledge.dataset_versions.import_status = 'superseded'` (existing enum value) — rows referencing it stay resolvable for historical recommendation replay (existing guarantee, `module-2-recommendation-data-model.md` §9), just excluded from new runs. |
| Staging records | Never need "rollback" in the destructive sense — `ai_generation_items`/`runs` are an append-only audit log; a bad run is marked `rejected`/`superseded`, never deleted. |
| Segment-filtering loader change (§14) | A single-function revert (`loadStreams()`/`loadPathways()` back to the old unconditional hardcode) — no data migration needed either direction, since the underlying `stream_maps.segment` column and data are unaffected by which query logic reads them. |
| Geo-scope change (§13) | Revert to omitting `selectedState`/`neighboringStates` from the request (the existing default-to-`profile.state`/`[]` behavior in `scoreColleges()` already handles their absence gracefully) — no data change involved, purely caller-side. |
| Pathway/college importer extensions (Migrations B/C) | Both are additive (new optional contract fields, a new importer for a previously-unsupported table) — reverting means simply not calling the new/extended code paths; no existing data or existing importer behavior for careers/streams/aid is touched by either. |
| **Overall kill switch:** | Because every AI-sourced row is identified by `dataset_version_id`/`knowledge_sources.trust_level` and gated by `verification_status`, disabling "all AI-assisted catalog data" at once is one `UPDATE ... SET verification_status='retired' WHERE dataset_version_id IN (...)` per affected table — the recommendation engine requires zero code change to honor this, since it already filters on that column today. |

---

## 28. Future Real-Dataset Migration

Exactly the pattern already proven for careers (923-row O*NET replacing a 30-row hardcoded list,
zero changes to `career-matching.ts`), generalized:

```
AI temporary dataset (verification_status='verified', dataset_version_id = V_ai)
        │
        │  new official/researched dataset arrives (e.g. a licensed college directory)
        ▼
new ingest script maps the real dataset → the SAME manifest+records shape
(reusing the same Zod contracts this plan builds/extends — no new shape invented)
        │
        ▼
new dataset_version_id = V_real, published, verification_status='verified'
        │
        ▼
old AI-drafted rows for the same real-world entities: verification_status→'retired'
(matched by natural key — same normalization logic as §11's dedupe check, reused here
 to decide which AI rows the real import supersedes)
        │
        ▼
recommendation-data-source.ts loaders — UNCHANGED — now return V_real rows only
        │
        ▼
inputHash changes for any affected student (V_ai no longer in the candidate set) →
findByInputHash() misses → a fresh recommendation run is computed and stored
        │
        ▼
historical recommendation_items rows that referenced the retired V_ai rows remain
resolvable (entity_snapshot_json + entity_dataset_version already captured at run time,
per the existing recommendation.recommendation_items schema) — nothing about deleting
or retiring a catalog row deletes or breaks a past run
```

**Why this requires zero recommendation-engine changes:** every loader
(`loadStreams`/`loadPathways`/`loadColleges`) already selects purely on
`verification_status`/`publication_status`/`status`, never on `dataset_version_id` value,
`knowledge_sources.trust_level`, or any AI-provenance signal — so "real data replaces AI data" is
indistinguishable, from the scorer's point of view, from "dataset version 3 replaces dataset
version 2," which is a case this codebase already handles correctly today (careers already did
it once).

---

## 29. Open Decisions / Trade-offs

1. **Staging shape confirmed as tables** per the user's explicit direction — no longer open, but
   worth re-flagging: this is more upfront schema work than a draft-file directory, in exchange
   for real dedupe constraints and a queryable review queue. Accepted trade-off.
2. **`education_routes`/`disciplines` dataset shape:** fold into an extended streams dataset (since
   `StreamDatasetRecordsSchema` already carries `educationRoutes`/`pathways` fields, curiously —
   worth re-checking at implementation time whether that's a hint the original schema author
   intended routes to ride along with streams) vs. giving them their own manifest type. Low
   stakes either way; decide when writing Migration Phase 1's actual contract code.
3. **Gap-queue persistence (Phase 5):** a stored table (auditable "known since when") vs. a
   pure computed check each run (simpler, no new schema). Recommend starting with the computed
   check — add a stored queue only if the batch job's own run-time becomes a problem or an
   audit trail of gap history is specifically requested.
4. **Segment-specific pathway content:** no `pathways.segment` column proposed in this plan,
   since nothing in the investigation shows pathway *content* needing to differ by segment (only
   plan *framing* does, which is unrelated per §15). Revisit only if a real product need appears.
5. **`stream_map_items.rank` for AI-assisted content:** this plan classifies rank as backend/
   human-assigned, not Gemini-decided (§6) — but doesn't fully specify the assignment rule
   (alphabetical? priority-by-something?) since only 15 rows exist in the MVP and a human can
   just order them by hand. Revisit if this ever needs to scale past hand-ordering.
6. **`relevance_weight` on `pathway_disciplines`:** classified as "Gemini-proposes, backend
   clamps, human sanity-checks" (§6) — a genuinely soft call, since it's numeric but describes
   catalog structure, not a student. If review shows Gemini's proposed weights are consistently
   unreliable, tighten this to a small fixed set of allowed values (e.g. `{0.5, 0.75, 1.0}`)
   chosen by the reviewer instead of an arbitrary decimal from Gemini.
7. **Shared low-level Gemini request helper vs. independent client in `packages/knowledge`**
   (§16) — deferred to implementation time, depends on how invasive extracting a shared helper
   from `packages/counselor` turns out to be.
8. **Whether to ever populate `website_url` for AI-drafted colleges** — this plan recommends
   omitting it entirely for v1 (§6, §21); revisit only alongside a real verification step (a
   human actually clicking the link before publish), not as a Gemini-trust question.
9. **Bootstrap state selection (Karnataka/Maharashtra/other)** — flagged as a product choice in
   §8, not a technical one; needs a decision from whoever owns geographic rollout priority.

---

## What we should build now

The minimum required to make the temporary AI-assisted catalog work correctly, end to end, for a
small but real slice of the catalog:

- Phase 0's two deterministic bugfixes (segment/ordering-aware stream+pathway loading, geo-scope
  resolution) — these block correct behavior regardless of catalog richness and are cheap.
- The curated base vocabulary (education routes, disciplines, stream options, 15 general
  `stream_maps` rows) — Phase 1.
- The `knowledge.ai_generation_runs`/`ai_generation_items` staging tables — Phase 2.
- The Gemini catalog-drafting module, scoped to **pathways first** (simplest dependency chain,
  no geography, proves the whole loop) — Phase 3.
- The missing pathway dataset-import pipeline (contract + validator + publisher) — required by
  Phase 3, and a genuine pre-existing infrastructure gap independent of AI.
- The college dataset contract/publisher extension (admission route/fees/external code) —
  required before Phase 4 can produce useful college drafts.
- College + college-program generation for the 3 seed states — Phase 4.
- The CLI review and promotion scripts (Option A) — no UI.
- The deterministic gap-detection batch — Phase 5, so future coverage gaps are found without
  manual spreadsheet-tracking.

## What we should NOT build now

- A full-India crawler or any live web-retrieval/scraping infrastructure (§17) — nothing here
  requires it, and it's a materially larger feature than the actual need.
- An admin dashboard/UI for review (§12) — CLI is sufficient at current expected volume.
- Any runtime (in-request) Gemini call for recommendations, catalog lookup, or gap-filling —
  the entire design rests on Gemini staying offline-only (§18).
- A new `AiProvider` abstraction — the existing one is reused as-is.
- Any mechanism, table, or field that lets Gemini set a score, rank, ring, tier, or eligibility
  label, anywhere, ever.
- AI-generated plan content or plan logic — plans stay 100% deterministic (§15).
- A `pathways.segment` column or any other segment-specific catalog *content* dimension beyond
  the one that already exists for streams — no evidence it's needed yet.
- New microservices, message queues, or infrastructure beyond a Node CLI script and two new
  Postgres tables — the batch/offline model fits entirely inside the existing script execution
  pattern already used by `scripts/ingest/*`.
- A `knowledge.state_adjacency` database table — a static TS constant is sufficient until a
  concrete non-developer-editing need appears.

## What can wait until later

- Segment-specific `stream_maps` content (beyond the `NULL`-general MVP rows) — add only where a
  real content/wording reason to differ by segment is identified.
- Expanding college coverage beyond 3 states — driven by Phase 5's gap detection naturally, no
  new mechanism needed, just more generator runs.
- Real, sourced (not Gemini-knowledge) college/aid data via `knowledge.entity_source_links` —
  the schema already supports per-field source attribution; building an actual ingestion path
  for it is a separate, larger effort than this plan's scope.
- An admin review UI, once/if CLI-based review volume becomes unwieldy.
- A `content_source` column (distinguishing "AI-drafted" from "hand-authored" within the
  existing `unverified` status) as a first-class catalog column, if `ai_generation_items.promoted_entity_id`
  ever proves insufficient for some later provenance-reporting need.
- Plan/mission product work (§15 "B") — entirely independent, can proceed on its own schedule.
- Promoting state-adjacency from a code constant to a database table, if non-developer edits are
  ever required.

This is a planning document only. No code, migrations, seed data, or Gemini prompts have been
written. Awaiting approval before the implementation prompt and actual changes are produced.

---

## Implementation status (added 2026-09-11 — read this before assuming anything below is still just a plan)

Everything under "What we should build now" has been implemented in code, typechecked
(`npx tsc --noEmit`, clean across the whole repo) and covered by passing tests
(`npx vitest run` — 381 tests, 84 files, all green, including every pre-existing test). Nothing
was committed to git and no migration was applied to any database, per this project's own
working conventions.

**Two corrections found while implementing, both narrowing scope (less new code than planned):**

1. **§22/§23's "Migration C: new pathway dataset importer" was wrong — no new importer was
   needed.** Re-reading `packages/contracts/src/catalog.ts` and
   `postgres-stream-dataset-publisher.ts` before writing code showed `StreamDatasetRecordsSchema`
   already carries `pathways`/`educationRoutes` and its publisher already inserts
   `knowledge.pathways`/`education_routes` — a full pathway import pipeline already existed, just
   bundled inside the "streams" dataset rather than given its own type. The **only** genuine gap
   was `knowledge.career_pathways` (zero existing coverage anywhere). Fix actually shipped: added
   an optional `careerPathways: CareerPathwayLink[]` array to `StreamDatasetRecordsSchema`/
   `StreamDatasetManifestSchema`, extended `validateStreamRecords()` (new `DUPLICATE_LINK`/
   `ORPHAN_REFERENCE` checks, `knownCareerIds` param mirroring the college validator's
   `knownPathwayIds` pattern) and `PostgresStreamDatasetPublisher` (one new insert loop). No new
   contract type, importer, or publisher file.
2. **`StreamMapSchema.segment` was non-nullable in the contract**, even though
   `knowledge.stream_maps.segment` is nullable in the actual schema and Phase 1's whole "seed 15
   general (`segment=NULL`) mappings" strategy depends on being able to publish a null segment
   through the existing importer. Fixed: `segment: SegmentSchema.nullable()`.

**What's actually in the repo now** (see `git status` for the exact file list):

| Plan phase | Status |
|---|---|
| Phase 0 (segment/ordering loader fixes, geo-scope, Pathfinder intake question) | ✅ Done, tested |
| Phase 1 (curated education routes/disciplines/stream options/15 general stream_maps) | ✅ Seed files generated and verified against the real (unmodified) import validators — not yet imported into any database |
| Phase 2 (`ai_generation_runs`/`items` staging tables) | ✅ Migration written (`20260911000100_knowledge_ai_generation_staging.sql`) — not yet applied |
| College importer extension (admissionRoute/feesBand/externalCode) | ✅ Done, tested |
| Phase 3 (Gemini catalog-drafting module: pathways, colleges, stream-map-item reasons) | ✅ Done, tested against a fake `fetch` (including a test proving a forbidden `tier` field gets rejected) |
| CLI scripts (generate / review / promote) | ✅ Written, typechecked — **not run against a live database or a real Gemini API key**, since neither was available in the implementation environment |
| Phase 4 (college coverage for 3 real states) | ⏳ Tooling ready (`pnpm ai-catalog:generate --target colleges --state ... --discipline ...`); no actual Gemini calls have been made — running it is a manual step requiring `GEMINI_API_KEY`/`DATABASE_URL` |
| Phase 5 (deterministic gap detection) | ✅ `detectCatalogGaps()` built and wired into the pathway-generation CLI path; college gap-checking is available (`collegeCoverageTargets` option) but deliberately requires an explicit state/discipline list rather than auto-scanning all of India, per §9's own design |
| Frontend, plans/missions | Untouched — out of scope per §15 and the original brief |

**Manual steps still required from the user, in order** (per `[[db-migrations-manual-apply]]`):
1. Apply `supabase/migrations/20260911000100_knowledge_ai_generation_staging.sql`.
2. Re-run `packages/assessment/scripts/seed-intake.ts` to add Pathfinder's new
   `location_preference` question.
3. Import the two curated batches: `pnpm knowledge:import-streams data/seed/knowledge/streams/2026-09-11 --publish` and `pnpm knowledge:import-colleges data/seed/knowledge/disciplines/2026-09-11 --publish`.
4. Set `GEMINI_API_KEY`/`GEMINI_MODEL`/`DATABASE_URL`, then run
   `pnpm ai-catalog:generate --target pathways`, review with `pnpm ai-catalog:review --list`,
   approve/reject, then `pnpm ai-catalog:promote --run <runId>`.
5. Repeat step 4 with `--target colleges --state <state> --discipline <disciplineCode>` for each
   of the chosen seed states/disciplines (§8).
6. Separately, explicitly flip `verification_status`/`publication_status` to
   `verified`/`published` for whichever promoted rows a human has actually checked — promotion
   never does this automatically (§13).
7. Optionally regenerate `packages/database/src/database.types.ts` (`pnpm db:types`) once the
   migration is applied to a linked Supabase project.

---

## Live execution results (2026-09-11) — steps 1-5 above actually run, at the user's request

Everything in the "manual steps" list was executed against the real database and a real
Gemini API key already present in `.env` — not just built. Six real bugs were found and fixed
**only because this ran for real**, none of which code review or the unit-test suite had
surfaced:

1. **Migration applied.** `knowledge.ai_generation_runs`/`ai_generation_items` exist.
2. **`location_preference` added to Pathfinder** — but the first attempt hit
   `intake_questions_display_order_key` (a **global**, not per-segment, unique constraint on
   `display_order` — each segment reserves a block of 10: explorer 1-10, pathfinder 11-20,
   launcher 21-30). Fixed by using pathfinder's next free slot (18) instead of renumbering
   `support_needed`.
3. **Both curated seed batches published** — but two of the curated `education_routes` codes
   (`degree`, `iti`, `diploma`) and one discipline code (`computing`) collided with rows the
   *pre-existing* 2026-07-31 fixture had already published to this same database (`route_code`/
   `discipline_code` are unique separately from `id`, and the publisher's `on conflict (id)`
   doesn't catch a same-code-different-id collision). Caught before anything corrupted — the
   transaction rolled back cleanly both times (verified) — fixed by dropping the 3
   already-covered routes and the 1 already-covered discipline from the curated batch and
   reusing the existing rows instead. Also found and fixed two `recordCount`-vs-`recordCounts`
   manifest bugs (`CollegeDatasetManifestSchema` requires both fields; `StreamDatasetManifestSchema`
   only needs the latter) that only surface at actual import time, not in a type-check.
4. **Pathway generation: 63 careers, 86 published pathways, 148 career_pathways links, 184
   pathway_disciplines links, 0 failed runs remaining.** Along the way: (a) a `pathway_code`
   collision between two independently-drafted pathways (Gemini invents codes per-call with no
   visibility into other calls) — fixed with a deterministic disambiguating suffix at promotion
   time; (b) a cache-vs-retry bug where a `rate_limited` Gemini call permanently blocked retries
   (the unique `(target_table, input_hash)` cache key doesn't distinguish "genuinely cached" from
   "failed, please retry") — fixed so only non-`failed` runs count as a cache hit, and `createRun`
   upserts a `failed` row in place rather than violating the unique constraint on retry; (c) both
   the stream and college validators needed a new "these IDs are already published, don't require
   them in this batch" escape hatch (`knownEducationRouteIds`/`knownCareerIds`/`knownDisciplineIds`/
   `knownCollegeIds`) — promoted pathways/programs routinely reference entities from *earlier*
   batches, which the existing validators (reasonably, for hand-authored datasets) didn't
   anticipate; (d) the promotion script's idempotency handling needed two passes to get right —
   first, a partially-failed run's already-promoted items were being silently re-submitted
   (harmless for `pathway_disciplines`, which upserts, but `college_programs`/`pathways` have no
   natural key to upsert against); the fix skips already-promoted items entirely except for the
   one genuinely-upsertable sub-relationship (pathway↔discipline links).
5. **College generation: 5 Tamil Nadu disciplines (computing, mechanical-engineering, nursing,
   commerce-accounting, visual-communication-design), 16 colleges, 23 programs, all
   `verification_status='unverified'` pending human review.** This surfaced the single largest
   real finding of the whole session: **Gemini's `responseJsonSchema` support has two
   undocumented limits**, isolated by live bisection (the API returns a bare `400
   INVALID_ARGUMENT` with no field-level detail):
   - An array nested two levels deep tolerates far fewer nullable (`type: [x, "null"]`) fields
     on its item schema than the same shape does one level up — the natural "colleges, each with
     a nested programs array" shape (3 nullable fields: durationBand/admissionRoute/feesBand)
     tripped this reliably.
   - Independently, an array's `maxItems` has a ceiling somewhere between 20 and 30 for an
     object this wide (7 properties) — above it, the request is rejected even with zero nesting.
   Fixed by restructuring the Gemini-facing schema into two sibling top-level arrays
   (`colleges`, `programs`, cross-referenced by `collegeName`) instead of nesting one inside the
   other, and capping `programs.maxItems` at 20 — `draftColleges()` re-assembles the nested
   `CollegeDraftBatch` shape the rest of the codebase already expects, so nothing outside
   `gemini-catalog-drafter.ts` needed to change. See that file's own comment for the full
   isolation trail. **This finding is worth remembering for any future Gemini
   `responseJsonSchema` work in this codebase, not just this pipeline.**

All 102 staged items across both entity types ended up `approved` and `promoted_entity_id`
set — 0 left in `approved_not_promoted`, 0 `failed_runs` remaining. Every promoted row is
`publication_status='draft'` (pathways) or `verification_status='unverified'` (colleges/
programs) — **none of it is visible to a live student recommendation yet**; a human still needs
to review the content (a representative sample was spot-checked during this session and was
consistently well-formed and plausible) and explicitly flip the relevant rows before they enter
`loadPathways()`/`loadColleges()`'s results, exactly as designed in §13.
