export type GuardianDeclineTokenChallenge = {
  consentId: string;
  token: string;
  expiresAt: string;
};

export type GuardianDeclineTokenStore = {
  save(challenge: GuardianDeclineTokenChallenge): void;
  get(consentId: string): GuardianDeclineTokenChallenge | null;
  delete(consentId: string): void;
};

/** Same in-memory tradeoffs as InMemoryGuardianOtpStore (see guardian-otp-store.ts). */
export class InMemoryGuardianDeclineTokenStore implements GuardianDeclineTokenStore {
  private readonly challenges = new Map<string, GuardianDeclineTokenChallenge>();

  save(challenge: GuardianDeclineTokenChallenge): void {
    this.challenges.set(challenge.consentId, challenge);
  }

  get(consentId: string): GuardianDeclineTokenChallenge | null {
    return this.challenges.get(consentId) ?? null;
  }

  delete(consentId: string): void {
    this.challenges.delete(consentId);
  }
}
