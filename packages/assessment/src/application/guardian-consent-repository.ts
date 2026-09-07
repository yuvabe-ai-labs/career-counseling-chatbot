import type { GuardianConsent } from "@yuvanext/contracts";

export type NewGuardianConsent = {
  id: string;
  userId: string;
  guardianEmailHash: string;
  guardianEmailMasked: string;
  status: "pending";
  textVersion: string;
  providerReferenceHash: string;
  now: string;
};

/**
 * Same shape as GuardianConsentSchema (contracts) but with `pendingSessionId` instead of
 * `userId` — this consent isn't attached to a real identity yet (see attachToUser below).
 */
export type PendingSessionGuardianConsent = {
  id: string;
  pendingSessionId: string;
  consentType: "guardian";
  guardianEmailMasked: string;
  status: "pending" | "granted" | "declined" | "expired" | "revoked";
  textVersion: string;
  requestedAt: string;
  verifiedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type NewPendingSessionGuardianConsent = {
  id: string;
  pendingSessionId: string;
  guardianEmailHash: string;
  guardianEmailMasked: string;
  status: "pending";
  textVersion: string;
  providerReferenceHash: string;
  now: string;
};

export type GuardianConsentRepository = {
  createPending(input: NewGuardianConsent): Promise<GuardianConsent>;
  findByIdForUser(input: { consentId: string; userId: string }): Promise<GuardianConsent | null>;
  /** Not scoped to a userId — used by the unauthenticated guardian-decline route, which has
   * no student session to scope by (see decline()). */
  findById(consentId: string): Promise<GuardianConsent | null>;
  findLatestForUser(userId: string): Promise<GuardianConsent | null>;
  hasGrantedForUser(userId: string): Promise<boolean>;
  grant(input: { consentId: string; userId: string; now: string }): Promise<GuardianConsent>;
  expire(input: { consentId: string; userId: string; now: string }): Promise<GuardianConsent>;
  decline(input: { consentId: string; userId: string; now: string }): Promise<GuardianConsent>;

  /**
   * Pre-identity path (minor signup, no userId yet — see PendingSessionGuardianConsent above).
   * Mirrors the userId-scoped methods above, but scoped by `pendingSessionId` instead.
   */
  createPendingForSession(
    input: NewPendingSessionGuardianConsent,
  ): Promise<PendingSessionGuardianConsent>;
  findByIdForSession(input: {
    consentId: string;
    pendingSessionId: string;
  }): Promise<PendingSessionGuardianConsent | null>;
  grantForSession(input: {
    consentId: string;
    pendingSessionId: string;
    now: string;
  }): Promise<PendingSessionGuardianConsent>;
  expireForSession(input: {
    consentId: string;
    pendingSessionId: string;
    now: string;
  }): Promise<PendingSessionGuardianConsent>;
  /**
   * Looks up a *granted* pending-session consent, for the password-signup step to confirm
   * guardian consent actually happened (and to get the guardian's email hash, to enforce
   * guardian ≠ student without ever exposing the guardian's plaintext email outside this
   * module). Returns null if none exists or it isn't granted yet.
   */
  findGrantedForPendingSession(
    pendingSessionId: string,
  ): Promise<{ consentId: string; guardianEmailHash: string } | null>;
  /**
   * Finalizes a granted pending-session consent once password signup creates the real userId —
   * reassigns it from pendingSessionId to userId so findLatestForUser/hasGrantedForUser see it
   * from then on, same as a consent granted through the adult (post-identity) path.
   */
  attachToUser(input: { consentId: string; userId: string; now: string }): Promise<GuardianConsent>;
};
