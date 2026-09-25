import { Calendar } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import type { CounselorDashboardStatsResponse } from "@yuvapath/contracts";
import counselorDashboardBanner from "@/assets/counselor-dashboard-banner.png";
import counselorDashboardCardCompleted from "@/assets/counselor-dashboard-card-completed.png";
import counselorDashboardCardInProgress from "@/assets/counselor-dashboard-card-in-progress.png";
import counselorDashboardCardTotalStudents from "@/assets/counselor-dashboard-card-total-students.png";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCounselorDashboardStats } from "../hooks/useCounselorDashboard";
import { useCounselorSession } from "../state/counselor-session-context";

const GREETING_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

type StatCardConfig = {
  key: keyof CounselorDashboardStatsResponse;
  label: string;
  description: string;
  /** The card's own decorative artwork, exported from Figma node 779:1815. */
  image: string;
  /** Defaults to STAT_CARD_IMAGE_CLASS — only overridden where one card's own source image reads
   *  smaller than the other two at the shared size (see the Assessment Completed card below). */
  imageClassName?: string;
};

/**
 * One shared decorative-background system for every dashboard card's artwork (the 3 stat cards
 * below, and the bottom banner) — same corner anchor, same "shrink to fit, never distort"
 * sizing, same low opacity and low z-index, so all 4 read as one consistent background layer
 * instead of four independently-sized images that each look like their own inserted picture.
 *
 * Three things work together to get that "subtle background, not a placed image" feel:
 * - `z-0` here + `relative z-10` on each card's own text wrapper (added at each call site) is
 *   an explicit stacking order, not just DOM order — matches the `.card-decoration`/
 *   `.card-content` split this was specced against.
 * - A `max-h`/`max-w` box sized to roughly a third of the card's area is what keeps the art
 *   "concentrated toward the bottom-right" and low enough that it never climbs behind the
 *   heading/number, while still reading as clearly-visible artwork rather than a corner icon —
 *   the first pass (85%/62%) read as a picture sitting inside the card, pulling that too far the
 *   other way (52%/42%) made it read as a tiny badge, and 72%/54% still left too little of the
 *   curve/icon visible; this is the settled value after that back-and-forth.
 * - `-right-2 -bottom-2` deliberately pushes the art a couple pixels past the card's own edge,
 *   so the card's `overflow-hidden rounded-2xl` genuinely clips a sliver of it at the rounded
 *   corner — the "partially beyond the card, clipped by the rounded corner" look — instead of
 *   the artwork's own rectangular edge sitting exactly flush with the visible corner.
 *
 * `h-auto w-auto` + only `max-h`/`max-w` set is what keeps each image undistorted regardless of
 * this box's size: Figma's own generated positioning used independent left/top/width/height
 * percentages sized for its fixed source canvas, which stretched non-uniformly once rendered
 * into this app's own variable-size cards. That box only produces truly *consistent* edge-
 * hugging once every source PNG's actual drawn content also touches its own canvas edges, which
 * the raw Figma exports didn't (each had a different amount of transparent padding baked in). All
 * 4 PNGs in src/assets were cropped to their real non-transparent bounding box before being added
 * here (via a one-off PIL script, not committed) specifically so this shared anchor produces
 * even, comparable spacing on every card.
 */
const DASHBOARD_CARD_ART_ANCHOR_CLASS =
  "pointer-events-none absolute -right-2 -bottom-2 z-0 h-auto w-auto";

/** Each stat card's own source PNG has a different real aspect ratio post-crop (1.27–1.69) — the
 *  shared anchor above keeps them all corner-aligned and undistorted, while this per-card max
 *  box keeps their rendered footprint small and comparable across the row. */
const STAT_CARD_IMAGE_CLASS = `${DASHBOARD_CARD_ART_ANCHOR_CLASS} max-h-[80%] max-w-[60%] opacity-80`;

/** The foreground text stack for any dashboard card (stat cards and the banner alike) —
 *  `relative z-10` is what keeps it above DASHBOARD_CARD_ART_ANCHOR_CLASS's `z-0` artwork
 *  regardless of DOM order. */
