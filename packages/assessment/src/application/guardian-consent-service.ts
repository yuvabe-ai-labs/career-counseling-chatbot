import { randomUUID } from "node:crypto";
import type {
  GuardianConsent,
  GuardianConsentStatusResponse,
  GuardianOtpTiming,
  PendingGuardianConsent,
  RequestGuardianConsentRequest,
  RequestPendingGuardianConsentRequest,
  ResendPendingGuardianConsentRequest,
  VerifyGuardianConsentRequest,
  VerifyPendingGuardianConsentRequest,
} from "@yuvanext/contracts";
import {
  createGuardianOtp,
  createGuardianOtpExpiration,
  GUARDIAN_OTP_MAX_RESENDS,
  guardianOtpResendAvailableAt,
  isMinorAge,
  maskEmail,
  normalizeEmail,
  protectedEmailHash,
  providerReferenceHash,
} from "../domain/guardian-consent.js";
import { canResumeJourneySession, isJourneySessionExpired } from "../domain/journey-session.js";
import { calculateAgeAtOnboarding } from "../domain/user-profile.js";
import {
  guardianConsentDeclineLinkInvalid,
  guardianConsentNotFound,
  guardianConsentNotPending,
  guardianConsentNotRequired,
  guardianEmailAlreadyRegistered,
  guardianEmailMatchesStudent,
  guardianOtpExpired,
  guardianOtpResendLimitReached,
  guardianOtpResendNotYetAvailable,
  invalidGuardianOtp,
  journeySessionExpired,
  journeySessionNotFound,
  journeySessionNotResumable,
  pendingSignupNotFound,
  under12Ineligible,
  userProfileNotFound,
} from "./errors.js";
import type { EmailProvider } from "./email-provider.js";
import type { GuardianConsentRepository } from "./guardian-consent-repository.js";
import type { GuardianDeclineTokenStore } from "./guardian-decline-token-store.js";
import type { GuardianOtpStore } from "./guardian-otp-store.js";
import type { IdentityUserDirectory } from "./identity-user-directory.js";
import type { JourneySessionRepository } from "./journey-session-repository.js";
import type { PendingSignupStore } from "./pending-signup-store.js";
import type { UserProfileRepository } from "./user-profile-repository.js";

export type GuardianConsentServiceOptions = {
  guardianConsentRepository: GuardianConsentRepository;
  journeySessionRepository: JourneySessionRepository;
  userProfileRepository: UserProfileRepository;
  /** Only needed for the pre-identity path (requestForPendingSession/verifyForPendingSession) —
   * validates the pendingSessionId is real and unexpired, same store identity-otp uses. */
  pendingSignupStore: PendingSignupStore;
  otpStore: GuardianOtpStore;
  declineTokenStore: GuardianDeclineTokenStore;
  emailProvider: EmailProvider;
  /** Only needed for requestForPendingSession, to reject a guardian email that already belongs
   * to a registered user (see requestForPendingSession's own doc comment). Optional so tests /
   * the post-identity request()/verify() pair (which don't need this) aren't forced to wire it. */
  identityUserDirectory?: Pick<IdentityUserDirectory, "emailExists">;
  clock?: () => Date;
  createOtp?: () => string;
};

export class GuardianConsentService {
  private readonly guardianConsentRepository: GuardianConsentRepository;
  private readonly journeySessionRepository: JourneySessionRepository;
  private readonly userProfileRepository: UserProfileRepository;
  private readonly pendingSignupStore: PendingSignupStore;
  private readonly otpStore: GuardianOtpStore;
  private readonly declineTokenStore: GuardianDeclineTokenStore;
  private readonly emailProvider: EmailProvider;
  private readonly identityUserDirectory: Pick<IdentityUserDirectory, "emailExists"> | undefined;
  private readonly clock: () => Date;
  private readonly createOtp: () => string;

  constructor(options: GuardianConsentServiceOptions) {
    this.guardianConsentRepository = options.guardianConsentRepository;
    this.journeySessionRepository = options.journeySessionRepository;
    this.userProfileRepository = options.userProfileRepository;
    this.pendingSignupStore = options.pendingSignupStore;
    this.otpStore = options.otpStore;
    this.declineTokenStore = options.declineTokenStore;
    this.emailProvider = options.emailProvider;
    this.identityUserDirectory = options.identityUserDirectory;
    this.clock = options.clock ?? (() => new Date());
    this.createOtp = options.createOtp ?? createGuardianOtp;
  }

