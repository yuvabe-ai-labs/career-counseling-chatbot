import { useQuery } from "@tanstack/react-query";
import { getCareerRecommendations } from "../api/career";

export function useCareerRecommendations(profileSnapshotId: string | null) {
  return useQuery({
    queryKey: ["career-recommendations", profileSnapshotId],
    queryFn: () => getCareerRecommendations(profileSnapshotId as string),
    enabled: profileSnapshotId !== null,
    retry: false,
  });
}
