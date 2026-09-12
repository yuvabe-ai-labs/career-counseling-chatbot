import { useQuery } from "@tanstack/react-query";
import { getStreamRecommendations } from "../api/stream";

export function useStreamRecommendations(profileSnapshotId: string | null) {
  return useQuery({
    queryKey: ["stream-recommendations", profileSnapshotId],
    queryFn: () => getStreamRecommendations(profileSnapshotId as string),
    enabled: profileSnapshotId !== null,
    retry: false,
  });
}
