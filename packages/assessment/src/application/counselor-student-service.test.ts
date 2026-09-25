import { describe, expect, it } from "vitest";
import type { AssessmentResult, UserProfile } from "@yuvapath/contracts";
import { CounselorStudentService } from "./counselor-student-service.js";
import type { AssessmentRepository } from "./assessment-repository.js";
import type { CounselorDirectory } from "./counselor-directory.js";
import type {
  CounselorStudentListFilters,
  CounselorStudentListResult,
  CounselorStudentReportExtras,
  CounselorStudentRepository,
} from "./counselor-student-repository.js";
import type { UserProfileRepository } from "./user-profile-repository.js";

class FakeCounselorDirectory implements CounselorDirectory {
  readonly activeCounselorIds = new Set<string>();

  verifyCounselorPassword(): Promise<{ userId: string; mustResetPassword: boolean; displayName: string } | null> {
    return Promise.resolve(null);
  }

  findActiveCounselorIdByEmail(): Promise<string | null> {
    return Promise.resolve(null);
  }

  updatePassword(): Promise<void> {
    return Promise.resolve();
  }

  clearMustResetPassword(): Promise<void> {
    return Promise.resolve();
  }

  isActiveCounselor(userId: string): Promise<boolean> {
    return Promise.resolve(this.activeCounselorIds.has(userId));
  }
}

const EMPTY_EXTRAS: CounselorStudentReportExtras = {
  profileAnswers: { current_stream: "science" },
  matches: { career: [], stream: [], pathway: [] },
};

class FakeCounselorStudentRepository implements CounselorStudentRepository {
  constructor(
    private readonly result: CounselorStudentListResult,
    public lastFilters: CounselorStudentListFilters | null = null,
  ) {}

  listStudents(filters: CounselorStudentListFilters): Promise<CounselorStudentListResult> {
    this.lastFilters = filters;
    return Promise.resolve(this.result);
  }

  findReportExtras(): Promise<CounselorStudentReportExtras> {
    return Promise.resolve(EMPTY_EXTRAS);
  }
}

class FakeUserProfileRepository implements UserProfileRepository {
  constructor(private readonly profiles: Map<string, UserProfile>) {}

  upsert(): Promise<UserProfile> {
    throw new Error("not used by this test");
  }

  findByUserId(userId: string): Promise<UserProfile | null> {
    return Promise.resolve(this.profiles.get(userId) ?? null);
  }
}

const notUsed = () => Promise.reject(new Error("not used by this test"));

class FakeAssessmentRepository implements AssessmentRepository {
  constructor(private readonly result: AssessmentResult | null) {}

  findActiveVersion = notUsed;
  createRun = notUsed;
  findRunByIdForUser = notUsed;
  findLatestRunForUser = notUsed;
  listRunItems = notUsed;
  listAnsweredItemIds = notUsed;
  findItemForRun = notUsed;
  findOptionForItem = notUsed;
  upsertResponse = notUsed;
  updateRunProgress = notUsed;
  listScoringResponses = notUsed;
  createResult = notUsed;
  findResultByRunForUser = notUsed;
  findLatestResultByUserForInstrument = notUsed;
  getIntakeSummary = notUsed;
  getNextProfileVersion = notUsed;
  createAssessmentSnapshot = notUsed;

  findLatestRiasecResultForUser(): Promise<AssessmentResult | null> {
    return Promise.resolve(this.result);
  }
}

