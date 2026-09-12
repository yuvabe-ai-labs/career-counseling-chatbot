# AI-Assisted Temporary Catalog — Repository Investigation Report

> **Status:** investigation only. No migrations, code, scripts, or Gemini prompts were written
> for this report. Every claim below is cited against an actual file, table, or migration in
> this repository — read on 2026-09-11, branch `development`, HEAD `ea92828`. Where an existing
> planning document already covers ground the user asked about, it is cited and then verified
> (agreed with, or corrected) against the real code — not taken on faith.
>
> Directly relevant prior art already in the repo, both consulted and checked line-by-line
> against current code while writing this report:
> - `docs/poc/stream-college-plan-ai-integration.md` (written earlier the same day) — proposes
>   almost exactly the seed+gap-fill architecture described in the user's request. Verified
>   largely accurate; two corrections are called out explicitly in §3 and §9 below.
> - `docs/data-model/module-2-recommendation-data-model.md` and
>   `docs/data-model/module-3-knowledge-data-model.md` — the design spec for the
>   `recommendation` and `knowledge` schemas. Verified against the actual migration SQL; a
>   handful of drifts (real code doing something the doc doesn't mention) are called out.

---

## 1. Repository understanding

**Monorepo shape:** pnpm workspaces (`pnpm-workspace.yaml`), TypeScript throughout.

- `apps/api` — Express API. Boot/wiring lives in `apps/api/src/app/create-app.ts` (assembles
  every module's routes against a real Postgres `Pool`) and `create-runtime-app.ts` (Lambda/HTTP
  runtime entry, resolves the `AiProvider` — Gemini or Anthropic — from env). Env validation:
  `apps/api/src/config/env.ts` (Zod schema, includes every `GEMINI_*` var).
- `apps/web` — Vite/React frontend.
- `packages/assessment` — Module 1: intake, RIASEC/WIP scoring, user profile, segment
  derivation, profile snapshots.
- `packages/knowledge` — Module 3: catalog domain (careers, colleges, streams, aid, disciplines),
  dataset import/validation/publish pipeline, Postgres + in-memory repositories.
- `packages/recommendations` — Module 2: all deterministic scoring domain code, the
  recommendation service/store, HTTP routes.
- `packages/counselor` — Module 4: chat/counselor orchestration, **this is where all existing
  AI-provider code lives** (Gemini + Anthropic clients, prompt/schema plumbing).
- `packages/database` — thin Postgres pool/Supabase client wrapper (`createDatabasePool`,
  `withTransaction`), generated `database.types.ts`.
- `packages/contracts` — every Zod schema shared across packages (request/response DTOs,
  catalog record types, dataset manifest schemas).
- `packages/safety`, `packages/evaluation`, `packages/test-fixtures` — Module 5, eval harness,
  shared fixtures (`packages/test-fixtures/src/module-2-demo.ts` is a full worked
  intake→career→plan fixture used by tests).
- `supabase/migrations/*.sql` — hand-written, sequential SQL migrations (no ORM). Applied
  manually by the user (see `[[db-migrations-manual-apply]]`), never by CI.
- `data/seed/knowledge/{careers,colleges,streams,aid-schemes,career-pathways,career-profiles,career-values}/<date>/` —
  a real, dataset-versioned **seed file format** (`manifest.json` + a records file), each
  imported by a script in `scripts/ingest/import-*.ts` through
  `packages/knowledge/src/application/import-*-dataset.ts` +
  `packages/knowledge/src/infrastructure/postgres-*-dataset-publisher.ts`. This is a mature,
  already-built ingestion pipeline — see §4 and §9.
- `scripts/ingest/generate-*-migration.ts` / `generate-*-profiles.ts` — a second, complementary
  pattern: scripts that read a large external source file (e.g. the O*NET spreadsheet at
  `data/raw/onet/interests-full/Career Interest Types.xlsx`) and emit a raw SQL migration
  directly, bypassing the manifest pipeline. Both patterns exist and are both "normal" in this
  codebase.
- `docs/data-model/module-{1..5}-*.md` + matching `*-storage-flow.md` + `*.dbml` — the schema
  design spec, module by module.
- `docs/poc/*.md` — working design/planning docs, explicitly not-yet-built specs (several say so
  in their own header, e.g. `launcher-goal-based-recommendations.md`: *"None of it is built into
  the app's screens yet."*). Do not mistake these for shipped behavior.

**Files most relevant to this feature**, concretely:

| Concern | File(s) |
|---|---|
| Deterministic scoring | `packages/recommendations/src/domain/{career-matching,stream-recommendations,pathway-recommendations,college-recommendations,aid-recommendations,plan-generation}.ts` |
| Catalog loading from Postgres | `packages/recommendations/src/application/recommendation-data-source.ts` |
| Recommendation persistence/cache | `packages/recommendations/src/application/recommendation-store.ts`, `recommendation-service.ts` |
| HTTP surface | `packages/recommendations/src/http/recommendation-routes.ts` |
| Existing Gemini client | `packages/counselor/src/infrastructure/gemini-ai-provider.ts` + `ai-provider-shared.ts` |
| AI provider port (interface) | `packages/counselor/src/application/ports/ai-provider.ts` |
| App wiring / env | `apps/api/src/app/create-app.ts`, `apps/api/src/config/env.ts` |
| Catalog import pipeline | `packages/knowledge/src/application/import-college-dataset.ts` (+ career/stream/aid siblings), `packages/knowledge/src/infrastructure/postgres-college-dataset-publisher.ts` |
| Dataset manifest contract | `packages/contracts/src/catalog.ts` |
| Intake questions per segment | `packages/assessment/scripts/seed-intake.ts` |
| Segment derivation | `packages/assessment/src/domain/user-profile.ts` (`deriveSegment`) |
| Schema (ground truth) | `supabase/migrations/20260727000100_phase_a_mvp.sql` |
| Mock/synthetic/real seed data | `supabase/migrations/20260805000*.sql`, `20260805000600_tn_dce_official_colleges_aid.sql` |

---

## 2. Current data model (verified against `supabase/migrations/20260727000100_phase_a_mvp.sql`)

The design docs (`module-2-recommendation-data-model.md`, `module-3-knowledge-data-model.md`)
match the real schema almost exactly. Table-by-table, with actual current data status (verified
by reading every seed migration, not assumed):

### `knowledge.dataset_versions` / `knowledge.knowledge_sources`
Fields exactly as documented (`id, source_key/dataset_key, version, checksum, import_status,
trust_level, ...`). **Real usage differs from the doc's enum**: the doc lists `trust_level` as
`authoritative | reviewed_secondary | internal_reviewed`, but actual seeded rows use
`'synthetic'` (mock data) and `'authoritative_external'` (TN DCE real data) — `trust_level` is
plain `text`, not a checked enum, so this is a soft-documentation drift, not a bug. **Already
supports** an AI-sourced value like `'ai_generated_unreviewed'` with zero schema change.

### `knowledge.stream_options`, `stream_maps`, `stream_map_items`
- `stream_options(id, stream_code, title, description, status)` — matches doc exactly.
- `stream_maps(id, top_two_code, version, dataset_version_id, status, segment)` — **the doc omits
  `segment`**; it was added later by
  `supabase/migrations/20260731000100_m3_stream_map_segment.sql` (`text`, checked to
  `explorer|pathfinder|launcher|null`, with a unique index over
  `(top_two_code, segment, version, dataset_version_id)`). This column exists specifically so a
  RIASEC top-two code can have **different** stream content per segment — but see §7, it is not
  currently used by the loader.
- `stream_map_items(map_id, stream_option_id, rank, reason_key)` — matches doc.
- **Current data:** 10 mock rows (`knowledge_mock_seed_10_rows.sql`, one `stream_map` per
  top-two-code, `segment` cycled `explorer/pathfinder/launcher` by row index — not semantically
  meaningful) + 10 realistic-looking synthetic stream **options** (`SYN-SCI-PCM`, etc. in
  `realistic_knowledge_mock_data.sql`) with **no corresponding `stream_maps`/`stream_map_items`
  rows** — i.e. the "nicer" synthetic streams are never actually reachable through
  `loadStreams()`, only the `MOCK-STREAM-*` ones are.
- **Can safely store AI-generated temp data:** yes, no FK/constraint obstacles.
- **What's missing for the proposed approach:** real RIASEC-code→stream content per segment;
  today one `stream_maps` row per top-two-code total, not per segment.

### `knowledge.pathways`, `career_pathways`, `pathway_disciplines`
- `pathways(id, pathway_code, title, description, education_route_id, duration_band,
  backup_route_note, publication_status, dataset_version_id)` — matches doc.
- `career_pathways(career_id, pathway_id, relationship_type, display_order)` — matches doc.
- `pathway_disciplines(pathway_id, discipline_id, relevance_weight, mapping_version)` — matches
  doc; this is the table `recommendation-data-source.ts`'s `loadTargetDisciplineIds()` reads to
  turn "top pathway" into "target disciplines" for college ranking.
- **Current data:** 10 mock (`MOCK-PATHWAY-*`) + 10 synthetic-but-readable
  (`SYN-PATH-SOLAR` etc., TN-flavoured but explicitly labeled synthetic/example.com). **Zero**
  real/official pathway rows exist.
- **Missing:** everything real. This is a genuinely empty catalog dimension today.

### `knowledge.colleges`, `disciplines`, `college_programs`
- `colleges(id, external_code, name, city, state, institution_type, tier, admission_route,
  fees_band, website_url, verification_status, last_verified_at, dataset_version_id, ...)` —
  matches doc exactly, including the doc's own comment that `tier` is "never inferred by AI".
- `disciplines(id, discipline_code, title, domain_code, status)` — matches doc.
- `college_programs(id, college_id, discipline_id, program_name, qualification_level,
  duration_band, admission_route, fees_band, verification_status, last_verified_at,
  dataset_version_id)` — matches doc.
- **Current data, three tiers, verified by reading the actual INSERTs:**
  1. 10 pure-mock rows (`MOCK-COLLEGE-*`, `tier=3` hardcoded, `institution_type='synthetic'`).
  2. 10 "realistic" synthetic Tamil Nadu colleges (`Aruvi Institute of Renewable Technology`
     etc.) — fictional names, `example.com` URLs, explicitly commented *"must not be represented
     as official or production facts."*
  3. **10 real Tamil Nadu government colleges** from
     `20260805000600_tn_dce_official_colleges_aid.sql`, sourced from the actual TN Directorate of
     Collegiate Education site (real `external_code`, real names/cities, real
     `tndce.tn.gov.in` URLs, `verification_status='verified'`, `trust_level='authoritative_external'`).
     But: `tier` is `NULL` for all 10, only **one** `college_programs` row per college (real
     catalogues list many programs per college — this is clearly a partial/demo import, not a
     full crawl), and **no discipline/program coverage outside Arts & Science** — no engineering,
     medicine, polytechnic, ITI, etc.
- **Missing for the proposed approach:** breadth (10 real colleges nationwide vs. needing
  state-by-state, discipline-by-discipline coverage), program depth per college, `tier` values
  (must stay human/reviewer-set per the schema comment — Gemini must never fill this field).

### `knowledge.careers`, `career_interest_profiles`, `career_value_profiles`, `career_profiles`
Per `[[career-recommendations-explore-plan]]`, already fully replaced with the real O*NET-derived
catalog (`20260910000100_onet_full_career_catalog.sql`, ~923 occupations) — **out of scope for
this feature**, already real, not part of the "no real dataset" problem.

### `recommendation.*` (matching_configurations, feasibility_rules, counselor_priorities, recommendation_runs, recommendation_rings, recommendation_items, plan_templates, plan_template_steps, generated_plans, generated_plan_steps, missions)
All match `module-2-recommendation-data-model.md` field-for-field, verified against the actual
`CREATE TABLE` statements. This schema owns **zero** catalog content — it only stores runs,
scores, and plan templates/instances. Nothing here needs to change to support an AI-assisted
catalog; the catalog lives entirely in `knowledge.*`.

**One migration slice not yet built:** `knowledge.ai_generation_runs` /
`ai_generation_items` (proposed by `docs/poc/stream-college-plan-ai-integration.md` §5) —
**confirmed absent** (grepped every migration file; no match).

---

## 3. Current recommendation pipeline (traced through actual code, not assumed)

1. **Intake → segment.** `packages/assessment/src/domain/user-profile.ts`'s `deriveSegment({age,
   selfStage})` maps `school→explorer`, `higher_secondary→pathfinder`,
   `college|graduate|working→launcher`, called from `user-profile-service.ts` at profile
   creation. Segment is **not** derived from RIASEC — it's a deterministic function of
   self-reported education stage, set once, stored on `assessment.user_profiles.segment` and
   copied into every `assessment.profile_snapshots.segment`.
2. **Intake questions differ by segment** — `packages/assessment/scripts/seed-intake.ts` defines
   three disjoint question lists (`explorer`, `pathfinder`, `launcher`) written into
   `assessment.intake_question_sets`/`intake_questions`. Verified: `location_preference` exists
   **only** under `launcher` (line 55, `display_order: 28`); Pathfinder has no such question.
   The script's own comment confirms `marks_band` is *"the only intake field actually consumed
   by exact-match recommendation logic anywhere"* (against `feasibility_rules.marks_band`).
3. **RIASEC scoring** — `packages/assessment/src/domain/scoring.ts`'s
   `scoreAssessmentResponses()` sums per-scale deltas, normalizes by max, picks the top-3 (career)
   or top-2 (WIP) as `resultCode`, and hashes input/output. This feeds
   `assessment.assessment_results` → `profile_snapshots.result_summary_json`.
4. **Profile snapshot → recommendation input** —
   `recommendation-data-source.ts`'s `loadProfile()` reads
   `assessment.profile_snapshots` directly by ID, reconstructs a `RiasecVector` from
   `result_summary_json` (`readRiasecVector`), and optionally a work-values vector
   (`readWorkValues`, present only if the WIP instrument was actually run — per
   `[[career-recommendations-explore-plan]]`, the frontend never triggers it today, so
   `workValues` is `undefined` for 100% of live users, and `career-matching.ts`'s weight
   redistribution kicks in for every request).
5. **Careers** — `career-matching.ts`'s `scoreCareers()`: Pearson correlation between normalized
   student/career RIASEC vectors → `interestFit`; `feasibilityRules` (from
   `recommendation.feasibility_rules`, keyed by segment+marksBand+route) → `feasibility`;
   `counselorPriorities` → `contextBoost`. Ships to `buildCareerRecommendationSet()`, ring-
   partitioned, hashed, saved via `recommendation-service.ts`.
6. **Streams** — `stream-recommendations.ts`'s `scoreStreams()`: RIASEC-letter overlap (top 3
   student letters vs. `stream.riasecLetters`) × 0.55 + `segmentFit` (stream's
   `recommendedSegments.includes(profile.segment)`) × 0.25 + marks-band match × 0.15 + catalog
   priority × 0.05. **Catalog loaded** by `recommendation-data-source.ts`'s `loadStreams()`,
   which queries `stream_maps`/`stream_map_items`/`stream_options` filtered only by
   `top_two_code` — **it does not select or use the `stream_maps.segment` column at all**, and
   hardcodes `recommendedSegments: ["explorer", "pathfinder", "launcher"]` on every returned
   record (line 222). So `segmentFit` is mathematically always `1` for every stream today,
   regardless of what's in the DB's `segment` column. Verified by reading both files side by
   side — this is a real, code-level gap, not a documentation gap.
7. **Pathways** — `pathway-recommendations.ts`'s `scorePathways()`: same shape (career/stream
   rank alignment + segmentFit + marksFit + reachability + backup-route bonus). Same catalog-
   loader gap: `loadPathways()` also hardcodes `recommendedSegments` to all three (line 262).
8. **Colleges** — `college-recommendations.ts`'s `scoreColleges()`: discipline overlap (0.45) +
   tier (0.2) + state-band fit (0.25) + access-route bonus (0.1), ring-partitioned by
   `resolveStateBand()` (`selected|neighboring|other`, weighted 1/0.75/0.4) into inner/middle/
   outer with an access-route rebalancing pass so vocational/polytechnic/ITI/open-university
   options always survive into the outer ring. **`selectedState`/`neighboringStates` are accepted
   parameters — nothing computes them from the student's answer today.** The
   `location_preference` intake answer exists (Launcher only) but nothing in
   `packages/recommendations` or `packages/assessment` reads it to build these two values; the
   route (`recommendation-routes.ts`) only forwards them if the caller supplies them directly.
9. **Geographic/state-adjacency logic** — does not exist yet in any form (no
   `resolveGeoScope()`, no state-adjacency table/constant). `college-recommendations.ts`'s
   `resolveStateBand()` is a pure string-match against whatever `selectedState`/
   `neighboringStates` it's handed — correct and complete on its own, just never fed real values.
10. **Plans** — `plan-generation.ts`'s `generatePlan()` picks one approved
    `recommendation.plan_templates` row by `(segment, planTypeForSegment(segment), targetEntityType)`
    and fills `{{targetTitle}}`/`{{state}}`/`{{targetType}}` placeholders via regex
    (`renderTemplate`). `planTypeForSegment()`: `explorer→"exploration"`,
    `pathfinder→"pathway"`, `launcher→"career_90_day"` — confirmed unchanged from what
    `docs/poc/stream-college-plan-ai-integration.md` describes as needing to change.
11. **Missions** — `recommendation.missions` table exists in the schema
    (`phase_a_mvp.sql` line 563) but **grepping the entire `packages/` tree for any INSERT/writer
    finds none** — only test/fixture files reference the word "missions" (as a plan-template
    title string, e.g. `"Explorer Safe Missions"`, in
    `packages/recommendations/src/application/module-2-demo-flow.test.ts:131`). Confirmed: no
    code path today converts a generated plan's steps into actual mission rows.
12. **Persistence/caching** — see §5, corrected from what the earlier planning doc assumed.

---

## 4. Current AI integration

**Provider abstraction:** `AiProvider` (`packages/counselor/src/application/ports/ai-provider.ts`)
— one method, `generateDraft(input): Promise<AiProviderResult>`, result is a discriminated union
(`completed | disabled | timed_out | failed`). Two implementations exist:
`GeminiAiProvider` and `AnthropicAiProvider`
(`packages/counselor/src/infrastructure/{gemini,anthropic}-ai-provider.ts`), both consuming
shared prompt/schema/parsing helpers from `ai-provider-shared.ts`.

**Gemini specifics** (`gemini-ai-provider.ts`):
- Calls `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  directly via `fetch` (no SDK dependency).
- Structured output: `generationConfig.responseMimeType: "application/json"` +
  `responseJsonSchema: counselorDraftJsonSchema` — **this is real schema-constrained JSON
  generation, already working**, not a plan.
