# Stream / College / Plan Rollout — Geo-Aware Recommendations + Gemini-Assisted Catalog

> **Status:** planning document, written 2026-09-11. Nothing here is built yet except what
> Part 1 documents as already existing. Companion docs: `docs/poc/career-recommendation-full-workflow.md`
> (career pipeline, fully wired, worked example) and `docs/poc/launcher-goal-based-recommendations.md`
> (which tabs show per segment/goal — unchanged by this plan).

## 0. TL;DR

The scoring pipeline for **streams, pathways, colleges and plans is already fully built and
wired to Postgres** — same quality bar as Career (`packages/recommendations/src/domain/*.ts`
+ `recommendation-data-source.ts` + `recommendation-routes.ts`). What's actually missing:

1. **Real catalog rows** — `knowledge.colleges`, `college_programs`, `stream_options`,
   `stream_maps`, `pathways` currently hold only mock-seed data (~10 rows). This is where
   Gemini comes in: as an **offline content drafter that fills catalog tables**, reviewed by a
   human before publish — never as a live scorer. The existing architecture explicitly forbids
   AI-provided scores/ranks/tiers (`docs/data-model/module-2-recommendation-data-model.md`
   §10: *"No LLM-provided score, rank, ring or eligibility label is accepted by write APIs"*;
   the college `tier` column is commented *"never inferred by AI"*). This plan keeps that rule
   intact — Gemini proposes descriptive/structural content, a human promotes it, and the exact
   same deterministic scoring code runs over it afterward.
2. **Geographic/relocation wiring** — the college scorer already accepts `selectedState` +
   `neighboringStates`, but nothing today computes those from the student's actual answer.
   Pathfinder also doesn't have a relocation question yet (Launcher does: `location_preference`).
3. **Plan content** — Explorer/Pathfinder/Launcher plan *templates* (the actual step text) barely
   exist; Pathfinder's plan type needs to change to a 90-day shape; Explorer's steps need to
   actually produce `recommendation.missions` rows, which nothing does today.
4. **Frontend screens** for Stream/Pathway/College/Plan tabs (only Career is built).
5. **A durable recommendation cache** — the dedupe-by-input-hash logic you're asking for
   ("save it, reuse if it all matches") **already exists** in
   `recommendation-service.ts`'s `save()`, but only against an in-memory store. It needs a
   Postgres-backed `RecommendationStore` to actually persist across requests/restarts.

---

## 1. What's already built — don't rebuild this

| Layer | File | Status |
|---|---|---|
| Stream scoring | `packages/recommendations/src/domain/stream-recommendations.ts` | ✅ done, segment-agnostic |
| Pathway scoring | `.../pathway-recommendations.ts` | ✅ done |
| College scoring + ringing | `.../college-recommendations.ts` | ✅ done, already takes `selectedState`/`neighboringStates` |
| Plan generation (template fill) | `.../plan-generation.ts` | ✅ done, but template *content* is thin and Pathfinder's `planTypeForSegment` maps to `"pathway"`, not a 90-day shape (§5) |
| DB-backed catalog loaders | `packages/recommendations/src/application/recommendation-data-source.ts` (`loadStreams`/`loadPathways`/`loadColleges`) | ✅ done, real SQL against `knowledge.*` |
| HTTP routes | `packages/recommendations/src/http/recommendation-routes.ts` | ✅ stream/pathway/college/plan endpoints all exist, same shape as the career endpoint |
| Run/kind caching (dedupe by input hash) | `recommendation-service.ts` → `store.findByInputHash(profileSnapshotId, kind, inputHash)` | ✅ logic done, ⚠️ backed only by `createInMemoryRecommendationStore()` today — needs a Postgres store (§7.3) |
| DB schema for runs/items/rings/plans/missions | `docs/data-model/module-2-recommendation-data-model.md` + `.dbml` | ✅ fully designed, matches the code's contracts |

None of the six domain scoring files need to change for anything in this plan. Everything
below is: catalog data, intake, plan templates, a persistence layer, and a new AI-assisted
ingest pipeline that only ever writes to *catalog* tables, offline.

---

## 2. The one architectural rule every AI decision below has to respect

> Gemini may **draft descriptive/structural catalog content** (a college's disciplines, a
> stream's subject list, a plan step's wording). Gemini may **never** produce a `fit_score`,
> `rank`, `ring`, `tier`, or eligibility label — those stay 100% deterministic, computed by the
> existing domain code from whatever catalog rows are currently published/verified.

This is not a new constraint I'm inventing — it's already the stated rule for this codebase.
It's also exactly what makes "swap in a real dataset later" free: the scoring code doesn't
know or care whether a `knowledge.colleges` row came from a human, a licensed dataset import,
or a reviewed Gemini draft. It only cares that the row is `verification_status = 'verified'`.

