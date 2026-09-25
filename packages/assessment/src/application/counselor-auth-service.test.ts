import { describe, expect, it } from "vitest";
import { CounselorAuthService } from "./counselor-auth-service.js";
import type { CounselorDirectory } from "./counselor-directory.js";
import { InMemoryCounselorPasswordResetOtpStore } from "./counselor-password-reset-otp-store.js";
import { InMemoryCounselorResetTokenStore } from "./counselor-reset-token-store.js";
import type { SendEmailInput, SendEmailResult, EmailProvider } from "./email-provider.js";

class FakeEmailProvider implements EmailProvider {
  readonly sent: SendEmailInput[] = [];

  send(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);
    return Promise.resolve({ providerMessageId: "fake-message-id" });
  }
}

class FakeCounselorDirectory implements CounselorDirectory {
  readonly counselorsByEmail = new Map<string, string>(); // email -> userId
  readonly passwordsByUserId = new Map<string, string>();
  readonly mustResetByUserId = new Map<string, boolean>();
  readonly displayNamesByUserId = new Map<string, string>();
  readonly updateCalls: { userId: string; newPassword: string }[] = [];
  readonly clearMustResetCalls: string[] = [];

  verifyCounselorPassword(
    email: string,
    password: string,
  ): Promise<{ userId: string; mustResetPassword: boolean; displayName: string } | null> {
    const userId = this.counselorsByEmail.get(email);
    if (!userId || this.passwordsByUserId.get(userId) !== password) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      userId,
      mustResetPassword: this.mustResetByUserId.get(userId) ?? false,
      displayName: this.displayNamesByUserId.get(userId) ?? "Test Counselor",
    });
  }

  findActiveCounselorIdByEmail(email: string): Promise<string | null> {
    return Promise.resolve(this.counselorsByEmail.get(email) ?? null);
  }

  updatePassword(userId: string, newPassword: string): Promise<void> {
    this.updateCalls.push({ userId, newPassword });
    this.passwordsByUserId.set(userId, newPassword);
    return Promise.resolve();
  }

  clearMustResetPassword(userId: string): Promise<void> {
    this.clearMustResetCalls.push(userId);
    this.mustResetByUserId.set(userId, false);
    return Promise.resolve();
  }

  isActiveCounselor(userId: string): Promise<boolean> {
    return Promise.resolve([...this.counselorsByEmail.values()].includes(userId));
  }
}

const createService = (now = new Date("2026-09-22T10:00:00.000Z")) => {
  const emailProvider = new FakeEmailProvider();
  const counselorDirectory = new FakeCounselorDirectory();
  const otpStore = new InMemoryCounselorPasswordResetOtpStore();
  const resetTokenStore = new InMemoryCounselorResetTokenStore();
  return {
    emailProvider,
    counselorDirectory,
    otpStore,
    resetTokenStore,
    service: new CounselorAuthService({
      counselorDirectory,
      otpStore,
      resetTokenStore,
      emailProvider,
      clock: () => now,
      createOtp: () => "4321",
    }),
  };
};

