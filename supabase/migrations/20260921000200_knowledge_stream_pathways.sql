-- Iteration 2 of the Stream -> Pathway mapping layer
-- (docs/architecture/stream-pathway-mapping-iteration-2-plan.md).
--
-- Confirmed before writing this migration (2026-09-21): no table anywhere links
-- knowledge.stream_options to knowledge.pathways. packages/recommendations's
-- PathwayRecommendationInput already accepts rankedStreamIds and folds it into the cache-key
-- inputHash, but scorePathways() has never read it — a real, pre-existing "plumbed but inert"
-- gap (same shape Iteration 1 closed for Career -> Stream). This table is the real
-- knowledge-mapping layer that relationship needs, modeled directly on
-- knowledge.career_streams (Iteration 1) — same relationship_type vocabulary, same
-- weight/source columns.
--
-- Purely additive: no existing knowledge.* table's shape, constraints, or meaning changes.
-- Ships with zero rows — packages/recommendations/src/domain/pathway-recommendations.ts's
-- rebalanced formula treats a pathway with no stream_pathways link as a real (not redistributed)
-- streamAlignment=0, the same way an unmatched pathway's careerAlignment already reads 0 today.

BEGIN;

CREATE TABLE IF NOT EXISTS "knowledge"."stream_pathways" (
  "stream_option_id" uuid NOT NULL,
  "pathway_id" uuid NOT NULL,
  "relationship_type" text NOT NULL CHECK (
    "relationship_type" IN ('primary', 'alternative', 'cross_disciplinary')
  ),
  "weight" numeric(3,2) NOT NULL CHECK ("weight" >= 0 AND "weight" <= 1),
  "source" text NOT NULL,
  "display_order" smallint NOT NULL DEFAULT 1,
  PRIMARY KEY ("stream_option_id", "pathway_id")
);

ALTER TABLE "knowledge"."stream_pathways"
  ADD CONSTRAINT "stream_pathways_stream_option_id_fkey"
  FOREIGN KEY ("stream_option_id") REFERENCES "knowledge"."stream_options" ("id");

ALTER TABLE "knowledge"."stream_pathways"
  ADD CONSTRAINT "stream_pathways_pathway_id_fkey"
  FOREIGN KEY ("pathway_id") REFERENCES "knowledge"."pathways" ("id");

CREATE INDEX IF NOT EXISTS "stream_pathways_pathway_id_idx"
  ON "knowledge"."stream_pathways" ("pathway_id");

COMMENT ON TABLE "knowledge"."stream_pathways" IS
  'Stream -> Pathway mapping layer (Iteration 2). Read by recommendation-data-source.ts''s loadPathways() to populate PathwayCatalogRecord.streamOptionIds, which pathway-recommendations.ts''s scorePathways() aligns against the student''s ranked streams.';
COMMENT ON COLUMN "knowledge"."stream_pathways"."relationship_type" IS
  'Same vocabulary as knowledge.career_streams: primary = the expected pathway from that stream; alternative = a valid but less common route; cross_disciplinary = an unconventional but real bridge.';
COMMENT ON COLUMN "knowledge"."stream_pathways"."weight" IS
  'Strength of this stream-pathway link, 0-1, authored per source. Used directly as a scoring multiplier by pathway-recommendations.ts.';
COMMENT ON COLUMN "knowledge"."stream_pathways"."source" IS
  'Provenance tag, e.g. gemini_drafted | curated. Free text, matching knowledge.career_streams.source.';

-- Extend the AI-generation staging CHECK constraints (20260911000100, already extended once by
-- 20260921000100 for career_streams) to accept this new drafting target/entity kind.
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
      'career_streams',
      'stream_pathways'
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
      'career_stream',
      'stream_pathway'
    )
  );

COMMIT;