---

## 3. Geography / "willing to relocate" wiring

### 3.1 Intake gap

Launcher already has this (`location_preference`, options `same_city / same_state /
anywhere_in_india / remote / not_sure` — `packages/assessment/scripts/seed-intake.ts`).
**Pathfinder does not** — add the identical question to Pathfinder's question set (same
`question_key`, same options, next `display_order` after `constraints`). No schema migration
needed, `assessment.intake_questions` already supports it — just add a row in `seed-intake.ts`
and re-run it (per [[db-migrations-manual-apply]], you run that yourself).

Explorer intentionally gets no location question — Explorer never shows the College tab
(`launcher-goal-based-recommendations.md` Part 1), so there's nothing for it to drive.

### 3.2 Turning the answer into `selectedState` / `neighboringStates`

`college-recommendations.ts` already has exactly the two inputs needed
(`resolveStateBand()` → `selected` / `neighboring` / `other`, weighted 1.0 / 0.75 / 0.4). No
domain code changes — just compute these two values before calling `recommendColleges()`:

| `location_preference` | `selectedState` | `neighboringStates` |
|---|---|---|
| `same_city` / `same_state` | student's profile state | `[]` — only home state scores "selected"; everywhere else is `other` (0.4), correctly narrowing the list |
| `not_sure` (or unanswered) | student's profile state | looked up from a static state-adjacency table (§3.3) |
| `anywhere_in_india` / `remote` | student's profile state | **every other Indian state/UT** — so nothing scores as `other`; state stops penalizing at all, ranking runs purely on discipline/tier/access-route |

This is a small pure function (`resolveGeoScope(locationPreference, homeState)`), one new
file, no changes to `college-recommendations.ts`, `recommendation-service.ts`, or the routes —
it just decides what to pass into the request that already exists.

### 3.3 State adjacency data

A fixed lookup of India's states/UTs → their bordering states. This is geography, not
something that benefits from an LLM or needs review — ship it as a plain TS constant
(`packages/recommendations/src/domain/state-adjacency.ts`, e.g. `{ "Tamil Nadu": ["Kerala",
"Karnataka", "Andhra Pradesh", "Puducherry"], ... }`). If it ever needs non-developer editing,
promote it to a `knowledge.state_adjacency(state text primary key, neighboring_states
text[])` table later — not needed for v1.

---

## 4. Plan generation: Explorer missions + Pathfinder 90-day + Launcher 90-day

### 4.1 The one required code change

`plan-generation.ts`'s `planTypeForSegment()` currently maps:
`explorer → "exploration"`, `pathfinder → "pathway"`, `launcher → "career_90_day"`.

You want Pathfinder on a 90-day shape too. Change the mapping so **both Pathfinder and
Launcher** resolve to `"career_90_day"`, and seed *segment-specific* template rows —
`plan_templates.segment` already scopes templates independently of `plan_type`, so this is a
one-line code change plus new template content, not a schema change:

```ts
function planTypeForSegment(segment): PlanTemplateCatalogRecord["planType"] {
  if (segment === "explorer") return "exploration";
  return "career_90_day"; // pathfinder and launcher both get a 90-day plan now
}
```

### 4.2 Template content to seed (via a migration, same pattern as existing `plan_templates` rows)

| Segment | `plan_type` | Shape | Example steps |
|---|---|---|---|
| Explorer | `exploration` | 3 weekly steps (unchanged from the POC doc's worked example) | Week 1: compare two subjects in your top stream · Week 2: talk to one trusted adult · Week 3: observe one local example |
| Pathfinder | `career_90_day` | Days 1–30 / 31–60 / 61–90, framed around the top **pathway**, not just career | 1–30: shortlist entrance requirements for {{targetTitle}} · 31–60: complete one practice task tied to the pathway · 61–90: confirm backup route + real application dates |
| Launcher | `career_90_day` | Days 1–30 / 31–60 / 61–90, framed around the top **career** | Already documented in `launcher-goal-based-recommendations.md` §4.4 — seed exactly that |

### 4.3 Making Explorer's steps into actual `recommendation.missions` rows

Nothing today converts a `GeneratedPlanItem`'s `generatedSteps` into `recommendation.missions`
rows — that table exists in the schema but has no writer. Add a small deterministic mapper,
called only when `segment === "explorer"`, at the point a generated plan is persisted (API
layer, alongside wherever `generated_plans`/`generated_plan_steps` get inserted):

```ts
function deriveMissionsFromPlan(plan: GeneratedPlanItem): MissionRow[] {
  return plan.explanation.generatedSteps.map((step, i) => ({
    missionOrder: i + 1,
    missionText: step.actionText,
    missionType: classifyMissionType(step.actionKey), // research | conversation | observation | practice
  }));
}
```

`classifyMissionType` is a fixed lookup off the template's `action_key` (e.g. any
"compare/research" key → `research`, "talk to" → `conversation`, "observe" → `observation`) —
approved once, same spirit as `ring_reason_key`/`reason_key` elsewhere in this codebase. Still
zero LLM involvement; missions are just plan steps relabeled for the gamified Explorer UI.

