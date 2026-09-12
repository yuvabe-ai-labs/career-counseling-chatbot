import { PathwayRecommendationSetResponseSchema } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * POST /api/v1/recommendations/pathways — deterministic pathway matching
 * (buildPathwayRecommendationSet, packages/recommendations/src/domain/pathway-recommendations.ts).
 * `rankedCareerIds`/`rankedStreamIds` are left for the backend to resolve from this profile's
 * own most recent completed career/stream runs (recommendation-data-source.ts's
 * loadLatestRankedEntityIds) rather than the frontend re-deriving them — same
 * minimal-body pattern as career.ts/stream.ts.
 */
export function getPathwayRecommendations(profileSnapshotId: string) {
  return apiRequest(
    "/api/v1/recommendations/pathways",
    PathwayRecommendationSetResponseSchema,
    { method: "POST", body: { profileSnapshotId } },
  );
}
