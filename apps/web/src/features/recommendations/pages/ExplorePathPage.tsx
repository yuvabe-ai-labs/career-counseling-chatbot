import { BookOpen, Building2, ClipboardList, Compass, HandCoins, Route } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import exploreCardCareer from "@/assets/explore-card-career.png";
import exploreCardPlan from "@/assets/explore-card-plan.png";
import exploreCardStreams from "@/assets/explore-card-streams.png";
import { AppHeader } from "@/components/AppHeader";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { getStoredExploreGatingContext, getStoredProfileSnapshotId } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/assessment";
import { ExploreOptionCard } from "../components/ExploreOptionCard";
import { tabsToShow, type ExploreTabKey } from "../lib/tabs-to-show";

const TAB_META: Record<
  ExploreTabKey,
  {
    title: string;
    description: string;
    icon: typeof Compass;
    href?: string;
    /** Figma node 611:41 only ships artwork for streams, plan and career — the rest render
     *  with an empty image slot rather than a substitute. */
    image?: string;
    imageClassName?: string;
  }
> = {
  career: {
    title: "Career map",
    description: "Explore your career matches and find the right path for you.",
    icon: Compass,
    href: "/explore-path/career",
    image: exploreCardCareer,
    imageClassName: "top-[36.8%] left-[-7.79%] h-[75.66%] w-[109.91%] max-w-none",
  },
  stream: {
    title: "Streams",
    description: "Discover recommended streams based on your interests and strengths.",
    icon: BookOpen,
    href: "/explore-path/stream",
    image: exploreCardStreams,
    imageClassName: "top-[14.09%] left-[-16.42%] h-full w-[149.54%] max-w-none",
  },
  pathway: {
    title: "Pathway",
    description: "Compare entry routes, backup options, and how to reach each stream.",
    icon: Route,
    href: "/explore-path/pathway",
    // Re-enabled: the two reasons this was disabled for are resolved. The ~1-2 min load was a
    // storage-layer bug (recommendation-store.ts inserting the full ~500-pathway catalog one row
    // at a time) fixed by curating results to ~16 ring-partitioned items before they're stored —
    // measured end-to-end at ~4s now. The fake "streamAlignment saturates at 1.0 for nearly
    // every pathway" score inflation (recommendation-data-source.ts's loadPathways() used to
    // attach every active stream id to every pathway) is fixed by loadPathways() reporting an
    // honest empty streamIds array instead.
  },
  college: {
    title: "Colleges",
    description: "See colleges ringed by state, from your home state to nearby options.",
    icon: Building2,
    href: "/explore-path/college",
  },
  scholarship: {
    title: "Scholarships & Aid",
    description: "Check scholarships and aid schemes you may be eligible for.",
    icon: HandCoins,
    href: "/explore-path/scholarship",
  },
  plan: {
    title: "Plan",
    description: "Plan your next steps and take action towards your goals.",
    icon: ClipboardList,
    // Temporarily disabled (no href) alongside Pathway, per request. The real screen/route
    // still exists at /explore-path/plan; restore by adding back `href: "/explore-path/plan"`.
    image: exploreCardPlan,
    imageClassName: "inset-0 size-full max-w-none object-cover",
  },
};

const TAB_ORDER: ExploreTabKey[] = [
  "career",
  "stream",
  "pathway",
  "college",
  "scholarship",
  "plan",
];

/**
 * Figma "career" file node 611:41 ("Explore Path"). Which cards render is entirely driven by
 * `tabsToShow()` (see that function's own doc comment for the current rule; originally ported
 * from docs/poc/launcher-goal-based-recommendations.md Part 5, since superseded on the
 * Launcher branch) — every gated tab renders so the segment/goal logic stays visible and
 * testable. Career/Streams/Pathway/Colleges are wired to real screens. Scholarships & Aid is wired to its
 * own screen and only ever appears for Pathfinders who answered Yes to the `seeks_aid` intake
 * question (Launcher aid is later work); Plan is currently disabled — temporarily, per its own TAB_META comment — even
 * though it has a real screen/route already built.
 */
