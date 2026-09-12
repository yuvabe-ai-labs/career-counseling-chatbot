import { useQuery } from "@tanstack/react-query";
import { getPathwayRecommendations } from "../api/pathway";

export function usePathwayRecommendations(profileSnapshotId: string | null) {
  return useQuery({
    queryKey: ["pathway-recommendations", profileSnapshotId],
    queryFn: () => getPathwayRecommendations(profileSnapshotId as string),
    enabled: profileSnapshotId !== null,
    retry: false,
  });
}