describe("CounselorAuthService", () => {
  describe("signIn", () => {
    it("resolves the userId for a correct email/password pair belonging to an active counselor, with a permanent password", async () => {
      const { service, counselorDirectory } = createService();
      counselorDirectory.counselorsByEmail.set("counselor@example.com", "counselor-1");
      counselorDirectory.passwordsByUserId.set("counselor-1", "Str0ng!Pass");
      counselorDirectory.mustResetByUserId.set("counselor-1", false);
      counselorDirectory.displayNamesByUserId.set("counselor-1", "Priya Sharma");

      await expect(
        service.signIn({ email: "Counselor@Example.com", password: "Str0ng!Pass" }),
      ).resolves.toEqual({
        userId: "counselor-1",
        requiresPasswordReset: false,
        displayName: "Priya Sharma",
      });
    });

    it("does NOT complete sign-in for a temporary (script-set) password — returns a resetToken instead, same mechanism as the OTP flow", async () => {
      const { service, counselorDirectory } = createService();
      counselorDirectory.counselorsByEmail.set("counselor@example.com", "counselor-1");
      counselorDirectory.passwordsByUserId.set("counselor-1", "Temp0rary!Pass");
      counselorDirectory.mustResetByUserId.set("counselor-1", true);
      counselorDirectory.displayNamesByUserId.set("counselor-1", "Ravi Kumar");

      const result = await service.signIn({ email: "counselor@example.com", password: "Temp0rary!Pass" });

      expect(result.userId).toBe("counselor-1");
      expect(result.requiresPasswordReset).toBe(true);
      expect(result.resetToken).toBeTruthy();
      expect(result.displayName).toBe("Ravi Kumar");

      // The returned resetToken is real and immediately usable, same as one issued by the OTP
      // flow — this is the whole point of reusing issueResetToken() for both paths.
      await expect(
        service.setNewPassword({ resetToken: result.resetToken!, newPassword: "MyOwn!Pass1" }),
      ).resolves.toEqual({ success: true });
      expect(counselorDirectory.clearMustResetCalls).toEqual(["counselor-1"]);
    });

    it("rejects a wrong password with the generic invalid_credentials error", async () => {
      const { service, counselorDirectory } = createService();
      counselorDirectory.counselorsByEmail.set("counselor@example.com", "counselor-1");
      counselorDirectory.passwordsByUserId.set("counselor-1", "Str0ng!Pass");

      await expect(
        service.signIn({ email: "counselor@example.com", password: "Wr0ng!Pass" }),
      ).rejects.toMatchObject({ code: "invalid_credentials", statusCode: 401 });
    });

    it("rejects a correct student password with the same generic error — verifyCounselorPassword already folds 'not a counselor' into null", async () => {
      const { service, counselorDirectory } = createService();
      // Directory never populated for this email — simulates a real student account with no
      // active counselor role, or no account at all; both collapse to the same rejection here.
      void counselorDirectory;

      await expect(
        service.signIn({ email: "student@example.com", password: "Str0ng!Pass" }),
      ).rejects.toMatchObject({ code: "invalid_credentials", statusCode: 401 });
    });
  });

  describe("password reset (OTP)", () => {
    it("sends an OTP for a real counselor email and lets it be verified into a reset token", async () => {
      const { service, counselorDirectory, emailProvider } = createService();
      counselorDirectory.counselorsByEmail.set("counselor@example.com", "counselor-1");

      await expect(
        service.requestPasswordResetOtp({ email: "counselor@example.com" }),
      ).resolves.toEqual({ sent: true });
      expect(emailProvider.sent).toHaveLength(1);
      expect(emailProvider.sent[0]).toMatchObject({
        to: "counselor@example.com",
        context: "counselor_password_reset_otp",
        templateVars: { OTP: "4321" },
      });

      const { resetToken } = await service.verifyPasswordResetOtp({
        email: "counselor@example.com",
        code: "4321",
      });
      expect(resetToken).toBeTruthy();
    });

    it("silently no-ops (still returns sent:true) for an email that isn't an active counselor — never leaks which emails are counselors", async () => {
      const { service, emailProvider } = createService();

      await expect(
        service.requestPasswordResetOtp({ email: "nobody@example.com" }),
      ).resolves.toEqual({ sent: true });
      expect(emailProvider.sent).toHaveLength(0);
    });

    it("rejects verify with an incorrect code and expires the challenge after three attempts", async () => {
      const { service, counselorDirectory, otpStore } = createService();
      counselorDirectory.counselorsByEmail.set("counselor@example.com", "counselor-1");
      await service.requestPasswordResetOtp({ email: "counselor@example.com" });

      await expect(
        service.verifyPasswordResetOtp({ email: "counselor@example.com", code: "0000" }),
      ).rejects.toMatchObject({ code: "invalid_counselor_otp", statusCode: 400 });
      await expect(
        service.verifyPasswordResetOtp({ email: "counselor@example.com", code: "0000" }),
      ).rejects.toMatchObject({ code: "invalid_counselor_otp" });
      await expect(
        service.verifyPasswordResetOtp({ email: "counselor@example.com", code: "0000" }),
      ).rejects.toMatchObject({ code: "invalid_counselor_otp" });

      expect(otpStore.get("counselor@example.com")).toBeNull();
      await expect(
        service.verifyPasswordResetOtp({ email: "counselor@example.com", code: "4321" }),
      ).rejects.toMatchObject({ code: "invalid_counselor_otp" });
    });

    it("enforces the resend cooldown — a second request before it elapses is rejected", async () => {
      const now = new Date("2026-09-22T10:00:00.000Z");
      const { service, counselorDirectory } = createService(now);
      counselorDirectory.counselorsByEmail.set("counselor@example.com", "counselor-1");

      await service.requestPasswordResetOtp({ email: "counselor@example.com" });

      await expect(
        service.requestPasswordResetOtp({ email: "counselor@example.com" }),
      ).rejects.toMatchObject({ code: "counselor_otp_resend_not_yet_available", statusCode: 429 });
    });

    it("sets a new password via a verified reset token, and the token cannot be reused", async () => {
      const { service, counselorDirectory } = createService();
      counselorDirectory.counselorsByEmail.set("counselor@example.com", "counselor-1");
      await service.requestPasswordResetOtp({ email: "counselor@example.com" });
      const { resetToken } = await service.verifyPasswordResetOtp({
        email: "counselor@example.com",
        code: "4321",
      });

      await expect(
        service.setNewPassword({ resetToken, newPassword: "N3wStr0ng!Pass" }),
      ).resolves.toEqual({ success: true });
      expect(counselorDirectory.updateCalls).toEqual([
        { userId: "counselor-1", newPassword: "N3wStr0ng!Pass" },
      ]);
      // Unconditional/idempotent — this counselor was never flagged must_reset_password in the
      // first place (this test reaches setNewPassword via the OTP flow, not a forced reset), but
      // clearMustResetPassword is still called; it's a harmless no-op when already false.
      expect(counselorDirectory.clearMustResetCalls).toEqual(["counselor-1"]);

      await expect(
        service.setNewPassword({ resetToken, newPassword: "AnotherOne!1" }),
      ).rejects.toMatchObject({ code: "invalid_or_expired_reset_token", statusCode: 400 });
    });

    it("rejects setNewPassword with an unknown reset token", async () => {
      const { service } = createService();

      await expect(
        service.setNewPassword({ resetToken: "not-a-real-token", newPassword: "Str0ng!Pass" }),
      ).rejects.toMatchObject({ code: "invalid_or_expired_reset_token", statusCode: 400 });
    });
  });
});
