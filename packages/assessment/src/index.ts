import type { ModuleDescriptor } from "@yuvapath/contracts";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import type { Express } from "express";
import type { Pool } from "pg";
import { AssessmentApplicationError } from "./application/errors.js";
import type { GuardianConsentRepository } from "./application/guardian-consent-repository.js";
import { GuardianConsentService } from "./application/guardian-consent-service.js";
import { InMemoryGuardianDeclineTokenStore } from "./application/guardian-decline-token-store.js";
import { InMemoryGuardianOtpStore } from "./application/guardian-otp-store.js";
import type { EmailProvider, SendEmailResult } from "./application/email-provider.js";
import { IdentityService } from "./application/identity-service.js";
import type { IdentityUserDirectory } from "./application/identity-user-directory.js";
import { JourneySessionService } from "./application/journey-session-service.js";
import type { JourneySessionRepository } from "./application/journey-session-repository.js";
import { InMemoryPendingSignupStore } from "./application/pending-signup-store.js";
import type { UserProfileRepository } from "./application/user-profile-repository.js";
import { UserProfileService } from "./application/user-profile-service.js";
import type { LocationRepository } from "./domain/location.js";
import { registerGuardianConsentRoutes } from "./http/guardian-consent-routes.js";
import { registerIdentityRoutes } from "./http/identity-routes.js";
import { registerJourneySessionRoutes } from "./http/journey-session-routes.js";
import { registerLocationRoutes } from "./http/location-routes.js";
import { registerUserProfileRoutes } from "./http/user-profile-routes.js";
import { InMemoryLocationRepository } from "./infrastructure/in-memory-location-repository.js";
import { PgGuardianConsentRepository } from "./infrastructure/pg-guardian-consent-repository.js";
import { PgJourneySessionRepository } from "./infrastructure/pg-journey-session-repository.js";
import { PostgresLocationRepository } from "./infrastructure/pg-location-repository.js";
import { PgUserProfileRepository } from "./infrastructure/pg-user-profile-repository.js";

// Profile access for the clusterfit module, so it never queries assessment tables directly.
export { PgUserProfileRepository } from "./infrastructure/pg-user-profile-repository.js";
export { InMemoryLocationRepository } from "./infrastructure/in-memory-location-repository.js";
export { PostgresLocationRepository } from "./infrastructure/pg-location-repository.js";
export type { LocationRepository } from "./domain/location.js";

/**
 * Module 1: the student's account — sign-up and sign-in, guardian consent for under-18s,
 * journey sessions, the profile, and the state/city search the sign-up form uses.
 */
export const assessmentModule: ModuleDescriptor = {
  code: "m1",
  name: "Accounts",
  packageName: "@yuvapath/assessment",
  status: "in_progress",
};

class UnavailableJourneySessionRepository implements JourneySessionRepository {
  private unavailable(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "database_unavailable",
        "Journey session storage is not configured.",
        503,
      ),
    );
  }

  create() {
    return this.unavailable();
  }

  findByIdForUser() {
    return this.unavailable();
  }

  markExpired() {
    return this.unavailable();
  }

  resume() {
    return this.unavailable();
  }
}

class UnavailableUserProfileRepository implements UserProfileRepository {
  private unavailable(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "database_unavailable",
        "User profile storage is not configured.",
        503,
      ),
    );
  }

  upsert() {
    return this.unavailable();
  }

  findByUserId() {
    return this.unavailable();
  }
}

class UnavailableGuardianConsentRepository implements GuardianConsentRepository {
  private unavailable(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "database_unavailable",
        "Guardian consent storage is not configured.",
        503,
      ),
    );
  }

  createPending() {
    return this.unavailable();
  }

  findByIdForUser() {
    return this.unavailable();
  }

  findById() {
    return this.unavailable();
  }

  findLatestForUser() {
    return this.unavailable();
  }

  hasGrantedForUser() {
    return this.unavailable();
  }

  grant() {
    return this.unavailable();
  }

  expire() {
    return this.unavailable();
  }

  decline() {
    return this.unavailable();
  }

  createPendingForSession() {
    return this.unavailable();
  }

  findByIdForSession() {
    return this.unavailable();
  }

  grantForSession() {
    return this.unavailable();
  }

  expireForSession() {
    return this.unavailable();
  }

  findGrantedForPendingSession() {
    return this.unavailable();
  }

  attachToUser() {
    return this.unavailable();
  }
}

class UnavailableIdentityUserDirectory implements IdentityUserDirectory {
  findOrCreateUserIdByEmail(): Promise<string> {
    return Promise.reject(
      new AssessmentApplicationError(
        "identity_directory_unavailable",
        "Identity bootstrap is not configured (no IdentityUserDirectory wired up).",
        503,
      ),
    );
  }

  createUserWithPassword(): Promise<string> {
    return Promise.reject(
      new AssessmentApplicationError(
        "identity_directory_unavailable",
        "Identity bootstrap is not configured (no IdentityUserDirectory wired up).",
        503,
      ),
    );
  }

  emailExists(): Promise<boolean> {
    return Promise.reject(
      new AssessmentApplicationError(
        "identity_directory_unavailable",
        "Identity bootstrap is not configured (no IdentityUserDirectory wired up).",
        503,
      ),
    );
  }

  verifyPassword(): Promise<string | null> {
    return Promise.reject(
      new AssessmentApplicationError(
        "identity_directory_unavailable",
        "Identity bootstrap is not configured (no IdentityUserDirectory wired up).",
        503,
      ),
    );
  }
}