export function ExplorePathPage() {
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }

  const visibility = tabsToShow(gatingContext);

  return (
    // h-screen + overflow-hidden, not min-h-screen: matches AuthLayout's own shell so the card
    // fills the viewport (up to the same 751px cap) and is vertically centred exactly like the
    // sign-in/sign-up hero-card, rather than sizing to content and leaving the page to scroll.
    <main className="flex h-screen flex-col overflow-hidden bg-page">
      <AppHeader />
      <div className={flowCardBandClass}>
        {/* Figma node 611:47 ("white-card"): 27px radius, #e7eaf2 border, and that frame's own
            fill — which is the same 90deg gradient the sign-up card uses, so it's the shared
            bg-auth-hero-gradient rather than a second copy of those stops.

            Width is flowCardClass's max-w-[1260px], matching both RiasecResultsPage (Explore
            Path opens straight from that screen's button, and the brief asks the two to keep the
            same container) and the sign-in/sign-up hero-card. The cards flex to fill the row
            instead of holding the frame's fixed 349px.

            h-full max-h-[751px]: same height cap as AuthLayout's hero-card, so the two read as
            the same-size box rather than the sign-in card reading taller/roomier. overflow-hidden
            here just clips the rounded corners; the actual scroll fallback for tall content lives
            on the inner wrapper below (same split AuthLayout uses), not on the card itself. */}
        <div
          className={cn(
            flowCardClass,
            "border border-border flex h-full max-h-[751px] flex-col overflow-hidden",
          )}
        >
          <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Node 611:50 — the active tab plus a real route back to the results screen this page
                was opened from, rather than a decorative second tab. */}
            {/* Both tabs share one shape: same size, weight, line-height and padding, and an
                underline that is w-full so it tracks each tab's own text rather than a fixed 124px
                that could only ever match one of them. Only colour marks the active tab. They
                previously carried different vertical padding (py-1.5 vs py-2.5) and different
                weights, which is what knocked them off a common baseline. */}
            <div className="flex items-start gap-6">
              <span className="flex flex-col gap-1.5">
                <span className="font-display text-base leading-6 font-semibold text-brand">
                  Explore Path
                </span>
                <span className="h-[2px] w-full rounded-full bg-brand" aria-hidden="true" />
              </span>
              <Link
                // ?tab=reportCard lands directly on RiasecResultsPage's Report Card segment — that
                // page defaults to Score otherwise (its landing segment right after finishing the
                // assessment), which isn't what clicking a link literally labeled "Report card"
                // should show.
                to="/riasec-results?tab=reportCard"
                className="flex flex-col gap-1.5 transition-colors hover:text-foreground"
              >
                <span className="font-display text-base leading-6 font-semibold text-muted-foreground">
                  Report card
                </span>
                <span
                  className="h-[2px] w-full rounded-full bg-border opacity-70"
                  aria-hidden="true"
                />
              </Link>
            </div>

            <div className="mt-5 flex flex-col gap-1.5">
              <h1 className="font-display text-2xl leading-[1.2] font-bold text-foreground sm:text-3xl lg:text-[34px]">
                Explore your path
              </h1>
              <p className="font-display text-sm leading-[1.4] text-foreground sm:text-base lg:text-lg">
                Choose an option below to explore and plan.
              </p>
            </div>

            {/* Which cards appear — and how many — is entirely tabsToShow(gatingContext) above:
                segment + seeksAid + currentGoal. Nothing here assumes a fixed set of three.

                The wider column gap at lg is what narrows the cards (318px -> 289px) without
                leaving dead space beside them: the row still spans the full content width, so the
                composition stays balanced. 64px is the Figma frame's own card gap. */}
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-16">
              {TAB_ORDER.filter((tab) => visibility[tab]).map((tab) => {
                const meta = TAB_META[tab];
                return (
                  <ExploreOptionCard
                    key={tab}
                    icon={meta.icon}
                    title={meta.title}
                    description={meta.description}
                    {...(meta.href ? { href: meta.href } : {})}
                    {...(meta.image ? { image: meta.image } : {})}
                    {...(meta.imageClassName ? { imageClassName: meta.imageClassName } : {})}
                  />
                );
              })}
            </div>

            <p className="mt-6 text-center font-display text-sm leading-[1.4] text-muted-foreground">
              "Explore your options. Shape your future."
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
