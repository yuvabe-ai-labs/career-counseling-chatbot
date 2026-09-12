import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import type { RecommendationItem } from "@yuvanext/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { getStoredExploreGatingContext, getStoredProfileSnapshotId } from "@/lib/storage";
import { useSession } from "@/features/assessment";
import { CareerDetailSheet } from "../components/CareerDetailSheet";
import { CareerRingMap } from "../components/CareerRingMap";
import { useCareerRecommendations } from "../hooks/useCareerRecommendations";

/**
 * Figma "career" file node 560:2106's header (back button + title) wraps the ring-map
 * interaction (from the user-supplied prototype, see CareerRingMap) and its detail sheet.
 * Match % is hidden for Explorer per Part 2 of docs/poc/launcher-goal-based-recommendations.md.
 */
export function CareerPage() {
  const navigate = useNavigate();
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null);

  const recommendationQuery = useCareerRecommendations(profileSnapshotId);

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }

  const rings = recommendationQuery.data?.rings;

  return (
    // The ring map now sits straight on the page gradient: the large rounded card that used to
    // wrap it (bg-hero-gradient + border + 64px padding) is gone, and that same gradient moved up
    // to <main> so the background is unchanged — only the box around it went away. Dropping its
    // padding is also most of what makes the map fit: the card alone cost 128px of height.
    <main className="bg-hero-gradient flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex min-h-0 flex-1 flex-col items-center px-6 py-6 sm:px-8">
        <div className="flex w-full max-w-[1090px] flex-col">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void navigate("/explore-path")}
              aria-label="Back to Explore Path"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-foreground shadow-sm"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">Career</h1>
          </div>
        </div>

        {/* flex-1 + justify-center: the map (tabs, rings and the labels around them) centres in
            whatever height is left under the title rather than being pinned beneath it, so the
            composition stays balanced as the viewport changes. The map itself is already
            horizontally centred by its own `items-center` column. */}
        <div className="flex w-full max-w-[1090px] min-h-0 flex-1 flex-col justify-center py-4">
          {recommendationQuery.isPending ? (
            <LoadingState />
          ) : recommendationQuery.isError ? (
            <ErrorState
              message={getErrorMessage(
                recommendationQuery.error,
                "We couldn't load your career matches.",
              )}
              onRetry={() => void recommendationQuery.refetch()}
            />
          ) : rings ? (
            <CareerRingMap
              rings={rings}
              hideMatchPercent={gatingContext.segment === "explorer"}
              selectedItemId={selectedItem?.itemId ?? null}
              onSelectCareer={setSelectedItem}
            />
          ) : null}
        </div>
      </div>

      <CareerDetailSheet
        item={selectedItem}
        segment={gatingContext.segment}
        onClose={() => setSelectedItem(null)}
      />
    </main>
  );
}