const profile: UserProfile = {
  userId: "11111111-1111-4111-8111-111111111111",
  firstName: "Divya",
  ageAtOnboarding: 17,
  ageBand: "minor_16_17",
  city: "Chennai",
  state: "Tamil Nadu",
  countryCode: "IN",
  segment: "pathfinder",
  selfStage: "higher_secondary",
  profileStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

describe("CounselorStudentService", () => {
  it("lists students and forwards filters for an active counselor", async () => {
    const counselorDirectory = new FakeCounselorDirectory();
    counselorDirectory.activeCounselorIds.add("counselor-1");
    const listResult: CounselorStudentListResult = {
      students: [{ userId: profile.userId, firstName: profile.firstName, segment: profile.segment, status: "completed" }],
      counts: { all: 1, completed: 1, inProgress: 0, notStarted: 0 },
    };
    const repository = new FakeCounselorStudentRepository(listResult);
    const service = new CounselorStudentService({
      counselorDirectory,
      repository,
      assessmentRepository: new FakeAssessmentRepository(null),
      userProfileRepository: new FakeUserProfileRepository(new Map()),
    });

    await expect(
      service.listStudents("counselor-1", { search: "Divya", status: "completed" }),
    ).resolves.toEqual(listResult);
    expect(repository.lastFilters).toEqual({ search: "Divya", status: "completed" });
  });

  it("rejects listStudents for a userId that is not an active counselor", async () => {
    const counselorDirectory = new FakeCounselorDirectory();
    const repository = new FakeCounselorStudentRepository({
      students: [],
      counts: { all: 0, completed: 0, inProgress: 0, notStarted: 0 },
    });
    const service = new CounselorStudentService({
      counselorDirectory,
      repository,
      assessmentRepository: new FakeAssessmentRepository(null),
      userProfileRepository: new FakeUserProfileRepository(new Map()),
    });

    await expect(service.listStudents("not-a-counselor", {})).rejects.toMatchObject({
      code: "counselor_not_authorized",
      statusCode: 401,
    });
  });

  it("returns a student's profile summary plus their latest RIASEC result", async () => {
    const counselorDirectory = new FakeCounselorDirectory();
    counselorDirectory.activeCounselorIds.add("counselor-1");
    const result: AssessmentResult = {
      id: "33333333-3333-4333-8333-333333333333",
      assessmentRunId: "44444444-4444-4444-8444-444444444444",
      userId: profile.userId,
      instrumentCode: "ip_60",
      instrumentVersion: "1",
      algorithmVersion: "1",
      rawScores: { R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 },
      normalizedScores: { R: 0.1, I: 0.1, A: 0.1, S: 0.1, E: 0.1, C: 0.1 },
      resultCode: "IAS",
      confidence: "normal",
      closeScores: false,
      qcSummary: {},
      inputHash: "hash-in",
      outputHash: "hash-out",
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    const service = new CounselorStudentService({
      counselorDirectory,
      repository: new FakeCounselorStudentRepository({
        students: [],
        counts: { all: 0, completed: 0, inProgress: 0, notStarted: 0 },
      }),
      assessmentRepository: new FakeAssessmentRepository(result),
      userProfileRepository: new FakeUserProfileRepository(new Map([[profile.userId, profile]])),
    });

    await expect(service.getStudentReport("counselor-1", profile.userId)).resolves.toEqual({
      profile: {
        userId: profile.userId,
        firstName: profile.firstName,
        segment: profile.segment,
        ageAtOnboarding: 17,
        city: "Chennai",
        state: "Tamil Nadu",
        countryCode: "IN",
      },
      result,
      profileAnswers: { current_stream: "science" },
      matches: { career: [], stream: [], pathway: [] },
    });
  });

  it("rejects getStudentReport for a student that doesn't exist", async () => {
    const counselorDirectory = new FakeCounselorDirectory();
    counselorDirectory.activeCounselorIds.add("counselor-1");
    const service = new CounselorStudentService({
      counselorDirectory,
      repository: new FakeCounselorStudentRepository({
        students: [],
        counts: { all: 0, completed: 0, inProgress: 0, notStarted: 0 },
      }),
      assessmentRepository: new FakeAssessmentRepository(null),
      userProfileRepository: new FakeUserProfileRepository(new Map()),
    });

    await expect(
      service.getStudentReport("counselor-1", "99999999-9999-4999-8999-999999999999"),
    ).rejects.toMatchObject({ code: "counselor_student_not_found", statusCode: 404 });
  });
});
