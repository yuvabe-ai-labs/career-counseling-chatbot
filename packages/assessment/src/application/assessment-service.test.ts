import { describe, expect, it } from "vitest";
import type {
  AssessmentItem,
  AssessmentResponse,
  AssessmentResult,
  AssessmentRun,
  JourneySession,
  ProfileSnapshot,
  UserProfile,
} from "@yuvanext/contracts";
import { AssessmentService } from "./assessment-service.js";
import type {
  AssessmentRepository,
  AssessmentVersionRecord,
  NewAssessmentResponse,
  NewAssessmentRun,
  NewAssessmentSnapshot,
} from "./assessment-repository.js";
import type { GuardianConsentRepository } from "./guardian-consent-repository.js";
import type { JourneySessionRepository } from "./journey-session-repository.js";
import type { UserProfileRepository } from "./user-profile-repository.js";
import type { ScoredResponseInput } from "../domain/scoring.js";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const itemOneId = "44444444-4444-4444-8444-444444444444";
const itemTwoId = "55555555-5555-4555-8555-555555555555";

class MemoryAssessmentRepository implements AssessmentRepository {
  run: AssessmentRun | null = null;
  responses = new Map<string, AssessmentResponse>();
  result: AssessmentResult | null = null;
  lastInstrumentCode: string | null = null;
  createRunCalls = 0;

  private readonly items: AssessmentItem[] = [
    {
      id: itemOneId,
      itemKey: "R1",
      displayOrder: 1,
      itemType: "likert",
      promptText: "Build something",
      promptAssetRef: null,
      scaleCode: "R",
      isQc: false,
      options: [],
    },
    {
      id: itemTwoId,
      itemKey: "I1",
      displayOrder: 2,
      itemType: "likert",
      promptText: "Research something",
      promptAssetRef: null,
      scaleCode: "I",
      isQc: false,
      options: [],
    },
  ];

  findActiveVersion(input: {
    instrumentCode: AssessmentVersionRecord["instrumentCode"];
  }): Promise<AssessmentVersionRecord | null> {
    this.lastInstrumentCode = input.instrumentCode;
    return Promise.resolve({
      id: "66666666-6666-4666-8666-666666666666",
      instrumentCode: input.instrumentCode,
      instrumentVersion: "1.0",
      algorithmVersion: input.instrumentCode === "wip" ? "wip-deterministic-v1" : "riasec-score-v1",
      batchSize: 10,
      itemCount: 2,
    });
  }

  createRun(input: NewAssessmentRun): Promise<AssessmentRun> {
    this.createRunCalls += 1;
    this.run = {
      id: runId,
      userId: input.userId,
      journeySessionId: input.journeySessionId,
      assessmentVersionId: input.assessmentVersionId,
      instrumentCode:
        this.lastInstrumentCode === "wip"
          ? "wip"
          : this.lastInstrumentCode === "ip_60"
            ? "ip_60"
            : "mini_ip_30",
      instrumentVersion: "1.0",
      algorithmVersion:
        this.lastInstrumentCode === "wip" ? "wip-deterministic-v1" : "riasec-score-v1",
      segment: input.segment,
      status: "active",
      currentPosition: 0,
      startedAt: input.startedAt,
      lastAnsweredAt: null,
      completedAt: null,
      scoredAt: null,
      resumeExpiresAt: input.resumeExpiresAt,
      attemptNumber: 1,
      createdAt: input.createdAt,
    };
    return Promise.resolve(this.run);
  }

  findRunByIdForUser(): Promise<AssessmentRun | null> {
    return Promise.resolve(this.run);
  }

  findLatestRunForUser(): Promise<AssessmentRun | null> {
    return Promise.resolve(this.run);
  }

  listRunItems(): Promise<AssessmentItem[]> {
    return Promise.resolve(this.items);
  }

  listAnsweredItemIds(): Promise<Set<string>> {
    return Promise.resolve(new Set(this.responses.keys()));
  }

  findItemForRun(input: { itemId: string }): Promise<AssessmentItem | null> {
    return Promise.resolve(this.items.find((item) => item.id === input.itemId) ?? null);
  }

  findOptionForItem(): Promise<{ id: string; scoreDelta: number | null } | null> {
    return Promise.resolve(null);
  }

