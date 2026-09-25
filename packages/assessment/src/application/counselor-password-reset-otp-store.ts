export type CounselorPasswordResetOtpChallenge = {
  /** Normalized email — the key, since no prior session exists to key off before a counselor is
   *  even signed in (unlike student identity OTP, keyed by pendingSessionId). */
  email: string;
  userId: string;
  code: string;
  expiresAt: string;
  attempts: number;
  /** When the next request-otp call for this email is allowed to actually send a new code
   *  (rather than being rejected as "too soon") — see counselor-auth.ts's
   *  counselorOtpResendAvailableAt(). Same field also gates the very first send. */
  resendAvailableAt: string;
};

export type CounselorPasswordResetOtpStore = {
  save(challenge: CounselorPasswordResetOtpChallenge): void;
  get(email: string): CounselorPasswordResetOtpChallenge | null;
  recordFailedAttempt(email: string): CounselorPasswordResetOtpChallenge | null;
  delete(email: string): void;
};

/** Same shape/tradeoffs as InMemoryIdentityOtpStore — short-lived challenges, in-process is fine. */
export class InMemoryCounselorPasswordResetOtpStore implements CounselorPasswordResetOtpStore {
  private readonly challenges = new Map<string, CounselorPasswordResetOtpChallenge>();

  save(challenge: CounselorPasswordResetOtpChallenge): void {
    this.challenges.set(challenge.email, challenge);
  }

  get(email: string): CounselorPasswordResetOtpChallenge | null {
    return this.challenges.get(email) ?? null;
  }

  recordFailedAttempt(email: string): CounselorPasswordResetOtpChallenge | null {
    const challenge = this.challenges.get(email);
    if (!challenge) {
      return null;
    }
    const updated = { ...challenge, attempts: challenge.attempts + 1 };
    this.challenges.set(email, updated);
    return updated;
  }

  delete(email: string): void {
    this.challenges.delete(email);
  }
}
