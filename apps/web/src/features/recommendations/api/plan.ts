import { PlanRecommendationSetResponseSchema } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * POST /api/v1/recommendations/plans — deterministic, template-based plan generation
 * (buildPlanRecommendationSet, packages/recommendations/src/domain/plan-generation.ts).
 * `target` is intentionally omitted: selectPlanTemplate() only requires one when a template
 * declares its own `targetEntityType`, and none of the three segments' currently-approved
 * templates (recommendation.plan_templates) do — so every segment's one approved template
 * (exploration / pathway / career_90_day) is selected from `profileSnapshotId` alone, same as
 * every other recommendation endpoint. Passing a real target (e.g. the student's top career)
 * would only make the template's own `{{targetTitle}}` placeholder more specific — not required
 * for a plan to generate at all.
 */
export function getPlanRecommendation(profileSnapshotId: string) {
  return apiRequest(
    "/api/v1/recommendations/plans",
    PlanRecommendationSetResponseSchema,
    { method: "POST", body: { profileSnapshotId } },
  );
}
