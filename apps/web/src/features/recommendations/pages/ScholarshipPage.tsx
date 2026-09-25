import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { getStoredExploreGatingContext, getStoredProfileSnapshotId } from "@/lib/storage";
import { useSession } from "@/features/assessment";
import { AidSchemeCard } from "../components/AidSchemeCard";
import { useAidSchemes } from "../hooks/useAidSchemes";
import { tabsToShow } from "../lib/tabs-to-show";

/**
 * Pathfinder-only screen, reached from Explore Path's "Scholarships & Aid" card — which itself
 * only exists when the student answered Yes to the `seeks_aid` intake question (see
 * tabsToShow()). This screen re-checks that same rule so a direct URL visit by a student who
 * answered No (or a segment with no aid yet) is sent back instead of showing schemes they opted
 * out of. It lists every verified scheme in the catalogue, unranked (see api/aid.ts for why).
 */
export function ScholarshipPage() {
  const navigate = useNavigate();
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();
  const aidQuery = useAidSchemes();

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }
  if (!tabsToShow(gatingContext).scholarship) {
    return <Navigate to="/explore-path" replace />;
  }

  const schemes = aidQuery.data?.data ?? [];
  const caveats = aidQuery.data?.caveats ?? [];

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
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              Scholarships &amp; Aid
            </h1>
          </div>
          <p className="mt-3 font-display text-sm leading-[1.4] text-foreground sm:text-base">
            Scholarships and financial aid schemes for college students.
          </p>
        </div>

        <div className="flex w-full max-w-[1090px] min-h-0 flex-1 flex-col py-4">
          {aidQuery.isPending ? (
            <LoadingState />
          ) : aidQuery.isError ? (
            <ErrorState
              message={getErrorMessage(aidQuery.error, "We couldn't load scholarships and aid.")}
              onRetry={() => void aidQuery.refetch()}
            />
          ) : schemes.length > 0 ? (
            <>
              <p className="mb-3 font-display text-sm font-semibold text-muted-foreground">
                {schemes.length} {schemes.length === 1 ? "scheme" : "schemes"}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {schemes.map((scheme) => (
                  <AidSchemeCard key={scheme.id} scheme={scheme} />
                ))}
              </div>
              {caveats.map((caveat) => (
                <p
                  key={caveat}
                  className="mt-5 text-center font-display text-sm text-muted-foreground"
                >
                  {caveat}
                </p>
              ))}
            </>
          ) : (
            <p className="text-center font-display text-base text-muted-foreground">
              We don&apos;t have any verified scholarships or aid schemes listed yet — check back
              soon.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
