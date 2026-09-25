import {
  CounselorStudentListResponseSchema,
  CounselorStudentReportResponseSchema,
} from "@yuvapath/contracts";
import { apiRequest } from "@/lib/api-client";

export type CounselorStudentListFilters = {
  search?: string;
  status?: "all" | "completed" | "in_progress" | "not_started";
};

/** GET /api/v1/counselor/students — authenticated via x-yuvapath-counselor-id. */
export function getCounselorStudents(filters: CounselorStudentListFilters) {
  return apiRequest("/api/v1/counselor/students", CounselorStudentListResponseSchema, {
    auth: "counselor",
    query: { search: filters.search, status: filters.status },
  });
}

/** GET /api/v1/counselor/students/:studentId/report — authenticated via x-yuvapath-counselor-id. */
export function getCounselorStudentReport(studentId: string) {
  return apiRequest(
    `/api/v1/counselor/students/${studentId}/report`,
    CounselorStudentReportResponseSchema,
    { auth: "counselor" },
  );
}
