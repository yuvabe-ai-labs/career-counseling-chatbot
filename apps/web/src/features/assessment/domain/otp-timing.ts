import type { GuardianOtpTiming } from "@yuvanext/contracts";

/**
 * Purely derived from the backend's own `GuardianOtpTiming` (packages/contracts) plus the
 * current time — never a separately stored flag. The backend is the only source of truth for
 * `otpExpiresAt`/`nextResendAvailableAt`/`canResend`; this just turns those into something a
 * component can branch its rendering on, mirroring GuardianConsentService's own resend schedule
 * (packages/assessment/src/domain/guardian-consent.ts).
 */
export type OtpResendState = "resend_limit_reached" | "resend_waiting" | "resend_available";

export function deriveResendState(otpTiming: GuardianOtpTiming, now: Date): OtpResendState {
  if (!otpTiming.canResend || !otpTiming.nextResendAvailableAt) {
    return "resend_limit_reached";
  }
  return now.getTime() >= new Date(otpTiming.nextResendAvailableAt).getTime()
    ? "resend_available"
    : "resend_waiting";
}

export function isOtpExpired(otpTiming: GuardianOtpTiming, now: Date): boolean {
  return now.getTime() >= new Date(otpTiming.otpExpiresAt).getTime();
}

/** Whole seconds remaining until `iso`, floored at 0 (never negative, for display). */
export function secondsUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 1000));
}

/** "1:05" style — used for both the OTP-expiry and resend-wait countdowns. */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
