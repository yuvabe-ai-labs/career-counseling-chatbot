import { randomBytes, randomInt } from "node:crypto";
import { createOtpExpiration } from "./otp.js";

/**
 * Counselor password-reset OTP — deliberately 4 digits (not the 6-digit createOtpCode() used by
 * student identity/guardian OTP), matching Figma node 706:439's "Enter 4-digit OTP" spec exactly
 * rather than reusing the student convention for a flow the Figma design explicitly scopes
 * differently.
 */
export const createCounselorOtpCode = (): string => randomInt(0, 10_000).toString().padStart(4, "0");

export const createCounselorOtpExpiration = (now: Date): Date => createOtpExpiration(now, 10);

/**
 * Figma's own copy: "You can resend after 20 seconds." No hard resend cap, unlike guardian
 * consent's 3-tier schedule — Figma shows no "no more resends" state for this screen, so this
 * stays a flat cooldown rather than importing that stricter policy unasked.
 */
const COUNSELOR_OTP_RESEND_DELAY_SECONDS = 20;

export const counselorOtpResendAvailableAt = (from: Date): Date => {
  const resendAt = new Date(from);
  resendAt.setUTCSeconds(resendAt.getUTCSeconds() + COUNSELOR_OTP_RESEND_DELAY_SECONDS);
  return resendAt;
};

/** Opaque, unguessable, single-use — carried by the frontend as page state between the OTP-verify
 *  step and the set-new-password step; never shown to the counselor. Same construction as
 *  guardian-consent.ts's createGuardianDeclineToken. */
export const createCounselorResetToken = (): string => randomBytes(24).toString("base64url");

/** 15 minutes — enough to type a new password without rushing, short enough that an abandoned
 *  reset attempt can't be resumed much later by someone else with browser access. */
export const createCounselorResetTokenExpiration = (now: Date): Date => createOtpExpiration(now, 15);
