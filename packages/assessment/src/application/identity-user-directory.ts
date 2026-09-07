/**
 * Port onto the real identity store (Supabase Auth's `auth.users`, via the service-role
 * admin API — implemented in apps/api, e.g. apps/api/src/auth/supabase-identity-directory.ts).
 * This is the piece that resolves Gap 1's FK-violation problem: every other Module 1 route
 * requires x-yuvanext-user-id to already exist in auth.users, and nothing previously created
 * that row. findOrCreateUserIdByEmail is what creates it, on first successful OTP verification.
 */
export type IdentityUserDirectory = {
  findOrCreateUserIdByEmail(email: string): Promise<string>;
  /**
   * Password-based signup (minors, after guardian consent — see IdentityService.signUpWithPassword).
   * Unlike findOrCreateUserIdByEmail, this always creates a *new* auth.users row and rejects if
   * the email is already registered — reusing an existing row here would mean silently
   * overwriting someone else's password.
   */
  createUserWithPassword(email: string, password: string): Promise<string>;
  /**
   * Case-insensitive existence check (Supabase Auth itself enforces uniqueness this way — see
   * SupabaseIdentityDirectory), reused for three things: the pre-identity email-availability
   * check (IdentityService.checkEmailAvailability), rejecting a guardian email that belongs to
   * an existing user (GuardianConsentService.requestForPendingSession), and — indirectly, via
   * createUserWithPassword's own pre-check — final account creation.
   */
  emailExists(email: string): Promise<boolean>;
  /**
   * Password-based sign-in (returning users — see IdentityService.signInWithPassword). Returns
   * the userId on a correct email/password pair, or null for any failure — wrong password,
   * unknown email, or an account that has no password (e.g. never completed signup) — so the
   * caller can return one generic "email or password is incorrect" error either way, rather
   * than letting response shape leak whether a given email is registered.
   */
  verifyPassword(email: string, password: string): Promise<string | null>;
};
