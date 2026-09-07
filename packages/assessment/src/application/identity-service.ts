import { randomUUID } from "node:crypto";
import type {
  CheckEmailAvailabilityResponse,
  RequestAnonymousSessionResponse,
  SignInWithPasswordResponse,
  SignUpWithPasswordResponse,
  VerifyIdentityOtpResponse,
} from "@yuvanext/contracts";
import { isMinorAge, protectedEmailHash } from "../domain/guardian-consent.js";
import {
  createIdentityOtp,
  createIdentityOtpExpiration,
  createPendingSignupExpiration,
  normalizeEmail,
} from "../domain/identity.js";
import { calculateAgeAtOnboarding } from "../domain/user-profile.js";
import type { EmailProvider } from "./email-provider.js";
import {
  guardianConsentRequiredForSignup,
  guardianEmailMatchesStudent,
  invalidCredentials,
  invalidIdentityOtp,
  pendingSignupNotFound,
  under12Ineligible,
} from "./errors.js";
import type { GuardianConsentRepository } from "./guardian-consent-repository.js";
import type { IdentityOtpStore } from "./identity-otp-store.js";
import type { IdentityUserDirectory } from "./identity-user-directory.js";
import type { PendingSignupStore } from "./pending-signup-store.js";

export type IdentityServiceOptions = {
  pendingSignupStore: PendingSignupStore;
  otpStore: IdentityOtpStore;
  emailProvider: EmailProvider;
  userDirectory: IdentityUserDirectory;
  /**
   * Only needed for signUpWithPassword (the minor path) — confirms a granted guardian consent
   * exists for the pendingSessionId before a password-based account can be created, and
   * reassigns that consent to the new userId once it is. Optional so the OTP-only adult path
   * (requestOtp/verifyOtp) doesn't need it wired up.
   */
  guardianConsentRepository?: Pick<
    GuardianConsentRepository,
    "findGrantedForPendingSession" | "attachToUser"
  >;
  clock?: () => Date;
  createOtp?: () => string;
};

export class IdentityService {
  private readonly pendingSignupStore: PendingSignupStore;
  private readonly otpStore: IdentityOtpStore;
  private readonly emailProvider: EmailProvider;
  private readonly userDirectory: IdentityUserDirectory;
  private readonly guardianConsentRepository:
    Pick<GuardianConsentRepository, "findGrantedForPendingSession" | "attachToUser"> | undefined;
  private readonly clock: () => Date;
  private readonly createOtp: () => string;

  constructor(options: IdentityServiceOptions) {
    this.pendingSignupStore = options.pendingSignupStore;
    this.otpStore = options.otpStore;
    this.emailProvider = options.emailProvider;
    this.userDirectory = options.userDirectory;
    this.guardianConsentRepository = options.guardianConsentRepository;
    this.clock = options.clock ?? (() => new Date());
    this.createOtp = options.createOtp ?? createIdentityOtp;
  }

  createAnonymousSession(): RequestAnonymousSessionResponse {
    const now = this.clock();
    const pendingSessionId = randomUUID();
    const expiresAt = createPendingSignupExpiration(now).toISOString();
    this.pendingSignupStore.create({
      id: pendingSessionId,
      createdAt: now.toISOString(),
      expiresAt,
    });
    return { pendingSessionId, expiresAt };
  }

  /**
   * Lets the frontend validate the student's own email right after Step 1 — before the
   * guardian-consent detour for a minor — instead of only discovering a duplicate at the very
   * end. Not the actual source of truth: createUserWithPassword re-checks (and, under a race,
   * Supabase Auth's own uniqueness enforcement is what really decides) at account-creation time
   * regardless of what this returned a moment earlier.
   */
  async checkEmailAvailability(input: { email: string }): Promise<CheckEmailAvailabilityResponse> {
    const email = normalizeEmail(input.email);
    const exists = await this.userDirectory.emailExists(email);
    return { available: !exists };
  }

  async requestOtp(input: { pendingSessionId: string; email: string }): Promise<void> {
    const now = this.clock();
    const pending = this.pendingSignupStore.get(input.pendingSessionId);
    if (!pending || new Date(pending.expiresAt).getTime() <= now.getTime()) {
      throw pendingSignupNotFound();
    }

    const email = normalizeEmail(input.email);
    const code = this.createOtp();
    this.otpStore.save({
      pendingSessionId: input.pendingSessionId,
      email,
      code,
      expiresAt: createIdentityOtpExpiration(now).toISOString(),
      attempts: 0,
    });
    await this.emailProvider.send({
      to: email,
      context: "identity_otp",
      templateVars: { OTP: code },
    });
  }

