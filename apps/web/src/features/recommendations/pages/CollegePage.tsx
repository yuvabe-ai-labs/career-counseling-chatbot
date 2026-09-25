import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import type { RecommendationItem, TnDistrict } from "@yuvapath/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { LoadingState } from "@/components/LoadingState";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { getStoredExploreGatingContext, getStoredProfileSnapshotId } from "@/lib/storage";
import { useSession } from "@/features/assessment";
import { DISTRICT_OPTIONS } from "@/features/assessment/data";
import type { CollegeFilters } from "../api/college";
import { CollegeDetailSheet, isCollegeExplanation } from "../components/CollegeDetailSheet";
import { CollegeOptionCard } from "../components/CollegeOptionCard";
import { useCollegeRecommendations } from "../hooks/useCollegeRecommendations";

const ALL_VALUE = "";

type FilterOptions = {
  programType: string[];
  instituteKind: string[];
  ownership: string[];
  admissionRoute: string[];
};

/**
 * Filter dropdown options are derived from the district-only baseline response's own items, not a
 * hardcoded reference list. That keeps the options exactly in sync with what the catalogue
 * actually contains for that district. The district picker itself offers every Tamil Nadu
 * district, not just ones with a currently-eligible college.
 */
function deriveFilterOptions(items: RecommendationItem[]): FilterOptions {
  const programType = new Set<string>();
  const instituteKind = new Set<string>();
  const ownership = new Set<string>();
  const admissionRoute = new Set<string>();

  for (const item of items) {
    if (!isCollegeExplanation(item.explanation)) continue;
    item.explanation.matchedProgramTypes.forEach((value) => programType.add(value));
    instituteKind.add(item.explanation.instituteKind);
    ownership.add(item.explanation.ownership);
    item.explanation.matchedAdmissionRoutes.forEach((value) => admissionRoute.add(value));
  }

  const sort = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b, "en"));
  return {
    programType: sort(programType),
    instituteKind: sort(instituteKind),
    ownership: sort(ownership),
    admissionRoute: sort(admissionRoute),
  };
}

// A native <select> list is as wide as its longest option and can spill past the filter box, so long
// catalogue labels are shortened for display only (the filter value stays the full text).
const OPTION_LABEL_MAX = 32;
const shortenLabel = (value: string) =>
  value.length > OPTION_LABEL_MAX ? `${value.slice(0, OPTION_LABEL_MAX - 1).trimEnd()}…` : value;

const OWNERSHIP_OPTION_LABEL: Record<string, string> = {
  government: "Government",
  government_aided: "Government Aided",
  private: "Private",
  other: "Other",
};

/**
 * Pathfinder / study-goal Launcher tab. The student must pick a district first; nothing is
 * requested or shown until they do. Then the backend returns every eligible Tamil Nadu college
 * in that district (`district` is a hard filter — see college-recommendations.ts
 * resolveEligibleColleges()) for the student's target pathway, and the filter dropdowns narrow
 * that list further. Changing the district refetches and resets the other filters.
 */
