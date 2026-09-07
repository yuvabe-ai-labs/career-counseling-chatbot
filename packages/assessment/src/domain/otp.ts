import { randomInt } from "node:crypto";

/** Shared by guardian-consent OTP and identity OTP — see domain/guardian-consent.ts and domain/identity.ts. */
export const createOtpCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

export const createOtpExpiration = (now: Date, minutes: number): Date => {
  const expiresAt = new Date(now);
  expiresAt.setUTCMinutes(expiresAt.getUTCMinutes() + minutes);
  return expiresAt;
};
