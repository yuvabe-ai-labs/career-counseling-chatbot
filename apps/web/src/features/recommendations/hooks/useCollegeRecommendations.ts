import { useQuery } from "@tanstack/react-query";
import { type CollegeFilters, getCollegeRecommendations } from "../api/college";

export function useCollegeRecommendations(profileSnapshotId: string | null, filters: CollegeFilters = {}) {
  return useQuery({
    queryKey: ["college-recommendations", profileSnapshotId, filters],
    queryFn: () => getCollegeRecommendations(profileSnapshotId as string, filters),
    enabled: profileSnapshotId !== null,
    retry: false,
  });
}
