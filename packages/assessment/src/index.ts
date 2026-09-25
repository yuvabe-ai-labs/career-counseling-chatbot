import type { ModuleDescriptor } from "@yuvapath/contracts";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import type { Express } from "express";
import type { Pool } from "pg";
import type { AssessmentRepository } from "./application/assessment-repository.js";
import { AssessmentService } from "./application/assessment-service.js";
import { CounselorAuthService } from "./application/counselor-auth-service.js";
import { CounselorDashboardService } from "./application/counselor-dashboard-service.js";
import type { CounselorDashboardRepository } from "./application/counselor-dashboard-repository.js";
import type { CounselorDirectory } from "./application/counselor-directory.js";
import { CounselorStudentService } from "./application/counselor-student-service.js";
import type { CounselorStudentRepository } from "./application/counselor-student-repository.js";
import { InMemoryCounselorPasswordResetOtpStore } from "./application/counselor-password-reset-otp-store.js";
import { InMemoryCounselorResetTokenStore } from "./application/counselor-reset-token-store.js";
import { AssessmentApplicationError } from "./application/errors.js";
import type { GuardianConsentRepository } from "./application/guardian-consent-repository.js";
import { GuardianConsentService } from "./application/guardian-consent-service.js";
import { InMemoryGuardianDeclineTokenStore } from "./application/guardian-decline-token-store.js";
import { InMemoryGuardianOtpStore } from "./application/guardian-otp-store.js";
import type { EmailProvider, SendEmailResult } from "./application/email-provider.js";
import { IdentityService } from "./application/identity-service.js";
import { InMemoryIdentityOtpStore } from "./application/identity-otp-store.js";
import type { IdentityUserDirectory } from "./application/identity-user-directory.js";
import type { IntakeRepository } from "./application/intake-repository.js";
import { IntakeService } from "./application/intake-service.js";
import { JourneySessionService } from "./application/journey-session-service.js";
import type { JourneySessionRepository } from "./application/journey-session-repository.js";
import { InMemoryPendingSignupStore } from "./application/pending-signup-store.js";
import type { UserProfileRepository } from "./application/user-profile-repository.js";
import { UserProfileService } from "./application/user-profile-service.js";
import { registerAssessmentRunRoutes } from "./http/assessment-run-routes.js";
import { registerCounselorAuthRoutes } from "./http/counselor-auth-routes.js";
import { registerCounselorDashboardRoutes } from "./http/counselor-dashboard-routes.js";
import { registerCounselorStudentRoutes } from "./http/counselor-student-routes.js";
import { registerGuardianConsentRoutes } from "./http/guardian-consent-routes.js";
import { registerIdentityRoutes } from "./http/identity-routes.js";
import { registerIntakeRoutes } from "./http/intake-routes.js";
import { registerJourneySessionRoutes } from "./http/journey-session-routes.js";
import { registerUserProfileRoutes } from "./http/user-profile-routes.js";
import { PgAssessmentRepository } from "./infrastructure/pg-assessment-repository.js";
import { PgCounselorDashboardRepository } from "./infrastructure/pg-counselor-dashboard-repository.js";
import { PgCounselorStudentRepository } from "./infrastructure/pg-counselor-student-repository.js";
import { PgGuardianConsentRepository } from "./infrastructure/pg-guardian-consent-repository.js";
import { PgIntakeRepository } from "./infrastructure/pg-intake-repository.js";
import { PgJourneySessionRepository } from "./infrastructure/pg-journey-session-repository.js";
import { PgUserProfileRepository } from "./infrastructure/pg-user-profile-repository.js";

export * from "./application/assessment-snapshot-reader.js";
export * from "./application/get-assessment-snapshot.js";
export {
  registerAssessmentSnapshotRoutes,
  type AssessmentHttpDependencies,
  type AssessmentSnapshotService,
  type ResolveAssessmentUserId,
} from "./http/assessment-snapshot-routes.js";
export * from "./infrastructure/postgres-assessment-snapshot-reader.js";

export const assessmentModule: ModuleDescriptor = {
  code: "m1",
  name: "Assessment",
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

class UnavailableIntakeRepository implements IntakeRepository {
  private unavailable(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "database_unavailable",
        "Intake storage is not configured.",
        503,
      ),
    );
  }

  findApprovedQuestionSet() {
    return this.unavailable();
  }

  findQuestionForProfileSegment() {
    return this.unavailable();
  }

  upsertAnswer() {
    return this.unavailable();
  }

  findAnswersForUser() {
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

class UnavailableCounselorDirectory implements CounselorDirectory {
  private unavailable(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "counselor_directory_unavailable",
        "Counselor authentication is not configured (no CounselorDirectory wired up).",
        503,
      ),
    );
  }

  verifyCounselorPassword(): Promise<{ userId: string; mustResetPassword: boolean; displayName: string } | null> {
    return this.unavailable();
  }

  findActiveCounselorIdByEmail(): Promise<string | null> {
    return this.unavailable();
  }

  clearMustResetPassword(): Promise<void> {
    return this.unavailable();
  }

  updatePassword(): Promise<void> {
    return this.unavailable();
  }

  isActiveCounselor(): Promise<boolean> {
    return this.unavailable();
  }
}

