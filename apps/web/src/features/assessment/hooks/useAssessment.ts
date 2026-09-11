import { useMutation, useQuery } from "@tanstack/react-query";
import type { SubmitAssessmentResponseRequest } from "@yuvanext/contracts";
import { createAssessmentSnapshot } from "../api/assessment-snapshot";
import {
  getNextAssessmentBatch,
  scoreAssessmentRun,
  startAssessmentRun,
  submitAssessmentResponse,
} from "../api/assessment";

export function useStartAssessmentRun(sessionId: string) {
  return useMutation({ mutationFn: () => startAssessmentRun(sessionId) });
}

/**
 * Exported so RiasecAssessmentPage can write a PUT response's own `next` field straight into
 * this query's cache (`queryClient.setQueryData`) after submitting an answer, instead of
 * keeping a second, separate copy of "the current batch" in local state and an effect to keep
 * the two in sync.
 */
export const assessmentNextQueryKey = (runId: string | null) => ["assessment-next", runId] as const;

export function useNextAssessmentBatch(runId: string | null) {
  return useQuery({
    queryKey: assessmentNextQueryKey(runId),
    queryFn: () => getNextAssessmentBatch(runId as string),
    enabled: runId !== null,
    // A 404/409 here (stale/expired/inactive run) isn't transient — RiasecAssessmentPage's own
    // stale-run recovery (drop the id, start a fresh run) is what actually fixes it, so the
    // default retry would just add a multi-second delay before that kicks in for no benefit.
    retry: false,
  });
}

export function useSubmitAssessmentResponse(runId: string) {
  return useMutation({
    mutationFn: (input: SubmitAssessmentResponseRequest) => submitAssessmentResponse(runId, input),
  });
}

/**
 * A `useQuery`, even though `POST .../score` is the underlying call — from the results page's
 * point of view this is just "fetch the result for this run", and scoreAssessmentRun is safe to
 * call repeatedly (see api/assessment.ts's comment), so the usual query caching/dedup behavior
 * is exactly what's wanted here rather than a mutation the page has to trigger imperatively.
 */
export function useAssessmentResult(runId: string | null) {
  return useQuery({
    queryKey: ["assessment-result", runId],
    queryFn: () => scoreAssessmentRun(runId as string),
    enabled: runId !== null,
    retry: false,
  });
}

/**
 * Not idempotent on the backend (see api/assessment-snapshot.ts) — callers must check
 * `getStoredProfileSnapshotId()` before calling `mutateAsync`, same guard pattern
 * `getStoredAssessmentRunId` already uses for `useStartAssessmentRun`.
 */
export function useCreateAssessmentSnapshot(sessionId: string, runId: string) {
  return useMutation({ mutationFn: () => createAssessmentSnapshot(sessionId, runId) });
}