  upsertResponse(input: NewAssessmentResponse): Promise<AssessmentResponse> {
    const response: AssessmentResponse = {
      id: input.id,
      assessmentRunId: input.assessmentRunId,
      itemId: input.itemId,
      selectedOptionId: input.selectedOptionId,
      responseValue: input.responseValue,
      responseJson: input.responseJson,
      latencyMs: input.latencyMs,
      answeredAt: input.answeredAt,
      receivedAt: input.receivedAt,
    };
    this.responses.set(input.itemId, response);
    return Promise.resolve(response);
  }

  updateRunProgress(input: {
    currentPosition: number;
    status: AssessmentRun["status"];
    now: string;
  }): Promise<AssessmentRun> {
    if (!this.run) throw new Error("missing run");
    this.run = {
      ...this.run,
      currentPosition: input.currentPosition,
      status: input.status,
      lastAnsweredAt: input.now,
      completedAt: input.status === "completed" ? input.now : null,
    };
    return Promise.resolve(this.run);
  }

  listScoringResponses(): Promise<ScoredResponseInput[]> {
    // Derived from whatever's actually been submitted so far (this.responses), same as the real
    // repository joining assessment_responses -> assessment_items — not a fixed stub, since
    // getNext() now also reads this (to build answeredItems) at points before every item is
    // necessarily answered yet, not just once scoring runs.
    return Promise.resolve(
      this.items
        .filter((item) => this.responses.has(item.id))
        .map((item) => ({
          itemId: item.id,
          scaleCode: item.scaleCode,
          isQc: item.isQc,
          responseValue: this.responses.get(item.id)!.responseValue,
          scoreDelta: null,
        })),
    );
  }

  createResult(input: AssessmentResult): Promise<AssessmentResult> {
    this.result = input;
    return Promise.resolve(input);
  }

  findResultByRunForUser(): Promise<AssessmentResult | null> {
    return Promise.resolve(this.result);
  }

  findLatestResultByUserForInstrument(): Promise<AssessmentResult | null> {
    return Promise.resolve(this.result?.instrumentCode === "wip" ? this.result : null);
  }

  getIntakeSummary(): Promise<Record<string, unknown>> {
    return Promise.resolve({ current_goal: { value: "job" } });
  }

  getNextProfileVersion(): Promise<number> {
    return Promise.resolve(1);
  }

  createAssessmentSnapshot(input: NewAssessmentSnapshot): Promise<ProfileSnapshot> {
    return Promise.resolve({
      snapshotId: input.id,
      userId: input.userId,
      firstName: input.profile.firstName,
      segment: input.profile.segment,
      ageBand: input.profile.ageBand,
      city: input.profile.city,
      state: input.profile.state,
      selfStage: input.profile.selfStage,
      wantsAid: input.profile.wantsAid,
      intakeSummary: input.intakeSummary,
      riasec: (input.resultSummary as { riasec: ProfileSnapshot["riasec"] }).riasec,
      values: (input.resultSummary as { values: ProfileSnapshot["values"] }).values,
      profileVersion: input.profileVersion,
      algorithmVersion: input.algorithmVersion,
      sourceResultIds: input.sourceResults.map((sourceResult) => sourceResult.resultId),
      createdAt: input.createdAt,
    });
  }
}

const session: JourneySession = {
  id: sessionId,
  userId,
  anonymousSessionId: null,
  channel: "web",
  status: "active",
  startedAt: "2026-07-30T09:00:00.000Z",
  lastSeenAt: "2026-07-30T09:00:00.000Z",
  expiresAt: "2026-08-06T09:00:00.000Z",
  completedAt: null,
};

const profile: UserProfile = {
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
  createdAt: "2026-07-30T09:00:00.000Z",
  updatedAt: "2026-07-30T09:00:00.000Z",
  deletedAt: null,
};

class MemoryJourneySessionRepository implements JourneySessionRepository {
  create(): Promise<JourneySession> {
    throw new Error("not used");
  }
  findByIdForUser(): Promise<JourneySession | null> {
    return Promise.resolve(session);
  }
  markExpired(): Promise<JourneySession> {
    throw new Error("not used");
  }
  resume(): Promise<JourneySession> {
    throw new Error("not used");
  }
}

