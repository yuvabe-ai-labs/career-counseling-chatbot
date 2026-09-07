-- Guardian consent moved from phone/SMS to email/SMTP (Module 1) — no SMS/phone delivery
-- remains anywhere in the app; the student's own identity verification made the same move
-- earlier. Existing rows in assessment.guardian_consents are pre-launch synthetic test data
-- (verified: text_version values like "string"/"guardian", phone-last-4 values like
-- "0001"/"1236" — not real guardian phone numbers), so the old phone columns are dropped
-- outright rather than preserved alongside new ones.

alter table "assessment"."guardian_consents"
  drop column "guardian_phone_hash",
  drop column "guardian_phone_last4",
  add column "guardian_email_hash" text not null default '',
  add column "guardian_email_masked" text;

alter table "assessment"."guardian_consents"
  alter column "guardian_email_hash" drop default;

comment on column "assessment"."guardian_consents"."guardian_email_hash" is 'Required; keyed hash recommended';
comment on column "assessment"."guardian_consents"."guardian_email_masked" is 'Masked staff display only';
