import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClusterfitSession } from "@yuvapath/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { useSession } from "@/features/assessment/state/session-context";
import { scoreClusterfitSession, startClusterfitSession } from "../api/clusterfit";
import { ItemsStep } from "../components/ItemsStep";
import { SituationStep } from "../components/SituationStep";
import { getClusterfitStartKey, setStoredClusterfitSessionId } from "../lib/clusterfit-storage";
import { STEP_LABELS } from "../lib/copy";
import { cn } from "@/lib/utils";

type Step = "A" | "B" | "C" | "D";
const ORDER: Step[] = ["A", "B", "C", "D"];

/** First step that still needs answers (plan §18: chat → B → C → D). Every item is required. */
const firstOpenStep = (session: ClusterfitSession): Step => {
  if (!session.gradePath) return "A";
  const { B, C } = session.progress;
  if (B.answered < B.total) return "B";
  if (C.answered < C.total) return "C";
  return "D";
};

/**
 * /clusterfit: the whole flow on one route. Every answer is on the server, so a reload resumes at
 * the first open step.
 */
export function ClusterfitPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const studentSession = useSession();
  const [chosenStep, setStep] = useState<Step | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sessionQuery = useQuery({
    // Keyed by student: a cached session must never be shown to another student in this browser.
    queryKey: ["clusterfit", studentSession.userId, "session"],
    queryFn: () => startClusterfitSession(getClusterfitStartKey(), studentSession.journeySessionId),
    enabled: Boolean(studentSession.userId),
    retry: false,
  });
  const session = sessionQuery.data?.session;
  const step: Step | null = chosenStep ?? (session ? firstOpenStep(session) : null);

  useEffect(() => {
    if (!session) return;
    setStoredClusterfitSessionId(session.sessionId);
    if (session.status === "scored") void navigate("/clusterfit/results", { replace: true });
  }, [session, navigate]);

  if (!studentSession.userId) return <Navigate to="/" replace />;

  const go = (target: Step) => {
    setStep(target);
    window.scrollTo({ top: 0 });
  };
  const next = (from: Step) => go(ORDER[ORDER.indexOf(from) + 1] ?? "D");
  const back = (from: Step) => go(ORDER[Math.max(0, ORDER.indexOf(from) - 1)] ?? "A");

  const submit = async () => {
    if (!session) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await scoreClusterfitSession(session.sessionId, crypto.randomUUID());
      void navigate("/clusterfit/results");
    } catch (caught) {
      setSubmitError(getErrorMessage(caught));
      setSubmitting(false);
    }
  };

  return (
    <main className="bg-hero-gradient flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 justify-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex w-full max-w-4xl animate-in flex-col gap-6 duration-300 fade-in">
          {sessionQuery.isError ? (
            <ErrorState
              message={getErrorMessage(sessionQuery.error)}
              onRetry={() => void sessionQuery.refetch()}
            />
          ) : !session || !step ? (
            <LoadingState />
          ) : (
            <>
              <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
                {ORDER.map((entry, index) => {
                  const position = ORDER.indexOf(step);
                  const done = index < position;
                  const current = index === position;
                  return (
                    <li
                      key={entry}
                      aria-current={current ? "step" : undefined}
                      className="flex flex-col gap-2"
                    >
                      <span
                        className={cn(
                          "h-1.5 rounded-full transition-colors",
                          done || current ? "bg-brand" : "bg-brand/15",
                        )}
                      />
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs sm:text-sm",
                          current ? "font-semibold text-brand" : "text-muted-foreground",
                        )}
                      >
                        {done && <Check className="size-3.5 shrink-0 text-brand" />}
                        {STEP_LABELS[entry]}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {step === "A" && (
                <SituationStep
                  sessionId={session.sessionId}
                  onDone={() => {
                    void queryClient.invalidateQueries({ queryKey: ["clusterfit"] });
                    next("A");
                  }}
                />
              )}
              {step !== "A" && (
                <ItemsStep
                  key={step}
                  sessionId={session.sessionId}
                  part={step}
                  onBack={() => back(step)}
                  onDone={() => (step === "D" ? void submit() : next(step))}
                  doneLabel={step === "D" ? "See my results" : "Next part"}
                  submitting={submitting}
                />
              )}
              {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