---

## 5. New database objects

Nothing changes in the existing `recommendation.*` schema — it already fits. Two additions,
both in the `knowledge` schema, both purely for the AI-assisted catalog pipeline:

### 5.1 `knowledge.ai_generation_runs` — one row per Gemini call, doubles as the cache

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `target_table` | `text` | `stream_options` \| `colleges` \| `college_programs` \| `pathways` \| `plan_template_steps` |
| `provider` | `text` | `gemini` (kept generic so another provider can slot in later) |
| `model` | `text` | e.g. `gemini-2.5-pro`, whatever `GEMINI_MODEL` resolves to |
| `prompt_version` | `text` | Bump when the prompt template changes, so stale cache entries can be told apart |
| `input_params_json` | `jsonb` | The structured ask, e.g. `{ "state": "Tamil Nadu", "discipline": "civil_engineering" }` |
| `input_hash` | `text` | `sha256(target_table + prompt_version + input_params_json)` |
| `raw_response_json` | `jsonb` | Exactly what Gemini returned, kept for audit and re-parsing |
| `status` | `text` | `pending_review` \| `approved` \| `rejected` \| `superseded` |
| `reviewed_by` | `uuid` | Nullable, staff Auth ID |
| `reviewed_at` | `timestamptz` | Nullable |
| `created_at` | `timestamptz` | Required |

Unique on `(target_table, input_hash)` — **this is the "save it, reuse if it all matches" cache
for AI content**, a separate concern from the recommendation-run cache in §7. Before calling
Gemini, look up this table first; only call the API on a miss.

### 5.2 `knowledge.ai_generation_items` — one row per proposed catalog row inside a run

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `generation_run_id` | `uuid` | FK → `ai_generation_runs` |
| `proposed_entity_type` | `text` | `college` \| `college_program` \| `stream_option` \| `pathway` \| `plan_step` |
| `proposed_payload_json` | `jsonb` | The draft row's fields, shaped exactly like the target table's insertable columns |
| `matched_existing_id` | `uuid` | Nullable — set if this looks like a duplicate of an already-published row (dedupe on review) |
| `promoted_entity_id` | `uuid` | Nullable — filled in once a human approves and it's actually inserted |
| `created_at` | `timestamptz` | Required |

A review step (a script today, an admin screen later — same maturity level Module 4's
counselor tooling is at) flips `ai_generation_runs.status` to `approved` and, for each item,
inserts into the real `knowledge.colleges` / `stream_options` / etc. with
`verification_status = 'unverified'` (or `'verified'` if the reviewer is confident) and a new
`dataset_version_id` — exactly the existing publish flow, nothing special for AI-sourced rows.

---

## 6. Gemini integration — mechanics

You already have the pattern for this: `packages/counselor/src/infrastructure/gemini-ai-provider.ts`
calls `generateContent` with `responseMimeType: "application/json"` + `responseJsonSchema`, so
Gemini's output is schema-constrained JSON, then it's re-validated with Zod
(`parseAiProviderDraft`). Reuse that shape exactly for catalog drafting:

1. **New module**, e.g. `packages/knowledge/src/infrastructure/gemini-catalog-drafter.ts`,
   implementing a small `CatalogDrafter` interface (`draftColleges(input)`,
   `draftStreamSubjects(input)`, etc.) — same request/response plumbing as
   `GeminiAiProvider`, different system prompt + different `responseJsonSchema` per target
   table (e.g. a college draft schema: `name, city, state, institutionType, disciplines[],
   admissionRouteSummary, feesBand, websiteUrl` — deliberately **no `tier` field**, since tier
   is explicitly human-only per the existing schema comment).
2. **Offline CLI script**, `scripts/ingest/generate-ai-college-drafts.ts` (same family as the
   existing `scripts/ingest/generate-*-migration.ts` / `generate-*-profiles.ts` scripts) — takes
   a list of `(state, discipline)` gaps to fill, checks the `ai_generation_runs` cache, calls
   Gemini on a miss, validates with Zod, writes `pending_review` rows. This runs **outside**
   the live API — same as the O*NET ingest scripts — so it needs no changes to
   `apps/api`'s runtime config; it's a standalone Node script reading `GEMINI_API_KEY` /
   `GEMINI_MODEL` / `GEMINI_MAX_TOKENS` / `GEMINI_TIMEOUT_MS` (already in your `.env`) directly.
