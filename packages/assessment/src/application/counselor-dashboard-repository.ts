export type CounselorDashboardStats = {
  totalStudents: number;
  assessmentCompleted: number;
  assessmentInProgress: number;
};

/**
 * Port onto the read-side stats a counselor's dashboard shows (Figma node 779:1815). See
 * PgCounselorDashboardRepository for the exact per-student aggregation these numbers use.
 */
export type CounselorDashboardRepository = {
  getStats(): Promise<CounselorDashboardStats>;
};
