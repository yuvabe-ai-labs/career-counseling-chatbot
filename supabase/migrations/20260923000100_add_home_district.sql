-- Adds a student's home district (Tamil Nadu, ~38 fixed values — TnDistrictSchema in
-- packages/contracts/src/common.ts) to both the live profile and the per-run snapshot it's
-- copied into, feeding the new location-proximity signal in College recommendations
-- (packages/recommendations/src/domain/college-recommendations.ts). See
-- packages/recommendations/src/domain/tn-district-regions.ts for the district->region grouping
-- and proximity-tiering logic this column ultimately drives.
--
-- Purely additive, both columns nullable: new signups are required (at the app/contract layer,
-- not the DB layer — same enforcement style as self_stage/city/state, none of which have a DB
-- CHECK constraint either) to supply a value via UpsertUserProfileRequestSchema, but every
-- pre-existing row predates this field and must remain readable with no value until that student
-- goes through onboarding again — an absent value degrades to the "unknown" proximity tier
-- (same effective score as "rest_of_tamil_nadu" today), never a read failure.

BEGIN;

ALTER TABLE "assessment"."user_profiles"
  ADD COLUMN IF NOT EXISTS "home_district" text;

COMMENT ON COLUMN "assessment"."user_profiles"."home_district" IS
  'Student''s home district (Tamil Nadu, ~38 fixed values — see TnDistrictSchema in packages/contracts/src/common.ts). Nullable: pre-existing profiles have no value until re-onboarded; new signups are required to supply one at the application layer.';

ALTER TABLE "assessment"."profile_snapshots"
  ADD COLUMN IF NOT EXISTS "home_district" text;

COMMENT ON COLUMN "assessment"."profile_snapshots"."home_district" IS
  'Copied from assessment.user_profiles.home_district at snapshot-creation time — same pattern as city/state/self_stage (see pg-assessment-repository.ts createAssessmentSnapshot()).';

COMMIT;
