import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { LoadingState } from "@/components/LoadingState";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import type { CounselorStudentListFilters } from "../api/counselor-students";
import { StatusFilterDropdown } from "../components/StatusFilterDropdown";
import { useCounselorStudents } from "../hooks/useCounselorStudents";
import { useCounselorSession } from "../state/counselor-session-context";

const STATUS_VALUES = ["all", "completed", "in_progress", "not_started"] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

const isStatusValue = (value: string | null): value is StatusValue =>
  value !== null && (STATUS_VALUES as readonly string[]).includes(value);

const SEGMENT_LABEL: Record<string, string> = {
  explorer: "Explorer",
  pathfinder: "Pathfinder",
  launcher: "Launcher",
};

/** Shared between the status filter dropdown and each student card's own name-row dot (Figma
 *  node 888:7237's small "Ellipse" before the name) — one color per real assessment-completion
 *  status, so the two never drift out of sync. Colors match Figma node 888:8309's own status
 *  dots (green/orange); "not_started" has no Figma equivalent (see CounselorStudentStatusSchema's
 *  own comment), so it gets a neutral gray rather than an invented color. */
const STATUS_DOT_CLASSNAME: Record<"completed" | "in_progress" | "not_started", string> = {
  completed: "bg-[#12b76a]",
  in_progress: "bg-[#f79009]",
  not_started: "bg-muted-foreground",
};

