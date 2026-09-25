import type { CollegeOwnership, TnDistrict } from "@yuvapath/contracts";
import { CollegeRecommendationSetResponseSchema } from "@yuvapath/contracts";
import { apiRequest } from "@/lib/api-client";

export type CollegeFilters = {
  programType?: string;
  instituteKind?: string;
  ownership?: CollegeOwnership;
  admissionRoute?: string;
  /** A hard filter: only colleges in this district are returned (the backend's `district`
   *  field, applied in resolveEligibleColleges). The student must pick one on the College screen
   *  before anything is requested. */
  district?: TnDistrict;
};

/**
 * POST /api/v1/recommendations/colleges — eligible Tamil Nadu colleges (offer a programme in the
 * target pathway's discipline, and match every selected filter, including the district)
 * (buildCollegeRecommendationSet, packages/recommendations/src/domain/college-recommendations.ts).
 * `district`/`programType`/`instituteKind`/`ownership`/`admissionRoute` are all hard filters that
 * can exclude a college. `targetDisciplineIds`/`targetPathwayId` are left for the backend to
 * resolve from this profile's own most recent pathway run. Filters are omitted from the body
 * entirely when unset, matching the backend's cache-key handling (an unselected filter must not
 * affect the input hash). The backend's ranking-only `homeDistrict` is no longer sent by the web
 * app.
 */
export function getCollegeRecommendations(profileSnapshotId: string, filters: CollegeFilters = {}) {
  return apiRequest(
    "/api/v1/recommendations/colleges",
    CollegeRecommendationSetResponseSchema,
    {
      method: "POST",
      body: {
        profileSnapshotId,
        ...(filters.programType ? { programType: filters.programType } : {}),
        ...(filters.instituteKind ? { instituteKind: filters.instituteKind } : {}),
        ...(filters.ownership ? { ownership: filters.ownership } : {}),
        ...(filters.admissionRoute ? { admissionRoute: filters.admissionRoute } : {}),
        ...(filters.district ? { district: filters.district } : {}),
      },
    },
  );
}
