import { describe, expect, it } from "vitest";
import type { GuardianConsent, JourneySession, UserProfile } from "@yuvanext/contracts";
import type { SendEmailInput, SendEmailResult, EmailProvider } from "./email-provider.js";
import { GuardianConsentService } from "./guardian-consent-service.js";
import type {
  GuardianConsentRepository,
  NewGuardianConsent,
  NewPendingSessionGuardianConsent,
  PendingSessionGuardianConsent,
} from "./guardian-consent-repository.js";
import { InMemoryGuardianDeclineTokenStore } from "./guardian-decline-token-store.js";
import { InMemoryGuardianOtpStore } from "./guardian-otp-store.js";
import type { JourneySessionRepository } from "./journey-session-repository.js";
import { InMemoryPendingSignupStore } from "./pending-signup-store.js";
import type { UserProfileRepository } from "./user-profile-repository.js";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

class InMemoryJourneySessionRepository implements JourneySessionRepository {
  constructor(private readonly session: JourneySession) {}

  create(): Promise<JourneySession> {
    throw new Error("not used");
  }

  findByIdForUser(input: { sessionId: string; userId: string }): Promise<JourneySession | null> {
    return Promise.resolve(
      this.session.id === input.sessionId && this.session.userId === input.userId
        ? this.session
        : null,
    );
  }

  markExpired(input: { now: string }): Promise<JourneySession> {
    return Promise.resolve({ ...this.session, status: "expired", lastSeenAt: input.now });
  }

  resume(): Promise<JourneySession> {
    throw new Error("not used");
  }
}

class InMemoryUserProfileRepository implements UserProfileRepository {
  constructor(private readonly profile: UserProfile | null) {}

  upsert(): Promise<UserProfile> {
    throw new Error("not used");
  }

  findByUserId(profileUserId: string): Promise<UserProfile | null> {
    return Promise.resolve(this.profile?.userId === profileUserId ? this.profile : null);
  }
}

class InMemoryGuardianConsentRepository implements GuardianConsentRepository {
  readonly consents = new Map<string, GuardianConsent>();

  createPending(input: NewGuardianConsent): Promise<GuardianConsent> {
    const consent: GuardianConsent = {
      id: input.id,
      userId: input.userId,
      consentType: "guardian",
      guardianEmailMasked: input.guardianEmailMasked,
      status: "pending",
      textVersion: input.textVersion,
      requestedAt: input.now,
      verifiedAt: null,
      declinedAt: null,
      expiredAt: null,
      revokedAt: null,
      createdAt: input.now,
    };
    this.consents.set(consent.id, consent);
    return Promise.resolve(consent);
  }

  findByIdForUser(input: { consentId: string; userId: string }): Promise<GuardianConsent | null> {
    const consent = this.consents.get(input.consentId);
    return Promise.resolve(consent?.userId === input.userId ? consent : null);
  }

  findById(consentId: string): Promise<GuardianConsent | null> {
    return Promise.resolve(this.consents.get(consentId) ?? null);
  }

  findLatestForUser(consentUserId: string): Promise<GuardianConsent | null> {
    return Promise.resolve(
      [...this.consents.values()].find((consent) => consent.userId === consentUserId) ?? null,
    );
  }

  hasGrantedForUser(consentUserId: string): Promise<boolean> {
    return Promise.resolve(
      [...this.consents.values()].some(
        (consent) => consent.userId === consentUserId && consent.status === "granted",
      ),
    );
  }

  async grant(input: { consentId: string; userId: string; now: string }): Promise<GuardianConsent> {
    const consent = await this.findByIdForUser(input);
    if (!consent) {
      throw new Error("missing consent");
    }
    const granted: GuardianConsent = { ...consent, status: "granted", verifiedAt: input.now };
    this.consents.set(input.consentId, granted);
    return granted;
  }

  async expire(input: {
    consentId: string;
    userId: string;
    now: string;
  }): Promise<GuardianConsent> {
    const consent = await this.findByIdForUser(input);
    if (!consent) {
      throw new Error("missing consent");
    }
    const expired: GuardianConsent = { ...consent, status: "expired", expiredAt: input.now };
    this.consents.set(input.consentId, expired);
    return expired;
  }