export function CollegePage() {
  const navigate = useNavigate();
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null);
  // Nothing is requested until a district is picked (a null snapshot id disables the query — see
  // useCollegeRecommendations), and it is deliberately not remembered between visits.
  const [district, setDistrict] = useState<TnDistrict | null>(null);
  // The programme/type/ownership/route filters, applied on top of the district.
  const [filters, setFilters] = useState<Omit<CollegeFilters, "district">>({});

  // The district alone (no other filter), purely to derive the filter dropdowns' option lists —
  // kept separate from the displayed result so picking one filter never shrinks the other
  // dropdowns. With no other filter selected this is the same request as resultQuery, so React
  // Query serves both from the one cache entry.
  const activeSnapshotId = district ? profileSnapshotId : null;
  const baselineQuery = useCollegeRecommendations(activeSnapshotId, district ? { district } : {});
  const resultQuery = useCollegeRecommendations(
    activeSnapshotId,
    district ? { ...filters, district } : {},
  );

  const filterOptions = useMemo(
    () => deriveFilterOptions(baselineQuery.data?.items ?? []),
    [baselineQuery.data],
  );

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }

  const items = resultQuery.data?.items ?? [];
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const setFilter = (key: keyof CollegeFilters) => (value: string) => {
    setFilters((current) => ({ ...current, [key]: value === ALL_VALUE ? undefined : value }));
  };

  // A different district is a different question: the other filters (and the options derived
  // for the previous district) don't carry over.
  const handleDistrictChange = (value: string) => {
    setDistrict(value === ALL_VALUE ? null : (value as TnDistrict));
    setFilters({});
    setSelectedItem(null);
  };

  const filterSelects = [
    {
      key: "programType" as const,
      label: "Programme",
      values: filterOptions.programType,
      format: shortenLabel,
    },
    {
      key: "instituteKind" as const,
      label: "College Type",
      values: filterOptions.instituteKind,
      format: shortenLabel,
    },
    {
      key: "ownership" as const,
      label: "Ownership",
      values: filterOptions.ownership,
      format: (value: string) => OWNERSHIP_OPTION_LABEL[value] ?? value,
    },
    {
      key: "admissionRoute" as const,
      label: "Admission Route",
      values: filterOptions.admissionRoute,
      format: shortenLabel,
    },
  ];
  const messageClassName =
    "rounded-2xl border border-dashed border-border bg-white/60 px-6 py-12 text-center font-display text-base text-muted-foreground";

  return (
    // Same fixed-viewport shell as Streams/Explore Path: the card is capped at 751px and centred,
    // and the inner wrapper scrolls (scrollbar hidden) once a district has many colleges.
    <main className="flex h-screen flex-col overflow-hidden bg-page">
      <AppHeader />
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
                onClick={() => void navigate("/explore-path")}
                aria-label="Back to Explore Path"
                className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-foreground shadow-sm"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
              </button>
              <h1 className="font-display text-2xl leading-[1.2] font-bold text-foreground sm:text-3xl lg:text-[34px]">
                Colleges
              </h1>
            </div>
            <p className="mt-5 font-display text-sm leading-[1.4] text-foreground sm:text-base lg:text-lg">
              Colleges offering this discipline
            </p>

            <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-foreground">Your district</Label>
                <SelectField
                  className="mt-2"
                  value={district ?? ALL_VALUE}
                  onValueChange={handleDistrictChange}
                  placeholder="Select your district"
                  options={DISTRICT_OPTIONS}
                  aria-label="Your district"
                />
              </div>
              {district && filterOptions.instituteKind.length > 0
                ? filterSelects
                    .filter((select) => select.values.length > 1)
                    .map((select) => (
                      <div key={select.key}>
                        <Label className="text-foreground">{select.label}</Label>
                        <SelectField
                          className="mt-2"
                          value={filters[select.key] ?? ALL_VALUE}
                          onValueChange={setFilter(select.key)}
                          options={[
                            { value: ALL_VALUE, label: "All" },
                            ...select.values.map((value) => ({
                              value,
                              label: select.format(value),
                            })),
                          ]}
                        />
                      </div>
                    ))
                : null}
            </div>

            <div className="mt-6 flex flex-1 flex-col">
              {!district ? (
                <p className={messageClassName}>Select your district to see colleges.</p>
              ) : resultQuery.isPending ? (
                <LoadingState />
              ) : resultQuery.isError ? (
                <ErrorState
                  message={getErrorMessage(
                    resultQuery.error,
                    "We couldn't load your college matches.",
                  )}
                  onRetry={() => void resultQuery.refetch()}
                />
              ) : items.length > 0 ? (
                <>
                  <p className="mb-3 font-display text-sm font-semibold text-muted-foreground">
                    {items.length} {items.length === 1 ? "college" : "colleges"} in {district}
                  </p>
                  <div
                    key={`${district}|${JSON.stringify(filters)}`}
                    className="grid animate-in grid-cols-1 gap-6 fade-in duration-200 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {items.map((item) => (
                      <CollegeOptionCard key={item.itemId} item={item} onSelect={setSelectedItem} />
                    ))}
                  </div>
                </>
              ) : (
                <p className={messageClassName}>
                  {hasActiveFilters
                    ? `No colleges in ${district} match these filters. Try changing the filters or another district.`
                    : `No colleges in ${district} offer this pathway yet. Try another district.`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <CollegeDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </main>
  );
}
