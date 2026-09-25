import { z } from "zod";
import { DateOnlySchema, IsoTimestampSchema, UuidSchema } from "./common.js";

/**
 * Custom identity-bootstrap contract (Module 1, Gap 1): a short-lived anonymous session
 * created before email verification, followed by our own OTP request/verify pair (delivered
 * via SMTP — see @yuvapath/assessment's EmailProvider). Verifying successfully returns a real
 * userId (backed by a Supabase Auth `auth.users` row created on first verification) that the
 * frontend then uses as the `x-yuvapath-user-id` header for every other Module 1 route — no
 * change to those routes' auth model. Guardian consent (see guardian-consent.ts) also moved to
 * email/SMTP, delivered through the same EmailProvider — no SMS/phone delivery remains anywhere.
 */
export const RequestAnonymousSessionResponseSchema = z.object({
  pendingSessionId: UuidSchema,
  expiresAt: IsoTimestampSchema,
});
export type RequestAnonymousSessionResponse = z.infer<typeof RequestAnonymousSessionResponseSchema>;

export const RequestIdentityOtpRequestSchema = z.object({
  pendingSessionId: UuidSchema,
  email: z.string().trim().min(3).max(254).email(),
});
export type RequestIdentityOtpRequest = z.infer<typeof RequestIdentityOtpRequestSchema>;

export const RequestIdentityOtpResponseSchema = z.object({
  sent: z.literal(true),
});
export type RequestIdentityOtpResponse = z.infer<typeof RequestIdentityOtpResponseSchema>;

export const VerifyIdentityOtpRequestSchema = z.object({
  pendingSessionId: UuidSchema,
  code: z.string().regex(/^\d{6}$/),
});
export type VerifyIdentityOtpRequest = z.infer<typeof VerifyIdentityOtpRequestSchema>;

export const VerifyIdentityOtpResponseSchema = z.object({
  userId: UuidSchema,
});
export type VerifyIdentityOtpResponse = z.infer<typeof VerifyIdentityOtpResponseSchema>;

/**
 * Password-based account setup (Module 1) — the single account-creation step for both adults
 * and minors, replacing the old email-OTP-based creation (RequestIdentityOtpRequestSchema /
 * VerifyIdentityOtpRequestSchema above stay defined for a possible future dashboard
 * verification feature, but nothing in registration calls them anymore).
 *
 * `dateOfBirth` is required so the backend can independently (re)confirm the age band right at
 * signup — the same value used earlier to decide whether the guardian-consent step was shown —
 * rather than trusting client state. If that recomputation says minor, this requires a
 * `pendingSessionId` with an already-`granted` guardian consent attached (see
 * guardian-consent.ts's pending-session request/verify pair); if adult, no guardian consent is
 * needed at all. Either way this is enforced server-side, not just by the frontend's step order.
 */
export const SignUpWithPasswordRequestSchema = z.object({
  pendingSessionId: UuidSchema,
  dateOfBirth: DateOnlySchema,
  email: z.string().trim().min(3).max(254).email(),
  // Figma "career" file node 264:1097 ("Password standard") specs this exact policy.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be at most 72 characters.")
    .regex(/[a-z]/, "Password must include a lowercase letter.")
    .regex(/[A-Z]/, "Password must include an uppercase letter.")
    .regex(/[0-9]/, "Password must include a number.")
    .regex(/[^A-Za-z0-9]/, "Password must include a special character."),
});
export type SignUpWithPasswordRequest = z.infer<typeof SignUpWithPasswordRequestSchema>;

export const SignUpWithPasswordResponseSchema = z.object({
  userId: UuidSchema,
});
export type SignUpWithPasswordResponse = z.infer<typeof SignUpWithPasswordResponseSchema>;

/**
 * Pre-identity email-uniqueness check (Module 1) — lets the frontend validate the student's own
 * email right after Step 1, before the guardian-consent detour for a minor, rather than only
 * discovering a duplicate at the very end of the flow. Same case-insensitive comparison
 * IdentityUserDirectory.emailExists uses everywhere else; Supabase Auth's own uniqueness
 * guarantee is still what actually gets enforced at account-creation time (see
 * SupabaseIdentityDirectory) — this is a convenience check, not the source of truth.
 */
export const CheckEmailAvailabilityRequestSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
});
export type CheckEmailAvailabilityRequest = z.infer<typeof CheckEmailAvailabilityRequestSchema>;

export const CheckEmailAvailabilityResponseSchema = z.object({
  available: z.boolean(),
});
export type CheckEmailAvailabilityResponse = z.infer<typeof CheckEmailAvailabilityResponseSchema>;

/**
 * Password-based sign-in (Module 1) — the returning-user counterpart to
 * SignUpWithPasswordRequestSchema above. No pendingSessionId/dateOfBirth: those only exist to
 * gate first-time account creation (guardian consent, age recomputation), which an already-
 * created account has already been through. Deliberately not length/complexity-validated the
 * way the signup password is — an existing password may predate a later policy tightening, and
 * this only ever gets echoed back to Supabase Auth for verification, never stored.
 *
 * Response mirrors SignUpWithPasswordResponseSchema (`{ userId }`) rather than issuing a
 * Supabase JWT session: every other Module 1 route still authenticates via the plain
 * `x-yuvapath-user-id` header (see apps/web/src/lib/api-client.ts), not a bearer token, so this
 * keeps the same auth model signup already established instead of introducing a second one.
 */
export const SignInWithPasswordRequestSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  password: z.string().min(1).max(72),
});
export type SignInWithPasswordRequest = z.infer<typeof SignInWithPasswordRequestSchema>;

export const SignInWithPasswordResponseSchema = z.object({
  userId: UuidSchema,
});
export type SignInWithPasswordResponse = z.infer<typeof SignInWithPasswordResponseSchema>;

/**
 * Counselor (staff) auth — a separate flow from the student one above, though it shares the
 * same underlying identity store (Supabase Auth `auth.users`) and the same
 * `{ userId }`-only response shape/auth model (no bearer session — see
 * SignInWithPasswordResponseSchema's own comment). A "counselor" is an auth.users row that also
 * has an active `operations.staff_profiles` row and a non-revoked, non-expired
 * `operations.staff_role_assignments` row with role='counselor' — verified server-side on every
 * sign-in, never inferred from the response alone. See
 * docs/architecture/counselor-auth-landing-page-plan.md.
 */
export const CounselorSignInRequestSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  password: z.string().min(1).max(72),
});
export type CounselorSignInRequest = z.infer<typeof CounselorSignInRequestSchema>;

/**
 * requiresPasswordReset is true when the password just verified was a temporary one set by
 * scripts/create-counselor.ts, not chosen by the counselor themselves
 * (operations.staff_profiles.must_reset_password) — sign-in does NOT complete in that case;
 * resetToken is populated instead (same short-lived, single-use token
 * VerifyCounselorPasswordResetOtpResponseSchema issues) so the frontend can send the counselor
 * straight into the existing "Create New Password" screen, reusing SetCounselorPasswordRequestSchema
 * below rather than a separate first-login flow. userId is always present either way.
 *
 * displayName is operations.staff_profiles.display_name (required on every counselor row) — used
 * client-side only to render the account-avatar initials (see apps/web's Avatar component), same
 * source the dashboard's own "Welcome" copy could draw from. Present even when
 * requiresPasswordReset is true for schema simplicity, though the frontend only stores it once
 * sign-in actually completes.
 */
export const CounselorSignInResponseSchema = z.object({
  userId: UuidSchema,
  requiresPasswordReset: z.boolean(),
  resetToken: z.string().min(1).optional(),
  displayName: z.string().min(1),
});
export type CounselorSignInResponse = z.infer<typeof CounselorSignInResponseSchema>;

/**
 * Counselor forgot-password, OTP-based (Figma node 706:439): request a 4-digit code by email,
 * verify it, then set a new password with the short-lived token verification returns. Distinct
 * from the student identity/guardian OTP flows (6-digit, keyed by pendingSessionId) — this one
 * is keyed by email directly (no prior session exists to key off before a counselor is even
 * signed in) and uses a 4-digit code, matching the Figma spec exactly rather than reusing the
 * student flow's 6-digit convention.
 */
export const RequestCounselorPasswordResetOtpRequestSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
});
export type RequestCounselorPasswordResetOtpRequest = z.infer<
  typeof RequestCounselorPasswordResetOtpRequestSchema
>;

export const RequestCounselorPasswordResetOtpResponseSchema = z.object({
  sent: z.literal(true),
});
export type RequestCounselorPasswordResetOtpResponse = z.infer<
  typeof RequestCounselorPasswordResetOtpResponseSchema
>;

export const VerifyCounselorPasswordResetOtpRequestSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  code: z.string().regex(/^\d{4}$/),
});
export type VerifyCounselorPasswordResetOtpRequest = z.infer<
  typeof VerifyCounselorPasswordResetOtpRequestSchema
>;

/** resetToken is opaque, single-use, short-lived — carried by the frontend as page state into
 *  the "Create New Password" step, never shown to the counselor. */
export const VerifyCounselorPasswordResetOtpResponseSchema = z.object({
  resetToken: z.string().min(1),
});
export type VerifyCounselorPasswordResetOtpResponse = z.infer<
  typeof VerifyCounselorPasswordResetOtpResponseSchema
>;

export const SetCounselorPasswordRequestSchema = z.object({
  resetToken: z.string().min(1),
  // Same policy as SignUpWithPasswordRequestSchema (Figma node 706:520 specs the identical
  // checklist: lowercase, uppercase, number, special character, 8-character minimum).
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be at most 72 characters.")
    .regex(/[a-z]/, "Password must include a lowercase letter.")
    .regex(/[A-Z]/, "Password must include an uppercase letter.")
    .regex(/[0-9]/, "Password must include a number.")
    .regex(/[^A-Za-z0-9]/, "Password must include a special character."),
});
export type SetCounselorPasswordRequest = z.infer<typeof SetCounselorPasswordRequestSchema>;

export const SetCounselorPasswordResponseSchema = z.object({
  success: z.literal(true),
});
export type SetCounselorPasswordResponse = z.infer<typeof SetCounselorPasswordResponseSchema>;
