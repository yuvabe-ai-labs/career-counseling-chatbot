import {
  Activity,
  Download,
  Headset,
  House,
  Palette,
  Search,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { Confidence, RiasecScale } from "@yuvanext/contracts";
import { AppHeader } from "@/components/AppHeader";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-messages";
import { getStoredAssessmentRunId, getStoredExploreGatingContext } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useAssessmentResult, useCreateAssessmentSnapshot } from "../hooks/useAssessment";
import { ensureProfileSnapshot } from "../lib/ensure-profile-snapshot";
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

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  normal: "Normal",
  soft: "Soft",
};

const REPORT_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function RiasecResultsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const gatingContext = getStoredExploreGatingContext();
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
  // Real, derived from the same normalizedScores the bars below already render — not a
  // restatement of the Figma's fixed "Doer • Thinker • Creator" example text.
  const topTraitLabels = result
    ? [...TRAIT_ORDER]
        .sort(
          (a, b) =>
            (result.normalizedScores[b.scale] ?? 0) - (result.normalizedScores[a.scale] ?? 0),
        )
        .slice(0, 3)
        .map(({ label }) => label)
    : [];

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
    // No lg:h-screen/overflow-hidden here (unlike this page's previous version) — the journey-
    // report content below (hero band + full trait list + selections + actions) is taller than
    // the old two-column layout that constraint was fitted to; letting the page scroll on short
    // viewports beats silently clipping the bottom of the card.
    <main className="flex min-h-screen flex-col bg-page">
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
              flowCardClass,
              // Slightly narrower than the shared flow-card width, on this page only — not a
              // change to flow-card.ts itself, which every other Explore Path screen also uses.
              "max-w-[960px]",
              result && "border border-border",
              !result && "flex items-center justify-center lg:min-h-[560px]",
            )}
          >
            {resultQuery.isError ? (
              <ErrorState
                message={getErrorMessage(resultQuery.error, "We couldn't load your results.")}
                onRetry={() => void resultQuery.refetch()}
              />
            ) : result ? (
              // A "journey report" (Figma node 560:1530): a distinct nested panel (top strip +
              // hero band + a two-column Assessment/Selections row), not a full replica — no
              // name/location/school fields (nothing in the profile schema backs them yet), no
              // logo inside the panel (AppHeader already has one), no summary paragraph (would
              // need a per-student narrative this backend doesn't generate), no Helper/Doer/
              // Thinker/etc relabeling (keeps this app's own Realistic/Investigative/... trait
              // names), and segment-agnostic — gatingContext.segment is only known once a
              // profile snapshot exists (after a first "Explore Path" visit), so the hero falls
              // back to a generic heading before that rather than guessing.
              <div className="flex flex-col gap-6">
                <div className="overflow-hidden rounded-2xl border border-border bg-brand-soft">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 sm:px-6">
                    <p className="font-display text-xs font-semibold tracking-wide text-brand uppercase">
                      Journey Report
                    </p>
                    <p className="font-display text-[11px] text-muted-foreground">
                      {REPORT_DATE_FORMAT.format(new Date(result.createdAt))}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-3 bg-brand px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="flex flex-col gap-1">
                      <p className="font-display text-xl font-semibold text-white capitalize sm:text-2xl">
                        {gatingContext?.segment ?? "Your Report"}
                      </p>
                      <p className="font-display text-xs text-white/70">RIASEC Assessment</p>
                    </div>
                    <p className="font-display text-4xl font-bold text-white/90 sm:text-5xl">
                      {result.resultCode}
                    </p>
                  </div>

                  <div className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">
                    <div className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-6">
                      <div className="flex flex-col gap-1">
                        <h1 className="font-display text-base font-semibold tracking-wide text-brand uppercase">
                          Assessment
                        </h1>
                        <p className="font-display text-sm text-muted-foreground">
                          Confidence: {CONFIDENCE_LABEL[result.confidence]}
                        </p>
                      </div>

                      <div className="flex w-full flex-col gap-2.5">
                        {TRAIT_ORDER.map(({ scale, label }) => {
                          const normalized = result.normalizedScores[scale] ?? 0;
                          const percent = Math.round(normalized * 100);
                          return (
                            <div key={scale} className="flex w-full items-center gap-3">
                              <p className="w-[92px] shrink-0 font-display text-sm text-foreground sm:w-[100px]">
                                {label}
                              </p>
                              <div
                                className="h-2 w-full flex-1 overflow-hidden rounded-full bg-brand-glow/25"
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
                              <p className="w-9 shrink-0 text-right font-display text-sm text-muted-foreground">
                                {percent}%
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      <p className="font-display text-sm text-muted-foreground">
                        <span className="font-semibold text-brand">{result.resultCode}</span>
                        {" · "}
                        {topTraitLabels.join(" + ")}
                      </p>
                    </div>

                    <div className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-6">
                      <p className="font-display text-base font-semibold tracking-wide text-brand uppercase">
                        Your Selections &amp; Explorations
                      </p>
                      {/* Deliberately empty — nothing to show yet. Careers/colleges the student
                          actually explores or shortlists aren't tracked anywhere yet; this is a
                          placeholder for that, not a stand-in for real data. */}
                      <p className="font-display text-base text-muted-foreground">
                        Careers and colleges you explore will show up here.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button onClick={() => void handleExplorePath()} disabled={isNavigating}>
                    {isNavigating ? "Loading…" : "Explore Path"}
                  </Button>
                  {/* Download/Talk to counsellor: no backend behind either yet — present as
                      smaller, disabled placeholders (per the brief) rather than left off the
                      page entirely, so the layout doesn't need revisiting once they're wired up. */}
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Download className="size-4" aria-hidden="true" />
                    Download
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Headset className="size-4" aria-hidden="true" />
                    Talk to counsellor
                  </Button>
                </div>
                {createSnapshot.isError ? (
                  <p className="text-center text-sm text-destructive">
                    {getErrorMessage(
                      createSnapshot.error,
                      "Couldn't start Explore Path — try again.",
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