  async request(input: {
    sessionId: string;
    userId: string;
    consent: RequestGuardianConsentRequest;
  }): Promise<GuardianConsent> {
    const { profile, now } = await this.loadActiveSessionProfile(input);
    if (!isMinorAge(profile.ageAtOnboarding)) {
      throw guardianConsentNotRequired();
    }

    const normalizedGuardianEmail = normalizeEmail(input.consent.guardianEmail);
    const normalizedStudentEmail = normalizeEmail(input.consent.studentEmail);
    if (normalizedGuardianEmail === normalizedStudentEmail) {
      throw guardianEmailMatchesStudent();
    }

    const consentId = randomUUID();
    const consent = await this.guardianConsentRepository.createPending({
      id: consentId,
      userId: input.userId,
      guardianEmailHash: protectedEmailHash(normalizedGuardianEmail),
      guardianEmailMasked: maskEmail(normalizedGuardianEmail),
      status: "pending",
      textVersion: input.consent.textVersion,
      providerReferenceHash: providerReferenceHash(consentId),
      now: now.toISOString(),
    });

    const code = this.createOtp();
    this.otpStore.save({
      consentId: consent.id,
      code,
      guardianEmail: normalizedGuardianEmail,
      issuedAt: now.toISOString(),
      expiresAt: createGuardianOtpExpiration(now).toISOString(),
      attempts: 0,
      resendCount: 0,
      nextResendAvailableAt: guardianOtpResendAvailableAt(0, now)?.toISOString() ?? null,
    });

    // No decline token is generated here — decline isn't offered at this stage (it's planned as
    // a separate, later piece of work with its own mechanism), so the OTP email carries only the
    // OTP. decline() below still exists and still checks declineTokenStore, but nothing in this
    // flow ever populates it anymore, so it stays unreachable until that later work wires a real
    // generation path back up.
    await this.emailProvider.send({
      to: normalizedGuardianEmail,
      context: "guardian_otp",
      templateVars: { OTP: code },
    });

    return consent;
  }

  async verify(input: {
    sessionId: string;
    userId: string;
    verification: VerifyGuardianConsentRequest;
  }): Promise<GuardianConsent> {
    const { now } = await this.loadActiveSessionProfile(input);
    const consent = await this.guardianConsentRepository.findByIdForUser({
      consentId: input.verification.consentId,
      userId: input.userId,
    });
    if (!consent) {
      throw guardianConsentNotFound();
    }
    if (consent.status !== "pending") {
      throw guardianConsentNotPending();
    }

    const challenge = this.otpStore.get(input.verification.consentId);
    if (!challenge || new Date(challenge.expiresAt).getTime() <= now.getTime()) {
      await this.guardianConsentRepository.expire({
        consentId: input.verification.consentId,
        userId: input.userId,
        now: now.toISOString(),
      });
      this.otpStore.delete(input.verification.consentId);
      this.declineTokenStore.delete(input.verification.consentId);
      throw challenge ? guardianOtpExpired() : invalidGuardianOtp();
    }

    if (challenge.code !== input.verification.verificationCode) {
      const updated = this.otpStore.recordFailedAttempt(input.verification.consentId);
      if (updated && updated.attempts >= 3) {
        await this.guardianConsentRepository.expire({
          consentId: input.verification.consentId,
          userId: input.userId,
          now: now.toISOString(),
        });
        this.otpStore.delete(input.verification.consentId);
        this.declineTokenStore.delete(input.verification.consentId);
      }
      throw invalidGuardianOtp();
    }

    this.otpStore.delete(input.verification.consentId);
    this.declineTokenStore.delete(input.verification.consentId);
    return this.guardianConsentRepository.grant({
      consentId: input.verification.consentId,
      userId: input.userId,
      now: now.toISOString(),
    });
  }

