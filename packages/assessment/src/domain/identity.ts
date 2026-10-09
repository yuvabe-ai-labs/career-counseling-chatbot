import { createOtpExpiration } from "./otp.js";

export { normalizeEmail } from "./email.js";

/** How long a POST /sessions/anonymous pending signup stays valid before account creation. */
export const createPendingSignupExpiration = (now: Date): Date => createOtpExpiration(now, 30);
