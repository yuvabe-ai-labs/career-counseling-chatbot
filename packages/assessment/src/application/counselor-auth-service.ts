import type {
  CounselorSignInResponse,
  RequestCounselorPasswordResetOtpResponse,
  SetCounselorPasswordResponse,
  VerifyCounselorPasswordResetOtpResponse,
} from "@yuvapath/contracts";
import {
  counselorOtpResendAvailableAt,
  createCounselorOtpCode,
  createCounselorOtpExpiration,
  createCounselorResetToken,
  createCounselorResetTokenExpiration,
} from "../domain/counselor-auth.js";
import { normalizeEmail } from "../domain/identity.js";
import type { CounselorDirectory } from "./counselor-directory.js";
import type { CounselorPasswordResetOtpStore } from "./counselor-password-reset-otp-store.js";
import type { CounselorResetTokenStore } from "./counselor-reset-token-store.js";
import type { EmailProvider } from "./email-provider.js";
import {
  counselorOtpResendNotYetAvailable,
  invalidCounselorOtp,
  invalidCredentials,
  invalidOrExpiredResetToken,
} from "./errors.js";

export type CounselorAuthServiceOptions = {
  counselorDirectory: CounselorDirectory;
  otpStore: CounselorPasswordResetOtpStore;
  resetTokenStore: CounselorResetTokenStore;
  emailProvider: EmailProvider;
  clock?: () => Date;
  createOtp?: () => string;
};

/**
 * Counselor (staff) sign-in and OTP-based password reset — a parallel flow to IdentityService's
 * student-facing one, sharing the same underlying identity store (Supabase Auth) and response
 * shape but never the same service instance/routes, so a counselor's userId can never leak into
 * a student-scoped code path or vice versa. See
 * docs/architecture/counselor-auth-landing-page-plan.md.
 */
export class CounselorAuthService {
  private readonly counselorDirectory: CounselorDirectory;
  private readonly otpStore: CounselorPasswordResetOtpStore;
  private readonly resetTokenStore: CounselorResetTokenStore;
  private readonly emailProvider: EmailProvider;
  private readonly clock: () => Date;
  private readonly createOtp: () => string;

  constructor(options: CounselorAuthServiceOptions) {
    this.counselorDirectory = options.counselorDirectory;
    this.otpStore = options.otpStore;
    this.resetTokenStore = options.resetTokenStore;
    this.emailProvider = options.emailProvider;
    this.clock = options.clock ?? (() => new Date());
    this.createOtp = options.createOtp ?? createCounselorOtpCode;
  }

  async signIn(input: { email: string; password: string }): Promise<CounselorSignInResponse> {
    const email = normalizeEmail(input.email);
    const verified = await this.counselorDirectory.verifyCounselorPassword(email, input.password);
    if (!verified) {
      throw invalidCredentials();
    }

    // The password just verified is a temporary one set by scripts/create-counselor.ts, not
    // chosen by the counselor — sign-in does not complete. Reuses the exact same resetToken
    // mechanism verifyPasswordResetOtp issues, so the frontend can send them into the same
    // "Create New Password" screen either way — this is the only place that screen is reached
    // without having gone through the OTP flow first.
    if (verified.mustResetPassword) {
      const resetToken = this.issueResetToken(verified.userId, this.clock());
      return {
        userId: verified.userId,
        requiresPasswordReset: true,
        resetToken,
        displayName: verified.displayName,
      };
    }

    return { userId: verified.userId, requiresPasswordReset: false, displayName: verified.displayName };
  }

  /**
   * Also serves as "resend" — there is no separate resend endpoint (Figma shows one "Resend
   * OTP" action, not a functionally different one from the initial send). Silently no-ops for a
   * non-counselor email (never reveals which emails are counselors), but still enforces the
   * resend cooldown for an email that DOES have a pending challenge, so the cooldown itself
   * can't be probed to distinguish "counselor, already has a code" from "not a counselor".
   */
  async requestPasswordResetOtp(input: { email: string }): Promise<RequestCounselorPasswordResetOtpResponse> {
    const now = this.clock();
    const email = normalizeEmail(input.email);

    const existing = this.otpStore.get(email);
    if (existing && new Date(existing.resendAvailableAt).getTime() > now.getTime()) {
      throw counselorOtpResendNotYetAvailable();
    }

    const userId = await this.counselorDirectory.findActiveCounselorIdByEmail(email);
    if (!userId) {
      // Same response as a real send — see the method's own comment.
      return { sent: true };
    }

    const code = this.createOtp();
    this.otpStore.save({
      email,
      userId,
      code,
      expiresAt: createCounselorOtpExpiration(now).toISOString(),
      attempts: 0,
      resendAvailableAt: counselorOtpResendAvailableAt(now).toISOString(),
    });
    await this.emailProvider.send({
      to: email,
      context: "counselor_password_reset_otp",
      templateVars: { OTP: code },
    });
    return { sent: true };
  }

  // Not async — every step here is a synchronous store lookup, no directory/email call needed
  // (unlike requestPasswordResetOtp/setNewPassword). Errors use Promise.reject(...) rather than
  // throw specifically so this stays a real rejected Promise either way (a bare `throw` in a
  // non-async function throws synchronously at the call site instead, which breaks both
  // `await`-ing callers expecting a rejection and `expect(...).rejects` in tests).
  verifyPasswordResetOtp(input: {
    email: string;
    code: string;
  }): Promise<VerifyCounselorPasswordResetOtpResponse> {
    const now = this.clock();
    const email = normalizeEmail(input.email);
    const challenge = this.otpStore.get(email);
    if (!challenge || new Date(challenge.expiresAt).getTime() <= now.getTime()) {
      this.otpStore.delete(email);
      return Promise.reject(invalidCounselorOtp());
    }

    if (challenge.code !== input.code) {
      const updated = this.otpStore.recordFailedAttempt(email);
      if (updated && updated.attempts >= 3) {
        this.otpStore.delete(email);
      }
      return Promise.reject(invalidCounselorOtp());
    }

    this.otpStore.delete(email);
    const resetToken = this.issueResetToken(challenge.userId, now);
    return Promise.resolve({ resetToken });
  }

  async setNewPassword(input: { resetToken: string; newPassword: string }): Promise<SetCounselorPasswordResponse> {
    const now = this.clock();
    const record = this.resetTokenStore.get(input.resetToken);
    if (!record || new Date(record.expiresAt).getTime() <= now.getTime()) {
      this.resetTokenStore.delete(input.resetToken);
      throw invalidOrExpiredResetToken();
    }

    await this.counselorDirectory.updatePassword(record.userId, input.newPassword);
    // Unconditional and idempotent — whichever flow got them here (OTP-verified forgot-password,
    // or a forced first-login reset), the password they just chose is now their real one.
    await this.counselorDirectory.clearMustResetPassword(record.userId);
    this.resetTokenStore.delete(input.resetToken);
    return { success: true };
  }

  private issueResetToken(userId: string, now: Date): string {
    const resetToken = createCounselorResetToken();
    this.resetTokenStore.save({
      resetToken,
      userId,
      expiresAt: createCounselorResetTokenExpiration(now).toISOString(),
    });
    return resetToken;
  }
}
