-- The signup "wants aid" flag is replaced by the pathfinder intake question `seeks_aid`
-- (assessment.intake_questions), whose answer already flows into
-- profile_snapshots.intake_summary_json — see docs/data-model/module-1-assessment-data-model.md.
alter table assessment.profile_snapshots drop column if exists wants_aid;
alter table assessment.user_profiles drop column if exists wants_aid;
