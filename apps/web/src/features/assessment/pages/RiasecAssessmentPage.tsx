import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { AssessmentAnsweredItem, AssessmentNextResponse } from "@yuvanext/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiRequestError } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-messages";
import {
  clearStoredAssessmentRunId,
  getStoredAssessmentRunId,
  setStoredAssessmentRunId,
} from "@/lib/storage";
import { RiasecProgressTrack } from "../components/RiasecProgressTrack";
import { RiasecSlider } from "../components/RiasecSlider";
import {
  assessmentNextQueryKey,
  useNextAssessmentBatch,
  useStartAssessmentRun,
  useSubmitAssessmentResponse,
} from "../hooks/useAssessment";
import { useSession } from "../state/session-context";

/**
 * Resolves whichever question sits at `position` in run order — the reached-so-far answered
 * items (in display order) followed by the upcoming unanswered batch, split at
 * `data.progress.nextPosition` (the backend's own authoritative frontier — not inferred from
 * `answeredItems.length`, which a fixture/test double could supply out of sync with it). One
 * lookup covers both "reviewing a past question" and "the current unanswered one" so the rest of
 * the page doesn't need to know which case it's in.
 */
function itemAtPosition(
  data: AssessmentNextResponse | undefined,
  position: number | null,
): AssessmentAnsweredItem | undefined {
  if (!data || position === null) return undefined;
  if (position < data.progress.nextPosition) return data.answeredItems[position];
  const item = data.items[position - data.progress.nextPosition];
  return item ? { ...item, responseValue: null } : undefined;
}

/**
 * RIASEC assessment — reached from IntakeQuestionsPage's "Start Quiz". Question layout, slider,
 * and progress-track visuals are ported from the Lovable "Yuva Path Connect" prototype's quiz
 * screen (C:\Users\HP\Desktop\Yuva Path Connect\src\routes\quiz-questions.tsx and
 * src/components/quiz/{QuestionCard,EmojiSlider,ProgressDots}.tsx) — minus that prototype's
 * "Boba" mascot/toy element, which isn't part of this port.
 *
 * Everything about *which* assessment this is — instrument, segment, version, item order,
 * batch size, response persistence, completion, scoring — is owned entirely by the existing
 * backend (AssessmentService, packages/assessment). This page only ever calls:
 *   - POST .../assessment-runs to start (or resume, via the locally-stored runId — see
 *     lib/storage.ts's comment: startRun always creates a new run, so avoiding a second call is
 *     this page's job, not the backend's),
 *   - GET .../assessment-runs/:runId/next for the current question + progress,
 *   - PUT .../assessment-runs/:runId/responses to record an answer, whose own response already
 *     carries the updated `next` batch/progress — written straight into the query cache below,
 *     so there's no extra GET after each answer and no second, duplicate copy of that state.
 * Once the backend reports the run complete, this page hands off to RiasecResultsPage, which
 * owns the actual POST .../score call — this page never scores anything itself.
 *
 * Previous/edit: AssessmentService.getNext now also returns `answeredItems` — every already-
 * answered item, in order, with its saved value — so this page can page backward through
 * anything already reached and show/edit the saved answer, sourced from that same response, not
 * client-only state. `viewIndex` tracks which position is currently displayed, independent of
 * `progress.nextPosition` (the true unanswered frontier); see itemAtPosition above. Editing and
 * re-submitting a past item reuses the exact same PUT .../responses call as answering the
 * current one — the backend's upsert (unique on run+item) updates that item's row in place.
 */
