export type PendingSignup = {
  id: string;
  createdAt: string;
  expiresAt: string;
};

export type PendingSignupStore = {
  create(signup: PendingSignup): void;
  get(id: string): PendingSignup | null;
  delete(id: string): void;
};

/**
 * In-memory, matching InMemoryGuardianOtpStore/InMemoryIdentityOtpStore — a pending signup is
 * short-lived (see createPendingSignupExpiration) and only ever needed to bridge the landing
 * screen to phone verification, so it doesn't need to survive a server restart.
 */
export class InMemoryPendingSignupStore implements PendingSignupStore {
  private readonly signups = new Map<string, PendingSignup>();

  create(signup: PendingSignup): void {
    this.signups.set(signup.id, signup);
  }

  get(id: string): PendingSignup | null {
    return this.signups.get(id) ?? null;
  }

  delete(id: string): void {
    this.signups.delete(id);
  }
}