  async decline(input: {
    consentId: string;
    userId: string;
    now: string;
  }): Promise<GuardianConsent> {
    const consent = await this.findByIdForUser(input);
    if (!consent) {
      throw new Error("missing consent");
    }
    const declined: GuardianConsent = { ...consent, status: "declined", declinedAt: input.now };
    this.consents.set(input.consentId, declined);
    return declined;
  }

  // Pre-identity path (minor signup) — separate map since these rows have no userId yet.
  readonly pendingConsents = new Map<
    string,
    PendingSessionGuardianConsent & { guardianEmailHash: string }
  >();

  createPendingForSession(
    input: NewPendingSessionGuardianConsent,
  ): Promise<PendingSessionGuardianConsent> {
    const consent = {
      id: input.id,
      pendingSessionId: input.pendingSessionId,
      consentType: "guardian" as const,
      guardianEmailMasked: input.guardianEmailMasked,
      guardianEmailHash: input.guardianEmailHash,
      status: "pending" as const,
      textVersion: input.textVersion,
      requestedAt: input.now,
      verifiedAt: null,
      declinedAt: null,
      expiredAt: null,
      revokedAt: null,
      createdAt: input.now,
    };
    this.pendingConsents.set(consent.id, consent);
    return Promise.resolve(consent);
  }

  findByIdForSession(input: {
    consentId: string;
    pendingSessionId: string;
  }): Promise<PendingSessionGuardianConsent | null> {
    const consent = this.pendingConsents.get(input.consentId);
    return Promise.resolve(consent?.pendingSessionId === input.pendingSessionId ? consent : null);
  }

  async grantForSession(input: {
    consentId: string;
    pendingSessionId: string;
    now: string;
  }): Promise<PendingSessionGuardianConsent> {
    const consent = await this.findByIdForSession(input);
    if (!consent) throw new Error("missing pending consent");
    const stored = this.pendingConsents.get(input.consentId);
    if (!stored) throw new Error("missing pending consent");
    const granted = { ...stored, status: "granted" as const, verifiedAt: input.now };
    this.pendingConsents.set(input.consentId, granted);
    return granted;
  }

  async expireForSession(input: {
    consentId: string;
    pendingSessionId: string;
    now: string;
  }): Promise<PendingSessionGuardianConsent> {
    const consent = await this.findByIdForSession(input);
    if (!consent) throw new Error("missing pending consent");
    const stored = this.pendingConsents.get(input.consentId);
    if (!stored) throw new Error("missing pending consent");
    const expired = { ...stored, status: "expired" as const, expiredAt: input.now };
    this.pendingConsents.set(input.consentId, expired);
    return expired;
  }

  findGrantedForPendingSession(
    pendingSessionId: string,
  ): Promise<{ consentId: string; guardianEmailHash: string } | null> {
    const consent = [...this.pendingConsents.values()].find(
      (candidate) =>
        candidate.pendingSessionId === pendingSessionId && candidate.status === "granted",
    );
    return Promise.resolve(
      consent ? { consentId: consent.id, guardianEmailHash: consent.guardianEmailHash } : null,
    );
  }

  attachToUser(input: {
    consentId: string;
    userId: string;
    now: string;
  }): Promise<GuardianConsent> {
    const pending = this.pendingConsents.get(input.consentId);
    if (!pending || pending.status !== "granted") {
      throw new Error("missing granted pending consent");
    }
    const attached: GuardianConsent = {
      id: pending.id,
      userId: input.userId,
      consentType: "guardian",
      guardianEmailMasked: pending.guardianEmailMasked,
      status: "granted",
      textVersion: pending.textVersion,
      requestedAt: pending.requestedAt,
      verifiedAt: pending.verifiedAt,
      declinedAt: pending.declinedAt,
      expiredAt: pending.expiredAt,
      revokedAt: pending.revokedAt,
      createdAt: pending.createdAt,
    };
    this.consents.set(attached.id, attached);
    this.pendingConsents.delete(input.consentId);
    return Promise.resolve(attached);
  }
}

