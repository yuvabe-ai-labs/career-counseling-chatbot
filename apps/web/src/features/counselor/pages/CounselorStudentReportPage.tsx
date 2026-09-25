import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { JourneyReportPanel } from "@/features/assessment/components/JourneyReport";
import { buildReportMatchCards } from "@/features/assessment/components/ReportCardSections";
import { downloadReportPdf } from "@/features/assessment/lib/download-report-pdf";
import { tabsToShow } from "@/features/recommendations/lib/tabs-to-show";
import { useCounselorStudentReport } from "../hooks/useCounselorStudents";
import { useCounselorSession } from "../state/counselor-session-context";

/**
 * A counselor's read-only copy of one student's Report Card — reached from CounselorStudentsPage's
 * "View Profile" link. It renders the very same JourneyReportPanel the student sees on their own
 * Report Card tab (header, hero band, profile tags, RIASEC bars, top matches), backed by a
 * counselor-gated read (getStudentReport) rather than the student's own runId/journeySession — see
 * CounselorStudentReportResponseSchema's own comment for why. `result` is null whenever the
 * student hasn't completed a RIASEC run yet, which this page shows as its own explicit state
 * rather than as an error or a blocked "View Profile" link on the card before it.
 *
 * Back uses browser history (navigate(-1)) rather than a hardcoded link to /counselor/students,
 * specifically so the student list's own search/status URL params — still on that history entry
 * — come back unchanged instead of resetting to an unfiltered list.
 */
export function CounselorStudentReportPage() {
  const navigate = useNavigate();
  const session = useCounselorSession();
  const { studentId } = useParams<{ studentId: string }>();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const reportQuery = useCounselorStudentReport(studentId, Boolean(session.userId));

  if (!session.userId) {
    return <Navigate to="/counselor/sign-in" replace />;
  }
  if (!studentId) {
    return <Navigate to="/counselor/students" replace />;
  }

  const handleSignOut = () => {
    session.reset();
    void navigate("/counselor/sign-in", { replace: true });
  };

  const report = reportQuery.data;
  const result = report?.result ?? null;

  const handleDownload = async () => {
    const panel = panelRef.current;
    if (!panel) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadReportPdf(panel, report?.profile.firstName);
    } catch {
      setDownloadError("We couldn't create the PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Same per-segment card visibility the student's own Explore Path uses.
  const matchCards = report
    ? buildReportMatchCards(
        report.matches,
        tabsToShow({ segment: report.profile.segment, seeksAid: false, currentGoal: undefined }),
      )
    : [];

  return (
    <main className="flex min-h-screen flex-col bg-page">
      <AppHeader
        accountContext={{
          name: session.displayName,
          isLoggedIn: Boolean(session.userId),
          onSignOut: handleSignOut,
        }}
      />
      <div className="flex min-h-0 flex-1 justify-center px-6 py-6 sm:px-8">
        <div className="flex w-full max-w-[960px] flex-col gap-4">
          <button
            type="button"
            onClick={() => void navigate(-1)}
            className="flex w-fit cursor-pointer items-center gap-2 font-display text-sm font-semibold text-foreground"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-sm">
              <ArrowLeft className="size-5" aria-hidden="true" />
            </span>
            Back to students
          </button>

          {reportQuery.isPending ? (
            <LoadingState />
          ) : reportQuery.isError ? (
            <ErrorState
              message={getErrorMessage(
                reportQuery.error,
                "We couldn't load this student's report.",
              )}
              onRetry={() => void reportQuery.refetch()}
            />
          ) : report && result ? (
            <>
              <JourneyReportPanel
                result={result}
                profile={report.profile}
                profileAnswers={report.profileAnswers}
                matches={{ cards: matchCards, isLoading: false, hasSnapshot: true }}
                panelRef={panelRef}
              />
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={isDownloading}
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-brand px-5 font-display text-base font-semibold text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloading ? "Preparing PDF…" : "Download"}
                </button>
                {downloadError ? (
                  <p className="font-display text-sm text-destructive">{downloadError}</p>
                ) : null}
              </div>
            </>
          ) : report ? (
            <p className="rounded-2xl border border-dashed border-border bg-white/60 px-6 py-12 text-center font-display text-base text-muted-foreground">
              {report.profile.firstName} hasn&apos;t completed the RIASEC assessment yet.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
