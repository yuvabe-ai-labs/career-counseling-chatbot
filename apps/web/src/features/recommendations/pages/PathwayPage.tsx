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
import { PathwayDetailSheet } from "../components/PathwayDetailSheet";
import { RingMap } from "../components/RingMap";
import { usePathwayRecommendations } from "../hooks/usePathwayRecommendations";

const ZOOM_LABEL = { 1: "Explore More", 2: "Explore More", 3: "Recommended Pathways" } as const;

/**
 * Pathfinder-only tab (tabsToShow() never enables it for Explorer). Same shell/pattern as
 * StreamPage — pathways aren't ring-partitioned either, so this is the same singleTier RingMap
 * treatment.
 */
export function PathwayPage() {
  const navigate = useNavigate();
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null);

  const recommendationQuery = usePathwayRecommendations(profileSnapshotId);

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }

  const items = recommendationQuery.data?.items ?? [];

  return (
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
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">Pathway</h1>
          </div>
        </div>

        <div className="flex w-full max-w-[1090px] min-h-0 flex-1 flex-col justify-center py-4">
          {recommendationQuery.isPending ? (
            <LoadingState />
          ) : recommendationQuery.isError ? (
            <ErrorState
              message={getErrorMessage(
                recommendationQuery.error,
                "We couldn't load your recommended pathways.",
              )}
              onRetry={() => void recommendationQuery.refetch()}
            />
          ) : items.length > 0 ? (
            <RingMap
              rings={{ inner: items, middle: [], outer: [] }}
              zoomLabels={ZOOM_LABEL}
              hideMatchPercent={false}
              selectedItemId={selectedItem?.itemId ?? null}
              onSelectItem={setSelectedItem}
              ariaLabel="Recommended pathways"
              singleTier
            />
          ) : (
            <p className="text-center font-display text-base text-muted-foreground">
              We don't have enough pathway data for your profile yet — check back soon.
            </p>
          )}
        </div>
      </div>

      <PathwayDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </main>
  );
}
