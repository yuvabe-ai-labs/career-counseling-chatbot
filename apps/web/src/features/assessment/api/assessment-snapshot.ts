import { ProfileSnapshotResponseSchema } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * POST /api/v1/journey-sessions/:sessionId/assessment-runs/:runId/assessment-snapshot —
 * builds the immutable ProfileSnapshot (segment + intake summary + RIASEC result) that
 * `profileSnapshotId` for every recommendation call comes from
 * (`packages/assessment/src/application/assessment-service.ts`'s `buildAssessmentSnapshot`).
 *
 * NOT idempotent on the backend — each call creates a brand-new snapshot row (no existing-
 * snapshot lookup, unlike `scoreAssessmentRun`). Callers must guard against calling this more
 * than once per run themselves; see `getStoredProfileSnapshotId` in `@/lib/storage` and how
 * `RiasecResultsPage` uses it before calling this.
 */
export function createAssessmentSnapshot(sessionId: string, runId: string) {
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/assessment-runs/${runId}/assessment-snapshot`,
    ProfileSnapshotResponseSchema,
    { method: "POST" },
  );
}

// Deliberately no GET /api/v1/assessment-snapshots wrapper here: that route requires a real
// Supabase Auth bearer token (resolveUserId: createSupabaseUserResolver, apps/api/src/app/
// create-assessment-runtime.ts) — a different auth model than the x-yuvanext-user-id header
// apiRequest sends everywhere else in this app, and one the frontend doesn't implement at all.
// Calling it from here would just 401. The Explore Path screens instead store the gating
// fields (segment/wantsAid/currentGoal) from this POST's own response — see
// setStoredExploreGatingContext in @/lib/storage — rather than re-fetching the snapshot later.
