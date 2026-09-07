import { useEffect, useRef, useState, type UIEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import heroIllustration from "@/assets/hero-illustration.png";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/error-messages";
import { IntakeQuestionField } from "../components/IntakeQuestionField";
import { useIntakeQuestions, useUpsertIntakeAnswer } from "../hooks/useIntake";
import { useSession } from "../state/session-context";

type AnswerValue = string | string[];

const isAnswerEmpty = (value: AnswerValue | undefined): boolean =>
  value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/**
 * Intake Questions — Figma node 346:100. Reached from HomePage's Explore button. Renders
 * whichever segment-specific question set `GET .../intake/questions` returns for this journey
 * session (see api/intake.ts) — the count and content are never hardcoded here; explorer,
 * pathfinder, and launcher each render however many questions the backend actually sends back.
 *
 * This is the existing profile-intake question set (see docs/poc/module-1-user-profile-
 * assessment.md's "Routing and intake service"), not the RIASEC/psychometric assessment.
 * "Start Quiz" persists these intake answers via the existing PUT .../intake/answers/:questionId
 * route, then navigates to /riasec-assessment — RiasecAssessmentPage owns starting that
 * separate, segment-selected RIASEC run; this page has no involvement in that selection.
 */
export function IntakeQuestionsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const sessionId = session.journeySessionId;

  const questionsQuery = useIntakeQuestions(sessionId);
  const upsertAnswer = useUpsertIntakeAnswer(sessionId ?? "");
  // Separate mutation instance for the debounced save-as-you-go below (see scheduleAnswerSave) —
  // deliberately not sharing `upsertAnswer`'s pending state with it, so a background per-field
  // save never flips the "Start Quiz" button into its "Saving…" state; that button's loading
  // look is reserved for the deliberate final save it triggers itself.
  const backgroundSave = useUpsertIntakeAnswer(sessionId ?? "");

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Drives only the "Question X of Y" counter below — the scroll position itself is shown by the
  // fields column's own native scrollbar (styled purple via the scrollbar-brand class), not a
  // separate decorative bar.
  const [scrollFraction, setScrollFraction] = useState(0);

  const fieldsRef = useRef<HTMLDivElement | null>(null);
  // Guards the one-time "prefill from the server, then scroll to wherever the user left off"
  // sequence below so it never re-runs and clobbers in-progress edits (e.g. if the query quietly
  // refetches later) — resume is something that happens once, on arrival.
  const hasResumedRef = useRef(false);
  // Per-question debounce timers for save-as-you-go (see handleAnswerChange) — a fresh keystroke
  // in one field must not reset another field's pending save.
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const questions = questionsQuery.data?.questions ?? [];
  const total = questions.length;

  const updateScrollIndicator = () => {
    const el = fieldsRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    setScrollFraction(maxScroll > 0 ? el.scrollTop / maxScroll : 0);
  };

  // Re-measure once the questions actually render (their count/height determines whether the
  // fields column scrolls at all — see updateScrollIndicator).
  useEffect(() => {
    updateScrollIndicator();
  }, [total]);

  // Resume: the backend now includes this user's own previously-saved answers alongside the
  // questions themselves (see IntakeService.getQuestions / findAnswersForUser) — found by userId
  // alone, regardless of which journey session saved them, since a fresh one is minted every
  // sign-in. Runs once, the first time the questions actually arrive.
  useEffect(() => {
    const data = questionsQuery.data;
    if (!data || hasResumedRef.current) return;
    hasResumedRef.current = true;

    const seeded: Record<string, AnswerValue> = {};
    for (const answer of data.answers) {
      seeded[answer.questionId] = answer.answer.value;
    }
    setAnswers(seeded);

    // Already done in full (e.g. finishing on another device, or just returning after
    // completing everything) — same pattern as RiasecAssessmentPage's own "already complete"
    // redirect to results, one step earlier in the chain.
    const allRequiredAnswered = data.questions.every(
      (question) => !question.isRequired || !isAnswerEmpty(seeded[question.id]),
    );
    if (data.questions.length > 0 && allRequiredAnswered) {
      void navigate("/riasec-assessment", { replace: true });
      return;
    }

    // Otherwise, land on the first genuinely unanswered field instead of the top of the list —
    // by the time this effect runs the fields have already been committed to the DOM (this
    // effect fires off the same `questionsQuery.data` that `questions`/`total` above are also
    // derived from), so no extra render/RAF wait is needed.
    const firstUnansweredIndex = data.questions.findIndex((question) =>
      isAnswerEmpty(seeded[question.id]),
    );
    const container = fieldsRef.current;
    const target =
      firstUnansweredIndex > 0 ? container?.children[firstUnansweredIndex] : undefined;
    if (container && target instanceof HTMLElement) {
      container.scrollTop = target.offsetTop;
      updateScrollIndicator();
    }
  }, [questionsQuery.data, navigate]);

  // Clears any pending debounced saves — used both on unmount and right before the final
  // save-everything flush in handleSubmit, so a save-in-flight timer never fires twice.
  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  if (!session.userId || !sessionId) {
    return <Navigate to="/" replace />;
  }

  const currentQuestionNumber =
    total === 0 ? 0 : Math.min(total, Math.round(scrollFraction * (total - 1)) + 1);

  /**
   * Save-as-you-go: debounced per question (~500ms after the last edit to that specific field),
   * not per keystroke — a leaving-before-Start-Quiz page unload only loses whatever's still
   * mid-debounce, not everything typed so far. Best-effort: a failure here is silent (logged,
   * not surfaced) because handleSubmit's own save loop below is the authoritative, user-visible
   * save — it resends every answer right before navigating regardless of whether this one
   * already landed, so nothing is actually lost even if a background save here fails.
   */
  const scheduleAnswerSave = (questionId: string, value: AnswerValue) => {
    const timers = saveTimersRef.current;
    if (timers[questionId]) clearTimeout(timers[questionId]);
    timers[questionId] = setTimeout(() => {
      delete timers[questionId];
      backgroundSave.mutateAsync({ questionId, answer: { value } }).catch((error: unknown) => {
        console.error(error);
      });
    }, 500);
  };

  const handleAnswerChange = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setFieldErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    setSubmitted(false);
    setSubmitError(null);
    scheduleAnswerSave(questionId, value);
  };

  const handleSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    for (const question of questions) {
      if (question.isRequired && isAnswerEmpty(answers[question.id])) {
        nextErrors[question.id] = "This field is required.";
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitError(null);
    // Final flush: supersedes any still-pending debounced saves above, so cancel them rather
    // than let a stale timer fire a redundant (harmless, but pointless) save after this.
    for (const [questionId, timer] of Object.entries(saveTimersRef.current)) {
      clearTimeout(timer);
      delete saveTimersRef.current[questionId];
    }
    try {
      for (const question of questions) {
        const value = answers[question.id];
        if (value === undefined) continue;
        // Sequential, not Promise.all: (userId, sessionId, questionId) upserts share no
        // ordering guarantee server-side worth risking, and this is a handful of answers.
        await upsertAnswer.mutateAsync({ questionId: question.id, answer: { value } });
      }
      setSubmitted(true);
      void navigate("/riasec-assessment");
    } catch (error) {
      setSubmitError(getErrorMessage(error, "We couldn't save your answers. Please try again."));
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-page">
      <AppHeader />
      <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8 sm:py-14 lg:py-[56px]">
        <div className="w-full max-w-[1260px] animate-in rounded-[27px] border border-border bg-[rgba(224,215,250,0.37)] p-8 fade-in duration-300 sm:p-12 lg:min-h-[751px] lg:p-[64px]">
          {questionsQuery.isLoading ? (
            <LoadingState message="Loading your questions…" />
          ) : questionsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(questionsQuery.error, "We couldn't load your questions.")}
              onRetry={() => void questionsQuery.refetch()}
            />
          ) : (
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[472px_1fr] lg:gap-16">
              <div className="flex w-full flex-col items-start gap-6 lg:w-[472px]">
                <p className="font-display text-sm font-medium text-muted-foreground">
                  Question {currentQuestionNumber} of {total}
                </p>

                <div
                  ref={fieldsRef}
                  onScroll={(event: UIEvent<HTMLDivElement>) => {
                    void event;
                    updateScrollIndicator();
                  }}
                  // scrollbar-brand (index.css): the one real scrollbar here, styled purple —
                  // previously a decorative purple bar sat next to the browser's own unstyled
                  // (grey) scrollbar, showing two redundant scroll indicators at once.
                  className="scrollbar-brand flex max-h-[560px] w-full flex-col items-start gap-6 overflow-y-auto pr-1"
                >
                  {questions.map((question, index) => (
                    <IntakeQuestionField
                      key={question.id}
                      question={question}
                      displayIndex={index + 1}
                      value={answers[question.id]}
                      onChange={(value) => handleAnswerChange(question.id, value)}
                      error={fieldErrors[question.id]}
                    />
                  ))}
                </div>

                {submitError ? (
                  <p className="font-display text-xs font-normal text-destructive">{submitError}</p>
                ) : null}

                <Button
                  onClick={() => void handleSubmit()}
                  disabled={upsertAnswer.isPending || total === 0}
                  className="h-[49px] w-[151px] gap-2 rounded-2xl text-xl font-bold shadow-none"
                >
                  {upsertAnswer.isPending ? <Spinner className="size-[18px]" /> : null}
                  {upsertAnswer.isPending ? "Saving…" : "Start Quiz"}
                </Button>

                {submitted ? (
                  <p className="font-display text-sm font-medium text-brand">
                    Saved! Taking you to your assessment…
                  </p>
                ) : null}
              </div>

              <div className="flex h-full flex-col items-start justify-center gap-6">
                <div className="flex flex-col items-start gap-6">
                  <h1 className="font-display text-3xl leading-[1.2] font-semibold text-foreground sm:text-4xl">
                    Let&apos;s get to know <span className="text-brand">you!</span>
                  </h1>
                  <p className="font-display text-lg text-foreground sm:text-2xl">
                    Answer few questions to complete your profile
                  </p>
                </div>
                <div className="flex w-full justify-center">
                  <img
                    src={heroIllustration}
                    alt="Student sitting cross-legged with a laptop, books, a plant, and a backpack, with a graduation cap floating above her"
                    className="w-full max-w-[320px] object-contain sm:max-w-[378px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
