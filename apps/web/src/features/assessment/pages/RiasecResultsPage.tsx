import { Activity, House, Palette, Search, Shield, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { RiasecScale } from "@yuvanext/contracts";
import bottomShadow from "@/assets/riasec-coin-bottom-shadow.svg";
import glossyHighlight from "@/assets/riasec-coin-glossy-highlight.svg";
import innerRing from "@/assets/riasec-coin-inner-ring.svg";
import mainFace from "@/assets/riasec-coin-main-face.svg";
import outerRim from "@/assets/riasec-coin-outer-rim.svg";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-messages";
import { getStoredAssessmentRunId } from "@/lib/storage";
import { useAssessmentResult } from "../hooks/useAssessment";
import { useSession } from "../state/session-context";

/**
 * RIASEC results — Figma "career" file node 346:151 ("quiz result"). Reached once
 * RiasecAssessmentPage reports the run complete. This page owns the actual
 * `POST .../assessment-runs/:runId/score` call itself (via useAssessmentResult) rather than
 * receiving the result handed off through navigation state — that endpoint is idempotent
 * (AssessmentService.scoreRun returns the existing result if one was already produced), so a
 * reload or a direct revisit here re-fetches the same result instead of erroring.
 *
 * Every number on this screen comes from the backend's own AssessmentResult — resultCode and
 * normalizedScores (scoreAssessmentResponses, packages/assessment/src/domain/scoring.ts) — none
 * of it is computed or hardcoded here.
 */

const TRAIT_ORDER: { scale: RiasecScale; label: string; Icon: LucideIcon }[] = [
  { scale: "R", label: "Realistic", Icon: House },
  { scale: "I", label: "Investigative", Icon: Search },
  { scale: "A", label: "Artistic", Icon: Palette },
  { scale: "S", label: "Social", Icon: Users },
  { scale: "E", label: "Enterprising", Icon: Activity },
  { scale: "C", label: "Conventional", Icon: Shield },
];

export function RiasecResultsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [runId] = useState(() => getStoredAssessmentRunId());

  const resultQuery = useAssessmentResult(runId);

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!runId) {
    return <Navigate to="/home" replace />;
  }

  const result = resultQuery.data?.result ?? null;

  return (
    <main className="flex min-h-screen flex-col bg-page">
      <AppHeader />
      <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8 sm:py-14 lg:py-[56px]">
        <div className="w-full max-w-[1260px] animate-in rounded-[27px] border border-border bg-[rgba(224,215,250,0.37)] p-8 fade-in duration-300 sm:p-12 lg:min-h-[751px] lg:p-[64px]">
          {resultQuery.isLoading ? (
            <LoadingState message="Scoring your assessment…" />
          ) : resultQuery.isError ? (
            <ErrorState
              message={getErrorMessage(resultQuery.error, "We couldn't load your results.")}
              onRetry={() => void resultQuery.refetch()}
            />
          ) : result ? (
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_385px] lg:gap-16">
              <div className="flex flex-col items-start gap-8">
                <h1 className="font-display text-3xl leading-[1.2] font-semibold text-foreground sm:text-4xl">
                  Personality Type Trait Strength!
                </h1>

                <div className="flex w-full flex-col gap-4">
                  {TRAIT_ORDER.map(({ scale, label, Icon }) => {
                    const normalized = result.normalizedScores[scale] ?? 0;
                    const percent = Math.round(normalized * 100);
                    return (
                      <div
                        key={scale}
                        className="flex w-full items-center justify-between gap-4 py-2"
                      >
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-[14px] bg-page">
                            <Icon className="size-[18px] text-foreground" aria-hidden="true" />
                          </span>
                          <p className="w-[130px] font-display text-lg font-medium text-foreground sm:w-[158px] sm:text-2xl">
                            {label}
                          </p>
                        </div>
                        <div className="flex flex-1 items-center gap-1.5">
                          <div
                            className="h-[15px] w-full overflow-hidden rounded-[4px] bg-page"
                            role="progressbar"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${label} strength`}
                          >
                            <div
                              className="h-full rounded-[4px] bg-brand"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <p className="w-[56px] shrink-0 text-right font-display text-base text-foreground sm:w-[78px] sm:text-2xl">
                            {percent}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={() => void navigate("/home")}
                  className="h-[49px] w-[176px] rounded-2xl text-xl font-bold shadow-none"
                >
                  Explore Path
                </Button>
              </div>

              <div className="flex flex-col items-center gap-6 sm:gap-[29px]">
                <p className="font-display text-2xl font-semibold text-foreground sm:text-[32px]">
                  Your <span className="text-brand">RIASEC</span> Code
                </p>
                <div
                  className="relative grid size-[220px] shrink-0 place-items-center rounded-full border border-[#e7e0f5] bg-white shadow-[0px_10px_24px_0px_rgba(89,42,199,0.08)] sm:size-[328px]"
                  aria-hidden="true"
                >
                  <img src={outerRim} alt="" className="absolute inset-0 size-full" />
                  <img
                    src={mainFace}
                    alt=""
                    className="absolute size-[92.7%] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                  <img
                    src={innerRing}
                    alt=""
                    className="absolute size-[75.6%] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                  <img
                    src={bottomShadow}
                    alt=""
                    className="absolute size-[22%] left-1/2 top-[calc(50%+36%)] -translate-x-1/2 -translate-y-1/2"
                  />
                  <img
                    src={glossyHighlight}
                    alt=""
                    className="absolute size-[36.6%] left-[calc(50%-22%)] top-[calc(50%-22%)] -translate-x-1/2 -translate-y-1/2"
                  />
                  <p className="relative font-display text-4xl font-semibold whitespace-nowrap text-brand sm:text-[56px]">
                    {result.resultCode}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
