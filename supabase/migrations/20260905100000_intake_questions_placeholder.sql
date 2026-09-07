-- Adds a server-driven example-placeholder hint for intake questions (used by short_text
-- fields — see IntakeQuestionField.tsx) and a uniqueness constraint that lets seed-intake.ts
-- upsert instead of only ever inserting-if-missing, so re-running it after editing a question's
-- content (response_type, options, placeholder) actually applies the change to already-seeded
-- rows instead of silently no-op'ing.
alter table assessment.intake_questions
  add column if not exists placeholder_text text;

create unique index if not exists intake_questions_question_set_id_question_key_key
  on assessment.intake_questions (question_set_id, question_key);
