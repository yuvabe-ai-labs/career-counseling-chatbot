import { describe, expect, it } from "vitest";
import type { SendEmailInput, SendEmailResult, EmailProvider } from "./email-provider.js";
import { IdentityService } from "./identity-service.js";
import { InMemoryIdentityOtpStore } from "./identity-otp-store.js";
import type { IdentityUserDirectory } from "./identity-user-directory.js";
import { InMemoryPendingSignupStore } from "./pending-signup-store.js";

class FakeEmailProvider implements EmailProvider {
  readonly sent: SendEmailInput[] = [];

  send(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);
    return Promise.resolve({ providerMessageId: "fake-message-id" });
  }
}

class FakeIdentityUserDirectory implements IdentityUserDirectory {
  readonly byEmail = new Map<string, string>();
  readonly passwordsByEmail = new Map<string, string>();
  calls: string[] = [];
  passwordCalls: { email: string; password: string }[] = [];
  verifyCalls: { email: string; password: string }[] = [];

  findOrCreateUserIdByEmail(email: string): Promise<string> {
    this.calls.push(email);
    const existing = this.byEmail.get(email);
    if (existing) {
      return Promise.resolve(existing);
    }
    const created = `created-${this.byEmail.size}`;
    this.byEmail.set(email, created);
    return Promise.resolve(created);
  }

  createUserWithPassword(email: string, password: string): Promise<string> {
    this.passwordCalls.push({ email, password });
    const created = `password-user-${this.passwordCalls.length}`;
    this.byEmail.set(email, created);
    this.passwordsByEmail.set(email, password);
    return Promise.resolve(created);
  }

  emailExists(email: string): Promise<boolean> {
    return Promise.resolve(this.byEmail.has(email));
  }

  verifyPassword(email: string, password: string): Promise<string | null> {
    this.verifyCalls.push({ email, password });
    const userId = this.byEmail.get(email);
    if (!userId || this.passwordsByEmail.get(email) !== password) {
      return Promise.resolve(null);
    }
    return Promise.resolve(userId);
  }
}

/** Narrow fake for IdentityService's optional guardianConsentRepository dependency. */
class FakeGuardianConsentGate {
  grantedByPendingSession = new Map<string, { consentId: string; guardianEmailHash: string }>();
  attachCalls: { consentId: string; userId: string }[] = [];

  findGrantedForPendingSession(
    pendingSessionId: string,
  ): Promise<{ consentId: string; guardianEmailHash: string } | null> {
    return Promise.resolve(this.grantedByPendingSession.get(pendingSessionId) ?? null);
  }

  attachToUser(input: { consentId: string; userId: string; now: string }): Promise<never> {
    this.attachCalls.push({ consentId: input.consentId, userId: input.userId });
    return Promise.resolve(undefined as never);
  }
}

const createService = (now = new Date("2026-07-29T10:00:00.000Z")) => {
  const emailProvider = new FakeEmailProvider();
  const userDirectory = new FakeIdentityUserDirectory();
  const otpStore = new InMemoryIdentityOtpStore();
  const pendingSignupStore = new InMemoryPendingSignupStore();
  const guardianConsentRepository = new FakeGuardianConsentGate();
  return {
    emailProvider,
    userDirectory,
    otpStore,
    pendingSignupStore,
    guardianConsentRepository,
    service: new IdentityService({
      pendingSignupStore,
      otpStore,
      emailProvider,
      userDirectory,
      guardianConsentRepository,
      clock: () => now,
      createOtp: () => "654321",
    }),
  };
};

