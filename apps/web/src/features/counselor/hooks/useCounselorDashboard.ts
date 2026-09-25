import { useQuery } from "@tanstack/react-query";
import { getCounselorDashboardStats } from "../api/counselor-dashboard";

export function useCounselorDashboardStats(enabled: boolean) {
  return useQuery({
    queryKey: ["counselor-dashboard-stats"],
    queryFn: getCounselorDashboardStats,
    enabled,
    retry: false,
  });
}
