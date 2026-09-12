import { CollegeRecommendationSetResponseSchema } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * POST /api/v1/recommendations/colleges — deterministic college ranking
 * (buildCollegeRecommendationSet, packages/recommendations/src/domain/college-recommendations.ts).
 * `targetDisciplineIds`/`targetPathwayId` are left for the backend to resolve from this
 * profile's own most recent pathway run; `selectedState`/`neighboringStates` are left for the
 * backend to derive from the student's own `location_preference` intake answer via
 * `resolveGeoScope()` (recommendation-routes.ts) — same minimal-body pattern as the other
 * recommendation endpoints, no geography logic duplicated on the frontend.
 */
export function getCollegeRecommendations(profileSnapshotId: string) {
  return apiRequest(
    "/api/v1/recommendations/colleges",
    CollegeRecommendationSetResponseSchema,
    { method: "POST", body: { profileSnapshotId } },
  );
}