const CARD_CONTENT_CLASS = "relative z-10 flex flex-col gap-2";

/**
 * Figma node 779:1815 has "Assessment Paused"/count of paused runs — renamed to "Assessment In
 * Progress" per this feature's own spec, since 'paused' is never actually written by any writer
 * of assessment_runs.status in this codebase (only 'active', 'completed', 'scored' are); "in
 * progress" reflects what the number really counts (see PgCounselorDashboardRepository). Figma
 * only ships one artwork for that card slot (a document + pause glyph, matching its own "Paused"
 * label) — reused as-is since there's no separate "in progress" asset to substitute.
 */
const STAT_CARDS: StatCardConfig[] = [
  {
    key: "totalStudents",
    label: "Total Students",
    description: "Students registered on YuvaPath",
    image: counselorDashboardCardTotalStudents,
  },
  {
    key: "assessmentCompleted",
    label: "Assessment Completed",
    description: "Students who have completed the assessment",
    image: counselorDashboardCardCompleted,
    // This source PNG's real artwork (the document+check) sits further from its own canvas
    // edges than the other two cards' images (there's a disconnected dot-grid accent floating
    // above it — see the crop comment on DASHBOARD_CARD_ART_ANCHOR_CLASS), so the same shared
    // box renders it visibly smaller than Total Students/Assessment In Progress. Scaled up
    // slightly here, on this card only, to match their visual weight.
    imageClassName: `${DASHBOARD_CARD_ART_ANCHOR_CLASS} max-h-[92%] max-w-[68%] opacity-80`,
  },
  {
    key: "assessmentInProgress",
    label: "Assessment In Progress",
    description: "Students who have an assessment in progress",
    image: counselorDashboardCardInProgress,
    // The inverse of Assessment Completed's own comment above: this source PNG's real artwork
    // sits closer to its own canvas edges than Total Students', so the shared box renders it
    // visibly larger at the same percentage. Scaled down slightly here to match their weight.
    imageClassName: `${DASHBOARD_CARD_ART_ANCHOR_CLASS} max-h-[68%] max-w-[50%] opacity-80`,
  },
];

/**
 * Counselor dashboard home — Figma node 779:1815 ("home"), rebuilt with this app's own layout
 * language (flowCardClass-style gradient card, `ui/button` + `ui/input`) but using Figma's own
 * decorative artwork for the stat cards and the bottom banner (downloaded to src/assets, same
 * `image`/`imageClassName` pattern as ExploreOptionCard) — the numbers/text still render from
 * this app's own type scale and tokens, not Figma's raw styling. See
 * docs/architecture/counselor-auth-landing-page-plan.md.
 *
 * The Start/End Date pickers and the bottom "Completed Assessments" banner are both rendered
 * disabled — the banner per explicit spec (a student list isn't built yet), the date range
 * filter as the same judgment call already established on this page (Download/Talk-to-counsellor
 * in RiasecResultsPage): shown for layout fidelity to Figma, wired up once there's a real
 * date-filtered stats endpoint behind it.
 */
