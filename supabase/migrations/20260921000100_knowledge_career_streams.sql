-- Iteration 1 of the Career -> Stream mapping layer
-- (docs/architecture/career-stream-mapping-iteration-1-plan.md).
--
-- Confirmed before writing this migration (2026-09-21, re-verified against the live schema):
-- no table or FK anywhere links knowledge.careers to knowledge.stream_options today. Stream
-- recommendations are scored purely off the student's RIASEC vector via
-- knowledge.stream_maps/stream_map_items, entirely independent of Career. This table is the
-- real knowledge-mapping layer that relationship needs, modeled directly on the existing
-- knowledge.career_pathways junction table (same career_id + relationship_type shape), plus a
-- numeric weight/source pair career_pathways does not have — stream-recommendation scoring
-- needs a real magnitude to blend against its existing RIASEC-derived factors, not just a
-- display-order tiebreak.
--
-- Purely additive: no existing knowledge.* table's shape, constraints, or meaning changes.
-- Ships with zero rows — packages/recommendations/src/domain/stream-recommendations.ts's new
-- careerAlignment scoring factor is designed to be a no-op when no career_streams rows exist
-- for a student's ranked careers, so this migration alone changes no live recommendation output.

BEGIN;

CREATE TABLE IF NOT EXISTS "knowledge"."career_streams" (
  "career_id" uuid NOT NULL,
  "stream_option_id" uuid NOT NULL,
  "relationship_type" text NOT NULL CHECK (
    "relationship_type" IN ('primary', 'alternative', 'cross_disciplinary')
  ),
  "weight" numeric(3,2) NOT NULL CHECK ("weight" >= 0 AND "weight" <= 1),
  "source" text NOT NULL,
  "display_order" smallint NOT NULL DEFAULT 1,
  PRIMARY KEY ("career_id", "stream_option_id")
);

ALTER TABLE "knowledge"."career_streams"
  ADD CONSTRAINT "career_streams_career_id_fkey"
  FOREIGN KEY ("career_id") REFERENCES "knowledge"."careers" ("id");

ALTER TABLE "knowledge"."career_streams"
  ADD CONSTRAINT "career_streams_stream_option_id_fkey"
  FOREIGN KEY ("stream_option_id") REFERENCES "knowledge"."stream_options" ("id");

CREATE INDEX IF NOT EXISTS "career_streams_stream_option_id_idx"
  ON "knowledge"."career_streams" ("stream_option_id");

COMMENT ON TABLE "knowledge"."career_streams" IS
  'Career -> Stream mapping layer (Iteration 1). Read by recommendation-data-source.ts''s loadStreams() to generate career-driven stream candidates, additive to the existing RIASEC-pair (stream_maps) candidate set.';
COMMENT ON COLUMN "knowledge"."career_streams"."relationship_type" IS
  'primary = the standard/expected stream for this career; alternative = a less obvious but valid route; cross_disciplinary = an unconventional but real path.';
COMMENT ON COLUMN "knowledge"."career_streams"."weight" IS
  'Strength of this career-stream link, 0-1, authored per source. Used directly as a scoring multiplier by stream-recommendations.ts, unlike career_pathways.display_order which is only a tiebreak.';
COMMENT ON COLUMN "knowledge"."career_streams"."source" IS
  'Provenance tag, e.g. riasec_derived_seed | gemini_drafted | curated. Free text (not an enum) so a new provenance kind never requires a migration, matching knowledge_sources.source_type''s existing looseness.';

-- Extend the AI-generation staging CHECK constraints (20260911000100) to accept this new
-- drafting target/entity kind, additive only — every previously-valid value stays valid.
ALTER TABLE "knowledge"."ai_generation_runs"
  DROP CONSTRAINT IF EXISTS "ai_generation_runs_target_table_check";

ALTER TABLE "knowledge"."ai_generation_runs"
  ADD CONSTRAINT "ai_generation_runs_target_table_check"
  CHECK (
    "target_table" IN (
      'pathways',
      'career_pathways',
      'pathway_disciplines',
      'colleges',
      'college_programs',
      'stream_map_items',
      'career_streams'
    )
  );

ALTER TABLE "knowledge"."ai_generation_items"
  DROP CONSTRAINT IF EXISTS "ai_generation_items_proposed_entity_type_check";

ALTER TABLE "knowledge"."ai_generation_items"
  ADD CONSTRAINT "ai_generation_items_proposed_entity_type_check"
  CHECK (
    "proposed_entity_type" IN (
      'pathway',
      'career_pathway',
      'pathway_discipline',
      'college',
      'college_program',
      'stream_map_item',
      'career_stream'
    )
  );

COMMIT;
