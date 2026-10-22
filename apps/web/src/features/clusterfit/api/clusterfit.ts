import {
  ClusterfitCaptureResponseSchema,
  ClusterfitCompleteSituationResponseSchema,
  ClusterfitCoverageResponseSchema,
  ClusterfitLiveTokenResponseSchema,
  ClusterfitPartItemsResponseSchema,
  ClusterfitSessionResponseSchema,
  ClusterfitSituationResponseSchema,
  ClusterfitStudentResultResponseSchema,
  ClusterfitWellbeingResponseSchema,
  SaveClusterfitResponseResponseSchema,
  type ClusterfitPart,
  type ClusterfitTranscript,
  type ClusterfitValuesRanking,
} from "@yuvapath/contracts";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

const BASE = "/api/v1/clusterfit";
const session = (sessionId: string) => `${BASE}/sessions/${sessionId}`;

/** POST /clusterfit/sessions: starts, or resumes the latest session (idempotent on the key). */
export const startClusterfitSession = (idempotencyKey: string, journeySessionId?: string | null) =>
  apiRequest(`${BASE}/sessions`, ClusterfitSessionResponseSchema, {
    method: "POST",
    body: { idempotencyKey, ...(journeySessionId ? { journeySessionId } : {}) },
  });

export const getClusterfitPartItems = (sessionId: string, part: ClusterfitPart) =>
  apiRequest(`${session(sessionId)}/parts/${part}/items`, ClusterfitPartItemsResponseSchema);

export const saveClusterfitAnswer = (
  sessionId: string,
  input: {
    itemKey: string;
    answer: string | number;
    latencyMs?: number;
    idempotencyKey: string;
  },
) =>
  apiRequest(`${session(sessionId)}/responses`, SaveClusterfitResponseResponseSchema, {
    method: "PUT",
    body: input,
  });

export const getClusterfitSituation = (sessionId: string) =>
  apiRequest(`${session(sessionId)}/situation`, ClusterfitSituationResponseSchema);

export const saveClusterfitSituation = (
  sessionId: string,
  input: { grade: 9 | 10 | 11 | 12; values?: ClusterfitValuesRanking },
) =>
  apiRequest(`${session(sessionId)}/situation`, ClusterfitSituationResponseSchema, {
    method: "PUT",
    body: input,
  });

/** Ends "About you" (chat finished, failed or skipped) and opens the activities. Safe to repeat. */
export const completeClusterfitSituation = (sessionId: string) =>
  apiRequest(
    `${session(sessionId)}/situation/complete`,
    ClusterfitCompleteSituationResponseSchema,
    {
      method: "PUT",
    },
  );

export const scoreClusterfitSession = (sessionId: string, idempotencyKey: string) =>
  apiRequest(`${session(sessionId)}/score`, z.object({ scored: z.literal(true) }), {
    method: "POST",
    body: { idempotencyKey },
  });

export const getClusterfitStudentResult = (sessionId: string) =>
  apiRequest(`${session(sessionId)}/result`, ClusterfitStudentResultResponseSchema);

// ─── Part A + E chat ─────────────────────────────────────────────────────────

export const getClusterfitLiveToken = (sessionId: string) =>
  apiRequest(`${session(sessionId)}/live-token`, ClusterfitLiveTokenResponseSchema, {
    method: "POST",
  });

export const checkClusterfitCoverage = (sessionId: string, transcript: ClusterfitTranscript) =>
  apiRequest(`${session(sessionId)}/situation/coverage`, ClusterfitCoverageResponseSchema, {
    method: "POST",
    body: { transcript },
  });

export const captureClusterfitSituation = (
  sessionId: string,
  input: { transcript: ClusterfitTranscript; idempotencyKey: string; wellbeingFlagged: boolean },
) =>
  apiRequest(`${session(sessionId)}/situation-captures`, ClusterfitCaptureResponseSchema, {
    method: "POST",
    body: input,
  });

export const getClusterfitWellbeingMessage = (sessionId: string, idempotencyKey: string) =>
  apiRequest(`${session(sessionId)}/situation/wellbeing`, ClusterfitWellbeingResponseSchema, {
    method: "POST",
    body: { idempotencyKey },
  });