describe("IdentityService", () => {
  it("creates a pending signup and lets a code be requested for it", async () => {
    const { service, emailProvider, otpStore } = createService();

    const { pendingSessionId, expiresAt } = service.createAnonymousSession();
    expect(expiresAt).toBe("2026-07-29T10:30:00.000Z");

    await service.requestOtp({ pendingSessionId, email: " Student@Example.com " });

    expect(otpStore.get(pendingSessionId)?.code).toBe("654321");
    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0]).toMatchObject({
      to: "student@example.com",
      context: "identity_otp",
      templateVars: { OTP: "654321" },
    });
  });

  it("rejects an OTP request for an unknown/expired pending session", async () => {
    const { service } = createService();

    await expect(
      service.requestOtp({
        pendingSessionId: "11111111-1111-4111-8111-111111111111",
        email: "student@example.com",
      }),
    ).rejects.toMatchObject({ code: "pending_signup_not_found", statusCode: 404 });
  });

  it("verifies the correct code and resolves a userId via the directory", async () => {
    const { service, userDirectory } = createService();

    const { pendingSessionId } = service.createAnonymousSession();
    await service.requestOtp({ pendingSessionId, email: "student@example.com" });

    const result = await service.verifyOtp({ pendingSessionId, code: "654321" });

    expect(result.userId).toBe("created-0");
    expect(userDirectory.calls).toEqual(["student@example.com"]);
  });

  it("resolves the same userId for a second verification of the same email", async () => {
    const { service } = createService();

    const first = service.createAnonymousSession();
    await service.requestOtp({
      pendingSessionId: first.pendingSessionId,
      email: "student@example.com",
    });
    const firstResult = await service.verifyOtp({
      pendingSessionId: first.pendingSessionId,
      code: "654321",
    });

    const second = service.createAnonymousSession();
    await service.requestOtp({
      pendingSessionId: second.pendingSessionId,
      email: "student@example.com",
    });
    const secondResult = await service.verifyOtp({
      pendingSessionId: second.pendingSessionId,
      code: "654321",
    });

    expect(secondResult.userId).toBe(firstResult.userId);
  });

  it("rejects an incorrect code and expires the challenge after three attempts", async () => {
    const { service, otpStore } = createService();
    const { pendingSessionId } = service.createAnonymousSession();
    await service.requestOtp({ pendingSessionId, email: "student@example.com" });

    await expect(service.verifyOtp({ pendingSessionId, code: "000000" })).rejects.toMatchObject({
      code: "invalid_identity_otp",
      statusCode: 400,
    });
    await expect(service.verifyOtp({ pendingSessionId, code: "000000" })).rejects.toMatchObject({
      code: "invalid_identity_otp",
    });
    await expect(service.verifyOtp({ pendingSessionId, code: "000000" })).rejects.toMatchObject({
      code: "invalid_identity_otp",
    });

    expect(otpStore.get(pendingSessionId)).toBeNull();
    await expect(service.verifyOtp({ pendingSessionId, code: "654321" })).rejects.toMatchObject({
      code: "invalid_identity_otp",
    });
  });

  describe("checkEmailAvailability", () => {
    it("reports available: true for an email nobody has registered", async () => {
      const { service } = createService();

      await expect(
        service.checkEmailAvailability({ email: "nobody@example.com" }),
      ).resolves.toEqual({ available: true });
    });

    it("reports available: false for an already-registered email", async () => {
      const { service, userDirectory } = createService();
      userDirectory.byEmail.set("taken@example.com", "existing-user-id");

      await expect(
        service.checkEmailAvailability({ email: "taken@example.com" }),
      ).resolves.toEqual({ available: false });
    });

    it("compares case-insensitively, same as account creation itself", async () => {
      const { service, userDirectory } = createService();
      userDirectory.byEmail.set("taken@example.com", "existing-user-id");

      await expect(
        service.checkEmailAvailability({ email: "TAKEN@EXAMPLE.COM" }),
      ).resolves.toEqual({ available: false });
    });
  });

  describe("signUpWithPassword", () => {
    // createService()'s fixed clock is 2026-07-29 — DOBs below are chosen relative to that.
    const MINOR_DOB = "2011-01-01"; // 15
    const ADULT_DOB = "2000-01-01"; // 26
    const EXACT_18_DOB = "2008-07-29"; // birthday is today under the fixed clock — exactly 18

    it("minor: creates the account once a granted guardian consent exists for the pendingSessionId", async () => {
      const { service, userDirectory, guardianConsentRepository } = createService();
      const { pendingSessionId } = service.createAnonymousSession();
      guardianConsentRepository.grantedByPendingSession.set(pendingSessionId, {
        consentId: "consent-1",
        guardianEmailHash: "hash-of-guardian-email",
      });

      const result = await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: MINOR_DOB,
        email: "Student@Example.com",
        password: "Str0ng!Pass",
      });

      expect(result.userId).toBe("password-user-1");
      expect(userDirectory.passwordCalls).toEqual([
        { email: "student@example.com", password: "Str0ng!Pass" },
      ]);
      expect(guardianConsentRepository.attachCalls).toEqual([
        { consentId: "consent-1", userId: "password-user-1" },
      ]);
    });

    it("minor: rejects when no guardian consent has been granted for this pendingSessionId — cannot be bypassed by calling this endpoint directly", async () => {
      const { service } = createService();
      const { pendingSessionId } = service.createAnonymousSession();

      await expect(
        service.signUpWithPassword({
          pendingSessionId,
          dateOfBirth: MINOR_DOB,
          email: "student@example.com",
          password: "Str0ng!Pass",
        }),
      ).rejects.toMatchObject({ code: "guardian_consent_required_for_signup", statusCode: 409 });
    });

    it("minor: rejects when the account email matches the guardian's own email", async () => {
      const { service, guardianConsentRepository } = createService();
      const { pendingSessionId } = service.createAnonymousSession();
      // protectedEmailHash("guardian@example.com") — same hash the service computes internally.
      const { protectedEmailHash } = await import("../domain/guardian-consent.js");
      guardianConsentRepository.grantedByPendingSession.set(pendingSessionId, {
        consentId: "consent-1",
        guardianEmailHash: protectedEmailHash("guardian@example.com"),
      });

      await expect(
        service.signUpWithPassword({
          pendingSessionId,
          dateOfBirth: MINOR_DOB,
          email: "Guardian@Example.com",
          password: "Str0ng!Pass",
        }),
      ).rejects.toMatchObject({ code: "guardian_email_matches_student", statusCode: 400 });
    });

    it("adult: creates the account directly — no guardian consent is checked or attached", async () => {
      const { service, guardianConsentRepository } = createService();
      const { pendingSessionId } = service.createAnonymousSession();

      const result = await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: ADULT_DOB,
        email: "adult@example.com",
        password: "Str0ng!Pass",
      });

      expect(result.userId).toBe("password-user-1");
      expect(guardianConsentRepository.attachCalls).toEqual([]);
    });

    it("adult: exactly 18 today is treated as an adult, not a minor (boundary case)", async () => {
      const { service, guardianConsentRepository } = createService();
      const { pendingSessionId } = service.createAnonymousSession();

      const result = await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: EXACT_18_DOB,
        email: "adult-today@example.com",
        password: "Str0ng!Pass",
      });

      expect(result.userId).toBe("password-user-1");
      expect(guardianConsentRepository.attachCalls).toEqual([]);
    });

    it("adult: succeeds even when no guardianConsentRepository is configured at all", async () => {
      const emailProvider = new FakeEmailProvider();
      const userDirectory = new FakeIdentityUserDirectory();
      const otpStore = new InMemoryIdentityOtpStore();
      const pendingSignupStore = new InMemoryPendingSignupStore();
      const service = new IdentityService({
        pendingSignupStore,
        otpStore,
        emailProvider,
        userDirectory,
        // guardianConsentRepository intentionally omitted.
        clock: () => new Date("2026-07-29T10:00:00.000Z"),
      });
      const { pendingSessionId } = service.createAnonymousSession();

      const result = await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: ADULT_DOB,
        email: "adult@example.com",
        password: "Str0ng!Pass",
      });

      expect(result.userId).toBe("password-user-1");
    });

    it("rejects under-12 outright, before any guardian-consent check", async () => {
      const { service } = createService();
      const { pendingSessionId } = service.createAnonymousSession();

      await expect(
        service.signUpWithPassword({
          pendingSessionId,
          dateOfBirth: "2018-01-01", // 8
          email: "child@example.com",
          password: "Str0ng!Pass",
        }),
      ).rejects.toMatchObject({ code: "under_12_ineligible", statusCode: 422 });
    });

    it("rejects an unknown/expired pendingSessionId", async () => {
      const { service } = createService();

      await expect(
        service.signUpWithPassword({
          pendingSessionId: "11111111-1111-4111-8111-111111111111",
          dateOfBirth: ADULT_DOB,
          email: "student@example.com",
          password: "Str0ng!Pass",
        }),
      ).rejects.toMatchObject({ code: "pending_signup_not_found", statusCode: 404 });
    });

    it("rejects signing up twice with the same pendingSessionId (no replay)", async () => {
      const { service, guardianConsentRepository } = createService();
      const { pendingSessionId } = service.createAnonymousSession();
      guardianConsentRepository.grantedByPendingSession.set(pendingSessionId, {
        consentId: "consent-1",
        guardianEmailHash: "hash-of-guardian-email",
      });

      await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: MINOR_DOB,
        email: "student@example.com",
        password: "Str0ng!Pass",
      });

      await expect(
        service.signUpWithPassword({
          pendingSessionId,
          dateOfBirth: ADULT_DOB,
          email: "someone-else@example.com",
          password: "Str0ng!Pass",
        }),
      ).rejects.toMatchObject({ code: "pending_signup_not_found", statusCode: 404 });
    });
  });

  describe("signInWithPassword", () => {
    const ADULT_DOB = "2000-01-01"; // 26 under the fixed clock

    it("resolves the userId for a correct email/password pair", async () => {
      const { service, userDirectory } = createService();
      const { pendingSessionId } = service.createAnonymousSession();
      const { userId: signedUpId } = await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: ADULT_DOB,
        email: "adult@example.com",
        password: "Str0ng!Pass",
      });

      const result = await service.signInWithPassword({
        email: "adult@example.com",
        password: "Str0ng!Pass",
      });

      expect(result.userId).toBe(signedUpId);
      expect(userDirectory.verifyCalls).toEqual([
        { email: "adult@example.com", password: "Str0ng!Pass" },
      ]);
    });

    it("is case-insensitive on email, same as every other identity lookup", async () => {
      const { service } = createService();
      const { pendingSessionId } = service.createAnonymousSession();
      await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: ADULT_DOB,
        email: "Adult@Example.com",
        password: "Str0ng!Pass",
      });

      const result = await service.signInWithPassword({
        email: "adult@example.com",
        password: "Str0ng!Pass",
      });

      expect(result.userId).toBe("password-user-1");
    });

    it("rejects a wrong password with the generic invalid_credentials error", async () => {
      const { service } = createService();
      const { pendingSessionId } = service.createAnonymousSession();
      await service.signUpWithPassword({
        pendingSessionId,
        dateOfBirth: ADULT_DOB,
        email: "adult@example.com",
        password: "Str0ng!Pass",
      });

      await expect(
        service.signInWithPassword({ email: "adult@example.com", password: "Wr0ng!Pass" }),
      ).rejects.toMatchObject({ code: "invalid_credentials", statusCode: 401 });
    });

    /**
     * Same error as a wrong password, deliberately — response shape must not let a caller
     * distinguish "no such account" from "wrong password" (user enumeration).
     */
    it("rejects an unknown email with the same generic invalid_credentials error", async () => {
      const { service } = createService();

      await expect(
        service.signInWithPassword({ email: "nobody@example.com", password: "Str0ng!Pass" }),
      ).rejects.toMatchObject({ code: "invalid_credentials", statusCode: 401 });
    });
  });
});
