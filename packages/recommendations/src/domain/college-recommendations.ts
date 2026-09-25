import type {
  CollegeCatalogRecord,
  CollegeEligibilityExplanation,
  CollegeOwnership,
  MatchingConfig,
  ProfileSnapshotForRecommendations,
  RecommendationItem,
  RecommendationSet,
} from "@yuvapath/contracts";
import { stableHash } from "./career-matching.js";
import { proximityTierOf, type LocationProximityTier } from "./tn-district-regions.js";

// A small, deterministic preview of the filtered eligible list — not a "top N", see
// buildCollegeRecommendationSet()'s doc comment. Reuse this constant wherever the preview size
// matters (route responses, tests) instead of repeating the number.
export const COLLEGE_RING_PREVIEW_LIMIT = 5;
export const COLLEGE_RING_MIDDLE_LIMIT = 5;
export const COLLEGE_RING_OUTER_LIMIT = 5;

// Iteration 1 of real college ranking — location proximity is the only signal so far, so its
// weight is 1.0 by construction (a trivial-looking formula, kept as a named constant anyway so a
// future second signal is a weight rebalance, not a rewrite — same convention as
// pathway-recommendations.ts's CAREER_ALIGNMENT_WEIGHT etc.). Tier scores are a simple 1/0.5/0
// ladder: same district beats same region beats everywhere else in Tamil Nadu; "unknown" (no
// homeDistrict on file yet) scores the same as rest_of_tamil_nadu — no signal either way, not a
// penalty.
const LOCATION_PROXIMITY_WEIGHT = 1;
const LOCATION_PROXIMITY_TIER_SCORES: Record<LocationProximityTier, number> = {
  same_district: 1,
  same_region: 0.5,
  rest_of_tamil_nadu: 0,
  unknown: 0,
};

// Optional, composable eligibility filters. Every filter narrows the mandatory Tamil Nadu +
// discipline eligibility result; an omitted filter never restricts it (see
// resolveEligibleColleges()). Only fields the data audit found reliably populated across the
// catalogue are represented here.
export type CollegeFilterOptions = {
  programType?: string;
  instituteKind?: string;
  ownership?: CollegeOwnership;
  district?: string;
  admissionRoute?: string;
};

export type CollegeRecommendationInput = CollegeFilterOptions & {
  recommendationId: string;
  profile: ProfileSnapshotForRecommendations;
  colleges: CollegeCatalogRecord[];
  targetDisciplineIds: string[];
  config: MatchingConfig;
  createdAt: string;
};

export type EligibleCollege = RecommendationItem & {
  entityType: "college";
  explanation: CollegeEligibilityExplanation;
};

