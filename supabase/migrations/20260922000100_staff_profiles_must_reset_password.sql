-- First-login forced password change for counselor (staff) accounts.
-- (docs/architecture/counselor-auth-landing-page-plan.md).
--
-- scripts/create-counselor.ts provisions a counselor with a script-generated or admin-chosen
-- password (never one the counselor picked themselves). This column marks that password as
-- temporary: CounselorAuthService.signIn() checks it on every successful password verification
-- and, when true, redirects the counselor into the same "Create New Password" screen the
-- OTP-based forgot-password flow already uses (reusing its resetToken mechanism) instead of
-- completing sign-in — so a counselor's real, permanent password is always one they chose
-- themselves, never the one printed to a terminal at provisioning time.
--
-- Purely additive: no existing row's meaning changes. Defaults to false at the column level
-- (a direct manual insert is never silently forced into this flow) — scripts/create-counselor.ts
-- is what explicitly sets it true whenever it sets or generates a password on someone's behalf.

BEGIN;

ALTER TABLE "operations"."staff_profiles"
  ADD COLUMN IF NOT EXISTS "must_reset_password" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "operations"."staff_profiles"."must_reset_password" IS
  'True when the current password was set by an admin/script (scripts/create-counselor.ts), not chosen by the counselor themselves — forces a password change on next successful sign-in.';

COMMIT;
