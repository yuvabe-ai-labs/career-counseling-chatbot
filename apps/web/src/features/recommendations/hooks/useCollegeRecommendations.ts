import { useQuery } from "@tanstack/react-query";
import { getCollegeRecommendations } from "../api/college";

export function useCollegeRecommendations(profileSnapshotId: string | null) {
  return useQuery({
    queryKey: ["college-recommendations", profileSnapshotId],
    queryFn: () => getCollegeRecommendations(profileSnapshotId as string),
    enabled: profileSnapshotId !== null,
    retry: false,
  });
}