// Tamil Nadu-only, eligibility-based college recommendation with composable filtering, ranked by
// one real signal: location proximity (see LOCATION_PROXIMITY_WEIGHT above and
// docs/recommendation-pipeline-explained.md, updated to record why — a prior fitScore was removed
// for being constant across the whole catalogue; proximity is the first one that genuinely varies
// per student). This ranks, it never filters: a college's eligibility is decided entirely by the
// filter chain below, before proximity is even computed — a far-away-but-eligible college always
// still appears in the result, just ordered later.
//
// A college is eligible when at least one of its verified programmes matches the target
// discipline(s) AND, if selected, the programme-level filters (programType, admissionRoute) —
// checked against the SAME programme, not independently against any programme at the college.
// A college offering "B.Sc Computer Science" and separately "B.Voc Software Development" must
// not qualify for "discipline=Computer Science, programme=B.Voc": no single programme satisfies
// both. College-level filters (instituteKind, ownership, district) apply to the college as a
// whole, since those attributes don't vary by programme.
export function resolveEligibleColleges(input: CollegeRecommendationInput): EligibleCollege[] {
  if (input.targetDisciplineIds.length === 0) {
    return [];
  }

  return input.colleges
    .filter((college) => college.verified)
    .filter((college) => !input.instituteKind || college.instituteKind === input.instituteKind)
    .filter((college) => !input.ownership || college.ownership === input.ownership)
    .filter((college) => !input.district || college.district === input.district)
    .map((college) => {
      const matchingPrograms = college.programs.filter(
        (program) =>
          input.targetDisciplineIds.includes(program.disciplineId) &&
          (!input.programType || program.programType === input.programType) &&
          (!input.admissionRoute || program.admissionRoute === input.admissionRoute),
      );
      return { college, matchingPrograms };
    })
    .filter(({ matchingPrograms }) => matchingPrograms.length > 0)
    .map(({ college, matchingPrograms }) => {
      const locationProximityTier = proximityTierOf(input.profile.homeDistrict, college.district);
      const locationProximity = round(
        LOCATION_PROXIMITY_TIER_SCORES[locationProximityTier] * LOCATION_PROXIMITY_WEIGHT,
        input.config.roundingScale,
      );

      const item: EligibleCollege = {
        itemId: `college:${college.collegeId}`,
        entityType: "college",
        entityId: college.collegeId,
        title: college.title,
        rank: 1,
        fitScore: locationProximity,
        explanation: {
          schemaVersion: 4 as const,
          matchedDisciplineIds: dedupe(matchingPrograms.map((program) => program.disciplineId)),
          instituteKind: college.instituteKind,
          ownership: college.ownership,
          district: college.district,
          matchedProgramTypes: dedupe(matchingPrograms.map((program) => program.programType)),
          matchedAdmissionRoutes: dedupe(matchingPrograms.map((program) => program.admissionRoute)),
          locationProximity,
          locationProximityTier,
        },
        entityDatasetVersion: college.datasetVersion,
      };

      return item;
    })
    .sort(compareEligibleColleges)
    .map((college, index) => ({ ...college, rank: index + 1 }));
}

// `items` is the FULL eligible list, fitScore-ordered — unlike Pathway/Career's curated top-N
// `items`, College's list is the actual browsable catalogue (a popular discipline can have
// hundreds of eligible colleges), so it is never truncated here; only `rings` curates a small
// preview. An item only carries a `ring` value if partitionCollegeRings() actually placed it in
// one — every other item keeps no ring, same as today's inner-only behavior, just now correct
// for middle/outer too.
export function buildCollegeRecommendationSet(input: CollegeRecommendationInput): RecommendationSet {
  const eligible = resolveEligibleColleges(input);
  const rings = partitionCollegeRings(eligible);
  const ringedIds = new Map(
    [...rings.inner, ...rings.middle, ...rings.outer].map((item) => [item.entityId, item.ring]),
  );
  const items = eligible.map((item) => {
    const ring = ringedIds.get(item.entityId);
    return ring ? { ...item, ring } : item;
  });

  const sourceDataVersions = collectSourceDataVersions(input.colleges);
  const inputHash = stableHash({
    profile: input.profile,
    config: input.config,
    targetDisciplineIds: [...input.targetDisciplineIds].sort(),
    // Every selected filter must change the cache key — a request for "Computer Science +
    // Government + Coimbatore" must never return a cached result computed for
    // "Computer Science + Private + Chennai".
    programType: input.programType ?? null,
    instituteKind: input.instituteKind ?? null,
    ownership: input.ownership ?? null,
    district: input.district ?? null,
    admissionRoute: input.admissionRoute ?? null,
    collegeIds: input.colleges
      .map((college) => ({
        collegeId: college.collegeId,
        datasetVersion: college.datasetVersion,
      }))
      .sort((left, right) => left.collegeId.localeCompare(right.collegeId, "en")),
    sourceDataVersions,
  });
  const outputHash = stableHash({
    kind: "college",
    items,
    algorithmVersion: input.config.algorithmVersion,
    weightsVersion: input.config.weightsVersion,
  });

  return {
    recommendationId: input.recommendationId,
    profileSnapshotId: input.profile.profileSnapshotId,
    kind: "college",
    items,
    rings,
    algorithmVersion: input.config.algorithmVersion,
    weightsVersion: input.config.weightsVersion,
    sourceDataVersions,
    inputHash,
    outputHash,
    createdAt: input.createdAt,
  };
}

