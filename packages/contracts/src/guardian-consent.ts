import { z } from "zod";
import { DateOnlySchema, IsoTimestampSchema, UuidSchema } from "./common.js";

export const GuardianConsentStatusSchema = z.enum([
  "pending",
  "granted",
  "declined",
  "expired",
  "revoked",
]);
export type GuardianConsentStatus = z.infer<typeof GuardianConsentStatusSchema>;

export const GuardianConsentSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  consentType: z.literal("guardian"),
  guardianEmailMasked: z.string().min(1).max(254),
  status: GuardianConsentStatusSchema,
  textVersion: z.string().min(1).max(80),
  requestedAt: IsoTimestampSchema,
  verifiedAt: IsoTimestampSchema.nullable(),
  declinedAt: IsoTimestampSchema.nullable(),
  expiredAt: IsoTimestampSchema.nullable(),
  revokedAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
});
export type GuardianConsent = z.infer<typeof GuardianConsentSchema>;

/**
 * Both request/verify (student flow, RequestIdentityOtpRequestSchema in auth.ts) and
 * guardian consent are email/SMTP-based — see @yuvanext/assessment's EmailProvider. `studentEmail`
 * is required only to enforce guardian ≠ student (never persisted; the student's own identity
 * email is verified separately during onboarding).
 */
export const RequestGuardianConsentRequestSchema = z.object({
  guardianEmail: z.string().trim().min(3).max(254).email(),
  studentEmail: z.string().trim().min(3).max(254).email(),
  textVersion: z.string().trim().min(1).max(80),
});
export type RequestGuardianConsentRequest = z.infer<typeof RequestGuardianConsentRequestSchema>;

export const VerifyGuardianConsentRequestSchema = z.object({
  consentId: UuidSchema,
  verificationCode: z.string().regex(/^\d{6}$/),
});
export type VerifyGuardianConsentRequest = z.infer<typeof VerifyGuardianConsentRequestSchema>;

/**
 * Body for the guardian-initiated decline route (POST /guardian-consents/{consentId}/decline).
 * Unlike request/verify, this route carries no x-yuvanext-user-id — the guardian has no
 * student session, so the opaque token (sent to the guardian alongside the OTP) is the only
 * proof of authorization, together with the consentId in the URL.
 */
export const DeclineGuardianConsentRequestSchema = z.object({
  token: z.string().min(16),
});
export type DeclineGuardianConsentRequest = z.infer<typeof DeclineGuardianConsentRequestSchema>;

export const GuardianConsentResponseSchema = z.object({
  consent: GuardianConsentSchema,
});
export type GuardianConsentResponse = z.infer<typeof GuardianConsentResponseSchema>;

export const GuardianConsentStatusResponseSchema = z.object({
  consentRequired: z.boolean(),
  consent: GuardianConsentSchema.nullable(),
});
export type GuardianConsentStatusResponse = z.infer<typeof GuardianConsentStatusResponseSchema>;

/**
 * Pre-identity guardian consent (Module 1): for a minor, this runs *before* the student has a
 * userId at all — keyed by the anonymous `pendingSessionId` (see auth.ts) instead of a journey
 * session. Once granted, `SignUpWithPasswordRequestSchema` (auth.ts) uses it in place of the
 * student's own email-OTP verification. No `studentEmail` field here (unlike
 * RequestGuardianConsentRequestSchema) — the student's email isn't collected until the password
 * step; the guardian-vs-student distinctness check happens there instead.
 */
export const PendingGuardianConsentSchema = z.object({
  id: UuidSchema,
  pendingSessionId: UuidSchema,
  consentType: z.literal("guardian"),
  guardianEmailMasked: z.string().min(1).max(254),
  status: GuardianConsentStatusSchema,
  textVersion: z.string().min(1).max(80),
  requestedAt: IsoTimestampSchema,
  verifiedAt: IsoTimestampSchema.nullable(),
  declinedAt: IsoTimestampSchema.nullable(),
  expiredAt: IsoTimestampSchema.nullable(),
  revokedAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
});
export type PendingGuardianConsent = z.infer<typeof PendingGuardianConsentSchema>;

export const RequestPendingGuardianConsentRequestSchema = z.object({
  pendingSessionId: UuidSchema,
  guardianEmail: z.string().trim().min(3).max(254).email(),
  // No studentEmail here — the student's own email is collected later, at the password step
  // (Figma node 264:1097), not before the guardian-consent detour. The guardian ≠ student check
  // still happens, just at that later point instead — see IdentityService.signUpWithPassword,
  // which compares the submitted signup email's hash against this consent's guardianEmailHash.
  // The backend independently computes age from this (calculateAgeAtOnboarding) rather than
  // trusting a client-computed age — no profile row exists yet to read it back from (that needs
  // a userId, which this flow doesn't have until after guardian consent + password signup).
  dateOfBirth: DateOnlySchema,
  textVersion: z.string().trim().min(1).max(80),
});
export type RequestPendingGuardianConsentRequest = z.infer<
  typeof RequestPendingGuardianConsentRequestSchema
>;

export const VerifyPendingGuardianConsentRequestSchema = z.object({
  pendingSessionId: UuidSchema,
  consentId: UuidSchema,
  verificationCode: z.string().regex(/^\d{6}$/),
});
export type VerifyPendingGuardianConsentRequest = z.infer<
  typeof VerifyPendingGuardianConsentRequestSchema
>;

export const PendingGuardianConsentResponseSchema = z.object({
  consent: PendingGuardianConsentSchema,
});
export type PendingGuardianConsentResponse = z.infer<typeof PendingGuardianConsentResponseSchema>;

/**
 * OTP timing, authoritative from the backend — the frontend renders a countdown from these
 * timestamps but never decides `canResend`/`resendsRemaining` itself (see
 * GuardianConsentService's requestForPendingSession/resendForPendingSession, packages/assessment).
 * Resend schedule: 1 min before the 1st resend, 3 min (from the 1st resend) before the 2nd, 5 min
 * (from the 2nd) before the 3rd, then never again for this verification attempt.
 */
export const GuardianOtpTimingSchema = z.object({
  otpExpiresAt: IsoTimestampSchema,
  resendCount: z.number().int().min(0),
  resendsRemaining: z.number().int().min(0),
  nextResendAvailableAt: IsoTimestampSchema.nullable(),
  canResend: z.boolean(),
});
export type GuardianOtpTiming = z.infer<typeof GuardianOtpTimingSchema>;

export const RequestPendingGuardianConsentResponseSchema = z.object({
  consent: PendingGuardianConsentSchema,
  otpTiming: GuardianOtpTimingSchema,
});
export type RequestPendingGuardianConsentResponse = z.infer<
  typeof RequestPendingGuardianConsentResponseSchema
>;

export const ResendPendingGuardianConsentRequestSchema = z.object({
  pendingSessionId: UuidSchema,
  consentId: UuidSchema,
});
export type ResendPendingGuardianConsentRequest = z.infer<
  typeof ResendPendingGuardianConsentRequestSchema
>;

export const ResendPendingGuardianConsentResponseSchema = z.object({
  otpTiming: GuardianOtpTimingSchema,
});
export type ResendPendingGuardianConsentResponse = z.infer<
  typeof ResendPendingGuardianConsentResponseSchema
>;
