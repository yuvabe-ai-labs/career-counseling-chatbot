/**
 * Port onto the real counselor identity store — Supabase Auth `auth.users`, gated by
 * `operations.staff_profiles`/`operations.staff_role_assignments(role='counselor')` (see
 * docs/architecture/counselor-auth-landing-page-plan.md). Implemented in apps/api
 * (SupabaseCounselorDirectory), parallel to IdentityUserDirectory for students but never
 * confused with it — a counselor is verified against the staff-role tables on every call here,
 * not just against auth.users existing.
 */
export type CounselorDirectory = {
  /**
   * Returns the userId (plus whether the current password is a script-set temporary one — see
   * mustResetPassword's own field comment, and the counselor's display_name for the account
   * avatar) only when the password is correct AND the account currently holds an active,
   * non-revoked, non-expired 'counselor' role — folding "wrong password", "no such account", and
   * "account exists but isn't an active counselor" into the same null result, so the caller can
   * return one generic invalid-credentials error for all of them (same reasoning as
   * IdentityUserDirectory.verifyPassword).
   */
  verifyCounselorPassword(
    email: string,
    password: string,
  ): Promise<{ userId: string; mustResetPassword: boolean; displayName: string } | null>;
  /**
   * For the forgot-password flow: resolves an email to a userId only if it currently belongs to
   * an active counselor — null otherwise (including "no such account"), so
   * requestPasswordResetOtp can silently no-op instead of sending mail to (or confirming the
   * existence of) a non-counselor address.
   */
  findActiveCounselorIdByEmail(email: string): Promise<string | null>;
  /** Sets a new password directly (Supabase Admin `updateUserById`) — used only after a
   *  password-reset token has already been verified (either via the OTP flow, or via a
   *  forced-first-login reset — see CounselorAuthService.signIn()); never exposed to an
   *  unauthenticated caller on its own. */
  updatePassword(userId: string, newPassword: string): Promise<void>;
  /** Clears operations.staff_profiles.must_reset_password — called every time a password is
   *  actually set via setNewPassword, regardless of which flow got them there, so a counselor
   *  never gets routed back into the forced-reset screen once they've chosen their own
   *  password. Safe/idempotent to call even when the flag was already false. */
  clearMustResetPassword(userId: string): Promise<void>;
  /** For authenticated counselor-only routes (dashboard stats, etc.) called with a userId already
   *  taken from the x-yuvapath-counselor-id header — re-checks that userId still holds an active,
   *  non-revoked, non-expired 'counselor' role, the same check verifyCounselorPassword folds into
   *  sign-in, so a revoked counselor's still-cached header can't keep reading data. */
  isActiveCounselor(userId: string): Promise<boolean>;
};
