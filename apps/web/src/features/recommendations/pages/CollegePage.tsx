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
import { CollegeDetailSheet } from "../components/CollegeDetailSheet";
import { RingMap } from "../components/RingMap";
import { useCollegeRecommendations } from "../hooks/useCollegeRecommendations";

// Colleges ring by geography, not "match strength" — outer -> nearest is furthest from tried,
// inner -> your own state. Distinct labels from Career's "Explore More/Top Matches" progression.
const ZOOM_LABEL = { 1: "Other States", 2: "Neighboring States", 3: "Your State" } as const;

/**
 * Pathfinder-only tab. Colleges are the one other recommendation kind (besides career) that
 * produce real inner/middle/outer rings (partitionCollegeRings() — home state / neighboring
 * states / other), so this reuses the exact same 3-tier RingMap as CareerPage, unlike
 * Stream/Pathway's singleTier treatment.
 */
export function CollegePage() {
  const navigate = useNavigate();
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null);

  const recommendationQuery = useCollegeRecommendations(profileSnapshotId);

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }

  const rings = recommendationQuery.data?.rings;

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
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">Colleges</h1>
          </div>
        </div>

        <div className="flex w-full max-w-[1090px] min-h-0 flex-1 flex-col justify-center py-4">
          {recommendationQuery.isPending ? (
            <LoadingState />
          ) : recommendationQuery.isError ? (
            <ErrorState
              message={getErrorMessage(
                recommendationQuery.error,
                "We couldn't load your college matches.",
              )}
              onRetry={() => void recommendationQuery.refetch()}
            />
          ) : rings ? (
            <RingMap
              rings={rings}
              zoomLabels={ZOOM_LABEL}
              hideMatchPercent={false}
              selectedItemId={selectedItem?.itemId ?? null}
              onSelectItem={setSelectedItem}
              ariaLabel="Colleges by geographic ring"
              hubLabel={() => "STATE"}
            />
          ) : null}
        </div>
      </div>

      <CollegeDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </main>
  );
}
