import {
  IntakeAnswerResponseSchema,
  IntakeQuestionsResponseSchema,
  UpsertIntakeAnswerRequestSchema,
  type UpsertIntakeAnswerRequest,
} from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * GET /api/v1/journey-sessions/:sessionId/intake/questions — already segment-filtered
 * server-side (IntakeService.getQuestions -> the student's own UserProfile.segment, packages/
 * assessment/src/application/intake-service.ts), so the frontend never chooses or filters by
 * segment itself. Returns the approved question set for whichever segment the profile behind
 * this journey session actually has — explorer/pathfinder/launcher each get a different count.
 */
export function getIntakeQuestions(sessionId: string) {
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/intake/questions`,
    IntakeQuestionsResponseSchema,
  );
}

/** PUT /api/v1/journey-sessions/:sessionId/intake/answers/:questionId */
export function upsertIntakeAnswer(
  sessionId: string,
  questionId: string,
  input: UpsertIntakeAnswerRequest,
) {
  UpsertIntakeAnswerRequestSchema.parse(input);
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/intake/answers/${questionId}`,
    IntakeAnswerResponseSchema,
    {
      method: "PUT",
      body: input,
    },
  );
}
