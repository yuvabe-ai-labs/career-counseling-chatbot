-- YuvaPath serves Classes 9–12 only (school = Classes 9–10 → explorer, higher secondary =
-- Classes 11–12 → pathfinder). This removes everything that existed only for college students,
-- graduates and working adults (the "launcher" segment):
--   1. every account whose profile is launcher / college / graduate, with all of its data
--   2. the launcher intake question set and plan template
--   3. 'launcher' from the knowledge.stream_maps segment check
--   4. class options outside Classes 9–12 from the remaining intake questions
--
-- Irreversible: the deleted accounts and their history cannot be restored from this file.
-- No foreign key here cascades (except clusterfit's), so rows are deleted child-first.

create temporary table removed_users on commit drop as
  select user_id as id
  from assessment.user_profiles
  where segment = 'launcher' or self_stage in ('college', 'graduate');

-- Safety records that point at the students' conversations, runs and sessions.
delete from safety_private.alert_deliveries
  where handoff_id in (select id from safety_private.handoffs where user_id in (select id from removed_users));
delete from safety_private.handoff_actions
  where handoff_id in (select id from safety_private.handoffs where user_id in (select id from removed_users));
delete from safety_private.handoffs where user_id in (select id from removed_users);
delete from safety_private.safety_events where user_id in (select id from removed_users);

-- Counsellor chat history.
delete from counselor.generated_assets where user_id in (select id from removed_users);
delete from counselor.report_snapshots where user_id in (select id from removed_users);
delete from counselor.exploration_events where user_id in (select id from removed_users);
delete from counselor.journey_events where user_id in (select id from removed_users);
delete from counselor.journey_states where user_id in (select id from removed_users);
delete from counselor.message_grounding
  where assistant_message_id in (
    select message.id
    from counselor.conversation_messages message
    join counselor.conversations conversation on conversation.id = message.conversation_id
    where conversation.user_id in (select id from removed_users)
  );
delete from counselor.tool_calls
  where conversation_id in (select id from counselor.conversations where user_id in (select id from removed_users));
delete from counselor.conversation_summaries
  where conversation_id in (select id from counselor.conversations where user_id in (select id from removed_users));
delete from counselor.conversation_messages
  where conversation_id in (select id from counselor.conversations where user_id in (select id from removed_users));
delete from counselor.conversations where user_id in (select id from removed_users);

-- Plans and recommendations.
delete from recommendation.missions
  where generated_plan_id in (select id from recommendation.generated_plans where user_id in (select id from removed_users));
delete from recommendation.generated_plan_steps
  where generated_plan_id in (select id from recommendation.generated_plans where user_id in (select id from removed_users));
delete from recommendation.generated_plans where user_id in (select id from removed_users);
delete from recommendation.recommendation_items
  where recommendation_run_id in (select id from recommendation.recommendation_runs where user_id in (select id from removed_users));
delete from recommendation.recommendation_rings
  where recommendation_run_id in (select id from recommendation.recommendation_runs where user_id in (select id from removed_users));
delete from recommendation.recommendation_runs where user_id in (select id from removed_users);

-- Assessments, snapshots and intake.
delete from assessment.profile_snapshot_results
  where profile_snapshot_id in (select id from assessment.profile_snapshots where user_id in (select id from removed_users));
delete from assessment.profile_snapshots where user_id in (select id from removed_users);
delete from assessment.assessment_responses
  where assessment_run_id in (select id from assessment.assessment_runs where user_id in (select id from removed_users));
delete from assessment.assessment_results
  where user_id in (select id from removed_users)
     or assessment_run_id in (select id from assessment.assessment_runs where user_id in (select id from removed_users));
delete from assessment.assessment_runs where user_id in (select id from removed_users);
delete from assessment.intake_answers where user_id in (select id from removed_users);
delete from assessment.guardian_consents where user_id in (select id from removed_users);

-- Privacy jobs about these students.
delete from operations.privacy_job_steps
  where privacy_job_id in (select id from operations.privacy_jobs where user_id in (select id from removed_users));
delete from operations.privacy_jobs where user_id in (select id from removed_users);

-- The accounts themselves (clusterfit rows cascade from auth.users).
delete from assessment.journey_sessions where user_id in (select id from removed_users);
delete from assessment.user_profiles where user_id in (select id from removed_users);
delete from auth.users where id in (select id from removed_users);

-- 2. The launcher intake question set and plan template.
delete from assessment.intake_answers
  where question_id in (
    select question.id
    from assessment.intake_questions question
    join assessment.intake_question_sets question_set on question_set.id = question.question_set_id
    where question_set.segment = 'launcher'
  );
delete from assessment.intake_questions
  where question_set_id in (select id from assessment.intake_question_sets where segment = 'launcher');
delete from assessment.intake_question_sets where segment = 'launcher';

delete from recommendation.generated_plan_steps
  where source_template_step_id in (
    select step.id
    from recommendation.plan_template_steps step
    join recommendation.plan_templates template on template.id = step.plan_template_id
    where template.segment = 'launcher'
  );
delete from recommendation.generated_plans
  where plan_template_id in (select id from recommendation.plan_templates where segment = 'launcher');
delete from recommendation.plan_template_steps
  where plan_template_id in (select id from recommendation.plan_templates where segment = 'launcher');
delete from recommendation.plan_templates where segment = 'launcher';

-- 3. Stream maps can no longer be published for the launcher segment.
delete from knowledge.stream_map_items
  where map_id in (select id from knowledge.stream_maps where segment = 'launcher');
delete from knowledge.stream_maps where segment = 'launcher';
alter table knowledge.stream_maps drop constraint if exists stream_maps_segment_check;
alter table knowledge.stream_maps
  add constraint stream_maps_segment_check
  check (segment is null or segment in ('explorer', 'pathfinder'));

comment on column knowledge.stream_maps.segment is
  'Student journey segment: explorer (Classes 9–10) or pathfinder (Classes 11–12)';
comment on column assessment.user_profiles.segment is
  'explorer (Classes 9–10) or pathfinder (Classes 11–12)';
comment on column recommendation.plan_templates.plan_type is 'exploration, pathway, backup_route';

-- 4. Class options outside Classes 9–12 (matches packages/assessment/scripts/seed-intake.ts).
update assessment.intake_questions question
set options_json = '["class_9", "class_10", "other"]'::jsonb
from assessment.intake_question_sets question_set
where question_set.id = question.question_set_id
  and question_set.segment = 'explorer'
  and question.question_key = 'class_level';

update assessment.intake_questions question
set options_json = '["class_11", "class_12", "other"]'::jsonb
from assessment.intake_question_sets question_set
where question_set.id = question.question_set_id
  and question_set.segment = 'pathfinder'
  and question.question_key = 'education_stage';