class MemoryUserProfileRepository implements UserProfileRepository {
  upsert(): Promise<UserProfile> {
    throw new Error("not used");
  }
  findByUserId(): Promise<UserProfile | null> {
    return Promise.resolve(profile);
  }
}

class GrantedConsentRepository implements GuardianConsentRepository {
  createPending(): never {
    throw new Error("not used");
  }
  findByIdForUser(): never {
    throw new Error("not used");
  }
  findById(): never {
    throw new Error("not used");
  }
  findLatestForUser(): never {
    throw new Error("not used");
  }
  hasGrantedForUser(): Promise<boolean> {
    return Promise.resolve(true);
  }
  grant(): never {
    throw new Error("not used");
  }
  expire(): never {
    throw new Error("not used");
  }
  decline(): never {
    throw new Error("not used");
  }
  createPendingForSession(): never {
    throw new Error("not used");
  }
  findByIdForSession(): never {
    throw new Error("not used");
  }
  grantForSession(): never {
    throw new Error("not used");
  }
  expireForSession(): never {
    throw new Error("not used");
  }
  findGrantedForPendingSession(): never {
    throw new Error("not used");
  }
  attachToUser(): never {
    throw new Error("not used");
  }
}

describe("AssessmentService", () => {
  it("starts, delivers, persists, scores, and snapshots an adult run", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: new MemoryUserProfileRepository(),
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });

    const run = await service.startRun({
      sessionId,
      userId,
      request: { language: "en" },
    });
    expect(assessmentRepository.lastInstrumentCode).toBe("ip_60");
    expect(run.status).toBe("active");

    const firstBatch = await service.getNext({ runId, userId });
    expect(firstBatch.items).toHaveLength(2);

    await service.submitResponse({
      runId,
      userId,
      response: { itemId: itemOneId, responseValue: 5 },
    });
    const saved = await service.submitResponse({
      runId,
      userId,
      response: { itemId: itemTwoId, responseValue: 3 },
    });
    expect(saved.next.progress.isComplete).toBe(true);

    const scoredResult = await service.scoreRun({ runId, userId });
    expect(scoredResult).toBeDefined();
  });

  it("Previous/edit support: getNext returns already-answered items with their saved values, and re-submitting one updates it in place", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: new MemoryUserProfileRepository(),
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });
    await service.startRun({ sessionId, userId, request: { language: "en" } });

    const beforeAnyAnswers = await service.getNext({ runId, userId });
    expect(beforeAnyAnswers.answeredItems).toEqual([]);

    const afterFirst = await service.submitResponse({
      runId,
      userId,
      response: { itemId: itemOneId, responseValue: 5 },
    });
    expect(afterFirst.next.answeredItems).toEqual([
      expect.objectContaining({ id: itemOneId, responseValue: 5 }),
    ]);
    // Still the upcoming (unanswered) item, unaffected by the new answeredItems field.
    expect(afterFirst.next.items[0]?.id).toBe(itemTwoId);

    // Simulates clicking Previous back to item 1 and changing the answer, then Next — the
    // existing upsert (unique on (assessment_run_id, item_id)) updates the same response row.
    // (4, not something that would flip R/I dominance — this test isn't re-verifying scoring's
    // own tie-break rules, just that the edit lands and R stays the top scale below.)
    const afterEdit = await service.submitResponse({
      runId,
      userId,
      response: { itemId: itemOneId, responseValue: 4 },
    });
    expect(afterEdit.next.answeredItems).toEqual([
      expect.objectContaining({ id: itemOneId, responseValue: 4 }),
    ]);
    // Editing an already-answered item doesn't move the frontier or inflate the answered count.
    expect(afterEdit.next.progress.nextPosition).toBe(1);
    expect(afterEdit.next.progress.answered).toBe(1);

    const afterSecond = await service.submitResponse({
      runId,
      userId,
      response: { itemId: itemTwoId, responseValue: 3 },
    });
    expect(afterSecond.next.answeredItems).toEqual([
      expect.objectContaining({ id: itemOneId, responseValue: 4 }),
      expect.objectContaining({ id: itemTwoId, responseValue: 3 }),
    ]);
    expect(afterSecond.next.progress.isComplete).toBe(true);

    const result = await service.scoreRun({ runId, userId });
    expect(result.resultCode).toBe("RIA");

    const snapshot = await service.buildAssessmentSnapshot({ sessionId, userId, runId });
    expect(snapshot.snapshotId).toBeDefined();
    expect(snapshot.riasec?.code).toBe("RIA");
  });

  it("resume: a second startRun call reuses the existing active run instead of creating a new one", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: new MemoryUserProfileRepository(),
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });

    const first = await service.startRun({ sessionId, userId, request: { language: "en" } });
    expect(assessmentRepository.createRunCalls).toBe(1);

    // Simulates a different device/browser/session with no locally-cached runId — the same
    // account calling startRun again should resume, not duplicate.
    const second = await service.startRun({ sessionId, userId, request: { language: "en" } });

    expect(second.id).toBe(first.id);
    expect(assessmentRepository.createRunCalls).toBe(1);
  });

  it("resume: startRun returns an already-completed run rather than starting a new attempt", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: new MemoryUserProfileRepository(),
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });
    await service.startRun({ sessionId, userId, request: { language: "en" } });
    // Simulates having already finished this instrument (e.g. on another device) before this
    // startRun call — landing on the assessment page again should not start a fresh attempt.
    assessmentRepository.run = { ...assessmentRepository.run!, status: "completed" };

    const run = await service.startRun({ sessionId, userId, request: { language: "en" } });

    expect(run.status).toBe("completed");
    expect(assessmentRepository.createRunCalls).toBe(1);
  });

  it("defaults explorer runs to mini_ip_30", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: {
        upsert: () => {
          throw new Error("not used");
        },
        findByUserId: () =>
          Promise.resolve({
            ...profile,
            segment: "explorer",
            selfStage: "school",
            ageAtOnboarding: 13,
            ageBand: "minor_12_13",
          }),
      },
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });

    await service.startRun({ sessionId, userId, request: { language: "en", mode: "text" } });

    expect(assessmentRepository.lastInstrumentCode).toBe("mini_ip_30");
  });

  it("passes an explicit instrumentCode override through to the version lookup", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: new MemoryUserProfileRepository(),
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });

    // Adult/launcher profile would otherwise default to ip_60 (see the first test above) —
    // an explicit instrumentCode should override that default.
    await service.startRun({
      sessionId,
      userId,
      request: { language: "en", instrumentCode: "mini_ipip" },
    });

    expect(assessmentRepository.lastInstrumentCode).toBe("mini_ipip");
  });

  it("resolves mode:photo for an explorer segment to photo_ip", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: {
        upsert: () => {
          throw new Error("not used");
        },
        findByUserId: () =>
          Promise.resolve({
            ...profile,
            segment: "explorer",
            selfStage: "school",
            ageAtOnboarding: 13,
            ageBand: "minor_12_13",
          }),
      },
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });

    await service.startRun({ sessionId, userId, request: { language: "en", mode: "photo" } });

    expect(assessmentRepository.lastInstrumentCode).toBe("photo_ip");
  });

  it("cleanly 404s for an unseeded instrument instead of an unreachable/silent fallback", async () => {
    class NoVersionAssessmentRepository extends MemoryAssessmentRepository {
      findActiveVersion(): Promise<AssessmentVersionRecord | null> {
        return Promise.resolve(null);
      }
    }
    const service = new AssessmentService({
      assessmentRepository: new NoVersionAssessmentRepository(),
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: new MemoryUserProfileRepository(),
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });

    await expect(
      service.startRun({
        sessionId,
        userId,
        request: { language: "en", instrumentCode: "aptitude" },
      }),
    ).rejects.toMatchObject({ code: "assessment_version_not_found", statusCode: 404 });
  });

  it("starts WIP work-values runs without frontend instrument selection", async () => {
    const assessmentRepository = new MemoryAssessmentRepository();
    const service = new AssessmentService({
      assessmentRepository,
      journeySessionRepository: new MemoryJourneySessionRepository(),
      userProfileRepository: new MemoryUserProfileRepository(),
      guardianConsentRepository: new GrantedConsentRepository(),
      clock: () => new Date("2026-07-30T09:00:00.000Z"),
    });

    const run = await service.startWorkValuesRun({
      sessionId,
      userId,
      request: { language: "en" },
    });

    expect(assessmentRepository.lastInstrumentCode).toBe("wip");
    expect(run.instrumentCode).toBe("wip");
  });
});
