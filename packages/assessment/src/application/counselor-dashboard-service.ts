import type { CounselorDashboardStatsResponse } from "@yuvapath/contracts";
import type { CounselorDashboardRepository } from "./counselor-dashboard-repository.js";
import type { CounselorDirectory } from "./counselor-directory.js";
import { counselorNotAuthorized } from "./errors.js";

export type CounselorDashboardServiceOptions = {
  counselorDirectory: CounselorDirectory;
  repository: CounselorDashboardRepository;
};

/**
 * Backs GET /api/v1/counselor/dashboard/stats. counselorId comes from the
 * x-yuvapath-counselor-id header (never trusted on its own — see CounselorDirectory), so every
 * call re-checks it still holds an active counselor role before reading any student data.
 */
export class CounselorDashboardService {
  private readonly counselorDirectory: CounselorDirectory;
  private readonly repository: CounselorDashboardRepository;

  constructor(options: CounselorDashboardServiceOptions) {
    this.counselorDirectory = options.counselorDirectory;
    this.repository = options.repository;
  }

  async getStats(counselorId: string): Promise<CounselorDashboardStatsResponse> {
    const isActive = await this.counselorDirectory.isActiveCounselor(counselorId);
    if (!isActive) {
      throw counselorNotAuthorized();
    }
    return this.repository.getStats();
  }
}
