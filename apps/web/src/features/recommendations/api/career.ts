import { CareerRecommendationSetResponseSchema } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * POST /api/v1/recommendations/careers — deterministic career matching
 * (buildCareerRecommendationSet, packages/recommendations/src/domain/career-matching.ts).
 * Only `profileSnapshotId` is sent; the backend loads the profile, the active `career_match`
 * matching config, and the full published career catalog itself
 * (packages/recommendations/src/http/recommendation-routes.ts).
 */
export function getCareerRecommendations(profileSnapshotId: string) {
  return apiRequest(
    "/api/v1/recommendations/careers",
    CareerRecommendationSetResponseSchema,
    { method: "POST", body: { profileSnapshotId } },
  );
}
