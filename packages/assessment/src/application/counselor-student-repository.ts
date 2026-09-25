import type { CounselorReportMatch, CounselorStudentStatus, Segment } from "@yuvapath/contracts";

export type CounselorStudentRecord = {
  userId: string;
  firstName: string;
  segment: Segment;
  status: CounselorStudentStatus;
};

export type CounselorStudentListFilters = {
  search?: string;
  status?: "all" | "completed" | "in_progress" | "not_started";
};

export type CounselorStudentListResult = {
  students: CounselorStudentRecord[];
  counts: { all: number; completed: number; inProgress: number; notStarted: number };
};

export type CounselorStudentReportExtras = {
  /** Single-value intake answers by question key, only for the keys asked for. */
  profileAnswers: Record<string, string>;
  matches: {
    career: CounselorReportMatch[];
    stream: CounselorReportMatch[];
    pathway: CounselorReportMatch[];
  };
};

/**
 * Port onto the per-row student list a counselor's "View Students" screen (Figma node 888:8336)
 * shows. See PgCounselorStudentRepository for the exact status derivation, which reuses the same
 * 3-way split PgCounselorDashboardRepository's aggregate stats already compute.
 */
export type CounselorStudentRepository = {
  listStudents(filters: CounselorStudentListFilters): Promise<CounselorStudentListResult>;
  /** Read-only extras for one student's Report Card (see PgCounselorStudentRepository). */
  findReportExtras(
    userId: string,
    answerKeys: readonly string[],
  ): Promise<CounselorStudentReportExtras>;
};