class UnavailableCounselorDashboardRepository implements CounselorDashboardRepository {
  getStats(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "database_unavailable",
        "Counselor dashboard storage is not configured.",
        503,
      ),
    );
  }
}

class UnavailableCounselorStudentRepository implements CounselorStudentRepository {
  listStudents(): Promise<never> {
    return this.unavailable();
  }

  findReportExtras(): Promise<never> {
    return this.unavailable();
  }

  private unavailable(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "database_unavailable",
        "Counselor student storage is not configured.",
        503,
      ),
    );
  }
}

class UnavailableAssessmentRepository implements AssessmentRepository {
  private unavailable(): Promise<never> {
    return Promise.reject(
      new AssessmentApplicationError(
        "database_unavailable",
        "Assessment storage is not configured.",
        503,
      ),
    );
  }

  findActiveVersion() {
    return this.unavailable();
  }
  createRun() {
    return this.unavailable();
  }
  findRunByIdForUser() {
    return this.unavailable();
  }
  findLatestRunForUser() {
    return this.unavailable();
  }
  listRunItems() {
    return this.unavailable();
  }
  listAnsweredItemIds() {
    return this.unavailable();
  }
  findItemForRun() {
    return this.unavailable();
  }
  findOptionForItem() {
    return this.unavailable();
  }
  upsertResponse() {
    return this.unavailable();
  }
  updateRunProgress() {
    return this.unavailable();
  }
  listScoringResponses() {
    return this.unavailable();
  }
  createResult() {
    return this.unavailable();
  }
  findResultByRunForUser() {
    return this.unavailable();
  }
  findLatestResultByUserForInstrument() {
    return this.unavailable();
  }
  findLatestRiasecResultForUser() {
    return this.unavailable();
  }
  getIntakeSummary() {
    return this.unavailable();
  }
  getNextProfileVersion() {
    return this.unavailable();
  }
  createAssessmentSnapshot() {
    return this.unavailable();
  }
}

export type RegisterAssessmentRoutesOptions = {
  pool?: Pool;
  assessmentRepository?: AssessmentRepository;
  journeySessionRepository?: JourneySessionRepository;
  userProfileRepository?: UserProfileRepository;
  intakeRepository?: IntakeRepository;
  guardianConsentRepository?: GuardianConsentRepository;
  /** No default stand-in (no dev-echo) — pass a real provider (e.g. SmtpEmailProvider, wired
   * up in apps/api) or OTP requests fail with a clear 503 rather than a silent fake send.
   * Shared by both the student identity-OTP flow and guardian consent — no SMS/phone
   * delivery exists anywhere in Module 1 anymore. */
  emailProvider?: EmailProvider;
  /** Exposes the guardian-consents/{consentId}/otp-debug and auth/otp/debug/{pendingSessionId}
   * routes. Defaults to true; apps/api should pass false in production regardless of which
   * emailProvider is configured. */
  enableGuardianOtpDebugRoute?: boolean;
  /** Resolves/creates the Supabase Auth user behind a verified identity-OTP email (see
   * identity-user-directory.ts). Required for POST /auth/otp/verify to work — defaults to a
   * 503-returning stub, matching every other Unavailable* repository default here. */
  identityUserDirectory?: IdentityUserDirectory;
  /** Backs the counselor sign-in/forgot-password routes (see counselor-directory.ts). Defaults
   *  to a 503-returning stub, matching identityUserDirectory's own default. */
  counselorDirectory?: CounselorDirectory;
  /** Backs GET /counselor/dashboard/stats (see counselor-dashboard-repository.ts). Defaults to
   *  a Postgres-backed implementation when a pool is given, else a 503-returning stub. */
  counselorDashboardRepository?: CounselorDashboardRepository;
  /** Backs GET /counselor/students and GET /counselor/students/:studentId/report (see
   *  counselor-student-repository.ts). Defaults to a Postgres-backed implementation when a pool
   *  is given, else a 503-returning stub. */
  counselorStudentRepository?: CounselorStudentRepository;
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
  const intakeRepository =
    options.intakeRepository ??
    (options.pool ? new PgIntakeRepository(options.pool) : new UnavailableIntakeRepository());
  const guardianConsentRepository =
    options.guardianConsentRepository ??
    (options.pool
      ? new PgGuardianConsentRepository(options.pool)
      : new UnavailableGuardianConsentRepository());
  const assessmentRepository =
    options.assessmentRepository ??
    (options.pool
      ? new PgAssessmentRepository(options.pool)
      : new UnavailableAssessmentRepository());
  const emailProvider = options.emailProvider ?? new UnavailableEmailProvider();
  const identityUserDirectory =
    options.identityUserDirectory ?? new UnavailableIdentityUserDirectory();
  const counselorDirectory = options.counselorDirectory ?? new UnavailableCounselorDirectory();
  const counselorDashboardRepository =
    options.counselorDashboardRepository ??
    (options.pool
      ? new PgCounselorDashboardRepository(options.pool)
      : new UnavailableCounselorDashboardRepository());
  const counselorStudentRepository =
    options.counselorStudentRepository ??
    (options.pool
      ? new PgCounselorStudentRepository(options.pool)
      : new UnavailableCounselorStudentRepository());
  const otpStore = new InMemoryGuardianOtpStore();
  const declineTokenStore = new InMemoryGuardianDeclineTokenStore();
  const identityOtpStore = new InMemoryIdentityOtpStore();
  // Shared between IdentityService and GuardianConsentService — a minor's guardian-consent
  // request/verify and their final password signup all reference the same pendingSessionId
  // lifecycle as the adult email-OTP path, so both services need the same store instance.
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
    otpStore: identityOtpStore,
    emailProvider,
    userDirectory: identityUserDirectory,
    guardianConsentRepository,
  });
  const userProfileService = new UserProfileService({
    userProfileRepository,
    journeySessionRepository: repository,
  });
  const intakeService = new IntakeService({
    intakeRepository,
    guardianConsentRepository,
    journeySessionRepository: repository,
    userProfileRepository,
  });
  const assessmentService = new AssessmentService({
    assessmentRepository,
    journeySessionRepository: repository,
    userProfileRepository,
    guardianConsentRepository,
  });
  const counselorAuthService = new CounselorAuthService({
    counselorDirectory,
    otpStore: new InMemoryCounselorPasswordResetOtpStore(),
    resetTokenStore: new InMemoryCounselorResetTokenStore(),
    emailProvider,
  });
  const counselorDashboardService = new CounselorDashboardService({
    counselorDirectory,
    repository: counselorDashboardRepository,
  });
  const counselorStudentService = new CounselorStudentService({
    counselorDirectory,
    repository: counselorStudentRepository,
    assessmentRepository,
    userProfileRepository,
  });
  registerIdentityRoutes(app, registry, identityService, {
    otpStore: identityOtpStore,
    enableOtpDebugRoute: options.enableGuardianOtpDebugRoute ?? true,
  });
  registerJourneySessionRoutes(app, registry, journeySessionService);
  registerUserProfileRoutes(app, registry, userProfileService);
  registerGuardianConsentRoutes(app, registry, guardianConsentService, {
    otpStore,
    declineTokenStore,
    enableOtpDebugRoute: options.enableGuardianOtpDebugRoute ?? true,
  });
  registerIntakeRoutes(app, registry, intakeService);
  registerAssessmentRunRoutes(app, registry, assessmentService);
  registerCounselorAuthRoutes(app, registry, counselorAuthService);
  registerCounselorDashboardRoutes(app, registry, counselorDashboardService);
  registerCounselorStudentRoutes(app, registry, counselorStudentService);
};