/**
 * No dev/test stand-in exists for email delivery (there is no dev-echo — every environment
 * either has a real SmtpEmailProvider configured, via apps/api, or gets this: OTP requests
 * fail loudly with a clear 503 instead of silently "succeeding" without sending anything).
 */
class UnavailableEmailProvider implements EmailProvider {
  send(): Promise<SendEmailResult> {
    return Promise.reject(
      new AssessmentApplicationError(
        "email_provider_unavailable",
        "Email delivery is not configured (no EmailProvider wired up).",
        503,
      ),
    );
  }
}

export type RegisterAssessmentRoutesOptions = {
  pool?: Pool;
  journeySessionRepository?: JourneySessionRepository;
  userProfileRepository?: UserProfileRepository;
  guardianConsentRepository?: GuardianConsentRepository;
  /** State/city search for sign-up. Defaults to Postgres with a pool, else an empty in-memory list. */
  locationRepository?: LocationRepository;
  /** No default stand-in (no dev-echo) — pass a real provider (e.g. SmtpEmailProvider, wired
   * up in apps/api) or OTP requests fail with a clear 503 rather than a silent fake send. */
  emailProvider?: EmailProvider;
  /** Exposes the guardian-consents/{consentId}/otp-debug route. Defaults to true; apps/api
   * should pass false in production regardless of which emailProvider is configured. */
  enableGuardianOtpDebugRoute?: boolean;
  /** Resolves/creates the Supabase Auth user behind password-based signup/signin (see
   * identity-user-directory.ts). Defaults to a 503-returning stub. */
  identityUserDirectory?: IdentityUserDirectory;
};

export const registerAssessmentRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  options: RegisterAssessmentRoutesOptions = {},
): void => {
  const repository =
    options.journeySessionRepository ??
    (options.pool
      ? new PgJourneySessionRepository(options.pool)
      : new UnavailableJourneySessionRepository());
  const userProfileRepository =
    options.userProfileRepository ??
    (options.pool
      ? new PgUserProfileRepository(options.pool)
      : new UnavailableUserProfileRepository());
  const guardianConsentRepository =
    options.guardianConsentRepository ??
    (options.pool
      ? new PgGuardianConsentRepository(options.pool)
      : new UnavailableGuardianConsentRepository());
  const locationRepository =
    options.locationRepository ??
    (options.pool
      ? new PostgresLocationRepository(options.pool)
      : new InMemoryLocationRepository());
  const emailProvider = options.emailProvider ?? new UnavailableEmailProvider();
  const identityUserDirectory =
    options.identityUserDirectory ?? new UnavailableIdentityUserDirectory();
  const otpStore = new InMemoryGuardianOtpStore();
  const declineTokenStore = new InMemoryGuardianDeclineTokenStore();
  // Shared between IdentityService and GuardianConsentService — a minor's guardian-consent
  // request/verify and their final password signup both reference the same pendingSessionId
  // lifecycle, so both services need the same store instance.
  const pendingSignupStore = new InMemoryPendingSignupStore();
  const journeySessionService = new JourneySessionService({ repository });
  const guardianConsentService = new GuardianConsentService({
    guardianConsentRepository,
    journeySessionRepository: repository,
    userProfileRepository,
    pendingSignupStore,
    otpStore,
    declineTokenStore,
    emailProvider,
    identityUserDirectory,
  });
  const identityService = new IdentityService({
    pendingSignupStore,
    userDirectory: identityUserDirectory,
    guardianConsentRepository,
  });
  const userProfileService = new UserProfileService({
    userProfileRepository,
    journeySessionRepository: repository,
  });

  registerIdentityRoutes(app, registry, identityService);
  registerJourneySessionRoutes(app, registry, journeySessionService);
  registerUserProfileRoutes(app, registry, userProfileService);
  registerGuardianConsentRoutes(app, registry, guardianConsentService, {
    otpStore,
    declineTokenStore,
    enableOtpDebugRoute: options.enableGuardianOtpDebugRoute ?? true,
  });
  registerLocationRoutes(app, registry, locationRepository);
};

export { AssessmentApplicationError } from "./application/errors.js";
export { GuardianConsentService } from "./application/guardian-consent-service.js";
export { InMemoryGuardianDeclineTokenStore } from "./application/guardian-decline-token-store.js";
export { InMemoryGuardianOtpStore } from "./application/guardian-otp-store.js";
export { IdentityService } from "./application/identity-service.js";
export { InMemoryPendingSignupStore } from "./application/pending-signup-store.js";
export { JourneySessionService } from "./application/journey-session-service.js";
export { UserProfileService } from "./application/user-profile-service.js";
export {
  SmtpEmailProvider,
  type SmtpEmailProviderOptions,
} from "./infrastructure/smtp-email-provider.js";
export type {
  EmailContext,
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "./application/email-provider.js";
export type {
  GuardianConsentRepository,
  NewGuardianConsent,
  NewPendingSessionGuardianConsent,
  PendingSessionGuardianConsent,
} from "./application/guardian-consent-repository.js";
export type { GuardianOtpChallenge, GuardianOtpStore } from "./application/guardian-otp-store.js";
export type {
  GuardianDeclineTokenChallenge,
  GuardianDeclineTokenStore,
} from "./application/guardian-decline-token-store.js";
export type { IdentityUserDirectory } from "./application/identity-user-directory.js";
export type { PendingSignup, PendingSignupStore } from "./application/pending-signup-store.js";
export type {
  JourneySessionRepository,
  NewJourneySession,
} from "./application/journey-session-repository.js";
export type {
  UpsertUserProfileRecord,
  UserProfileRepository,
} from "./application/user-profile-repository.js";
