-- Formalizes the active recommendation.matching_configurations row for configuration_key =
-- 'career_match' as a real, committed migration.
--
-- Correction to earlier assumption: this row was NOT missing from the database — an active
-- row (id 048d5429-a30b-410d-89ba-8c402ab92041, version 'module-2-live-default-weights-v1')
-- already existed live, seeded out-of-band at some point (no prior migration file in this
-- repo shows it being inserted). This migration doesn't create a second, competing row — it
-- codifies the exact row that's already relied upon, using its real id/version, as an
-- idempotent upsert, so a fresh database (or anyone reading supabase/migrations/) gets the
-- same state instead of depending on undocumented live-only data. Weights (0.50 / 0.20 /
-- 0.15 / 0.15) match both the existing live row and the defaults hardcoded as fallbacks in
-- loadConfigByKey's toNumber(...) calls, so nothing about scoring behavior changes.
BEGIN;
INSERT INTO recommendation.matching_configurations
  (id, configuration_key, version, status, algorithm_version, interest_weight, values_weight,
   feasibility_weight, context_weight, rounding_scale, riasec_tie_order, rules_json,
   approved_by, approved_at, created_at)
VALUES
  ('048d5429-a30b-410d-89ba-8c402ab92041', 'career_match', 'module-2-live-default-weights-v1',
   'active', 'module-2-live-v1', 0.50000, 0.20000, 0.15000, 0.15000, 6,
   ARRAY['R','I','A','S','E','C']::char(1)[], '{}'::jsonb, NULL, NULL, '2026-07-31T10:40:03.077Z')
ON CONFLICT (configuration_key, version) DO UPDATE SET
  status = excluded.status,
  algorithm_version = excluded.algorithm_version,
  interest_weight = excluded.interest_weight,
  values_weight = excluded.values_weight,
  feasibility_weight = excluded.feasibility_weight,
  context_weight = excluded.context_weight,
  rounding_scale = excluded.rounding_scale,
  riasec_tie_order = excluded.riasec_tie_order,
  rules_json = excluded.rules_json;
COMMIT;
