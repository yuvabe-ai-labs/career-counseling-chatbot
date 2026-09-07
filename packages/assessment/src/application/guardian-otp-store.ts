export type GuardianOtpChallenge = {
  consentId: string;
  code: string;
  /**
   * Kept here (ephemeral, in-memory) — not in the persisted assessment.guardian_consents row,
   * which only ever stores a hash + masked display form of the guardian's email. Needed to
   * resend to the same address without asking the frontend to resupply it (which would also
   * let a client silently redirect a resend to a different email than the one consent was
   * actually requested for).
   */
  guardianEmail: string;
  issuedAt: string;
  expiresAt: string;
  attempts: number;
  /** How many times this OTP has been resent so far (0 = never resent — the original send). */
  resendCount: number;
  /** Null once resendCount has reached GUARDIAN_OTP_MAX_RESENDS — no more resends, ever, for
   * this verification attempt (domain/guardian-consent.ts's guardianOtpResendAvailableAt). */
  nextResendAvailableAt: string | null;
};

export type GuardianOtpStore = {
  save(challenge: GuardianOtpChallenge): void;
  get(consentId: string): GuardianOtpChallenge | null;
  recordFailedAttempt(consentId: string): GuardianOtpChallenge | null;
  delete(consentId: string): void;
};

export class InMemoryGuardianOtpStore implements GuardianOtpStore {
  private readonly challenges = new Map<string, GuardianOtpChallenge>();

  save(challenge: GuardianOtpChallenge): void {
    this.challenges.set(challenge.consentId, challenge);
  }

  get(consentId: string): GuardianOtpChallenge | null {
    return this.challenges.get(consentId) ?? null;
  }

  recordFailedAttempt(consentId: string): GuardianOtpChallenge | null {
    const challenge = this.challenges.get(consentId);
    if (!challenge) {
      return null;
    }
    const updated = { ...challenge, attempts: challenge.attempts + 1 };
    this.challenges.set(consentId, updated);
    return updated;
  }

  delete(consentId: string): void {
    this.challenges.delete(consentId);
  }
}
