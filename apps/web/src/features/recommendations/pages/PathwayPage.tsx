import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import type { RecommendationItem } from "@yuvapath/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { getStoredExploreGatingContext, getStoredProfileSnapshotId } from "@/lib/storage";
import { useSession } from "@/features/assessment";
import { PathwayDetailSheet } from "../components/PathwayDetailSheet";
import { RingMap } from "../components/RingMap";
import { usePathwayRecommendations } from "../hooks/usePathwayRecommendations";

function collegeAvailabilityOf(item: RecommendationItem): number | undefined {
  const explanation = item.explanation;
  return typeof explanation === "object" &&
    explanation !== null &&
    "collegeAvailability" in explanation &&
    typeof explanation.collegeAvailability === "number"
    ? explanation.collegeAvailability
    : undefined;
}

const ZOOM_LABEL = { 1: "Explore More", 2: "Explore More", 3: "Recommended Pathways" } as const;

/**
 * Pathfinder-only tab (tabsToShow() never enables it for Explorer). Pathways are now
 * ring-partitioned by the backend (partitionPathwayRings() in pathway-recommendations.ts,
 * mirroring career/college's own inner/middle/outer curation) instead of being dumped into one
 * synthetic tier, so this uses the same 3-tier RingMap treatment as CollegePage rather than
 * `singleTier`.
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

  const rings = recommendationQuery.data?.rings;
  const hasPathways = Boolean(
    rings && rings.inner.length + rings.middle.length + rings.outer.length > 0,
  );

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
          ) : hasPathways && rings ? (
            <RingMap
              rings={rings}
              zoomLabels={ZOOM_LABEL}
              hideMatchPercent={false}
              // MVP: the only number on a pathway dot is College Availability — fitScore and the
              // other pathway sub-scores stay in the API for a later scoring phase.
              dotMetric={collegeAvailabilityOf}
              selectedItemId={selectedItem?.itemId ?? null}
              onSelectItem={setSelectedItem}
              ariaLabel="Recommended pathways"
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
