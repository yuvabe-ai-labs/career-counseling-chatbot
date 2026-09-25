import { describe, expect, it } from "vitest";
import { CounselorDashboardService } from "./counselor-dashboard-service.js";
import type { CounselorDashboardRepository, CounselorDashboardStats } from "./counselor-dashboard-repository.js";
import type { CounselorDirectory } from "./counselor-directory.js";

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

class FakeCounselorDashboardRepository implements CounselorDashboardRepository {
  constructor(private readonly stats: CounselorDashboardStats) {}

  getStats(): Promise<CounselorDashboardStats> {
    return Promise.resolve(this.stats);
  }
}

describe("CounselorDashboardService", () => {
  it("returns stats for a userId that currently holds an active counselor role", async () => {
    const counselorDirectory = new FakeCounselorDirectory();
    counselorDirectory.activeCounselorIds.add("counselor-1");
    const repository = new FakeCounselorDashboardRepository({
      totalStudents: 500,
      assessmentCompleted: 420,
      assessmentInProgress: 80,
    });
    const service = new CounselorDashboardService({ counselorDirectory, repository });

    await expect(service.getStats("counselor-1")).resolves.toEqual({
      totalStudents: 500,
      assessmentCompleted: 420,
      assessmentInProgress: 80,
    });
  });

  it("rejects a userId that is not an active counselor without querying the repository", async () => {
    const counselorDirectory = new FakeCounselorDirectory();
    const repository = new FakeCounselorDashboardRepository({
      totalStudents: 0,
      assessmentCompleted: 0,
      assessmentInProgress: 0,
    });
    const service = new CounselorDashboardService({ counselorDirectory, repository });

    await expect(service.getStats("not-a-counselor")).rejects.toMatchObject({
      code: "counselor_not_authorized",
      statusCode: 401,
    });
  });
});