export function CounselorHomePage() {
  const navigate = useNavigate();
  const session = useCounselorSession();
  const statsQuery = useCounselorDashboardStats(Boolean(session.userId));

  if (!session.userId) {
    return <Navigate to="/counselor/sign-in" replace />;
  }

  const stats = statsQuery.data;

  // Same destination the route guard above would already redirect to, so there's no race to
  // defer around here the way AppHeader's own default (student) sign-out has to (see that
  // handler's own comment) — session.reset() and this navigate() both land on the same place.
  const handleSignOut = () => {
    session.reset();
    void navigate("/counselor/sign-in", { replace: true });
  };

  return (
    // h-screen + overflow-hidden, not min-h-screen: matches AuthLayout/ExplorePathPage's own
    // shell so the card fills the viewport (up to the same 751px cap) and is vertically centred
    // exactly like sign-in/sign-up/Explore Path, rather than sizing to content and leaving the
    // page to scroll.
    <main className="flex h-screen flex-col overflow-hidden bg-page">
      <AppHeader
        accountContext={{
          name: session.displayName,
          isLoggedIn: Boolean(session.userId),
          onSignOut: handleSignOut,
        }}
      />
      <div className={flowCardBandClass}>
        {/* h-full max-h-[751px]: same height cap as AuthLayout/ExplorePathPage's hero-card, so
            this reads as the same-size box rather than a differently-proportioned one.
            overflow-hidden here just clips the rounded corners; the actual scroll fallback for
            content taller than 751px lives on the inner wrapper below (same split AuthLayout/
            ExplorePathPage use), not on the card itself. */}
        <div
          className={cn(
            flowCardClass,
            "border border-border flex h-full max-h-[751px] flex-col overflow-hidden",
          )}
        >
          {statsQuery.isPending ? (
            <LoadingState />
          ) : statsQuery.isError ? (
            <ErrorState
              message="We couldn't load your dashboard stats."
              onRetry={() => void statsQuery.refetch()}
            />
          ) : (
            <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
              <div className="flex flex-col gap-1">
                <p className="font-display text-sm text-muted-foreground">
                  {GREETING_DATE_FORMAT.format(new Date())}
                </p>
                <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                  Welcome, <span className="text-brand">Counsellor</span>
                </h1>
                <p className="font-display text-sm text-muted-foreground">
                  Here&apos;s a snapshot of student activity.
                </p>
              </div>

              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    Assessment Overview
                  </h2>
                  {/* Decorative for now — see the page-level comment on why these are disabled. */}
                  <div className="flex flex-wrap items-end gap-4">
                    <label className="flex flex-col gap-1">
                      <span className="font-display text-xs font-medium text-muted-foreground">
                        Start Date
                      </span>
                      <div className="relative">
                        <Calendar
                          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          type="date"
                          disabled
                          className="h-10 w-[160px] pl-9"
                          aria-label="Start date"
                        />
                      </div>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-display text-xs font-medium text-muted-foreground">
                        End Date
                      </span>
                      <div className="relative">
                        <Calendar
                          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          type="date"
                          disabled
                          className="h-10 w-[160px] pl-9"
                          aria-label="End date"
                        />
                      </div>
                    </label>
                  </div>
                </div>

                {/* grid-cols-3, evenly stretched across the full row (not a fixed per-card width)
                    — matches the reference design's proportions, each card taking a full third of
                    the row rather than a narrower fixed box with space left over. */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  {STAT_CARDS.map(({ key, label, description, image, imageClassName }) => (
                    <div
                      key={key}
                      className="relative flex min-h-[160px] flex-col overflow-hidden rounded-2xl border border-border bg-background p-7 shadow-soft"
                    >
                      <img
                        src={image}
                        alt=""
                        aria-hidden="true"
                        className={imageClassName ?? STAT_CARD_IMAGE_CLASS}
                      />
                      <div className={CARD_CONTENT_CLASS}>
                        <p className="font-display text-sm font-medium text-foreground">{label}</p>
                        <p className="font-display text-3xl font-bold text-foreground">
                          {stats ? stats[key] : 0}
                        </p>
                        <p className="max-w-[70%] font-display text-xs text-muted-foreground">
                          {description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Text + button stack in a left column (Figma's own 409px-wide column), never
                  spread with justify-between — the artwork already owns the right ~50% of the
                  card (sm:pr-[45%] reserves that space), so a flex-row spread would push the
                  button right under the illustration and overlap it. */}
              <div className="relative flex min-h-[180px] flex-col justify-center gap-4 overflow-hidden rounded-2xl border border-border bg-background p-7 sm:pr-[46%]">
                <img
                  src={counselorDashboardBanner}
                  alt=""
                  aria-hidden="true"
                  className={`${DASHBOARD_CARD_ART_ANCHOR_CLASS} max-h-[78%] max-w-[42%] opacity-85`}
                />
                <div className={CARD_CONTENT_CLASS}>
                  <p className="font-display text-base font-semibold text-foreground">
                    Completed Assessments
                  </p>
                  <p className="font-display text-sm text-muted-foreground">
                    View students who have completed their assessment
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => void navigate("/counselor/students")}
                  className="relative z-10 w-fit"
                >
                  View Students
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
