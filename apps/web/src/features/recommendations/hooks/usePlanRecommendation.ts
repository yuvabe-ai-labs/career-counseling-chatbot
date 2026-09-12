import { useQuery } from "@tanstack/react-query";
import { getPlanRecommendation } from "../api/plan";

export function usePlanRecommendation(profileSnapshotId: string | null) {
  return useQuery({
    queryKey: ["plan-recommendation", profileSnapshotId],
    queryFn: () => getPlanRecommendation(profileSnapshotId as string),
    enabled: profileSnapshotId !== null,
    retry: false,
  });
}