- Re-validates the returned JSON with Zod (`ai-provider-shared.ts`'s `DraftSchema` /
  `parseAiProviderDraft`) even though the API already schema-constrained it — defense in depth.
- Timeout via `AbortSignal.timeout(timeoutMs)`; `TimeoutError`/`AbortError` map to a
  `timed_out` status; non-2xx (esp. 429) map to `failed` with an `errorCode` (`rate_limited`,
  `provider_http_{status}`); no retry loop exists anywhere in this file.
- Config: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MAX_TOKENS` (default 700, capped 4096),
  `GEMINI_TIMEOUT_MS` (default 60000), `GEMINI_THINKING_LEVEL` — all Zod-validated in
  `apps/api/src/config/env.ts`, wired in `create-runtime-app.ts`.
- **What it's used for today: only counselor chat message drafting.** The system prompt
  (`ai-provider-shared.ts`'s `counselorSystemPrompt`) explicitly forbids the model from doing
  anything else: *"Never calculate or change scores, ranks, rings, eligibility, URLs, or
  entities."* There is **zero** existing code that asks Gemini to draft catalog rows
  (colleges/streams/pathways) — that part of `stream-college-plan-ai-integration.md` is,
  correctly, marked as not-yet-built there too.
- **Cost/token controls:** only `maxOutputTokens`; no token-usage logging, no per-call cost
  tracking, no cache of prior Gemini calls anywhere in the codebase today (the `ai_generation_runs`
  cache-by-input-hash idea in the earlier planning doc is a **new** mechanism, not an existing one).

**Reusability for offline catalog generation:** yes, directly. `GeminiAiProvider`'s constructor
takes `{apiKey, model, maxTokens, timeoutMs, thinkingLevel}` and has no dependency on Express,
the counselor package's domain types, or a running server — it can be `new`'d from a standalone
Node script exactly the way `scripts/ingest/generate-onet-career-*.ts` scripts already run
outside `apps/api`. A catalog-drafting use would supply a different system prompt and a
different `responseJsonSchema` (e.g. a college-draft shape), reusing the exact same class,
`generateDraft` contract, and JSON-schema-then-Zod double-validation pattern. **No new AI
abstraction is needed.**

**Existing AI-generation-tracking metadata:** none. No table, column, or code anywhere records
"this row came from an LLM call" today. This is a genuine gap (see §8), though see the
manifest-based alternative below.

**A second, independently-relevant existing mechanism — the dataset import pipeline** —
(`packages/knowledge/src/application/import-college-dataset.ts`, with career/stream/aid
siblings) is a mature, already-built staged pipeline: parse a `manifest.json` (Zod-validated by
`CollegeDatasetManifestSchema` in `packages/contracts/src/catalog.ts`) + a records file, verify
checksum (`sha256`) and record counts match the manifest, Zod-validate every record
(`validateCollegeRecords`), then call a `Publisher.publish()` that writes to Postgres under a
`dataset_version_id`. Real manifests already carry provenance:
`data/seed/knowledge/colleges/2026-07-31/manifest.json` has
`reviewStatus: "approved"` and a nested `source: {sourceType, trustLevel, publisher, licenseRef}`
block. **Important, verified constraint:** the manifest's `reviewStatus` field is a hardcoded
`z.literal("approved")` in `packages/contracts/src/catalog.ts` (checked at lines 139, 254, 441,
578) — there is **no `"pending_review"`/`"draft"` value accepted by this schema today**. So this
pipeline can be reused as the *publish* step for AI-drafted content (a human reviews Gemini's
draft, edits it into the same manifest+records shape, and only then runs the unchanged existing
importer with `reviewStatus: "approved"`) — but it cannot, unmodified, hold an
unreviewed/pending AI draft. That staging function has to live somewhere else (a new table, or a
draft directory outside `data/seed/knowledge/` that never reaches the importer until approved).

---

## 5. Recommendation caching / persistence — **correction to the earlier planning doc**

`docs/poc/stream-college-plan-ai-integration.md` §7.3 states: *"`createInMemoryRecommendationStore()`
is the only implementation of `RecommendationStore` today... needs a Postgres-backed
`RecommendationStore`."* **This is out of date as of the current code.** Verified directly:

- `packages/recommendations/src/application/recommendation-store.ts` contains **both**
  `createInMemoryRecommendationStore()` **and** `createPostgresRecommendationStore({pool})` —
  the latter fully implemented: `save()` inserts into `recommendation.recommendation_runs`,
  `recommendation_rings`, `recommendation_items`, and (for `kind: "plan"`) also
  `recommendation.generated_plans`/`generated_plan_steps`, all inside one
  `withTransaction`; `findById()` reconstructs a full `RecommendationSet` by joining items+rings;
  `findByInputHash()` is the durable version of the "save it, reuse if it all matches" cache.
- **It is already wired at boot.** `apps/api/src/app/create-app.ts` line ~217:
  `recommendationStore = options.recommendationStore ?? (databasePool ?
  createPostgresRecommendationStore({pool: databasePool}) : undefined)`, and recommendation
  routes are only registered at all if a store resolved. In any real deployment (where
  `DATABASE_URL` is set), **the durable Postgres store is what's live today** — the in-memory
  store is a test/offline fallback, not the production path.
- So: the input-hash dedupe cache the user is asking about (§7.1 of that planning doc) is
  **already fully durable**, not a remaining gap. The one caveat: `recommendation_runs` rows
  reference `matching_configurations` by `(algorithm_version, weights_version)` lookup
  (`resolveConfigurationId`) — if a `dataset_version_id`/catalog change ever needs to invalidate
  a cached run independent of a config change, that's not modeled (the input hash embeds catalog
  entity IDs + dataset versions already, per each domain file's `stableHash()` call, so a catalog
  change **does** naturally produce a different hash and a fresh run — this already works
  correctly for AI-catalog swap-in, see §9).

---

## 6. Existing seed/mock data — exact inventory (see §2 for full detail; summary here)

| Table | Pure mock (`MOCK-*`) | "Realistic" synthetic (fictional, labeled) | Real | Total published |
|---|---|---|---|---|
| careers | superseded | superseded | **923 real O*NET rows** (out of scope, already solved) | 923 |
| pathways | 10 | 10 | 0 | 20 |
| stream_options | 10 | 10 (unreachable, no map rows) | 0 | 20 (10 usable) |
| stream_maps | 10 | 0 | 0 | 10 |
| colleges | 10 | 10 | **10** (TN DCE, Arts & Science only) | 30 |
| college_programs | 10 | 10 | 10 (1 per college) | 30 |
| disciplines | 10 | 10 | 10 | 30 |
| aid_schemes | 10 | 10 | **10** (real TN DCE schemes) | 30 |

This directly answers the user's instruction not to assume the seed is empty: **it is not
empty**, but every dimension except careers and (partially) aid/colleges is either fully
synthetic or a narrow single-state, single-discipline-family slice. **The existing seed
structure can absolutely be expanded by a script instead of hand-written rows** — that's
precisely what `scripts/ingest/import-colleges.ts` + the manifest format already do; a Gemini-
drafted dataset just needs to be shaped into the same `manifest.json` + records-file format
(after human review) to go through the exact same importer, dataset-versioned exactly like the
TN DCE import was.

---

## 7. Segment-specific behavior — verified, not assumed

- **Explorer:** intake = `school_board, class_level, favorite_subject, flow_activity,
  support_needed` (no location question — correct, since Explorer never needs geography).
  Plan type = `"exploration"`. No code path produces `recommendation.missions` rows (§3.11), so
  the gamified "missions" concept described in product docs has no backing writer yet.
- **Pathfinder:** intake = `education_stage, current_stream, marks_band, preferred_work_style,
  decision_confidence, constraints, support_needed` — **no `location_preference` question**,
  confirmed absent from `seed-intake.ts`. Plan type = `"pathway"` (not the 90-day shape the
  product docs describe for it).
- **Launcher:** intake includes `location_preference` (the only segment with it). Plan type =
  `"career_90_day"`.
- **Segment fit is genuinely computed** in `stream-recommendations.ts`/`pathway-recommendations.ts`
  (`segmentFit = recommendedSegments.includes(profile.segment) ? 1 : 0`, weighted 0.25/0.15
  respectively into the fit score) — the domain math is real and segment-aware.
- **But the DB-backed catalog loader defeats it**: `recommendation-data-source.ts`'s
  `loadStreams()`/`loadPathways()` hardcode `recommendedSegments: ["explorer", "pathfinder",
  "launcher"]` on every row (verified at lines 222 and 262), so `segmentFit` evaluates to `1` for
  every candidate regardless of the real `stream_maps.segment` column's value. **Net effect,
  verified against the actual code path a live request takes: two students with the same
  top-two RIASEC code but different segments receive identical stream/pathway candidate sets and
  identical segment-fit contribution to their score today**, even though the schema
  (`knowledge.stream_maps.segment`, added specifically for this) and the domain scoring both
  support differentiating them. This is the most concrete, code-verified "segment filtering is
  missing" finding in this investigation.
- **Tab visibility per segment** (which of career/stream/pathway/college/scholarship/plan shows)
  is fully speced in `docs/poc/launcher-goal-based-recommendations.md` — but that document's own
  header says this is *"the corrected target design... None of it is built into the app's
  screens yet."* Do not treat it as shipped; treat it as the design target for a frontend that
  doesn't exist yet for Stream/Pathway/College/Plan tabs (only Career has a frontend screen,
  per `[[career-recommendations-explore-plan]]`).

---

## 8. Plan architecture

- **Templates are static/deterministic**, stored as data
  (`recommendation.plan_templates`/`plan_template_steps`), selected by
  `(segment, planType, targetEntityType)` and filled by pure string substitution
  (`renderTemplate`'s `{{segment}}/{{state}}/{{targetTitle}}/{{targetType}}` placeholders) — **no
  AI involvement anywhere in plan generation today**, and none is proposed by this feature
  either. Template *content* (the actual step wording) is thin/placeholder-quality per
  `plan-generation.test.ts`'s fixtures, but that's a content-authoring gap, not an architecture
  gap.
- **Should the temporary AI catalog touch plans at all?** No, and there's no code reason it would
  need to. Plan generation only reads `recommendation.plan_templates` (owned by Module 2, not
  `knowledge.*`) plus a `PlanTarget` (a title string + entity type/id resolved from whichever
  career/stream/pathway the student already picked). A Gemini-populated `knowledge.colleges` row
  flows into a plan only indirectly, as `target.title` — never as template content. This
  cleanly matches the "Gemini drafts catalog rows, never plan/recommendation logic" separation
  the user is proposing.

---

## 9. Geographic recommendation logic

- `selectedState` / `neighboringStates`: accepted parameters on
  `college-recommendations.ts`'s `scoreColleges()`/`buildCollegeRecommendationSet()`, and on the
  `/api/v1/recommendations/colleges` route body — **fully implemented on the receiving end.**
- `resolveStateBand()` (private to `college-recommendations.ts`): pure string-normalize-and-match
  against `selectedState`/`neighboringStates`, returns `selected|neighboring|other`, weighted
  1/0.75/0.4 into `stateFit`. Correct and complete.
- **What's missing, confirmed by grep across `packages/recommendations` and
  `packages/assessment`:** nothing computes `selectedState`/`neighboringStates` from a student's
  actual `location_preference` answer or home state. No `resolveGeoScope()` function, no
  state-adjacency table or constant, anywhere in the repo today. The route
  (`recommendation-routes.ts`) simply forwards whatever the caller already supplies in the
  request body — if the caller (frontend or a script) doesn't compute these, college ranking
  silently falls back to `targetState = profile.state` and `neighboringStates = []`
  (`scoreColleges`'s own default), which is a reasonable degrade but not the full
  "anywhere in India" / "not sure→neighboring states" behavior the product intends.
- **This is genuinely missing infrastructure, independent of the AI-catalog question** — it's a
  small, pure, deterministic function plus a static state-adjacency lookup, not something an LLM
  should compute (this matches `stream-college-plan-ai-integration.md` §3's conclusion, which
  this investigation confirms is still accurate and still unbuilt).

---

## 10. Data quality and verification — what already exists

- `verification_status` (`unverified|verified|stale|retired`) — exists on `knowledge.colleges`
  and `knowledge.college_programs`, actively used: every catalog loader in
  `recommendation-data-source.ts` filters `where ... verification_status = 'verified'`. **An
  AI-drafted college/program row inserted as `'unverified'` is automatically invisible to every
  recommendation until a human flips it — this safety mechanism already works, today, with no
  changes.**
- `publication_status` (`draft|review|published|retired`) — same pattern on `careers`,
  `pathways`; `education_routes` uses a bare `publication_status` too. Same effect: draft rows
  are structurally excluded from every `where publication_status = 'published'` catalog query.
- `dataset_version_id` on every catalog table, `knowledge.dataset_versions.import_status`
  (`staged|validated|published|rejected|superseded`) — the full provenance/versioning skeleton
  from `module-3-knowledge-data-model.md` §10 is real and enforced by FK, not aspirational.
- **Not yet present:** any concept of "this specific row was drafted by an AI and needs review"
  distinct from the existing human-authored `unverified`/`draft` states — today those states
  don't distinguish *why* something is unverified (freshly scraped vs. AI-drafted vs. hand-typed
  placeholder). If that distinction matters for review UX later, it needs either a new column
  (e.g. `knowledge.colleges.content_source: 'human'|'ai_drafted'|'licensed_import'`) or the
  separate staging-table approach (§4's `ai_generation_runs`/`items`) — both are additive, no
  existing constraint blocks either.
- **Structurally guaranteed today, not just documented:** no request schema anywhere in
  `packages/contracts` lets an API caller supply a `fitScore`/`rank`/`ring`/`tier` value that
  gets stored verbatim — every recommendation route only accepts catalog rows + profile + config
  as input, and `rank`/`ring`/`fitScore` are always *computed output* of `scoreCareers`/
  `scoreStreams`/etc., never a pass-through field. So "no LLM-provided score/rank/ring" (the
  rule from `module-2-recommendation-data-model.md` §10) is enforced by the shape of the API
  itself, not merely a written policy that a future change could quietly violate.

---

## 11. Real-time vs. offline architecture — which fits this repo

**Evaluated against the actual code, not generic best practice:**

- **A. Pure runtime Gemini** (student request → Gemini → recommendation/catalog → response)
  would require: bypassing the entire `packages/recommendations/src/domain/*` scoring layer (the
  thing that's actually done and tested — `career-matching.test.ts`,
  `college-recommendations.test.ts`, etc. all assert deterministic, replayable output), adding
  live network latency + failure modes (`timed_out`/`rate_limited`, already modeled in
  `GeminiAiProvider` for *chat*, not for a blocking scoring path) into every recommendation
  request, and violating the schema-enforced/API-shape-enforced "no LLM score" rule described
  above. It would also break `recommendation_runs.input_hash`/`output_hash` replayability
  (`module-2-recommendation-data-model.md` §9's *"Replaying stored versions produces the same
  output hash"* requirement) since Gemini output isn't guaranteed deterministic across calls.
  **Does not fit.**
- **B. Seed + gap-fill** (Gemini drafts a catalog offline → human review → publish through the
  existing `knowledge.*` importer → deterministic engine reads only published/verified rows) —
  **fits directly onto three things that already exist and work**: (1) the
  `verification_status`/`publication_status` gating that already hides unreviewed rows from
  every live query, (2) the manifest+records+checksum+Zod-validate+publish pipeline in
  `packages/knowledge/src/application/import-*-dataset.ts`, and (3) the input-hash
  recommendation cache, which already invalidates correctly when a `dataset_version_id` changes
  (a catalog swap produces a new hash → a fresh run — this is not something that needs to be
  built, it already falls out of `stableHash()` embedding dataset versions).

**Conclusion, based on repo evidence: B is not just the safer choice, it is the only one that
doesn't require undoing already-built, already-tested infrastructure.**

---

## 12. Exact architecture gap analysis

| Capability | Status | Evidence |
|---|---|---|
| AI provider (Gemini client) | **ALREADY EXISTS** | `gemini-ai-provider.ts`, wired via `create-runtime-app.ts` |
| Structured Gemini output (JSON-schema-constrained + Zod) | **ALREADY EXISTS** | `ai-provider-shared.ts`'s `responseJsonSchema` + `DraftSchema` pattern |
| AI generation tracking (which rows came from an LLM, when, from what prompt) | **MISSING** | no `ai_generation_runs`/`ai_generation_items` table; no `content_source` column anywhere |
| Catalog generation (Gemini producing catalog content) | **MISSING** | zero code today asks Gemini for catalog rows; only chat drafting exists |
| Catalog storage | **ALREADY EXISTS** | `knowledge.{pathways,colleges,college_programs,stream_options,stream_maps,...}` — no schema changes needed to hold AI-drafted rows |
| Catalog verification/gating | **ALREADY EXISTS** | `verification_status`/`publication_status`, enforced in every loader query |
| Seed catalog | **PARTIALLY EXISTS** | real for careers/some colleges+aid; synthetic/mock for pathways, streams, most colleges (§6) |
| Gap-fill generation (runtime detection of missing catalog + on-demand offline draft) | **MISSING** | no code detects "recommendation ran with an empty/thin candidate set" and queues a draft request |
| Stream recommendation (scoring) | **ALREADY EXISTS** | `stream-recommendations.ts` |
| Stream recommendation (segment-aware catalog loading) | **EXISTS BUT NEEDS CHANGE** | `loadStreams()` ignores `stream_maps.segment`, hardcodes all-segments (§3.6, §7) |
| Pathway recommendation (scoring) | **ALREADY EXISTS** | `pathway-recommendations.ts` |
| Pathway recommendation (segment-aware catalog loading) | **EXISTS BUT NEEDS CHANGE** | `loadPathways()` same hardcoding issue |
| Discipline resolution | **ALREADY EXISTS** | `pathway_disciplines` + `loadTargetDisciplineIds()` |
| College recommendation (scoring/ringing) | **ALREADY EXISTS** | `college-recommendations.ts`, verified complete incl. access-route rebalancing |
| Geographic logic (state-band scoring) | **ALREADY EXISTS** | `resolveStateBand()` inside `college-recommendations.ts` |
| Geographic logic (turning `location_preference` into `selectedState`/`neighboringStates`) | **MISSING** | no `resolveGeoScope()`, no state-adjacency data, confirmed absent by grep |
| Segment filtering (domain scoring math) | **ALREADY EXISTS** | `segmentFit` computed correctly in stream/pathway scorers |
| Segment filtering (catalog content actually differing per segment) | **EXISTS BUT NEEDS CHANGE** | schema supports it (`stream_maps.segment`), loader doesn't use it |
| Plan generation | **ALREADY EXISTS** | `plan-generation.ts`, template-driven, deterministic |
| Missions (writer from generated plan → `recommendation.missions` rows) | **MISSING** | table exists, zero writer, confirmed by grep |
| Recommendation persistence/cache | **ALREADY EXISTS** | `createPostgresRecommendationStore`, wired at boot — **correction to the earlier planning doc, which called this a gap** |
| Dataset import pipeline (manifest+checksum+validate+publish) | **ALREADY EXISTS** | `import-college-dataset.ts` + siblings — directly reusable as the *publish* step for reviewed AI drafts |
| Draft/pending-review state in that import pipeline | **MISSING** | `reviewStatus` is a hardcoded `z.literal("approved")` in `packages/contracts/src/catalog.ts` — cannot hold an unreviewed AI draft as-is |
| Tests (deterministic scoring) | **ALREADY EXISTS** | `*.test.ts` colocated with every domain file, plus `module-2-demo-flow.test.ts` end-to-end |
| Tests (AI-catalog-specific: dedupe, duplicate detection, review gating) | **MISSING** | no such tests exist yet, nothing to test yet |
| Admin/review mechanism for catalog content | **MISSING** | no review UI/screen for any catalog content, AI-sourced or not; only CLI scripts today (matches Module 4's counselor tooling maturity level, per the earlier planning doc) |
| **Should not be added** — a new AI provider abstraction | **SHOULD NOT BE ADDED** | `GeminiAiProvider` already generalizes cleanly to a catalog-drafting prompt/schema |
| **Should not be added** — Gemini computing fit/rank/ring/tier | **SHOULD NOT BE ADDED** | contradicts `module-2-recommendation-data-model.md` §10, and is structurally prevented by the current API shape (§10 above) |

---

## 13. Risks (checked against what this specific codebase would actually do today if unchanged)

- **Duplicate catalog entities**: nothing today deduplicates by name/city/fuzzy-match before
  insert — `knowledge.colleges` has no unique constraint besides `id` and
  `(dataset_version_id, external_code)` where `external_code` is present. A naive gap-fill script
  calling Gemini per-request with no cache would create near-duplicate "Government Arts College,
  X" rows across repeated runs for the same state/discipline gap.
- **Race conditions on concurrent gap-fill**: if two students trigger the same missing
  `(state, discipline)` gap at once, with no `ai_generation_runs`-style input-hash cache/lock
  today, both would fire an independent Gemini call and (if auto-published) could both insert
  competing draft rows. This is exactly why the seed+gap-fill design must be offline/batched, not
  per-request — matches this investigation's §11 conclusion.
- **Unsafe auto-publishing**: the schema fully supports gating (`verification_status`,
  `publication_status`), but nothing *enforces* that an ingestion path sets `'unverified'` by
  default — a careless script could `INSERT ... verification_status = 'verified'` directly
  (exactly as `20260805000600_tn_dce_official_colleges_aid.sql` does for real TN DCE data, which
  is fine there because a human already verified it against the government source before
  writing that migration). Any AI-catalog ingestion script must be written to hard-code
  `'unverified'`/`'draft'` and never take a flag that lets it publish directly.
- **Stale information**: `last_verified_at` exists and is queried nowhere for staleness today
  (no "warn if last_verified_at is old" logic anywhere in `packages/knowledge` or
  `packages/recommendations`) — an AI-drafted row with no real-world freshness would look
  identical to a freshly verified one to every downstream consumer unless this is added.
- **Schema constraints that would block AI-assisted insertion**: none found. Every catalog table
  accepts nullable optional fields, and `dataset_version_id` is the only hard FK requirement,
  satisfiable by minting a new `dataset_versions` row per AI-generation batch (exactly like every
  existing seed migration does).
- **Making later replacement hard**: not a risk here — because every layer
  (`recommendation-data-source.ts`'s loaders, the domain scorers, the routes) reads catalog rows
  generically by `verification_status`/`publication_status`, never by provenance, swapping
  AI-drafted rows for a licensed dataset later is the same retire-and-replace recipe already
  proven for careers (`onet_full_career_catalog.sql` replaced a 30-row hardcoded catalog with 923
  real rows, zero changes to `career-matching.ts`). The one prerequisite is retiring (not
  deleting) old rows so historical `recommendation_items` stay resolvable — already a stated rule
  in `module-2-recommendation-data-model.md` §9, not something new to build.
- **Recursive/excessive runtime AI calls**: not a risk under design B (offline/batched) as
  concluded in §11; would be a serious risk under design A.

---

## 14. Recommended target architecture (high level — no code/migrations here)

Reuse, in order of how directly it slots in:

1. **`GeminiAiProvider`'s pattern** (not necessarily the class itself, since its prompt/schema
   are counselor-specific) — same request shape (JSON-schema-constrained `generateContent` +
   Zod re-validation), new system prompt + new `responseJsonSchema` per catalog target
   (college draft, stream-subject draft, pathway draft). Lives in a new module (a natural home:
   `packages/knowledge/src/infrastructure/`, since it's Module 3's concern, not Module 4's).
2. **The existing dataset-import pipeline** (`import-college-dataset.ts`-style
   validate→checksum→publish) as the *only* path anything — human-authored or AI-drafted —
   uses to actually land in `knowledge.*`. A Gemini-drafted college doesn't need a bespoke insert
   path; it needs to become a manifest+records pair that a human has reviewed, exactly like
   `data/seed/knowledge/colleges/2026-07-31/` today, just with `source.trustLevel` naming it as
   AI-assisted for traceability.
3. **Existing `verification_status`/`publication_status` gating** as the sole mechanism that
   keeps unreviewed AI content invisible to students — no new gating concept needed.
4. **Existing dataset-versioning/retirement pattern** as the sole mechanism for swapping
   AI-drafted rows for real data later — no new "replace" concept needed.

New, because nothing existing covers it:

5. **A staging layer for Gemini's raw drafts before a human turns them into an approved
   manifest** — needed specifically because `reviewStatus` in the current manifest contract is a
   hard `"approved"` literal (§4), so raw AI output cannot legally become a manifest until a
   human has looked at it. Two shapes are viable and both are additive to the current schema:
   - a pair of tables (`knowledge.ai_generation_runs`/`ai_generation_items`, roughly as sketched
     in `docs/poc/stream-college-plan-ai-integration.md` §5) — gives per-item review, input-hash
     dedupe, and an audit trail with a real primary key to build an admin screen against later; or
   - a plain draft directory (e.g. `data/raw/ai-drafts/<target>/<date>/`) that a human edits and
     then promotes by hand-copying into `data/seed/knowledge/...` and running the existing
     importer — zero new tables, but weaker concurrent-request dedupe and no queryable review
     queue.
   This is a real decision to make before implementation (see §16.4).
6. **A pure `resolveGeoScope()` function + a static state-adjacency lookup** — unrelated to
   Gemini, but a genuine current gap (§9) that the college scorer needs fed correctly regardless
   of where the catalog comes from.
7. **A small, deterministic gap-detection step** — after a normal recommendation run, if a
   ring/candidate set for stream/pathway/college comes back thin (e.g. below some catalog-count
   threshold for the student's state/discipline), record that gap for the *offline* drafting
   script to pick up next run — never a synchronous in-request Gemini call.

**Where things sit:** Gemini sits entirely inside Module 3's offline tooling — it never appears
in `apps/api`'s request path, never in `packages/recommendations`. The deterministic engine
(`packages/recommendations/src/domain/*`) sits exactly where it does today and needs **zero**
changes to its scoring logic — only its catalog inputs get richer over time. Duplicate
generation is prevented the same way §5's staging layer is designed either way (input-hash
lookup before calling Gemini again for the same gap). Replacement with official data later is
already a solved, proven pattern (careers already did it).

---

## 15. The proposed Gemini/deterministic split — does it conflict with anything found?

No conflict found. It is, in fact, already the codebase's stated and partially-enforced rule:

- `module-2-recommendation-data-model.md` §10: *"No LLM-provided score, rank, ring or eligibility
  label is accepted by write APIs"* — a written rule.
- The actual API/request-schema shape in `packages/contracts` structurally prevents a caller from
  injecting a score/rank/ring/tier — an enforced rule, not just a written one (§10 above).
- `knowledge.colleges.tier`'s own column comment in the schema: *"never inferred by AI"* — this
  predates the user's request and already assumes exactly this split.
- The counselor's existing Gemini usage already operates under an equivalent constraint for chat
  (`counselorSystemPrompt`'s *"Never calculate or change scores, ranks, rings, eligibility,
  URLs, or entities"*) — so this repository already has precedent for "Gemini drafts/describes,
  deterministic code decides" in a second, independent module.

The only thing to watch, not a conflict: `tier` must stay unset (`NULL`) on any AI-drafted
college row, exactly as it does on the real but not-yet-tiered TN DCE rows today — the schema
already tolerates `tier IS NULL` gracefully (`college-recommendations.ts`'s `tierFit = round(1 /
college.tier, ...)` — **note this will throw/produce `Infinity` on `tier = null` today; a
`tier IS NULL` college is only safe because the current loader's `loadColleges()` defaults it to
`row.tier ?? 3`** — so this coalesce point is the one place that must be preserved (or made more
deliberate) once more `NULL`-tier AI-drafted colleges start flowing through the same loader.

---

## 16. Summary and decisions needed before implementation

**1. Repository understanding** — pnpm monorepo, Express API + Vite frontend, Module 1
(assessment) / Module 2 (recommendations, deterministic) / Module 3 (knowledge/catalog) / Module 4
(counselor, where all AI-provider code currently lives) / Module 5 (safety/eval), Postgres via
hand-written `supabase/migrations/*.sql`, applied manually.

**2. Current data model** — `knowledge.*` catalog schema matches its design doc almost exactly
(one undocumented column, `stream_maps.segment`, found by reading the migration directly); seed
data exists in three tiers (mock/synthetic/real) across every catalog table except careers,
which is already a real 923-row O*NET import.

**3. Current recommendation flow** — fully traced, intake → segment (deterministic, not
RIASEC-derived) → RIASEC scoring → career/stream/pathway/college/plan, each with its own tested
deterministic domain file; two concrete, code-verified breaks found: segment is ignored by the
stream/pathway catalog loader (§3.6–7, §7), and `location_preference` never becomes
`selectedState`/`neighboringStates` (§3.8, §9).

**4. Current AI integration** — Gemini already integrated, schema-constrained, Zod-validated,
directly reusable for offline catalog drafting; used today only for counselor chat text, never
for catalog or scoring. A separate, independently useful existing pipeline (dataset
manifest+import) is available to *publish* whatever Gemini drafts, once reviewed.

**5. Current segment flow** — segment derivation and per-segment intake questions are solid;
per-segment catalog differentiation is designed into the schema but not wired into the loader;
tab-visibility-per-segment is a design doc only, no frontend yet outside Career.

**6. Current plan flow** — fully deterministic, template-driven, no AI involvement and none
needed; `recommendation.missions` has no writer yet (unrelated to the AI-catalog question).

**7. Current geographic flow** — scoring logic complete; the translation from a student's answer
into scoring inputs is the one clearly missing piece, independent of AI.

**8. Current gaps** — see the full table in §12. The two headline ones for this feature
specifically: (a) no code today asks Gemini for catalog content at all, and (b) the existing
dataset-import contract can't hold an unreviewed AI draft as-is (`reviewStatus` is hardcoded to
`"approved"`), so a staging step is unavoidable no matter which shape it takes.

**9. Recommended architecture** — seed-then-gap-fill (design B, §11), Gemini confined to
Module 3's offline tooling, reusing the existing Gemini client pattern and the existing
dataset-import/publish pipeline; a new staging mechanism is the only structurally-required new
component; the deterministic recommendation engine in `packages/recommendations` needs no
changes to its scoring logic.

**10. Key decisions needed before implementation:**
- Staging shape for unreviewed Gemini drafts: new `ai_generation_runs`/`ai_generation_items`
  tables (richer review/dedupe, more to build) vs. a draft-file directory promoted by hand into
  the existing importer (less to build, weaker concurrent-dedupe and no queryable review queue).
- Whether to fix the two confirmed segment/geo gaps (§3.6–9) as prerequisite work, since they
  affect the deterministic engine regardless of where the catalog comes from, or treat them as a
  separate track from the AI-catalog work.
- Review workflow maturity for v1: a CLI approve/reject script (matches this repo's current
  Module 4 tooling maturity) vs. a screen.
- Where the "gap exists, queue a draft" detection should live and what threshold defines "thin"
  candidate coverage per state/discipline.
- Whether a `content_source`/provenance-reason column is worth adding to `knowledge.*` tables
  now (distinguishing AI-drafted from hand-authored *within* the existing `unverified` state) or
  deferred until the staging table's own `ai_generation_items.promoted_entity_id` link is judged
  sufficient provenance on its own.

**11. Proposed implementation phases (high level only):**
1. Geographic wiring (`resolveGeoScope()` + state-adjacency data) — small, deterministic,
   independent of Gemini.
2. Segment-aware stream/pathway catalog loading (make `loadStreams()`/`loadPathways()` honor
   `stream_maps.segment` instead of hardcoding all-segments).
3. Staging mechanism for AI drafts (whichever shape is decided in §16.10).
4. Gemini catalog-drafting module + offline CLI script(s), starting with the highest-value gap
   (likely colleges, given the current real-data coverage is narrowest there outside one state).
5. Review step (script first).
6. Promote reviewed drafts through the existing import/publish pipeline; verify recommendations
   pick up the new catalog rows with no scoring-code changes.
7. Only then, plan-template content and frontend screens for Stream/Pathway/College/Plan — those
   are unrelated to the AI-catalog question and can proceed independently/in parallel.

This report is investigation-only. No migrations, code, or Gemini prompts have been written.