3. **Review step**: a second small script (or, once this matters enough, a page in whatever
   admin/counselor tooling Module 4 has) lists `pending_review` items, lets you approve/reject,
   and on approval runs the actual `insert into knowledge.colleges ...` with a fresh
   `dataset_version_id`, the same way `scripts/apply-*.ts` already do for hand-authored data.
4. **Nothing in `apps/api`'s request path calls Gemini.** The live recommendation endpoints
   only ever read already-published/verified catalog rows — nothing about a student's request
   triggers an AI call. This keeps latency, cost, and the "no AI in the scoring path" rule all
   satisfied at once.

---

## 7. Caching / reuse — two separate layers, don't conflate them

### 7.1 Recommendation-run cache (what you're asking for re: "save it, reuse if all matches")

Already built. `recommendation-service.ts`:

```ts
const save = async (set) => {
  const existing = await store.findByInputHash(set.profileSnapshotId, set.kind, set.inputHash);
  return existing ?? store.save(set);
};
```

`inputHash` is a hash of the profile snapshot + active config + every catalog row's id and
dataset version (see each domain file's `stableHash(...)` call). So: same student, same
snapshot, same active weights, same catalog version → identical hash → the previously computed
set is returned, nothing recomputed. This already covers career/stream/pathway/college/aid/plan
uniformly. **It already does exactly what you asked for.**

### 7.2 AI-content cache (a different thing — caching Gemini's output, not a student's result)

This is §5.1's `ai_generation_runs.input_hash` unique constraint — reuse a draft instead of
re-asking Gemini for the same `(state, discipline)` pair. Distinct concern, distinct table,
already covered above.

### 7.3 The one real gap: persistence

`createInMemoryRecommendationStore()` is the only implementation of `RecommendationStore`
today (`packages/recommendations/src/application/recommendation-store.ts`) — it dies with the
process. To make §7.1's cache actually durable, build a Postgres-backed `RecommendationStore`
that reads/writes `recommendation.recommendation_runs` / `recommendation_rings` /
`recommendation_items` (schema already fully specified in
`docs/data-model/module-2-recommendation-data-model.md` §5) — mirroring how
`postgres-recommendation-set-reader.ts` already reads that schema for the *read* side. This is
the single piece of infrastructure work that turns "already-built dedup logic" into
"actually-durable caching across requests and deploys."

---

## 8. Future: swapping in a real streams/colleges dataset

Because every layer above (`recommendation-data-source.ts`'s loaders, the domain scorers, the
API, the frontend) only ever reads `knowledge.stream_options` / `stream_maps` / `colleges` /
`college_programs` / `pathways` — never anything AI- or source-specific — replacing
Gemini-drafted rows with a licensed/official dataset later is the same recipe already used for
careers (`scripts/ingest/generate-onet-career-migration.ts` replaced a 30-row hardcoded catalog
with 923 O*NET-derived rows, zero changes to `career-matching.ts`):

1. Write a new ingest script mapping the new dataset's rows to the same table shape.
2. Insert under a new `dataset_version_id`.
3. `retire` (not delete) the AI-drafted rows — `retired_at` / `verification_status = 'retired'`
   — so historical recommendation runs that referenced them stay replayable
   (`module-2-recommendation-data-model.md` §9: *"Retired catalog entities remain resolvable
   for historical outputs"*).
4. Flip the new rows to `published` / `verified`.
5. Nothing in `packages/recommendations` changes. Nothing in the frontend changes.

---

## 9. Suggested build order

1. Pathfinder `location_preference` intake question (seed-intake.ts) + `resolveGeoScope()` helper + state-adjacency constant.
2. `planTypeForSegment` change + seed real `plan_templates`/`plan_template_steps` rows for all three segments (90-day for Pathfinder/Launcher, weekly for Explorer).
3. `deriveMissionsFromPlan()` + wherever generated plans are persisted, write `recommendation.missions` rows for Explorer.
4. Postgres-backed `RecommendationStore` (durability for the already-built cache).
5. Frontend: Stream/Pathway/College/Plan screens (Career's screen is the template to copy — ring map + detail sheet pattern already proven).
6. `knowledge.ai_generation_runs` / `ai_generation_items` migration.
7. `GeminiCatalogDrafter` + the offline ingest/review scripts, starting with colleges (highest-value gap) then stream subjects.
8. Run the drafter for your highest-priority states/disciplines, review, publish, watch real Stream/College tabs light up with real data.

## 10. Open decisions worth confirming before building

- **Pathfinder's 90-day plan framed around pathway or career?** §4.2 recommends pathway (matches Pathfinder's existing screen emphasis), but confirm — this only affects template wording, not schema.
- **Review step: script or a screen?** A CLI approve/reject script is enough for v1; only worth a UI once ingest volume makes a script tedious.
- **State-adjacency as code constant vs. DB table** — recommend code constant now (§3.3), promote later only if it needs non-developer edits.