export { AssessmentApplicationError } from "./application/errors.js";
export { AssessmentService } from "./application/assessment-service.js";
export { CounselorAuthService } from "./application/counselor-auth-service.js";
export { CounselorDashboardService } from "./application/counselor-dashboard-service.js";
export type { CounselorDashboardRepository } from "./application/counselor-dashboard-repository.js";
export type { CounselorDirectory } from "./application/counselor-directory.js";
export { CounselorStudentService } from "./application/counselor-student-service.js";
export type {
  CounselorStudentListFilters,
  CounselorStudentListResult,
  CounselorStudentRecord,
  CounselorStudentRepository,
} from "./application/counselor-student-repository.js";
export { InMemoryCounselorPasswordResetOtpStore } from "./application/counselor-password-reset-otp-store.js";
export { InMemoryCounselorResetTokenStore } from "./application/counselor-reset-token-store.js";
export { GuardianConsentService } from "./application/guardian-consent-service.js";
export { InMemoryGuardianDeclineTokenStore } from "./application/guardian-decline-token-store.js";
export { InMemoryGuardianOtpStore } from "./application/guardian-otp-store.js";
export { IdentityService } from "./application/identity-service.js";
export { InMemoryIdentityOtpStore } from "./application/identity-otp-store.js";
export { InMemoryPendingSignupStore } from "./application/pending-signup-store.js";
export { IntakeService } from "./application/intake-service.js";
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
  AssessmentRepository,
  AssessmentVersionRecord,
  NewAssessmentResponse,
  NewAssessmentRun,
  NewAssessmentSnapshot,
} from "./application/assessment-repository.js";
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
export type { IdentityOtpChallenge, IdentityOtpStore } from "./application/identity-otp-store.js";
export type { IdentityUserDirectory } from "./application/identity-user-directory.js";
export type { PendingSignup, PendingSignupStore } from "./application/pending-signup-store.js";
export type {
  IntakeQuestionSet,
  IntakeQuestionSetWithQuestions,
  IntakeRepository,
  NewIntakeAnswer,
} from "./application/intake-repository.js";
export type {
  JourneySessionRepository,
  NewJourneySession,
} from "./application/journey-session-repository.js";
export type {
  UpsertUserProfileRecord,
  UserProfileRepository,
} from "./application/user-profile-repository.js";