  /**
   * Pre-identity path (minor signup): mirrors request() above, but scoped by pendingSessionId
   * instead of a journey session — there's no userId or profile row yet, so age is computed
   * from the request's own dateOfBirth (calculateAgeAtOnboarding) rather than read back from a
   * saved profile. Rejects outright under 12 (same floor as the rest of the app), rather than
   * letting an under-12 sit in the guardian-consent flow with no way to ever finish signup.
   *
   * Also enforces that the guardian email doesn't already belong to a registered user — a
   * parent/guardian email is never required to be unique on its own (the same guardian email can
   * front any number of *different* children's consents), but it can't double as anyone's actual
   * account email, since that would let a "parent" email quietly bypass the real uniqueness rule
   * that governs student accounts. There's no guardian-vs-student check *here*: the student's own
   * email isn't collected until the later password step (Figma node 264:1097), so that
   * comparison happens there instead — see IdentityService.signUpWithPassword.
   */
  async requestForPendingSession(input: RequestPendingGuardianConsentRequest): Promise<{
    consent: PendingGuardianConsent;
    otpTiming: GuardianOtpTiming;
  }> {
    const now = this.clock();
    const pending = this.pendingSignupStore.get(input.pendingSessionId);
    if (!pending || new Date(pending.expiresAt).getTime() <= now.getTime()) {
      throw pendingSignupNotFound();
    }

    // The backend independently computes age from dateOfBirth — never trusts a client-supplied
    // age number, same reasoning as UserProfileService.upsertForSession's own dateOfBirth path.
    const age = calculateAgeAtOnboarding(input.dateOfBirth, now);
    if (age < 12) {
      throw under12Ineligible();
    }
    if (!isMinorAge(age)) {
      throw guardianConsentNotRequired();
    }

    const normalizedGuardianEmail = normalizeEmail(input.guardianEmail);
    if (this.identityUserDirectory && (await this.identityUserDirectory.emailExists(normalizedGuardianEmail))) {
      throw guardianEmailAlreadyRegistered();
    }

    const consentId = randomUUID();
    const consent = await this.guardianConsentRepository.createPendingForSession({
      id: consentId,
      pendingSessionId: input.pendingSessionId,
      guardianEmailHash: protectedEmailHash(normalizedGuardianEmail),
      guardianEmailMasked: maskEmail(normalizedGuardianEmail),
      status: "pending",
      textVersion: input.textVersion,
      providerReferenceHash: providerReferenceHash(consentId),
      now: now.toISOString(),
    });

    const code = this.createOtp();
    const otpExpiresAt = createGuardianOtpExpiration(now);
    const nextResendAvailableAt = guardianOtpResendAvailableAt(0, now);
    this.otpStore.save({
      consentId: consent.id,
      code,
      guardianEmail: normalizedGuardianEmail,
      issuedAt: now.toISOString(),
      expiresAt: otpExpiresAt.toISOString(),
      attempts: 0,
      resendCount: 0,
      nextResendAvailableAt: nextResendAvailableAt?.toISOString() ?? null,
    });

    // See request() above — no decline token generated here either, for the same reason.
    await this.emailProvider.send({
      to: normalizedGuardianEmail,
      context: "guardian_otp",
      templateVars: { OTP: code },
    });

    return {
      consent,
      otpTiming: {
        otpExpiresAt: otpExpiresAt.toISOString(),
        resendCount: 0,
        resendsRemaining: GUARDIAN_OTP_MAX_RESENDS,
        nextResendAvailableAt: nextResendAvailableAt?.toISOString() ?? null,
        canResend: nextResendAvailableAt !== null,
      },
    };
  }

  /**
   * Pre-identity path (minor signup) — resends the guardian OTP to the same email the original
   * request used (kept in the ephemeral OTP challenge, never in the persisted consent row — see
   * GuardianOtpChallenge, guardian-otp-store.ts). Server-authoritative: resendCount and
   * nextResendAvailableAt live in that same challenge, so a client can't shorten the wait or
   * exceed 3 resends by replaying/racing requests — see domain/guardian-consent.ts's
   * guardianOtpResendAvailableAt for the exact schedule.
   */
  async resendForPendingSession(
    input: ResendPendingGuardianConsentRequest,
  ): Promise<GuardianOtpTiming> {
    const now = this.clock();
    const pending = this.pendingSignupStore.get(input.pendingSessionId);
    if (!pending || new Date(pending.expiresAt).getTime() <= now.getTime()) {
      throw pendingSignupNotFound();
    }

    const consent = await this.guardianConsentRepository.findByIdForSession({
      consentId: input.consentId,
      pendingSessionId: input.pendingSessionId,
    });
    if (!consent) {
      throw guardianConsentNotFound();
    }
    if (consent.status !== "pending") {
      throw guardianConsentNotPending();
    }

    const challenge = this.otpStore.get(input.consentId);
    if (!challenge) {
      throw guardianConsentNotFound();
    }
    if (challenge.resendCount >= GUARDIAN_OTP_MAX_RESENDS) {
      throw guardianOtpResendLimitReached();
    }
    if (
      !challenge.nextResendAvailableAt ||
      now.getTime() < new Date(challenge.nextResendAvailableAt).getTime()
    ) {
      throw guardianOtpResendNotYetAvailable();
    }

    const code = this.createOtp();
    const resendCount = challenge.resendCount + 1;
    const otpExpiresAt = createGuardianOtpExpiration(now);
    const nextResendAvailableAt = guardianOtpResendAvailableAt(resendCount, now);
    this.otpStore.save({
      consentId: input.consentId,
      code,
      guardianEmail: challenge.guardianEmail,
      issuedAt: now.toISOString(),
      expiresAt: otpExpiresAt.toISOString(),
      // A fresh code deserves a fresh 3-strikes budget — otherwise a couple of wrong guesses on
      // the old code could expire a legitimately-just-resent one almost immediately.
      attempts: 0,
      resendCount,
      nextResendAvailableAt: nextResendAvailableAt?.toISOString() ?? null,
    });
    await this.emailProvider.send({
      to: challenge.guardianEmail,
      context: "guardian_otp",
      templateVars: { OTP: code },
    });

    return {
      otpExpiresAt: otpExpiresAt.toISOString(),
      resendCount,
      resendsRemaining: Math.max(0, GUARDIAN_OTP_MAX_RESENDS - resendCount),
      nextResendAvailableAt: nextResendAvailableAt?.toISOString() ?? null,
      canResend: nextResendAvailableAt !== null,
    };
  }

