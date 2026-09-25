-- Extends the AI-generation staging CHECK constraints (20260911000100, previously widened by
-- 20260921000100/20260921000200 for career_streams/stream_pathways) to accept a new drafting
-- target/entity kind: aid_schemes/aid_scheme, for the TN UG scholarship & financial-aid catalog
-- pipeline. Additive only — every previously-valid value stays valid, no existing row's meaning
-- changes.
--
-- Unlike the other targets, an aid_scheme draft's own criteria (income cap, category eligibility
-- — see knowledge.aid_criteria) are nested inside the SAME staged item's proposed_payload_json,
-- not staged as separate items — no new "aid_criterion" entity type is needed, mirroring how
-- CollegeDraft already nests `programs` inside a single college draft.

BEGIN;

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
      'stream_pathways',
      'aid_schemes'
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
      'stream_pathway',
      'aid_scheme'
    )
  );

COMMIT;
