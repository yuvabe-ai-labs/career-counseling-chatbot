import { createHash, randomBytes } from "node:crypto";
import { createOtpCode, createOtpExpiration } from "./otp.js";

export { maskEmail, normalizeEmail } from "./email.js";

export const protectedEmailHash = (normalizedEmail: string): string =>
  createHash("sha256").update(`guardian-email:v1:${normalizedEmail}`).digest("hex");

export const providerReferenceHash = (consentId: string): string =>
  createHash("sha256").update(`guardian-provider-reference:v1:${consentId}`).digest("hex");

export const createGuardianOtp = (): string => createOtpCode();

export const isMinorAge = (ageAtOnboarding: number): boolean => ageAtOnboarding < 18;

export const createGuardianOtpExpiration = (now: Date): Date => createOtpExpiration(now, 5);

/**
 * Resend schedule: 1 minute before the 1st resend, 3 minutes (from the 1st resend) before the
 * 2nd, 5 minutes (from the 2nd resend) before the 3rd, then no more resends ever for this
 * verification attempt. Indexed by the *current* resendCount (0, 1, 2) — index 3 (after the 3rd
 * resend) has no entry, which is exactly "no more resends allowed".
 */
const GUARDIAN_OTP_RESEND_DELAY_MINUTES = [1, 3, 5] as const;
export const GUARDIAN_OTP_MAX_RESENDS = GUARDIAN_OTP_RESEND_DELAY_MINUTES.length;

/** Minutes until the next resend is available, given how many resends have been used so far. */
export const guardianOtpNextResendDelayMinutes = (resendCount: number): number | null =>
  GUARDIAN_OTP_RESEND_DELAY_MINUTES[resendCount] ?? null;

/**
 * Timestamp the next resend becomes available, computed from `from` — the moment the *current*
 * OTP was issued (the original request, or the most recent resend), never from when the very
 * first OTP was originally created. Null once the max resend count has been used: no more
 * resends are ever allowed for this verification attempt.
 */
export const guardianOtpResendAvailableAt = (resendCount: number, from: Date): Date | null => {
  const delay = guardianOtpNextResendDelayMinutes(resendCount);
  return delay === null ? null : createOtpExpiration(from, delay);
};

/**
 * Guardian-initiated decline link token (Gap 6). Opaque and unguessable — this, plus the
 * consentId in the URL, is the only "authentication" on the unauthenticated decline route,
 * since the guardian has no student session. Longer-lived than the OTP: a guardian may not
 * read the message immediately, and declining is a lower-stakes action to leave open longer.
 */
export const createGuardianDeclineToken = (): string => randomBytes(24).toString("base64url");

export const createGuardianDeclineTokenExpiration = (now: Date): Date =>
  createOtpExpiration(now, 24 * 60);
