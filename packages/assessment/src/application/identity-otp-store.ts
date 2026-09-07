export type IdentityOtpChallenge = {
  pendingSessionId: string;
  /** Captured at request time so verify doesn't need the client to resend the email. */
  email: string;
  code: string;
  expiresAt: string;
  attempts: number;
};

export type IdentityOtpStore = {
  save(challenge: IdentityOtpChallenge): void;
  get(pendingSessionId: string): IdentityOtpChallenge | null;
  recordFailedAttempt(pendingSessionId: string): IdentityOtpChallenge | null;
  delete(pendingSessionId: string): void;
};

/** Same shape/tradeoffs as InMemoryGuardianOtpStore (see guardian-otp-store.ts). */
export class InMemoryIdentityOtpStore implements IdentityOtpStore {
  private readonly challenges = new Map<string, IdentityOtpChallenge>();

  save(challenge: IdentityOtpChallenge): void {
    this.challenges.set(challenge.pendingSessionId, challenge);
  }

  get(pendingSessionId: string): IdentityOtpChallenge | null {
    return this.challenges.get(pendingSessionId) ?? null;
  }

  recordFailedAttempt(pendingSessionId: string): IdentityOtpChallenge | null {
    const challenge = this.challenges.get(pendingSessionId);
    if (!challenge) {
      return null;
    }
    const updated = { ...challenge, attempts: challenge.attempts + 1 };
    this.challenges.set(pendingSessionId, updated);
    return updated;
  }

  delete(pendingSessionId: string): void {
    this.challenges.delete(pendingSessionId);
  }
}
