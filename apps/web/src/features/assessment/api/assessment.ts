import {
  AssessmentNextResponseSchema,
  AssessmentResponseSaveResponseSchema,
  AssessmentResultResponseSchema,
  AssessmentRunResponseSchema,
  StartAssessmentRunRequestSchema,
  SubmitAssessmentResponseRequestSchema,
  type StartAssessmentRunRequest,
  type SubmitAssessmentResponseRequest,
} from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * POST /api/v1/journey-sessions/:sessionId/assessment-runs — starts the RIASEC run. No
 * `instrumentCode` override is ever sent: AssessmentService.startRun (packages/assessment)
 * derives the instrument from the student's own profile segment via `selectDefaultInstrument`
 * (explorer -> mini_ip_30, pathfinder/launcher -> ip_60) — the frontend never chooses or
 * hardcodes which RIASEC instrument belongs to which segment.
 */
export function startAssessmentRun(
  sessionId: string,
  input: StartAssessmentRunRequest = { language: "en" },
) {
  StartAssessmentRunRequestSchema.parse(input);
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/assessment-runs`,
    AssessmentRunResponseSchema,
    {
      method: "POST",
      body: input,
    },
  );
}

/**
 * GET /api/v1/assessment-runs/:runId/next — the next unanswered item(s) plus exact progress,
 * respecting the item's own `display_order` and the run's segment-based batch size
 * (AssessmentService.getNext: explorer batches of 5, otherwise 10) entirely server-side.
 */
export function getNextAssessmentBatch(runId: string) {
  return apiRequest(`/api/v1/assessment-runs/${runId}/next`, AssessmentNextResponseSchema);
}

/**
 * PUT /api/v1/assessment-runs/:runId/responses — idempotent upsert on (assessment_run_id,
 * item_id); the response body's own `next` field is the same shape getNextAssessmentBatch
 * returns, already reflecting this answer, so callers don't need a follow-up GET.
 */
export function submitAssessmentResponse(runId: string, input: SubmitAssessmentResponseRequest) {
  SubmitAssessmentResponseRequestSchema.parse(input);
  return apiRequest(
    `/api/v1/assessment-runs/${runId}/responses`,
    AssessmentResponseSaveResponseSchema,
    {
      method: "PUT",
      body: input,
    },
  );
}

/**
 * POST /api/v1/assessment-runs/:runId/score — deterministic RIASEC scoring
 * (scoreAssessmentResponses, packages/assessment/src/domain/scoring.ts). Idempotent: if a
 * result already exists for this run, AssessmentService.scoreRun returns that existing result
 * instead of re-scoring, so the results page can safely call this itself on every visit rather
 * than needing the assessment page to hand the result off via navigation state.
 */
export function scoreAssessmentRun(runId: string) {
  return apiRequest(`/api/v1/assessment-runs/${runId}/score`, AssessmentResultResponseSchema, {
    method: "POST",
  });
}