const STATUS_LABEL: Record<"completed" | "in_progress" | "not_started", string> = {
  completed: "Completed",
  in_progress: "In progress",
  not_started: "Not started",
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Counselor "View Students" screen — Figma node 888:8336 ("counsellor view list"). Cards show
 * only a student's name + segment, plus the small status dot before the name Figma's own
 * "name-row" (node 888:7237) already has (no school/bio/status-pill footer/lock icon — those
 * either don't exist on UserProfile, or read as extra card content beyond what this feature's
 * spec asked for); the
 * status filter still works against the real 3-way split PgCounselorStudentRepository derives
 * from assessment_runs (see CounselorStudentStatusSchema's own comment for why "Paused" isn't
 * one of the options, unlike Figma's mock). AppHeader is reused as-is — Figma's own header/logo
 * for this screen is intentionally not rebuilt.
 *
 * search/status live in the URL (not just component state) specifically so that navigating to a
 * student's report and pressing Back (browser history, see CounselorStudentReportPage) lands back
 * on this exact filtered view instead of a reset one.
 */
export function CounselorStudentsPage() {
  const navigate = useNavigate();
  const session = useCounselorSession();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status");
  const urlStatus: StatusValue = isStatusValue(statusParam) ? statusParam : "all";

  // Local text state so typing doesn't push a new URL/refetch on every keystroke — committed to
  // the URL (and therefore the query) after a short pause.
  const [searchInput, setSearchInput] = useState(urlSearch);

  // Re-sync the input when the URL changes from elsewhere (back/forward, "clear filters").
  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch);
  if (syncedUrlSearch !== urlSearch) {
    setSyncedUrlSearch(urlSearch);
    setSearchInput(urlSearch);
  }

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === urlSearch) return;
    const timer = setTimeout(() => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (trimmed) next.set("search", trimmed);
          else next.delete("search");
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, urlSearch, setSearchParams]);

  const filters: CounselorStudentListFilters = useMemo(
    () => ({
      ...(urlSearch ? { search: urlSearch } : {}),
      ...(urlStatus !== "all" ? { status: urlStatus } : {}),
    }),
    [urlSearch, urlStatus],
  );

  const studentsQuery = useCounselorStudents(filters, Boolean(session.userId));

  if (!session.userId) {
    return <Navigate to="/counselor/sign-in" replace />;
  }

  const handleStatusChange = (value: string) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === "all") next.delete("status");
        else next.set("status", value);
        return next;
      },
      { replace: true },
    );
  };

  const handleSignOut = () => {
    session.reset();
    void navigate("/counselor/sign-in", { replace: true });
  };

  const counts = studentsQuery.data?.counts;
  const students = studentsQuery.data?.students ?? [];
  const hasActiveFilters = Boolean(urlSearch) || urlStatus !== "all";

  const statusOptions = [
    { value: "all", label: "All Students", count: counts?.all },
    {
      value: "completed",
      label: "Completed",
      count: counts?.completed,
      dotClassName: STATUS_DOT_CLASSNAME.completed,
    },
    {
      value: "in_progress",
      label: "In Progress",
      count: counts?.inProgress,
      dotClassName: STATUS_DOT_CLASSNAME.in_progress,
    },
    {
      value: "not_started",
      label: "Not Started",
      count: counts?.notStarted,
      dotClassName: STATUS_DOT_CLASSNAME.not_started,
    },
  ];

  return (
    // h-screen + overflow-hidden, not min-h-screen: matches AuthLayout/ExplorePathPage/
    // CounselorHomePage's own shell — the card fills the viewport up to the same 751px cap
    // instead of sizing to content and leaving the page to scroll. Unlike those pages, this
    // screen's own content (the student grid) is genuinely expected to overflow 751px once
    // there are more than a handful of students, so the inner overflow-y-auto wrapper below is
    // the real, load-bearing scroll surface here, not just a rare fallback.
    <main className="flex h-screen flex-col overflow-hidden bg-page">
      <AppHeader
        accountContext={{
          name: session.displayName,
          isLoggedIn: Boolean(session.userId),
          onSignOut: handleSignOut,
        }}
      />
      <div className={flowCardBandClass}>
        <div
          className={cn(
            flowCardClass,
            "border border-border flex h-full max-h-[751px] flex-col overflow-hidden",
          )}
        >
          <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void navigate("/counselor/home")}
                aria-label="Back to dashboard"
                className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-foreground shadow-sm"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
              </button>
              <div className="flex flex-col gap-1">
                <h1 className="font-display text-2xl font-black text-foreground">All Students</h1>
                <p className="font-display text-sm text-muted-foreground">
                  View students assigned to your category.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:max-w-[401px]">
                <Search
                  className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by student name"
                  aria-label="Search by student name"
                  className="h-12 rounded-[8px] bg-white pl-11 text-base"
                />
              </div>
              <StatusFilterDropdown
                className="sm:w-[220px]"
                value={urlStatus}
                onValueChange={handleStatusChange}
                options={statusOptions}
                aria-label="Filter by status"
              />
            </div>

            <div className="mt-6">
              {studentsQuery.isPending ? (
                <LoadingState />
              ) : studentsQuery.isError ? (
                <ErrorState
                  message={getErrorMessage(studentsQuery.error, "We couldn't load your students.")}
                  onRetry={() => void studentsQuery.refetch()}
                />
              ) : students.length === 0 ? (
                <p className="py-16 text-center font-display text-base text-muted-foreground">
                  {hasActiveFilters ? "No students match these filters." : "No students yet."}
                </p>
              ) : (
                <div className="grid animate-in grid-cols-1 gap-x-4 gap-y-10 pt-10 fade-in duration-200 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {students.map((student) => (
                    <div
                      key={student.userId}
                      className="relative flex flex-col items-center rounded-b-2xl rounded-t-3xl border border-border bg-background px-4 pt-12 pb-4 shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <Avatar
                        name={student.firstName}
                        className="absolute -top-8 left-1/2 size-16 -translate-x-1/2 border-4 border-background text-lg"
                      />
                      <p className="flex items-center justify-center gap-2 text-center font-display text-base font-semibold text-foreground">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            STATUS_DOT_CLASSNAME[student.status],
                          )}
                          aria-hidden="true"
                        />
                        <span className="sr-only">{STATUS_LABEL[student.status]}: </span>
                        {student.firstName}
                      </p>
                      <p className="mt-1 font-display text-sm text-muted-foreground">
                        {SEGMENT_LABEL[student.segment] ?? student.segment}
                      </p>
                      <div className="mt-6 h-px w-full bg-border" />
                      <button
                        type="button"
                        onClick={() => void navigate(`/counselor/students/${student.userId}`)}
                        className="mt-3 flex cursor-pointer items-center gap-1 font-display text-sm font-bold text-brand transition-opacity duration-150 hover:opacity-75"
                      >
                        View Profile
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
