import { CounselorDashboardStatsResponseSchema } from "@yuvapath/contracts";
import { apiRequest } from "@/lib/api-client";

/** GET /api/v1/counselor/dashboard/stats — authenticated via x-yuvapath-counselor-id. */
export function getCounselorDashboardStats() {
  return apiRequest("/api/v1/counselor/dashboard/stats", CounselorDashboardStatsResponseSchema, {
    auth: "counselor",
  });
}