export type CollegeRings = {
  inner: EligibleCollege[];
  middle: EligibleCollege[];
  outer: EligibleCollege[];
};

/**
 * Curates the fitScore-ordered eligible list into the three proximity tiers:
 *   - inner: same-district colleges — the strongest possible "near you" signal.
 *   - middle: same-region colleges that didn't already make the inner cut.
 *   - outer: backfilled from whatever's left (same_region overflow, rest_of_tamil_nadu, unknown)
 *     so the ring is always full whenever enough eligible colleges exist, even for a student with
 *     no homeDistrict on file yet.
 * Unlike Pathway/Career's ring partitioning, this runs over the FULL eligible list, not a
 * truncated top-N pool — a same-district college shouldn't lose its inner-ring slot just because
 * a hundred other, farther-away colleges happen to sort ahead of it before proximity tiering by
 * fitScore, and each tier can be genuinely deep for a broad discipline.
 */
function partitionCollegeRings(eligible: EligibleCollege[]): CollegeRings {
  const inner = takeMatching(
    eligible,
    [],
    COLLEGE_RING_PREVIEW_LIMIT,
    (college) => college.explanation.locationProximityTier === "same_district",
  );
  const middle = takeMatching(
    eligible,
    inner,
    COLLEGE_RING_MIDDLE_LIMIT,
    (college) => college.explanation.locationProximityTier === "same_region",
  );
  const outer = takeMatching(eligible, [...inner, ...middle], COLLEGE_RING_OUTER_LIMIT, () => true);

  return {
    inner: withRing(inner, "inner"),
    middle: withRing(middle, "middle"),
    outer: withRing(outer, "outer"),
  };
}

// Same shape as pathway-recommendations.ts's own takeMatching()/withRing() — duplicated locally
// rather than shared/exported, matching this codebase's existing per-domain-file convention (see
// career-matching.ts's own private copy too).
function takeMatching(
  candidates: EligibleCollege[],
  alreadyTaken: EligibleCollege[],
  targetCount: number,
  predicate: (college: EligibleCollege) => boolean,
): EligibleCollege[] {
  const takenIds = new Set(alreadyTaken.map((college) => college.entityId));
  const matches = candidates.filter((college) => !takenIds.has(college.entityId) && predicate(college));

  if (matches.length >= targetCount) {
    return matches.slice(0, targetCount);
  }

  const fallback = candidates.filter(
    (college) => !takenIds.has(college.entityId) && !matches.some((match) => match.entityId === college.entityId),
  );

  return [...matches, ...fallback].slice(0, targetCount);
}

function withRing(colleges: EligibleCollege[], ring: NonNullable<EligibleCollege["ring"]>): EligibleCollege[] {
  return colleges.map((college) => ({ ...college, ring }));
}

// Ranked by fitScore (location proximity) first — the one real signal today — falling back to
// the same deterministic alphabetical-by-title, then entityId, tiebreak this always used, so two
// colleges in the same tier still resolve to a stable, explainable order rather than nothing.
function compareEligibleColleges(left: EligibleCollege, right: EligibleCollege): number {
  const scoreDifference = (right.fitScore ?? 0) - (left.fitScore ?? 0);
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const titleDifference = normalizeTitle(left.title).localeCompare(normalizeTitle(right.title), "en");
  if (titleDifference !== 0) {
    return titleDifference;
  }

  return left.entityId.localeCompare(right.entityId, "en");
}

function round(value: number, scale: number): number {
  const multiplier = 10 ** scale;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function collectSourceDataVersions(colleges: CollegeCatalogRecord[]): Record<string, string> {
  const versions = [...new Set(colleges.map((college) => college.datasetVersion))].sort();
  return { colleges: versions.join(",") };
}

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase("en");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
