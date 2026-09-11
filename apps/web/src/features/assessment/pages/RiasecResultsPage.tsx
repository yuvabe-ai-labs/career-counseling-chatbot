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
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-messages";
import {
  getStoredAssessmentRunId,
  getStoredProfileSnapshotId,
  setStoredExploreGatingContext,
  setStoredProfileSnapshotId,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useAssessmentResult, useCreateAssessmentSnapshot } from "../hooks/useAssessment";
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

/**
 * `ProfileSnapshot.intakeSummary` entries are stored as `{ value: "..." }` (confirmed against
 * real assessment.profile_snapshots rows — verified via psql, e.g. `current_goal:
 * { value: "skill_building" }`), not plain scalars, so a naive `typeof intakeSummary[key] ===
 * "string"` check always fails on real data.
 */
function readIntakeAnswer(intakeSummary: Record<string, unknown>, key: string): string | undefined {
  const entry = intakeSummary[key];
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "value" in entry && typeof entry.value === "string") {
    return entry.value;
  }
  return undefined;
}

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
  const createSnapshot = useCreateAssessmentSnapshot(session.journeySessionId ?? "", runId ?? "");
  const [isNavigating, setIsNavigating] = useState(false);

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!runId) {
    return <Navigate to="/home" replace />;
  }

  const result = resultQuery.data?.result ?? null;

  /**
   * `createAssessmentSnapshot` isn't idempotent on the backend (a fresh snapshot row every
   * call) — guarded here by only ever calling it once, the first time this button is used,
   * and reusing the stored id on every visit after that.
   */
  const handleExplorePath = async () => {
    setIsNavigating(true);
    try {
      if (!getStoredProfileSnapshotId()) {
        const { snapshot } = await createSnapshot.mutateAsync();
        setStoredProfileSnapshotId(snapshot.snapshotId);
        setStoredExploreGatingContext({
          segment: snapshot.segment,
          wantsAid: snapshot.wantsAid,
          currentGoal: readIntakeAnswer(snapshot.intakeSummary, "current_goal"),
        });
      }
      void navigate("/explore-path");
    } catch {
      // Snapshot creation failed — stay on this page rather than navigating somewhere that
      // has no profileSnapshotId to work with; the button's error state (below) explains it.
      setIsNavigating(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-page lg:h-screen lg:overflow-hidden">
      <AppHeader />
      <div className={flowCardBandClass}>
        {/* Page background stays bg-page (unchanged) — only this box's own fill switches from a
            flat bg-[rgba(224,215,250,0.37)] to bg-hero-gradient (index.css), the same diagonal
            wash HomePage/IntakeQuestionsPage/RiasecAssessmentPage use at the page level.
            No lg:min-h-[751px] either — this box's content (the trait list + button, or the
            RIASEC coin) never needs that much height, so the forced minimum just left empty
            space at the bottom. Sized to its content instead.
            The border only shows once there's an actual result to frame as a "card" — while
            loading or on error, it's just this same soft gradient panel with no border, matching
            how those states look on the other pages (no card at all).
            flex/items-center/justify-center + lg:min-h-[560px] (RiasecAssessmentPage's own
            loading-box height) apply only for that same loading/error case, so LoadingState/
            ErrorState center within a box the same size as it gets on that page, instead of
            wherever this page's own (now content-sized) box happens to end up. Not applied once
            a real result renders — that content is a two-column grid meant to fill this box's
            full width, not sit as a centered flex child. */}
        <div
          className={cn(
            // max-w 1140 rather than 1260: the right column is a fixed 385px, so every pixel of
            // container width lands on the left column and stretches the trait bars. Narrowing
            // the card is the one knob that tightens the whole row — labels, bars and values keep
            // their proportions, nothing else needed adjusting.
            flowCardClass,
            result && "border border-border",
            !result && "flex items-center justify-center lg:min-h-[560px]",
          )}
        >
          {resultQuery.isLoading ? (
            <LoadingState />
          ) : resultQuery.isError ? (
            <ErrorState
              message={getErrorMessage(resultQuery.error, "We couldn't load your results.")}
              onRetry={() => void resultQuery.refetch()}
            />
          ) : result ? (
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_385px] lg:gap-12">
              <div className="flex flex-col items-start gap-5">
                <h1 className="font-display text-2xl leading-[1.2] font-semibold text-foreground sm:text-3xl">
                  Personality Type Trait Strength!
                </h1>

                <div className="flex w-full flex-col gap-2">
                  {TRAIT_ORDER.map(({ scale, label, Icon }) => {
                    const normalized = result.normalizedScores[scale] ?? 0;
                    const percent = Math.round(normalized * 100);
                    return (
                      <div
                        key={scale}
                        className="flex w-full items-center justify-between gap-4 py-1"
                      >
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-[14px] bg-page">
                            <Icon className="size-[18px] text-foreground" aria-hidden="true" />
                          </span>
                          <p className="w-[130px] font-display text-base font-medium text-foreground sm:w-[158px]">
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
                              // brand-glow (index.css) — the design system's lighter violet
                              // variant, not yet used elsewhere; bg-brand (the darker, saturated
                              // brand violet) was too dark against this bar's own light-purple
                              // track.
                              className="h-full rounded-[4px] bg-brand-glow"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <p className="w-[56px] shrink-0 text-right font-display text-sm text-foreground sm:w-[78px]">
                            {percent}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={() => void handleExplorePath()}
                  disabled={isNavigating}
                  className="w-[176px]"
                >
                  {isNavigating ? "Loading…" : "Explore Path"}
                </Button>
                {createSnapshot.isError ? (
                  <p className="text-sm text-destructive">
                    {getErrorMessage(
                      createSnapshot.error,
                      "Couldn't start Explore Path — try again.",
                    )}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col items-center gap-4">
                <p className="font-display text-xl font-semibold text-foreground sm:text-2xl">
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
