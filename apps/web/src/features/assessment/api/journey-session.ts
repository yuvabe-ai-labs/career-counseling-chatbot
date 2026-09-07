import {
  JourneySessionResponseSchema,
  type CreateJourneySessionRequest,
} from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/** POST /api/v1/journey-sessions — requires x-yuvanext-user-id (attached automatically by apiRequest). */
export function createJourneySession(input: CreateJourneySessionRequest = {}) {
  return apiRequest("/api/v1/journey-sessions", JourneySessionResponseSchema, {
    method: "POST",
    body: input,
  });
}

/** GET /api/v1/journey-sessions/:sessionId — used to resume after a reload. */
export function getJourneySession(sessionId: string) {
  return apiRequest(`/api/v1/journey-sessions/${sessionId}`, JourneySessionResponseSchema);
}

/** POST /api/v1/journey-sessions/:sessionId/resume */
export function resumeJourneySession(sessionId: string) {
  return apiRequest(`/api/v1/journey-sessions/${sessionId}/resume`, JourneySessionResponseSchema, {
    method: "POST",
  });
}
