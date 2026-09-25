import { Activity, House, Palette, Search, Shield, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type { RiasecScale } from "@yuvapath/contracts";
import { AppHeader } from "@/components/AppHeader";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-messages";
import {
  getStoredAssessmentRunId,
  getStoredExploreGatingContext,
  getStoredProfileSnapshotId,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useAssessmentResult, useCreateAssessmentSnapshot } from "../hooks/useAssessment";
import { useUserProfile } from "../hooks/useProfile";
import { ensureProfileSnapshot } from "../lib/ensure-profile-snapshot";
import { useSession } from "../state/session-context";
import { RiasecResultCoin } from "../components/RiasecResultCoin";
import { JourneyReport } from "../components/JourneyReport";

/**
 * RIASEC results — reached once RiasecAssessmentPage reports the run complete. This page owns
 * the actual `POST .../assessment-runs/:runId/score` call itself (via useAssessmentResult) rather
 * than receiving the result handed off through navigation state — that endpoint is idempotent
 * (AssessmentService.scoreRun returns the existing result if one was already produced), so a
 * reload or a direct revisit here re-fetches the same result instead of erroring.
 *
 * Two segments, chosen only by the URL's `tab` query param — no in-page tab UI to switch between
 * them (removed: the only real entry point is ExplorePathPage's own "Report card" link):
 *   - Score (default, i.e. no `tab` param or anything other than "reportCard"): Figma "career"
 *     file node 346:151 ("quiz result") — the trait-strength bars plus the RIASEC result coin,
 *     implemented as-is from that frame. This is the landing segment right after finishing the
 *     assessment.
 *   - Report Card (`?tab=reportCard`): the previously-shipped "journey report" panel (Figma node
 *     560:1530), reachable only via ExplorePathPage's "Report card" link.
 *
 * Every number on either segment comes from the backend's own AssessmentResult — resultCode and
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
  const gatingContext = getStoredExploreGatingContext();
  const [runId] = useState(() => getStoredAssessmentRunId());

  const resultQuery = useAssessmentResult(runId);
  const createSnapshot = useCreateAssessmentSnapshot(session.journeySessionId ?? "", runId ?? "");
  const [isNavigating, setIsNavigating] = useState(false);
  // Report Card header: the profile is only in memory right after onboarding, so a returning
  // student's is fetched on demand (same query AppHeader uses, so it is served from cache).
  const profileQuery = useUserProfile(session.journeySessionId);
  const profile = session.profile ?? profileQuery.data?.profile ?? null;
  const profileSnapshotId = getStoredProfileSnapshotId();
  // Defaults to Score (the landing segment right after finishing the assessment). Reachable
  // directly on Report Card only via ExplorePathPage's own "Report card" link (?tab=reportCard)
  // — there's no in-page tab UI to switch between them here anymore, so this is a plain derived
  // read, not state. A query param, not route state, so a refresh/bookmark/share of the URL
  // keeps pointing at the same segment.
  const [searchParams] = useSearchParams();
  const activeTab: "score" | "reportCard" =
    searchParams.get("tab") === "reportCard" ? "reportCard" : "score";

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!runId) {
    return <Navigate to="/home" replace />;
  }

  const result = resultQuery.data?.result ?? null;
  const handleExplorePath = async () => {
    setIsNavigating(true);
    try {
      await ensureProfileSnapshot(() => createSnapshot.mutateAsync());
      void navigate("/explore-path");
    } catch {
      // Snapshot creation failed — stay on this page rather than navigating somewhere that
      // has no profileSnapshotId to work with; the button's error state (below) explains it.
      setIsNavigating(false);
    }
  };

  return (
    // lg:h-screen/overflow-hidden only while Score is active — same convention as HomePage/
    // IntakeQuestionsPage (fit a desktop viewport with no scroll; below lg it stays a normal
    // scrolling page since columns stack and genuinely need more room than a short viewport has).
    // Score's own spacing (heading/list/coin sizes, gaps, card padding — see below) was tightened
    // and verified against real rendered heights at common desktop sizes (1366x768 down to a
    // tight ~625px-tall maximized-browser case) specifically so it fits under this constraint.
    // Report Card keeps scrolling: its content (hero band + full trait list + selections +
    // actions) is taller than Score's and wasn't part of this fit-without-scrolling request.
    <main
      className={cn(
        "flex min-h-screen flex-col bg-page",
        activeTab === "score" && "lg:h-screen lg:overflow-hidden",
      )}
    >
      <AppHeader />
      <div className={flowCardBandClass}>
        {/* Page background stays bg-page (unchanged) — only this box's own fill switches from a
            flat bg-[rgba(224,215,250,0.37)] to bg-hero-gradient (index.css), the same diagonal
            wash HomePage/IntakeQuestionsPage/RiasecAssessmentPage use at the page level.
            No lg:min-h-[751px] either — this box's content (the trait list + button, or the
            RIASEC coin) never needs that much height, so the forced minimum just left empty
            space at the bottom. Sized to its content instead.
            This box doesn't render at all while the score is still loading (see the isPending
            branch below) — only once there's either an error or a real result, so it never shows
            up empty. The border only shows once there's an actual result to frame as a "card";
            on error it's the same soft gradient panel with no border, matching how ErrorState
            looks on the other pages. flex/items-center/justify-center + lg:min-h-[560px]
            (RiasecAssessmentPage's own loading-box height) apply only to that error case now, so
            ErrorState centers within a box the same size it gets on that page. Not applied once a
            real result renders — that content is a two-column grid meant to fill this box's full
            width, not sit as a centered flex child. */}
        {resultQuery.isPending ? (
          // No card at all while the score is still loading — the previous version rendered
          // this same flowCardClass box (a filled, rounded, lg:min-h-[560px] gradient panel)
          // empty except for the spinner, which is exactly the "empty result card" flash this
          // replaces: page background, then the one shared centered spinner, then — once
          // `result` exists — this box appears for the first time, already fully populated.
          <LoadingState />
        ) : (
          <div
            className={cn(
              // Report Card, once there's a result: no outer card at all — the "Journey Report"
              // panel below already has its own border, fill and radius, so it stands alone on
              // the page background (only a centred, width-capped wrapper here). Every other
              // case (Score, and the error box) keeps the shared flow card.
              activeTab === "reportCard" && result
                ? "w-full max-w-[960px] animate-in fade-in duration-300"
                : flowCardClass,
              // Score is narrower than the shared 1260 — at the full flow-card width its two
              // columns sat far enough apart to leave a wide dead gap between them; 900 is a bit
              // past what the trait list + coin actually need side by side, for some breathing
              // room without reopening that gap. Also a tighter lg padding than the shared
              // lg:p-[46px] — see the fit-without-scrolling comment on <main> below for why.
              activeTab === "reportCard" && !result && "max-w-[960px]",
              activeTab === "score" && "max-w-[900px] lg:p-10",
              result && activeTab === "score" && "border border-border",
              !result && "flex items-center justify-center lg:min-h-[560px]",
            )}
          >
            {resultQuery.isError ? (
              <ErrorState
                message={getErrorMessage(resultQuery.error, "We couldn't load your results.")}
                onRetry={() => void resultQuery.refetch()}
              />
            ) : result ? (
              // Plain wrapper now — gap-6 only matters for Report Card's two stacked pieces
              // (panel + action row); Score renders a single child here since its own tab
              // switcher was removed, so it has nothing to space against.
              <div className="flex flex-col gap-6">
                {activeTab === "score" ? (
                  // Score — Figma "career" file node 346:151 ("quiz result"), implemented as-is
                  // apart from tighter lg spacing (heading/list/coin sizes, gaps, card padding):
                  // trait-strength bars on the left, the RIASEC result coin on the right. See the
                  // fit-without-scrolling comment on <main> below for why lg is tighter than
                  // Figma's own fixed-canvas numbers.
                  <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex w-full flex-col gap-6 lg:max-w-[440px] lg:gap-3">
                      <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl lg:text-2xl">
                        Personality Type Trait Strength!
                      </h1>
                      <div className="flex w-full flex-col gap-4 lg:gap-2.5">
                        {TRAIT_ORDER.map(({ scale, label, Icon }) => {
                          const normalized = result.normalizedScores[scale] ?? 0;
                          const percent = Math.round(normalized * 100);
                          return (
                            <div
                              key={scale}
                              className="flex w-full items-center justify-between gap-3 py-2 lg:py-1"
                            >
                              <div className="flex shrink-0 items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-page lg:size-7">
                                  <Icon
                                    className="size-[18px] text-foreground"
                                    aria-hidden="true"
                                  />
                                </span>
                                <p className="w-[110px] shrink-0 font-display text-base font-medium text-foreground sm:w-[140px] sm:text-lg lg:text-base">
                                  {label}
                                </p>
                              </div>
                              <div className="flex flex-1 items-center gap-2 sm:gap-3">
                                <div
                                  className="h-[10px] w-full flex-1 overflow-hidden rounded-full bg-brand-glow/25 sm:h-3 lg:h-[11px]"
                                  role="progressbar"
                                  aria-valuenow={percent}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-label={`${label} strength`}
                                >
                                  <div
                                    className="h-full rounded-full bg-brand-glow"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <p className="w-10 shrink-0 text-right font-display text-base text-foreground sm:text-lg lg:text-base">
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
                        size="sm"
                        className="w-fit"
                      >
                        {isNavigating ? "Loading…" : "Explore Path"}
                      </Button>
                      {createSnapshot.isError ? (
                        <p className="font-display text-sm text-destructive">
                          {getErrorMessage(
                            createSnapshot.error,
                            "Couldn't start Explore Path — try again.",
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-center gap-6 lg:gap-3">
                      <p className="font-display text-xl font-semibold text-foreground sm:text-2xl lg:text-xl">
                        Your <span className="text-brand">RIASEC</span> Code
                      </p>
                      <RiasecResultCoin code={result.resultCode} />
                    </div>
                  </div>
                ) : (
                  // Report Card — the Figma "journey report" panel (node 498:572), see
                  // JourneyReport.tsx. It stands alone on the page (no outer card) and has its own
                  // Download / Talk to counsellor row.
                  <JourneyReport
                    result={result}
                    profile={profile}
                    gatingContext={gatingContext}
                    profileSnapshotId={profileSnapshotId}
                    journeySessionId={session.journeySessionId}
                    onExplorePath={() => void handleExplorePath()}
                    isExploring={isNavigating}
                    exploreError={
                      createSnapshot.isError
                        ? getErrorMessage(
                            createSnapshot.error,
                            "Couldn't start Explore Path — try again.",
                          )
                        : null
                    }
                  />
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
