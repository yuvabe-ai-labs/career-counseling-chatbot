import { describe, expect, it } from "vitest";
import type {
  GuardianConsent,
  IntakeAnswer,
  IntakeQuestion,
  JourneySession,
  UserProfile,
} from "@yuvanext/contracts";
import { IntakeService } from "./intake-service.js";
import type { GuardianConsentRepository } from "./guardian-consent-repository.js";
import type {
  IntakeQuestionSetWithQuestions,
  IntakeRepository,
  NewIntakeAnswer,
} from "./intake-repository.js";
import type { JourneySessionRepository } from "./journey-session-repository.js";
import type { UserProfileRepository } from "./user-profile-repository.js";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const questionSetId = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";

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

  markExpired(input: { sessionId: string; userId: string; now: string }): Promise<JourneySession> {
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

class InMemoryIntakeRepository implements IntakeRepository {
  answer: IntakeAnswer | null = null;
  private readonly savedByQuestionId = new Map<string, IntakeAnswer>();

  constructor(private readonly questions: IntakeQuestion[]) {}

  findApprovedQuestionSet(): Promise<IntakeQuestionSetWithQuestions | null> {
    return Promise.resolve({
      questionSet: { id: questionSetId, segment: "launcher", version: "1.0", language: "en" },
      questions: this.questions,
    });
  }

  findQuestionForProfileSegment(input: { questionId: string }): Promise<IntakeQuestion | null> {
    return Promise.resolve(
      this.questions.find((question) => question.id === input.questionId) ?? null,
    );
  }

  upsertAnswer(input: NewIntakeAnswer): Promise<IntakeAnswer> {
    this.answer = {
      id: input.id,
      userId: input.userId,
      sessionId: input.sessionId,
      questionId: input.questionId,
      questionSetVersion: input.questionSetVersion,
      answer: input.answer,
      answeredAt: input.answeredAt,
    };
    this.savedByQuestionId.set(input.questionId, this.answer);
    return Promise.resolve(this.answer);
  }

  findAnswersForUser(input: { userId: string; questionIds: string[] }): Promise<IntakeAnswer[]> {
    return Promise.resolve(
      input.questionIds
        .map((id) => this.savedByQuestionId.get(id))
        .filter((answer): answer is IntakeAnswer => answer !== undefined && answer.userId === input.userId),
    );
  }
}

class InMemoryGuardianConsentRepository implements GuardianConsentRepository {
  constructor(private readonly granted: boolean) {}

  createPending(): Promise<GuardianConsent> {
    throw new Error("not used");
  }

  findByIdForUser(): Promise<GuardianConsent | null> {
    throw new Error("not used");
  }

  findById(): Promise<GuardianConsent | null> {
    throw new Error("not used");
  }

  findLatestForUser(): Promise<GuardianConsent | null> {
    throw new Error("not used");
  }

  hasGrantedForUser(): Promise<boolean> {
    return Promise.resolve(this.granted);
  }

  grant(): Promise<GuardianConsent> {
    throw new Error("not used");
  }

  expire(): Promise<GuardianConsent> {
    throw new Error("not used");
  }

  decline(): Promise<GuardianConsent> {
    throw new Error("not used");
  }

  createPendingForSession(): Promise<never> {
    throw new Error("not used");
  }

  findByIdForSession(): Promise<never> {
    throw new Error("not used");
  }

  grantForSession(): Promise<never> {
    throw new Error("not used");
  }

  expireForSession(): Promise<never> {
    throw new Error("not used");
  }

  findGrantedForPendingSession(): Promise<never> {
    throw new Error("not used");
  }

  attachToUser(): Promise<never> {
    throw new Error("not used");
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

const adultProfile: UserProfile = {
  userId,
  firstName: "Test",
  ageAtOnboarding: 26,
  ageBand: "adult_19_plus",
  city: "Chennai",
  state: "Tamil Nadu",
  countryCode: "IN",
  segment: "launcher",
  selfStage: "working",
  wantsAid: false,
  profileStatus: "active",
  createdAt: "2026-07-29T10:00:00.000Z",
  updatedAt: "2026-07-29T10:00:00.000Z",
  deletedAt: null,
};

const question: IntakeQuestion = {
  id: questionId,
  questionSetId,
  questionSetVersion: "1.0",
  segment: "launcher",
  language: "en",
  questionKey: "current_goal",
  displayOrder: 1,
  promptText: "What is your current goal?",
  responseType: "single_choice",
  options: ["job", "higher_studies", "not_sure"],
  placeholderText: null,
  isSensitive: false,
  isRequired: true,
};

const createService = (profile: UserProfile | null = adultProfile, guardianGranted = false) => {
  const intakeRepository = new InMemoryIntakeRepository([question]);
  return {
    intakeRepository,
    service: new IntakeService({
      intakeRepository,
      guardianConsentRepository: new InMemoryGuardianConsentRepository(guardianGranted),
      journeySessionRepository: new InMemoryJourneySessionRepository(session),
      userProfileRepository: new InMemoryUserProfileRepository(profile),
      clock: () => new Date("2026-07-29T10:00:00.000Z"),
    }),
  };
};

describe("IntakeService", () => {
  it("returns approved questions for the stored profile segment", async () => {
    const { service } = createService();

    const result = await service.getQuestions({ sessionId, userId });

    expect(result.questionSet.segment).toBe("launcher");
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.questionKey).toBe("current_goal");
    expect(result.answers).toEqual([]);
  });

  it("resume: returns a previously-saved answer even though it was saved under a different (now-stale) session id", async () => {
    const { service, intakeRepository } = createService();
    // Saved directly against the repository under an old session id — simulating an answer a
    // returning user gave in an earlier journey session, distinct from the one active now (a
    // fresh journey session is minted on every sign-in; findAnswersForUser must not care).
    await intakeRepository.upsertAnswer({
      id: "66666666-6666-4666-8666-666666666666",
      userId,
      sessionId: "77777777-7777-4777-8777-777777777777",
      questionId,
      questionSetVersion: "1.0",
      answer: { value: "job" },
      answeredAt: "2026-07-01T10:00:00.000Z",
    });

    const result = await service.getQuestions({ sessionId, userId });

    expect(result.answers).toHaveLength(1);
    expect(result.answers[0]?.questionId).toBe(questionId);
    expect(result.answers[0]?.answer.value).toBe("job");
  });

  it("stores a valid adult intake answer", async () => {
    const { service } = createService();

    const answer = await service.upsertAnswer({
      sessionId,
      userId,
      questionId,
      answer: { value: "job" },
    });

    expect(answer.questionSetVersion).toBe("1.0");
    expect(answer.answer.value).toBe("job");
  });

  it("rejects answers outside the allowed options", async () => {
    const { service } = createService();

    await expect(
      service.upsertAnswer({
        sessionId,
        userId,
        questionId,
        answer: { value: "invented" },
      }),
    ).rejects.toMatchObject({ code: "invalid_intake_answer", statusCode: 400 });
  });

  it("does not persist minor answers before guardian consent exists", async () => {
    const minorProfile: UserProfile = {
      ...adultProfile,
      ageAtOnboarding: 15,
      ageBand: "minor_14_15",
      segment: "explorer",
      selfStage: "school",
    };
    const { service, intakeRepository } = createService(minorProfile);

    await expect(
      service.upsertAnswer({
        sessionId,
        userId,
        questionId,
        answer: { value: "job" },
      }),
    ).rejects.toMatchObject({ code: "guardian_consent_required", statusCode: 409 });
    expect(intakeRepository.answer).toBeNull();
  });

  it("stores minor intake answers after guardian consent is granted", async () => {
    const minorProfile: UserProfile = {
      ...adultProfile,
      ageAtOnboarding: 15,
      ageBand: "minor_14_15",
      segment: "explorer",
      selfStage: "school",
    };
    const { service } = createService(minorProfile, true);

    const answer = await service.upsertAnswer({
      sessionId,
      userId,
      questionId,
      answer: { value: "job" },
    });

    expect(answer.answer.value).toBe("job");
  });
});