  /** Pre-identity path (minor signup) — mirrors verify() above, scoped by pendingSessionId. */
  async verifyForPendingSession(
    input: VerifyPendingGuardianConsentRequest,
  ): Promise<PendingGuardianConsent> {
    const now = this.clock();
    const pending = this.pendingSignupStore.get(input.pendingSessionId);
    if (!pending || new Date(pending.expiresAt).getTime() <= now.getTime()) {
      throw pendingSignupNotFound();
    }

    const consent = await this.guardianConsentRepository.findByIdForSession({
      consentId: input.consentId,
      pendingSessionId: input.pendingSessionId,
    });
    if (!consent) {
      throw guardianConsentNotFound();
    }
    if (consent.status !== "pending") {
      throw guardianConsentNotPending();
    }

    const challenge = this.otpStore.get(input.consentId);
    if (!challenge || new Date(challenge.expiresAt).getTime() <= now.getTime()) {
      await this.guardianConsentRepository.expireForSession({
        consentId: input.consentId,
        pendingSessionId: input.pendingSessionId,
        now: now.toISOString(),
      });
      this.otpStore.delete(input.consentId);
      this.declineTokenStore.delete(input.consentId);
      throw challenge ? guardianOtpExpired() : invalidGuardianOtp();
    }

    if (challenge.code !== input.verificationCode) {
      const updated = this.otpStore.recordFailedAttempt(input.consentId);
      if (updated && updated.attempts >= 3) {
        await this.guardianConsentRepository.expireForSession({
          consentId: input.consentId,
          pendingSessionId: input.pendingSessionId,
          now: now.toISOString(),
        });
        this.otpStore.delete(input.consentId);
        this.declineTokenStore.delete(input.consentId);
      }
      throw invalidGuardianOtp();
    }

    this.otpStore.delete(input.consentId);
    this.declineTokenStore.delete(input.consentId);
    return this.guardianConsentRepository.grantForSession({
      consentId: input.consentId,
      pendingSessionId: input.pendingSessionId,
      now: now.toISOString(),
    });
  }

  /**
   * Guardian-initiated decline (Gap 6). Unlike request/verify/getStatus, this has no session
   * context at all — the guardian calls it directly with the consentId + opaque token sent
   * alongside the OTP, so it looks the consent up by id rather than scoping by userId.
   */
  async decline(input: { consentId: string; token: string }): Promise<GuardianConsent> {
    const now = this.clock();
    const consent = await this.guardianConsentRepository.findById(input.consentId);
    if (!consent) {
      throw guardianConsentNotFound();
    }
    if (consent.status !== "pending") {
      throw guardianConsentNotPending();
    }

    const challenge = this.declineTokenStore.get(input.consentId);
    if (
      !challenge ||
      new Date(challenge.expiresAt).getTime() <= now.getTime() ||
      challenge.token !== input.token
    ) {
      throw guardianConsentDeclineLinkInvalid();
    }

    this.declineTokenStore.delete(input.consentId);
    this.otpStore.delete(input.consentId);
    return this.guardianConsentRepository.decline({
      consentId: input.consentId,
      userId: consent.userId,
      now: now.toISOString(),
    });
  }

  async getStatus(input: {
    sessionId: string;
    userId: string;
  }): Promise<GuardianConsentStatusResponse> {
    const { profile } = await this.loadActiveSessionProfile(input);
    return {
      consentRequired: isMinorAge(profile.ageAtOnboarding),
      consent: await this.guardianConsentRepository.findLatestForUser(input.userId),
    };
  }

  private async loadActiveSessionProfile(input: { sessionId: string; userId: string }): Promise<{
    profile: NonNullable<Awaited<ReturnType<UserProfileRepository["findByUserId"]>>>;
    now: Date;
  }> {
    const now = this.clock();
    const session = await this.journeySessionRepository.findByIdForUser(input);
    if (!session) {
      throw journeySessionNotFound();
    }
    if (isJourneySessionExpired(session, now)) {
      await this.journeySessionRepository.markExpired({
        sessionId: input.sessionId,
        userId: input.userId,
        now: now.toISOString(),
      });
      throw journeySessionExpired();
    }
    if (!canResumeJourneySession(session.status)) {
      throw journeySessionNotResumable();
    }

    const profile = await this.userProfileRepository.findByUserId(input.userId);
    if (!profile) {
      throw userProfileNotFound();
    }
    return { profile, now };
  }
}