const session: JourneySession = {
  id: sessionId,
  userId,
  anonymousSessionId: null,
  channel: "web",
  status: "active",
  startedAt: "2026-07-29T10:00:00.000Z",
  lastSeenAt: "2026-07-29T10:00:00.000Z",
  expiresAt: "2026-08-05T10:00:00.000Z",
  completedAt: null,
};

const minorProfile: UserProfile = {
  userId,
  firstName: "Minor",
  ageAtOnboarding: 15,
  ageBand: "minor_14_15",
  city: "Chennai",
  state: "Tamil Nadu",
  countryCode: "IN",
  segment: "explorer",
  selfStage: "school",
  wantsAid: false,
  profileStatus: "active",
  createdAt: "2026-07-29T10:00:00.000Z",
  updatedAt: "2026-07-29T10:00:00.000Z",
  deletedAt: null,
};

class FakeEmailProvider implements EmailProvider {
  readonly sent: SendEmailInput[] = [];

  send(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);
    return Promise.resolve({ providerMessageId: "fake-message-id" });
  }
}

const pendingSessionId = "44444444-4444-4444-8444-444444444444";

/** Narrow fake for GuardianConsentService's optional identityUserDirectory dependency. */
class FakeIdentityUserDirectoryGate {
  readonly registeredEmails = new Set<string>();

  emailExists(email: string): Promise<boolean> {
    return Promise.resolve(this.registeredEmails.has(email.toLowerCase()));
  }
}

const createService = (profile: UserProfile | null = minorProfile) => {
  const consentRepository = new InMemoryGuardianConsentRepository();
  const otpStore = new InMemoryGuardianOtpStore();
  const declineTokenStore = new InMemoryGuardianDeclineTokenStore();
  const emailProvider = new FakeEmailProvider();
  const pendingSignupStore = new InMemoryPendingSignupStore();
  const identityUserDirectory = new FakeIdentityUserDirectoryGate();
  pendingSignupStore.create({
    id: pendingSessionId,
    createdAt: "2026-07-29T09:00:00.000Z",
    expiresAt: "2026-07-29T10:30:00.000Z",
  });
  return {
    consentRepository,
    otpStore,
    declineTokenStore,
    emailProvider,
    pendingSignupStore,
    identityUserDirectory,
    service: new GuardianConsentService({
      guardianConsentRepository: consentRepository,
      journeySessionRepository: new InMemoryJourneySessionRepository(session),
      userProfileRepository: new InMemoryUserProfileRepository(profile),
      pendingSignupStore,
      otpStore,
      declineTokenStore,
      emailProvider,
      identityUserDirectory,
      clock: () => new Date("2026-07-29T10:00:00.000Z"),
      createOtp: () => "123456",
    }),
  };
};

