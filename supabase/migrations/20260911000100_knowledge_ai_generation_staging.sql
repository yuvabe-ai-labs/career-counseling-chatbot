-- Staging tables for the AI-assisted temporary catalog pipeline
-- (docs/poc/ai-assisted-catalog-implementation-plan.md §11/§23).
--
-- Purpose: hold Gemini's raw catalog drafts for human review BEFORE anything is written to a
-- real knowledge.* table. The existing dataset-import manifest contract
-- (packages/contracts/src/catalog.ts) hardcodes reviewStatus to the literal "approved" and has
-- no "draft"/"pending" state, so an unreviewed AI draft cannot pass through that pipeline as-is
-- — these two tables are where it lives until a human approves it, at which point a promotion
-- script assembles the approved items into the existing manifest+records shape and calls the
-- existing (unchanged) importer.
--
-- These tables are purely additive: no existing knowledge.* table's shape, constraints, or
-- meaning changes. Per the plan's rollback strategy (§27), rows here are an append-only audit
-- log — a bad run/item is marked rejected/superseded, never deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS "knowledge"."ai_generation_runs" (
  "id" uuid PRIMARY KEY,
  -- Which knowledge.* table (or table-bundle, e.g. the stream dataset's careerPathways) this
  -- run drafted content for.
  "target_table" text NOT NULL CHECK (
    "target_table" IN (
      'pathways',
      'career_pathways',
      'pathway_disciplines',
      'colleges',
      'college_programs',
      'stream_map_items'
    )
  ),
  -- Kept generic (not "gemini_*" column names) so another provider can slot in later without a
  -- schema change — same reasoning as knowledge.knowledge_sources.source_type.
  "provider" text NOT NULL DEFAULT 'gemini',
  "model" text NOT NULL,
  -- Bumped by hand whenever a target's prompt template changes, so stale cache entries can be
  -- told apart from current ones even when input_params_json is otherwise identical.
  "prompt_version" text NOT NULL,
  -- The structured ask (e.g. {"state": "Tamil Nadu", "disciplineCode": "computing"}) — never
  -- raw student data (see plan §10's explicit include/exclude table).
  "input_params_json" jsonb NOT NULL,
  -- sha256(target_table + prompt_version + input_params_json) — the "call Gemini only on a
  -- miss" cache key. Unique with target_table below.
  "input_hash" text NOT NULL,
  -- Exactly what Gemini returned, kept for audit and re-parsing without re-calling the API.
  "raw_response_json" jsonb,
  "status" text NOT NULL DEFAULT 'pending_review' CHECK (
    "status" IN ('pending_review', 'approved', 'rejected', 'superseded', 'failed')
  ),
  "error_code" text,
  "error_message" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE "knowledge"."ai_generation_runs" IS
  'One row per Gemini catalog-drafting call (or cache reuse) — staging only, never read by the recommendation engine.';
COMMENT ON COLUMN "knowledge"."ai_generation_runs"."input_hash" IS
  'sha256(target_table + prompt_version + input_params_json) — unique with target_table; the pre-call cache/idempotency key.';

CREATE UNIQUE INDEX IF NOT EXISTS "ai_generation_runs_target_input_hash_key"
  ON "knowledge"."ai_generation_runs" ("target_table", "input_hash");

CREATE INDEX IF NOT EXISTS "ai_generation_runs_status_idx"
  ON "knowledge"."ai_generation_runs" ("status");

CREATE TABLE IF NOT EXISTS "knowledge"."ai_generation_items" (
  "id" uuid PRIMARY KEY,
  "generation_run_id" uuid NOT NULL REFERENCES "knowledge"."ai_generation_runs" ("id"),
  "proposed_entity_type" text NOT NULL CHECK (
    "proposed_entity_type" IN (
      'pathway',
      'career_pathway',
      'pathway_discipline',
      'college',
      'college_program',
      'stream_map_item'
    )
  ),
  -- Shaped exactly like the target table's insertable columns, using natural keys (e.g. a
  -- disciplineCode, an O*NET code) for cross-references — never a UUID Gemini invented itself.
  -- See plan §5/§6: the promotion step resolves natural keys to real foreign-key IDs; an
  -- unresolvable reference means the item is rejected, never silently given a new row on the
  -- other side of the relationship.
  "proposed_payload_json" jsonb NOT NULL,
  -- Normalized deterministic string (e.g. lower(trim(name))||'|'||city||'|'||state for a
  -- college) computed by the application layer at write time — the duplicate-detection key.
  "natural_key" text NOT NULL,
  -- Set during normalization if natural_key already matches a *published* row — lets review
  -- immediately reject-as-duplicate instead of re-approving something that already exists.
  "matched_existing_id" uuid,
  -- Filled in once the promotion script actually inserts this item into its real table.
  "promoted_entity_id" uuid,
  "review_status" text NOT NULL DEFAULT 'pending_review' CHECK (
    "review_status" IN ('pending_review', 'approved', 'rejected')
  ),
  "reviewer_note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE "knowledge"."ai_generation_items" IS
  'One row per proposed catalog row inside an ai_generation_runs batch — staging only.';
COMMENT ON COLUMN "knowledge"."ai_generation_items"."natural_key" IS
  'Normalized dedupe key, scoped by proposed_entity_type — see the partial unique index below.';

CREATE INDEX IF NOT EXISTS "ai_generation_items_generation_run_id_idx"
  ON "knowledge"."ai_generation_items" ("generation_run_id");

-- Partial (not full) uniqueness: a rejected duplicate must not permanently block a corrected
-- retry of the same natural key (plan §11's idempotency design).
CREATE UNIQUE INDEX IF NOT EXISTS "ai_generation_items_entity_type_natural_key_key"
  ON "knowledge"."ai_generation_items" ("proposed_entity_type", "natural_key")
  WHERE "review_status" <> 'rejected';

COMMIT;
