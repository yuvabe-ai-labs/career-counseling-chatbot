-- Pre-identity guardian consent (Module 1): a minor's guardian-consent OTP now happens *before*
-- the student has a userId at all (see GuardianConsentService.requestForPendingSession /
-- verifyForPendingSession, and IdentityService.signUpWithPassword). user_id becomes nullable to
-- allow that pending state; pending_session_id carries the anonymous session in the meantime and
-- is cleared once attachToUser() reassigns the row to the real userId after password signup.

alter table "assessment"."guardian_consents"
  alter column "user_id" drop not null,
  add column "pending_session_id" uuid;

alter table "assessment"."guardian_consents"
  add constraint "guardian_consents_owner_check"
  check (("user_id" is not null) or ("pending_session_id" is not null));

create index "guardian_consents_pending_session_id_idx"
  on "assessment"."guardian_consents" ("pending_session_id")
  where "pending_session_id" is not null;

comment on column "assessment"."guardian_consents"."user_id" is
  'FK to auth.users; null while pending_session_id is set (minor signup, before the student has an identity)';

comment on column "assessment"."guardian_consents"."pending_session_id" is
  'Anonymous pendingSessionId (see auth.ts) — set only until attachToUser() reassigns this row to a real user_id';