describe("GuardianConsentService", () => {
  it("requests pending consent and stores only masked guardian email in the contract", async () => {
    const { service, otpStore } = createService();

    const consent = await service.request({
      sessionId,
      userId,
      consent: {
        guardianEmail: "Guardian@Example.com",
        studentEmail: "student@example.com",
        textVersion: "guardian-consent-v1",
      },
    });

    expect(consent.status).toBe("pending");
    expect(consent.guardianEmailMasked).toBe("gu******@example.com");
    expect(otpStore.get(consent.id)?.code).toBe("123456");
  });

  it("sends exactly one OTP-only email to the guardian, with no decline content or token", async () => {
    const { service, emailProvider, declineTokenStore } = createService();

    const consent = await service.request({
      sessionId,
      userId,
      consent: {
        guardianEmail: "Guardian@Example.com",
        studentEmail: "student@example.com",
        textVersion: "guardian-consent-v1",
      },
    });

    // Decline isn't offered at this stage (planned separately, later) — no decline token is
    // generated or stored as part of requesting consent, and the one email sent carries only the
    // OTP, nothing decline-related.
    expect(emailProvider.sent).toHaveLength(1);
    expect(declineTokenStore.get(consent.id)).toBeNull();
    expect(emailProvider.sent[0]).toMatchObject({
      to: "guardian@example.com",
      context: "guardian_otp",
      templateVars: { OTP: "123456" },
    });
    expect(emailProvider.sent[0]?.templateVars).not.toHaveProperty("CONSENT_ID");
    expect(emailProvider.sent[0]?.templateVars).not.toHaveProperty("TOKEN");
  });

  it("rejects guardian email matching the student email", async () => {
    const { service } = createService();

    await expect(
      service.request({
        sessionId,
        userId,
        consent: {
          guardianEmail: "same@example.com",
          studentEmail: "Same@Example.com",
          textVersion: "guardian-consent-v1",
        },
      }),
    ).rejects.toMatchObject({ code: "guardian_email_matches_student", statusCode: 400 });
  });

  it("does not request guardian consent for adult profiles", async () => {
    const { service } = createService({
      ...minorProfile,
      ageAtOnboarding: 26,
      ageBand: "adult_19_plus",
    });

    await expect(
      service.request({
        sessionId,
        userId,
        consent: {
          guardianEmail: "guardian@example.com",
          studentEmail: "student@example.com",
          textVersion: "guardian-consent-v1",
        },
      }),
    ).rejects.toMatchObject({ code: "guardian_consent_not_required", statusCode: 409 });
  });

  it("grants pending consent with the correct OTP", async () => {
    const { service } = createService();
    const consent = await service.request({
      sessionId,
      userId,
      consent: {
        guardianEmail: "guardian@example.com",
        studentEmail: "student@example.com",
        textVersion: "guardian-consent-v1",
      },
    });

    const granted = await service.verify({
      sessionId,
      userId,
      verification: { consentId: consent.id, verificationCode: "123456" },
    });

    expect(granted.status).toBe("granted");
    expect(granted.verifiedAt).toBe("2026-07-29T10:00:00.000Z");
  });

  it("expires consent after three failed OTP attempts", async () => {
    const { service, consentRepository } = createService();
    const consent = await service.request({
      sessionId,
      userId,
      consent: {
        guardianEmail: "guardian@example.com",
        studentEmail: "student@example.com",
        textVersion: "guardian-consent-v1",
      },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        service.verify({
          sessionId,
          userId,
          verification: { consentId: consent.id, verificationCode: "000000" },
        }),
      ).rejects.toMatchObject({ code: "invalid_guardian_otp", statusCode: 400 });
    }

    expect(consentRepository.consents.get(consent.id)?.status).toBe("expired");
  });

  // request() no longer generates a decline token (decline isn't offered at this stage — see the
  // email test above), so these tests seed declineTokenStore directly rather than through
  // request(). That keeps decline()'s own token-matching/expiry/status logic covered in
  // isolation, independent of however a real token eventually gets issued once decline is built
  // out separately.
  it("declines a pending consent given the correct token, without any student session", async () => {
    const { service, declineTokenStore } = createService();
    const consent = await service.request({
      sessionId,
      userId,
      consent: {
        guardianEmail: "guardian@example.com",
        studentEmail: "student@example.com",
        textVersion: "guardian-consent-v1",
      },
    });
    declineTokenStore.save({
      consentId: consent.id,
      token: "decline-token-fixed",
      expiresAt: "2026-07-29T11:00:00.000Z",
    });

    const declined = await service.decline({ consentId: consent.id, token: "decline-token-fixed" });

    expect(declined.status).toBe("declined");
    expect(declined.declinedAt).toBe("2026-07-29T10:00:00.000Z");
  });

  it("rejects a decline with the wrong token", async () => {
    const { service, declineTokenStore } = createService();
    const consent = await service.request({
      sessionId,
      userId,
      consent: {
        guardianEmail: "guardian@example.com",
        studentEmail: "student@example.com",
        textVersion: "guardian-consent-v1",
      },
    });
    declineTokenStore.save({
      consentId: consent.id,
      token: "decline-token-fixed",
      expiresAt: "2026-07-29T11:00:00.000Z",
    });

    await expect(
      service.decline({ consentId: consent.id, token: "wrong-token" }),
    ).rejects.toMatchObject({
      code: "guardian_consent_decline_link_invalid",
      statusCode: 400,
    });
  });

  it("rejects declining a consent that isn't pending anymore", async () => {
    const { service, declineTokenStore } = createService();
    const consent = await service.request({
      sessionId,
      userId,
      consent: {
        guardianEmail: "guardian@example.com",
        studentEmail: "student@example.com",
        textVersion: "guardian-consent-v1",
      },
    });
    declineTokenStore.save({
      consentId: consent.id,
      token: "decline-token-fixed",
      expiresAt: "2026-07-29T11:00:00.000Z",
    });
    await service.verify({
      sessionId,
      userId,
      verification: { consentId: consent.id, verificationCode: "123456" },
    });

    await expect(
      service.decline({ consentId: consent.id, token: "decline-token-fixed" }),
    ).rejects.toMatchObject({
      code: "guardian_consent_not_pending",
      statusCode: 409,
    });
  });

  it("rejects declining an unknown consent id", async () => {
    const { service } = createService();

    await expect(
      service.decline({ consentId: "33333333-3333-4333-8333-333333333333", token: "any-token" }),
    ).rejects.toMatchObject({ code: "guardian_consent_not_found", statusCode: 404 });
  });

  describe("requestForPendingSession / verifyForPendingSession (minor signup, pre-identity)", () => {
    it("requests and grants a pending-session consent without ever needing a userId", async () => {
      const { service, otpStore } = createService();

      const { consent } = await service.requestForPendingSession({
        pendingSessionId,
        guardianEmail: "Guardian@Example.com",
        dateOfBirth: "2011-01-01", // 15 as of the fixed clock (2026-07-29)
        textVersion: "guardian-consent-v1",
      });
      expect(consent.status).toBe("pending");
      expect(consent.pendingSessionId).toBe(pendingSessionId);
      expect(consent.guardianEmailMasked).toBe("gu******@example.com");
      expect(otpStore.get(consent.id)?.code).toBe("123456");

      const granted = await service.verifyForPendingSession({
        pendingSessionId,
        consentId: consent.id,
        verificationCode: "123456",
      });
      expect(granted.status).toBe("granted");
    });

    it("rejects an unknown or expired pendingSessionId", async () => {
      const { service } = createService();

      await expect(
        service.requestForPendingSession({
          pendingSessionId: "55555555-5555-4555-8555-555555555555",
          guardianEmail: "guardian@example.com",
          dateOfBirth: "2011-01-01", // 15 as of the fixed clock (2026-07-29)
          textVersion: "guardian-consent-v1",
        }),
      ).rejects.toMatchObject({ code: "pending_signup_not_found", statusCode: 404 });
    });

    it("rejects when the self-reported age isn't a minor", async () => {
      const { service } = createService();

      await expect(
        service.requestForPendingSession({
          pendingSessionId,
          guardianEmail: "guardian@example.com",
          dateOfBirth: "2006-01-01", // 20 as of the fixed clock (2026-07-29)
          textVersion: "guardian-consent-v1",
        }),
      ).rejects.toMatchObject({ code: "guardian_consent_not_required", statusCode: 409 });
    });

    it("rejects verifying with the wrong OTP", async () => {
      const { service } = createService();
      const { consent } = await service.requestForPendingSession({
        pendingSessionId,
        guardianEmail: "guardian@example.com",
        dateOfBirth: "2011-01-01", // 15 as of the fixed clock (2026-07-29)
        textVersion: "guardian-consent-v1",
      });

      await expect(
        service.verifyForPendingSession({
          pendingSessionId,
          consentId: consent.id,
          verificationCode: "000000",
        }),
      ).rejects.toMatchObject({ code: "invalid_guardian_otp", statusCode: 400 });
    });

    it("does not let a different pendingSessionId verify someone else's consent", async () => {
      const { service, pendingSignupStore } = createService();
      pendingSignupStore.create({
        id: "66666666-6666-4666-8666-666666666666",
        createdAt: "2026-07-29T09:00:00.000Z",
        expiresAt: "2026-07-29T10:30:00.000Z",
      });
      const { consent } = await service.requestForPendingSession({
        pendingSessionId,
        guardianEmail: "guardian@example.com",
        dateOfBirth: "2011-01-01", // 15 as of the fixed clock (2026-07-29)
        textVersion: "guardian-consent-v1",
      });

      await expect(
        service.verifyForPendingSession({
          pendingSessionId: "66666666-6666-4666-8666-666666666666",
          consentId: consent.id,
          verificationCode: "123456",
        }),
      ).rejects.toMatchObject({ code: "guardian_consent_not_found", statusCode: 404 });
    });
  });

  describe("requestForPendingSession — guardian email must not belong to a registered user", () => {
    // The guardian ≠ student check moved to the later password step (the student's own email
    // isn't collected here anymore) — see identity-service.test.ts's signUpWithPassword suite
    // for that half of the rule. This describe block covers what's still checked here: rule 7,
    // a guardian email can never double as an existing user's account email.
    it("rejects a guardian email that already belongs to a registered user", async () => {
      const { service, identityUserDirectory } = createService();
      identityUserDirectory.registeredEmails.add("existinguser@example.com");

      await expect(
        service.requestForPendingSession({
          pendingSessionId,
          guardianEmail: "existinguser@example.com",
          dateOfBirth: "2011-01-01", // 15
          textVersion: "guardian-consent-v1",
        }),
      ).rejects.toMatchObject({ code: "guardian_email_already_registered", statusCode: 409 });
    });

    it("rejects a registered-user guardian email regardless of capitalization", async () => {
      const { service, identityUserDirectory } = createService();
      identityUserDirectory.registeredEmails.add("existinguser@example.com");

      await expect(
        service.requestForPendingSession({
          pendingSessionId,
          guardianEmail: "ExistingUser@Example.com",
          dateOfBirth: "2011-01-01", // 15
          textVersion: "guardian-consent-v1",
        }),
      ).rejects.toMatchObject({ code: "guardian_email_already_registered", statusCode: 409 });
    });

    it("allows the same non-user guardian email to be reused for a different child's consent", async () => {
      const { service: serviceForChildA } = createService();
      const childA = await serviceForChildA.requestForPendingSession({
        pendingSessionId,
        guardianEmail: "parent@example.com",
        dateOfBirth: "2011-01-01", // 15
        textVersion: "guardian-consent-v1",
      });
      expect(childA.consent.status).toBe("pending");

      // A fresh pendingSessionId/service per child, same as two separate registration attempts —
      // the point under test is that "parent@example.com" is never rejected for being reused.
      const { service: serviceForChildB, pendingSignupStore: storeB } = createService();
      storeB.create({
        id: "77777777-7777-4777-8777-777777777777",
        createdAt: "2026-07-29T09:00:00.000Z",
        expiresAt: "2026-07-29T10:30:00.000Z",
      });
      const childB = await serviceForChildB.requestForPendingSession({
        pendingSessionId: "77777777-7777-4777-8777-777777777777",
        guardianEmail: "parent@example.com",
        dateOfBirth: "2011-01-01", // 15
        textVersion: "guardian-consent-v1",
      });
      expect(childB.consent.status).toBe("pending");

      const { service: serviceForChildC, pendingSignupStore: storeC } = createService();
      storeC.create({
        id: "88888888-8888-4888-8888-888888888888",
        createdAt: "2026-07-29T09:00:00.000Z",
        expiresAt: "2026-07-29T10:30:00.000Z",
      });
      const childC = await serviceForChildC.requestForPendingSession({
        pendingSessionId: "88888888-8888-4888-8888-888888888888",
        guardianEmail: "parent@example.com",
        dateOfBirth: "2011-01-01", // 15
        textVersion: "guardian-consent-v1",
      });
      expect(childC.consent.status).toBe("pending");
    });

    it("rejects a guardian email that belongs to a sibling who already completed signup", async () => {
      // Simulates rule 8's "parent email matching another child's email" case: child2 already
      // finished signup (their email is now a registered user), so it can no longer be used as
      // *anyone's* guardian email — not because it was ever a guardian email, but because it's
      // now a real account.
      const { service, identityUserDirectory } = createService();
      identityUserDirectory.registeredEmails.add("child2@example.com");

      await expect(
        service.requestForPendingSession({
          pendingSessionId,
          guardianEmail: "child2@example.com",
          dateOfBirth: "2011-01-01", // 15
          textVersion: "guardian-consent-v1",
        }),
      ).rejects.toMatchObject({ code: "guardian_email_already_registered", statusCode: 409 });
    });
  });

  describe("resendForPendingSession (resend schedule, expiry, and limits)", () => {
    /**
     * A controllable clock — the fixed-clock createService() above can't simulate the passage of
     * real time between a request and its resend(s), which is exactly what these tests need to
     * exercise. pendingSignupStore's own expiry is set generously (10 hours) so it never
     * interferes with the (much shorter) resend/OTP windows under test.
     */
    function createServiceWithControllableClock() {
      const consentRepository = new InMemoryGuardianConsentRepository();
      const otpStore = new InMemoryGuardianOtpStore();
      const declineTokenStore = new InMemoryGuardianDeclineTokenStore();
      const emailProvider = new FakeEmailProvider();
      const pendingSignupStore = new InMemoryPendingSignupStore();
      const clockState = { now: new Date("2026-07-29T10:00:00.000Z") };
      pendingSignupStore.create({
        id: pendingSessionId,
        createdAt: "2026-07-29T09:00:00.000Z",
        expiresAt: "2026-07-29T20:00:00.000Z",
      });
      let otpCounter = 0;
      const service = new GuardianConsentService({
        guardianConsentRepository: consentRepository,
        journeySessionRepository: new InMemoryJourneySessionRepository(session),
        userProfileRepository: new InMemoryUserProfileRepository(minorProfile),
        pendingSignupStore,
        otpStore,
        declineTokenStore,
        emailProvider,
        clock: () => clockState.now,
        createOtp: () => `code-${++otpCounter}`,
      });
      const advanceMinutes = (minutes: number) => {
        clockState.now = new Date(clockState.now.getTime() + minutes * 60_000);
      };
      return { service, otpStore, clockState, advanceMinutes };
    }

    const requestConsent = (service: GuardianConsentService) =>
      service.requestForPendingSession({
        pendingSessionId,
        guardianEmail: "guardian@example.com",
        dateOfBirth: "2011-01-01", // 15
        textVersion: "guardian-consent-v1",
      });

    it("the initial request sets a 1-minute resend window and a 5-minute OTP expiry", async () => {
      const { service, clockState } = createServiceWithControllableClock();
      const { otpTiming } = await requestConsent(service);

      expect(otpTiming.resendCount).toBe(0);
      expect(otpTiming.resendsRemaining).toBe(3);
      expect(otpTiming.canResend).toBe(true);
      expect(otpTiming.nextResendAvailableAt).toBe(
        new Date(clockState.now.getTime() + 60_000).toISOString(),
      );
      expect(otpTiming.otpExpiresAt).toBe(
        new Date(clockState.now.getTime() + 5 * 60_000).toISOString(),
      );
    });

    it("rejects a resend attempted before the 1-minute window elapses", async () => {
      const { service, advanceMinutes } = createServiceWithControllableClock();
      const { consent } = await requestConsent(service);
      advanceMinutes(0.5);

      await expect(
        service.resendForPendingSession({ pendingSessionId, consentId: consent.id }),
      ).rejects.toMatchObject({ code: "guardian_otp_resend_not_yet_available", statusCode: 429 });
    });

    it("allows the first resend after 1 minute, invalidates the old code, and opens a 3-minute window for the second", async () => {
      const { service, otpStore, clockState, advanceMinutes } =
        createServiceWithControllableClock();
      const { consent } = await requestConsent(service);
      advanceMinutes(1);

      const timing = await service.resendForPendingSession({
        pendingSessionId,
        consentId: consent.id,
      });
      expect(timing.resendCount).toBe(1);
      expect(timing.resendsRemaining).toBe(2);
      expect(timing.canResend).toBe(true);
      expect(timing.nextResendAvailableAt).toBe(
        new Date(clockState.now.getTime() + 3 * 60_000).toISOString(),
      );
      expect(otpStore.get(consent.id)?.code).toBe("code-2");

      // The pre-resend code ("code-1") no longer works — only the latest OTP is valid.
      await expect(
        service.verifyForPendingSession({
          pendingSessionId,
          consentId: consent.id,
          verificationCode: "code-1",
        }),
      ).rejects.toMatchObject({ code: "invalid_guardian_otp", statusCode: 400 });

      // The new code does.
      const granted = await service.verifyForPendingSession({
        pendingSessionId,
        consentId: consent.id,
        verificationCode: "code-2",
      });
      expect(granted.status).toBe("granted");
    });

    it("second resend becomes available only after 3 minutes from the first resend", async () => {
      const { service, clockState, advanceMinutes } = createServiceWithControllableClock();
      const { consent } = await requestConsent(service);
      advanceMinutes(1);
      await service.resendForPendingSession({ pendingSessionId, consentId: consent.id });

      advanceMinutes(2.9); // just short of the 3-minute window
      await expect(
        service.resendForPendingSession({ pendingSessionId, consentId: consent.id }),
      ).rejects.toMatchObject({ code: "guardian_otp_resend_not_yet_available", statusCode: 429 });

      advanceMinutes(0.1); // now exactly at 3 minutes
      const timing = await service.resendForPendingSession({
        pendingSessionId,
        consentId: consent.id,
      });
      expect(timing.resendCount).toBe(2);
      expect(timing.resendsRemaining).toBe(1);
      expect(timing.nextResendAvailableAt).toBe(
        new Date(clockState.now.getTime() + 5 * 60_000).toISOString(),
      );
    });

    it("third resend becomes available only after 5 minutes from the second resend, then no more resends", async () => {
      const { service, advanceMinutes } = createServiceWithControllableClock();
      const { consent } = await requestConsent(service);
      advanceMinutes(1);
      await service.resendForPendingSession({ pendingSessionId, consentId: consent.id });
      advanceMinutes(3);
      await service.resendForPendingSession({ pendingSessionId, consentId: consent.id });

      advanceMinutes(4.9); // just short of the 5-minute window
      await expect(
        service.resendForPendingSession({ pendingSessionId, consentId: consent.id }),
      ).rejects.toMatchObject({ code: "guardian_otp_resend_not_yet_available", statusCode: 429 });

      advanceMinutes(0.1); // now exactly at 5 minutes
      const timing = await service.resendForPendingSession({
        pendingSessionId,
        consentId: consent.id,
      });
      expect(timing.resendCount).toBe(3);
      expect(timing.resendsRemaining).toBe(0);
      expect(timing.canResend).toBe(false);
      expect(timing.nextResendAvailableAt).toBeNull();

      // A 4th resend is impossible — the limit is enforced server-side regardless of timing.
      await expect(
        service.resendForPendingSession({ pendingSessionId, consentId: consent.id }),
      ).rejects.toMatchObject({ code: "guardian_otp_resend_limit_reached", statusCode: 409 });
    });

    it("rejects resending for a consent that has already been granted", async () => {
      const { service, otpStore } = createServiceWithControllableClock();
      const { consent } = await requestConsent(service);
      const code = otpStore.get(consent.id)?.code ?? "";
      await service.verifyForPendingSession({
        pendingSessionId,
        consentId: consent.id,
        verificationCode: code,
      });

      await expect(
        service.resendForPendingSession({ pendingSessionId, consentId: consent.id }),
      ).rejects.toMatchObject({ code: "guardian_consent_not_pending", statusCode: 409 });
    });

    it("fails verification with a distinct 'expired' error once the OTP has expired, rather than 'invalid'", async () => {
      const { service, advanceMinutes } = createServiceWithControllableClock();
      const { consent } = await requestConsent(service);
      advanceMinutes(5); // exactly at otpExpiresAt

      await expect(
        service.verifyForPendingSession({
          pendingSessionId,
          consentId: consent.id,
          verificationCode: "code-1",
        }),
      ).rejects.toMatchObject({ code: "guardian_otp_expired", statusCode: 400 });
    });
  });
});
