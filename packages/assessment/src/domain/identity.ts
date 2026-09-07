import { createOtpCode, createOtpExpiration } from "./otp.js";

export { normalizeEmail } from "./email.js";

export const createIdentityOtp = (): string => createOtpCode();

export const createIdentityOtpExpiration = (now: Date): Date => createOtpExpiration(now, 5);

/** How long a POST /sessions/anonymous pending signup stays valid before phone verification. */
export const createPendingSignupExpiration = (now: Date): Date => createOtpExpiration(now, 30);
