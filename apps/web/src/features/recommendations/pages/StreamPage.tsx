import { useState } from "react";
import { ArrowLeft, Atom, Building2, Palette, type LucideIcon } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import type { RecommendationItem } from "@yuvanext/contracts";
import streamCardArts from "@/assets/stream-card-arts.png";
import streamCardCommerce from "@/assets/stream-card-commerce.png";
import streamCardScience from "@/assets/stream-card-science.png";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { getStoredExploreGatingContext, getStoredProfileSnapshotId } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/assessment";
import { StreamDetailSheet } from "../components/StreamDetailSheet";
import { StreamOptionCard } from "../components/StreamOptionCard";
import { useStreamRecommendations } from "../hooks/useStreamRecommendations";

type StreamVisualStyle = { icon: LucideIcon; image: string; imageClassName: string };

/**
 * The 3 card treatments Figma node 611:93 ("streams") actually ships artwork for
 * (card-commerce/card-arts/card-science) — every stream renders with one of these three, picked
 * by keyword match against its title where one applies, or cycled by position otherwise. There
 * is no 4th/generic treatment: the design only exists for these three, so reusing them is
 * truer to the brief than inventing an unstyled fallback card.
 */
const STREAM_VISUAL_STYLES: StreamVisualStyle[] = [
  {
    icon: Building2,
    image: streamCardCommerce,
    imageClassName: "h-[99.25%] left-[-44.24%] top-[15.92%] w-[144.18%] max-w-none",
  },
  {
    icon: Palette,
    image: streamCardArts,
    imageClassName: "h-full left-[-38.88%] top-[13.37%] w-[145.26%] max-w-none",
  },
  {
    icon: Atom,
    image: streamCardScience,
    imageClassName: "h-full left-[-39.27%] top-[7.82%] w-[145.27%] max-w-none",
  },
];

function resolveStreamVisualStyle(title: string, index: number): StreamVisualStyle {
  const lower = title.toLowerCase();
  if (lower.includes("commerce")) return STREAM_VISUAL_STYLES[0]!;
  if (lower.includes("art") || lower.includes("design") || lower.includes("humanit")) {
    return STREAM_VISUAL_STYLES[1]!;
  }
  if (lower.includes("science")) return STREAM_VISUAL_STYLES[2]!;
  return STREAM_VISUAL_STYLES[index % STREAM_VISUAL_STYLES.length]!;
}

/**
 * Figma node 611:93 ("streams"). Same shell/back-button pattern as PlanPage, over the shared
 * flow-card container (flow-card.ts) rather than CareerPage's ring-map treatment: streams
 * aren't ring-partitioned by the backend (scoreStreams() returns one flat ranked list, no
 * inner/middle/outer tiers), so a card grid — not a radial "circle" map implying tiers that
 * don't exist — matches both the design and the data shape. Card font sizes match
 * ExploreOptionCard's scale (text-lg/xl title, text-sm/base body), not this frame's own larger
 * 32px/16px type. Tapping a card opens the same StreamDetailSheet the old ring map used.
 */
export function StreamPage() {
  const navigate = useNavigate();
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null);

  const recommendationQuery = useStreamRecommendations(profileSnapshotId);

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }

  const items = recommendationQuery.data?.items ?? [];
  const hideMatchPercent = gatingContext.segment === "explorer";

  return (
    <main className="flex min-h-screen flex-col bg-page">
      <AppHeader />
      <div className={flowCardBandClass}>
        {recommendationQuery.isPending ? (
          // Nothing else renders while streams are loading — not even the back button/title/
          // subtitle/tagline shell. Those used to always render, with only the card grid
          // swapped for a spinner, which is exactly the "outer card appears, then the inner
          // cards populate a beat later" flash this avoids: now it's background, then the one
          // shared centered spinner, then the complete section appears together once the data
          // is actually ready — never a partially-populated card in between.
          <LoadingState />
        ) : (
          <div className={cn(flowCardClass, "border border-border")}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void navigate("/explore-path")}
                aria-label="Back to Explore Path"
                className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-foreground shadow-sm"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
              </button>
              <h1 className="font-display text-2xl leading-[1.2] font-bold text-foreground sm:text-3xl lg:text-[34px]">
                Streams
              </h1>
            </div>

            <p className="mt-5 font-display text-sm leading-[1.4] text-foreground sm:text-base lg:text-lg">
              These are the streams available to you based on your profile
            </p>

            <div className="mt-6">
              {recommendationQuery.isError ? (
                <ErrorState
                  message={getErrorMessage(
                    recommendationQuery.error,
                    "We couldn't load your recommended streams.",
                  )}
                  onRetry={() => void recommendationQuery.refetch()}
                />
              ) : items.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-16">
                  {items.map((item, index) => {
                    const style = resolveStreamVisualStyle(item.title, index);
                    return (
                      <StreamOptionCard
                        key={item.itemId}
                        item={item}
                        icon={style.icon}
                        image={style.image}
                        imageClassName={style.imageClassName}
                        hideMatchPercent={hideMatchPercent}
                        onSelect={setSelectedItem}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-center font-display text-base text-muted-foreground">
                  We don't have enough stream data for your profile yet — check back soon.
                </p>
              )}
            </div>

            <p className="mt-6 text-center font-display text-sm leading-[1.4] text-muted-foreground">
              "Explore your options. Shape your future."
            </p>
          </div>
        )}
      </div>

      <StreamDetailSheet
        item={selectedItem}
        hideMatchPercent={hideMatchPercent}
        onClose={() => setSelectedItem(null)}
      />
    </main>
  );
}