  async verifyOtp(input: {
    pendingSessionId: string;
    code: string;
  }): Promise<VerifyIdentityOtpResponse> {
    const now = this.clock();
    const challenge = this.otpStore.get(input.pendingSessionId);
    if (!challenge || new Date(challenge.expiresAt).getTime() <= now.getTime()) {
      this.otpStore.delete(input.pendingSessionId);
      throw invalidIdentityOtp();
    }

    if (challenge.code !== input.code) {
      const updated = this.otpStore.recordFailedAttempt(input.pendingSessionId);
      if (updated && updated.attempts >= 3) {
        this.otpStore.delete(input.pendingSessionId);
      }
      throw invalidIdentityOtp();
    }

    this.otpStore.delete(input.pendingSessionId);
    this.pendingSignupStore.delete(input.pendingSessionId);
    const userId = await this.userDirectory.findOrCreateUserIdByEmail(challenge.email);
    return { userId };
  }

  /**
   * Password-based sign-in (Module 1) — the returning-user counterpart to signUpWithPassword.
   * No pendingSessionId/guardian gating here: those only govern first-time account creation,
   * which a returning user has already been through. userDirectory.verifyPassword folds "no
   * such email" and "wrong password" into the same null result, so both surface as the same
   * generic invalidCredentials() here rather than letting a caller probe which emails exist.
   */
  async signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<SignInWithPasswordResponse> {
    const email = normalizeEmail(input.email);
    const userId = await this.userDirectory.verifyPassword(email, input.password);
    if (!userId) {
      throw invalidCredentials();
    }
    return { userId };
  }

  /**
   * Account setup (Module 1) — the single account-creation step for both adults and minors,
   * replacing the old email-OTP-based creation (requestOtp/verifyOtp above stay defined for a
   * possible future dashboard verification feature, but registration no longer calls them).
   *
   * Age is recomputed here from dateOfBirth independently of whatever branch the frontend took
   * earlier — the backend never trusts a client claim of "guardian already verified" or "I'm an
   * adult" on its own:
   *   - Under 18: requires an already-`granted` guardian consent for this pendingSessionId
   *     (GuardianConsentService's pending-session request/verify pair) — throws otherwise, even
   *     if the caller skips straight to this endpoint.
   *   - 18 or older: no guardian consent is required or checked at all.
   */
  async signUpWithPassword(input: {
    pendingSessionId: string;
    dateOfBirth: string;
    email: string;
    password: string;
  }): Promise<SignUpWithPasswordResponse> {
    const now = this.clock();
    const pending = this.pendingSignupStore.get(input.pendingSessionId);
    if (!pending || new Date(pending.expiresAt).getTime() <= now.getTime()) {
      throw pendingSignupNotFound();
    }

    const age = calculateAgeAtOnboarding(input.dateOfBirth, now);
    if (age < 12) {
      throw under12Ineligible();
    }

    const email = normalizeEmail(input.email);

    if (isMinorAge(age)) {
      if (!this.guardianConsentRepository) {
        throw new Error("signUpWithPassword requires guardianConsentRepository to be configured.");
      }
      const granted = await this.guardianConsentRepository.findGrantedForPendingSession(
        input.pendingSessionId,
      );
      if (!granted) {
        throw guardianConsentRequiredForSignup();
      }
      if (protectedEmailHash(email) === granted.guardianEmailHash) {
        throw guardianEmailMatchesStudent();
      }

      const userId = await this.userDirectory.createUserWithPassword(email, input.password);
      await this.guardianConsentRepository.attachToUser({
        consentId: granted.consentId,
        userId,
        now: now.toISOString(),
      });
      this.pendingSignupStore.delete(input.pendingSessionId);
      return { userId };
    }

    // Adult — no guardian consent to check or attach.
    const userId = await this.userDirectory.createUserWithPassword(email, input.password);
    this.pendingSignupStore.delete(input.pendingSessionId);
    return { userId };
  }
}
