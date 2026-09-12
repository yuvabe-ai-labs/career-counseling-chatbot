import { StreamRecommendationSetResponseSchema } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * POST /api/v1/recommendations/streams — deterministic stream matching
 * (buildStreamRecommendationSet, packages/recommendations/src/domain/stream-recommendations.ts).
 * Same minimal-body pattern as career.ts: the backend resolves the profile, the active
 * `stream_rank` config, and the published stream catalog (segment-aware — see
 * recommendation-data-source.ts's loadStreams()) from `profileSnapshotId` alone.
 */
export function getStreamRecommendations(profileSnapshotId: string) {
  return apiRequest(
    "/api/v1/recommendations/streams",
    StreamRecommendationSetResponseSchema,
    { method: "POST", body: { profileSnapshotId } },
  );
}