export function RiasecAssessmentPage() {
  const navigate = useNavigate();
  const session = useSession();
  const sessionId = session.journeySessionId;
  const queryClient = useQueryClient();

  const [runId, setRunId] = useState(() => getStoredAssessmentRunId());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  // Which question is currently displayed — defaults to the frontier (progress.nextPosition) the
  // first time data arrives (see the effect below), then moves independently via Previous/Next
  // while reviewing already-answered questions.
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const startRun = useStartAssessmentRun(sessionId ?? "");
  const nextQuery = useNextAssessmentBatch(runId);
  const submitResponse = useSubmitAssessmentResponse(runId ?? "");

  // Guards against React effect double-invocation (StrictMode/dev) firing startRun twice before
  // the first response comes back and setRunId re-renders this effect's own dependency check.
  const startRequestedRef = useRef(false);
  // Identifies the Next/Finish and Previous buttons for handleKeyDown below — see its comment.
  const advanceButtonRef = useRef<HTMLButtonElement>(null);
  const previousButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sessionId || runId || startRequestedRef.current) return;
    startRequestedRef.current = true;
    startRun
      .mutateAsync()
      .then(({ run }) => {
        setStoredAssessmentRunId(run.id);
        setRunId(run.id);
      })
      .catch((error: unknown) => {
        startRequestedRef.current = false;
        setPageError(getErrorMessage(error, "We couldn't start your assessment. Please try again."));
      });
  }, [sessionId, runId, startRun]);

  // A stale runId (server restarted, run expired/abandoned) surfaces here as 404 on the first
  // GET — recover the same way OnboardingPage's withFreshPendingSessionRetry does: drop it and
  // let the effect above start a fresh run, instead of showing a dead end. Deferred to a
  // microtask rather than calling setRunId directly in the effect body, same as the pattern
  // react-hooks' set-state-in-effect check wants for a state change that's a *reaction* to
  // fetched data rather than a direct mirror of it.
  useEffect(() => {
    if (
      !runId ||
      !(nextQuery.error instanceof ApiRequestError) ||
      nextQuery.error.code !== "assessment_run_not_found"
    ) {
      return;
    }
    void Promise.resolve().then(() => {
      clearStoredAssessmentRunId();
      startRequestedRef.current = false;
      setRunId(null);
      setViewIndex(null);
    });
  }, [runId, nextQuery.error]);

  useEffect(() => {
    if (nextQuery.data?.progress.isComplete) {
      void navigate("/riasec-results");
    }
  }, [nextQuery.data, navigate]);

  // Lands on the true frontier (the next unanswered question) the first time data for this run
  // arrives — including on resume, since progress.nextPosition already reflects wherever the
  // backend says this run actually is. Only fires once per run: viewIndex only ever becomes
  // non-null here, and is reset back to null below whenever runId changes (a stale-run recovery
  // or a brand new run starting) so this can re-fire for that fresh run's own data.
  useEffect(() => {
    if (viewIndex !== null || !nextQuery.data) return;
    setViewIndex(nextQuery.data.progress.nextPosition);
  }, [viewIndex, nextQuery.data]);

  if (!session.userId || !sessionId) {
    return <Navigate to="/" replace />;
  }

  const current = nextQuery.data ?? null;
  const item = itemAtPosition(current ?? undefined, viewIndex) ?? null;
  const progress = current?.progress ?? null;
  const questionNumber = viewIndex !== null ? viewIndex + 1 : 0;
  const total = progress?.total ?? 0;
  const isReviewingPastQuestion = progress !== null && viewIndex !== null && viewIndex < progress.nextPosition;
  const isLastQuestion =
    progress !== null && !isReviewingPastQuestion && progress.nextPosition === progress.total - 1;
  const canGoBack = viewIndex !== null && viewIndex > 0 && !submitResponse.isPending;

  const handlePrevious = () => {
    if (viewIndex === null || viewIndex <= 0 || submitResponse.isPending) return;
    const targetIndex = viewIndex - 1;
    const targetItem = itemAtPosition(current ?? undefined, targetIndex);
    setPageError(null);
    setViewIndex(targetIndex);
    // The saved answer for a reached question appears pre-selected and editable, straight from
    // the backend's own response value — never a leftover client-only selection.
    setSelectedIndex(targetItem?.responseValue != null ? targetItem.responseValue - 1 : null);
  };

  const handleAdvance = async () => {
    if (!runId || !item || !progress || selectedIndex === null || submitResponse.isPending) return;
    setPageError(null);
    try {
      const saved = await submitResponse.mutateAsync({
        itemId: item.id,
        // RiasecSlider works in a 0-4 display index; the backend's own 1-5 Likert scale
        // (SubmitAssessmentResponseRequestSchema) is just index + 1. Works identically whether
        // this item was already answered (editing — the backend upserts in place) or is the
        // current frontier item (answering for the first time).
        responseValue: selectedIndex + 1,
      });
      queryClient.setQueryData(assessmentNextQueryKey(runId), saved.next);

      if (viewIndex !== null && viewIndex < progress.nextPosition) {
        // Was reviewing a past question — step forward one, back toward (or right up against)
        // the frontier, rather than jumping straight to wherever the frontier itself now is.
        const nextViewIndex = viewIndex + 1;
        const nextItem = itemAtPosition(saved.next, nextViewIndex);
        setViewIndex(nextViewIndex);
        setSelectedIndex(nextItem?.responseValue != null ? nextItem.responseValue - 1 : null);
      } else {
        // Was at the true frontier — follow it forward, exactly as before this feature existed.
        setViewIndex(saved.next.progress.nextPosition);
        setSelectedIndex(null);
      }
    } catch (error) {
      setPageError(getErrorMessage(error, "We couldn't save your answer. Please try again."));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Not a <form>, so Enter has no native submit behavior to guard against here — this handler
    // is the only thing Enter does on this page, and only once an answer is actually selected.
    //
    // Only skip when focus is already on the Next/Finish or Previous buttons themselves — Enter
    // there already triggers their own onClick natively, so handling it here too would
    // double-fire (or, for Previous, fire a save the user didn't ask for). Any other focus
    // target must still work, most importantly RiasecSlider's response-label buttons
    // ("Dislike"/"Like"/etc.): clicking one to answer is the normal path and leaves that
    // <button> focused, so excluding *all* buttons here (an earlier version of this check) left
    // Enter doing nothing right after the single most common way of answering a question.
    if (event.key !== "Enter") return;
    if (event.target === advanceButtonRef.current || event.target === previousButtonRef.current) {
      return;
    }
    if (selectedIndex === null || submitResponse.isPending) return;
    event.preventDefault();
    void handleAdvance();
  };

  const isLoading = !current && !pageError;

  return (
    <main
      className="flex min-h-screen flex-col bg-[linear-gradient(135deg,#ffffff_0%,#f2eefc_50%,rgba(224,215,250,0.37)_100%)]"
      onKeyDown={handleKeyDown}
    >
      <AppHeader />
      <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8 sm:py-14 lg:py-[56px]">
        <div className="flex w-full max-w-[1260px] animate-in flex-col items-center justify-center gap-8 rounded-[27px] border border-border p-8 fade-in duration-300 sm:p-12 lg:min-h-[560px] lg:p-[64px]">
          {pageError ? (
            <ErrorState message={pageError} onRetry={() => void nextQuery.refetch()} />
          ) : isLoading ? (
            <LoadingState message="Loading your assessment…" />
          ) : item && progress ? (
            <div
              key={item.id}
              className="flex w-full max-w-3xl animate-in flex-col items-center gap-6 fade-in duration-200"
            >
              <div className="w-full rounded-[1.6rem] bg-gradient-to-br from-brand/80 to-brand/30 p-[2px] shadow-soft">
                <article className="flex flex-col gap-4 rounded-[calc(1.6rem-2px)] bg-background px-5 py-5 sm:px-8 sm:py-6">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="shrink-0 border-b-2 border-brand pb-0.5 font-display text-base font-bold text-brand sm:text-lg">
                      {String(questionNumber).padStart(2, "0")}
                    </span>
                    <span className="h-8 w-px shrink-0 bg-brand/20" aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-left font-display text-lg font-bold leading-snug tracking-tight text-foreground sm:text-xl md:text-2xl">
                      {item.promptText}
                    </p>
                  </div>
                  <RiasecSlider
                    value={selectedIndex}
                    onChange={setSelectedIndex}
                    label={item.promptText ?? `Question ${questionNumber}`}
                  />
                </article>
              </div>

              <div className="flex w-full max-w-3xl flex-col items-center gap-2">
                <p className="font-display text-sm font-bold text-foreground sm:text-base">
                  Question {questionNumber} of {total}
                </p>
                <RiasecProgressTrack
                  total={total}
                  answeredCount={progress.answered}
                  current={viewIndex ?? progress.nextPosition}
                />
              </div>

              <div className="flex w-full max-w-3xl items-center justify-center gap-4">
                <Button
                  ref={previousButtonRef}
                  type="button"
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={!canGoBack}
                  className="h-[49px] w-[151px] gap-2 rounded-2xl text-base font-semibold shadow-none"
                >
                  <ArrowLeft className="size-[18px]" aria-hidden="true" />
                  Previous
                </Button>

                <Button
                  ref={advanceButtonRef}
                  onClick={() => void handleAdvance()}
                  disabled={selectedIndex === null || submitResponse.isPending}
                  className="h-[49px] w-[180px] gap-2 rounded-2xl text-base font-semibold shadow-none"
                >
                  {submitResponse.isPending ? "Saving…" : isLastQuestion ? "Finish" : "Next"}
                  {submitResponse.isPending ? (
                    <Spinner className="size-[18px]" />
                  ) : (
                    <ArrowRight className="size-[18px]" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
