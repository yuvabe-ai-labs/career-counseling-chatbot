import type {
  MatchingConfig,
  PathwayCatalogRecord,
  PathwayFitExplanation,
  ProfileSnapshotForRecommendations,
  RecommendationItem,
  RecommendationSet,
} from "@yuvapath/contracts";
import { stableHash } from "./career-matching.js";

// A raw college-availability count spans 1 to 1287 across the real catalog (heavily
// right-skewed: most pathways cluster under a few dozen colleges, but a handful of very broad
// disciplines like Commerce sit in the hundreds/thousands). A linear count/CAP normalization
// would either saturate at 1.0 for most of the catalog (small CAP) or barely register any signal
// for anything but the biggest disciplines (large CAP). Log-scaling compresses that range into a
// fair 0..1 signal without either failure mode — the actual real-world case this fixes (9
// colleges vs 136 colleges for the same subject) lands roughly 0.32 vs 0.69, a meaningful gap,
// while 653 vs 1287 (both already "widely available") lands close together at roughly 0.90 vs
// 1.0 rather than being torn apart by raw count. 1500 is a fixed reference ceiling slightly above
// today's observed max (1287) so the normalization doesn't need to change as the catalog grows by
// a few colleges; it only needs revisiting if some future pathway's discipline coverage
// meaningfully exceeds it.
const COLLEGE_AVAILABILITY_REFERENCE_CEILING = 1500;

// Iteration 2 weights (docs/architecture/stream-pathway-mapping-iteration-2-plan.md §3) — an
// initial design hypothesis, not a final calibration; kept as named literals in one place
// (matching Stream's own Iteration 1 convention) rather than wired into MatchingConfig, since
// stream_rank/pathway_rank's DB-stored weight columns are already inert today (only
// roundingScale/riasecTieOrder are read from them — a separate, pre-existing simplification,
// not something this iteration fixes). Sums to 1.0. "Profile/segment fit" and "Academic
// feasibility" are each split across two existing sub-factors, proportionally to their old (v1)
// ratio: segmentFit:marksFit was 15:10 (60:40) and reachability:backupRouteFit was 20:3 (~87:13).
const CAREER_ALIGNMENT_WEIGHT = 0.4;
const STREAM_ALIGNMENT_WEIGHT = 0.3;
const COLLEGE_AVAILABILITY_WEIGHT = 0.15;
const SEGMENT_FIT_WEIGHT = 0.06;
const MARKS_FIT_WEIGHT = 0.04;
const REACHABILITY_WEIGHT = 0.045;
const BACKUP_ROUTE_FIT_WEIGHT = 0.005;

export type PathwayRecommendationInput = {
  recommendationId: string;
  profile: ProfileSnapshotForRecommendations;
  pathways: PathwayCatalogRecord[];
  rankedCareerIds: string[];
  // Was accepted and hashed into the cache key but never actually read by scoring until this
  // iteration — see docs/architecture/stream-pathway-mapping-iteration-2-plan.md §0/§6.
  rankedStreamIds: string[];
  config: MatchingConfig;
  createdAt: string;
};

export type ScoredPathway = RecommendationItem & {
  entityType: "pathway";
  explanation: PathwayFitExplanation;
};

export type PathwayRings = {
  inner: ScoredPathway[];
  middle: ScoredPathway[];
  outer: ScoredPathway[];
};

export function scorePathways(input: PathwayRecommendationInput): ScoredPathway[] {
  return input.pathways
    .filter((pathway) => pathway.verified)
    .map((pathway) => {
      const matchedCareerIds = input.rankedCareerIds.filter((careerId) =>
        pathway.careerIds.includes(careerId),
      );
      const careerAlignment = rankedAlignment(matchedCareerIds, input.rankedCareerIds, input.config.roundingScale);
      const matchedStreamOptionIds = input.rankedStreamIds.filter((streamOptionId) =>
        pathway.streamOptionIds.includes(streamOptionId),
      );
      const streamAlignment = rankedAlignment(matchedStreamOptionIds, input.rankedStreamIds, input.config.roundingScale);
      const segmentFit = pathway.recommendedSegments.includes(input.profile.segment) ? 1 : 0;
      const marksFit = calculateMarksFit(input.profile.marksBand, pathway.marksBands);
      const reachability = round(pathway.reachability, input.config.roundingScale);
      const backupRouteFit = pathway.hasBackupRoute ? 1 : 0;
      const collegeAvailability = round(
        Math.min(
          Math.log(pathway.collegeCount + 1) / Math.log(COLLEGE_AVAILABILITY_REFERENCE_CEILING + 1),
          1,
        ),
        input.config.roundingScale,
      );
      // v2 (Iteration 2) rebalance — streamAlignment=0 for an unmatched pathway is a real score,
      // not redistributed, same as careerAlignment already behaves for a pathway matching none
      // of the student's ranked careers. See this file's own weight-constant comments above.
      const fitScore = round(
        careerAlignment * CAREER_ALIGNMENT_WEIGHT +
          streamAlignment * STREAM_ALIGNMENT_WEIGHT +
          collegeAvailability * COLLEGE_AVAILABILITY_WEIGHT +
          segmentFit * SEGMENT_FIT_WEIGHT +
          marksFit * MARKS_FIT_WEIGHT +
          reachability * REACHABILITY_WEIGHT +
          backupRouteFit * BACKUP_ROUTE_FIT_WEIGHT,
        input.config.roundingScale,
      );

      const item: ScoredPathway = {
        itemId: `pathway:${pathway.pathwayId}`,
        entityType: "pathway",
        entityId: pathway.pathwayId,
        title: pathway.title,
        rank: 1,
        fitScore,
        explanation: {
          schemaVersion: 2 as const,
          careerAlignment,
          streamAlignment,
          collegeAvailability,
          segmentFit,
          marksFit,
          reachability,
          backupRouteFit,
          catalogPriority: pathway.priority,
          matchedCareerIds,
          matchedStreamOptionIds,
        },
        entityDatasetVersion: pathway.datasetVersion,
      };

      return item;
    })
    .sort(compareScoredPathways)
    .map((pathway, index) => ({ ...pathway, rank: index + 1 }));
}

export function buildPathwayRecommendationSet(input: PathwayRecommendationInput): RecommendationSet {
  const scored = scorePathways(input);
  const rings = partitionPathwayRings(scored);
  const ringedItems = [...rings.inner, ...rings.middle, ...rings.outer].sort(
    (left, right) => left.rank - right.rank,
  );
  const sourceDataVersions = collectSourceDataVersions(input.pathways);
  const inputHash = stableHash({
    profile: input.profile,
    config: input.config,
    rankedCareerIds: input.rankedCareerIds,
    rankedStreamIds: input.rankedStreamIds,
    pathwayIds: input.pathways
      .map((pathway) => ({
        pathwayId: pathway.pathwayId,
        datasetVersion: pathway.datasetVersion,
      }))
      .sort((left, right) => left.pathwayId.localeCompare(right.pathwayId, "en")),
    sourceDataVersions,
  });
  const outputHash = stableHash({
    kind: "pathway",
    items: ringedItems,
    rings,
    algorithmVersion: input.config.algorithmVersion,
    weightsVersion: input.config.weightsVersion,
  });

  return {
    recommendationId: input.recommendationId,
    profileSnapshotId: input.profile.profileSnapshotId,
    kind: "pathway",
    items: ringedItems,
    rings,
    algorithmVersion: input.config.algorithmVersion,
    weightsVersion: input.config.weightsVersion,
    sourceDataVersions,
    inputHash,
    outputHash,
    createdAt: input.createdAt,
  };
}

/**
 * Curates the full scored catalog down to the ~16 pathways that best "suit the user" instead of
 * handing back every published pathway (previously all 158) — same shape/sizing as
 * partitionCareerRings() in career-matching.ts, tuned to pathway's own signals:
 *   - inner (4): pathways reachable via one of the student's own top-ranked careers OR streams
 *     (matchedCareerIds or matchedStreamOptionIds non-empty — widened in Iteration 2 to match
 *     the new architecture's intent: either signal is a strong "suits them" hit) — the strongest
 *     possible "suits them" signal.
 *   - middle (6): widely available pathways (collegeAvailability >= 0.5, i.e. real, easy-to-find
 *     routes with dozens of colleges actually offering them) that didn't come from a direct
 *     career/stream hit — a genuine "safe, accessible option" tier, not just a leftover bucket.
 *   - outer (6): backfilled from the remaining top-scored candidates, so every ring is always
 *     full even for a profile with few/no matched careers/streams or widely-available pathways.
 * Candidates are the top 18 by fitScore (already sorted/ranked by scorePathways), matching
 * career/college's own candidate-pool size.
 */
export function partitionPathwayRings(scoredPathways: ScoredPathway[]): PathwayRings {
  const candidates = scoredPathways.slice(0, 18);

  const inner = takeMatching(
    candidates,
    [],
    4,
    (pathway) =>
      pathway.explanation.matchedCareerIds.length > 0 || pathway.explanation.matchedStreamOptionIds.length > 0,
  );
  const middle = takeMatching(candidates, inner, 6, (pathway) => pathway.explanation.collegeAvailability >= 0.5);
  const outer = takeMatching(candidates, [...inner, ...middle], 6, () => true);

  return {
    inner: withRing(inner, "inner"),
    middle: withRing(middle, "middle"),
    outer: withRing(outer, "outer"),
  };
}

function takeMatching(
  candidates: ScoredPathway[],
  alreadyTaken: ScoredPathway[],
  targetCount: number,
  predicate: (pathway: ScoredPathway) => boolean,
): ScoredPathway[] {
  const takenIds = new Set(alreadyTaken.map((pathway) => pathway.entityId));
  const matches = candidates.filter((pathway) => !takenIds.has(pathway.entityId) && predicate(pathway));

  if (matches.length >= targetCount) {
    return matches.slice(0, targetCount);
  }

  const fallback = candidates.filter(
    (pathway) =>
      !takenIds.has(pathway.entityId) && !matches.some((match) => match.entityId === pathway.entityId),
  );

  return [...matches, ...fallback].slice(0, targetCount);
}

function withRing(pathways: ScoredPathway[], ring: NonNullable<ScoredPathway["ring"]>): ScoredPathway[] {
  return pathways.map((pathway) => ({ ...pathway, ring }));
}

function rankedAlignment(matchedIds: string[], rankedIds: string[], roundingScale: number): number {
  if (rankedIds.length === 0 || matchedIds.length === 0) {
    return 0;
  }

  const totalWeight = rankedIds.reduce((sum, _id, index) => sum + 1 / (index + 1), 0);
  const matchedWeight = matchedIds.reduce((sum, id) => {
    const index = rankedIds.indexOf(id);
    return index === -1 ? sum : sum + 1 / (index + 1);
  }, 0);

  return round(matchedWeight / totalWeight, roundingScale);
}

function calculateMarksFit(profileMarksBand: string | undefined, pathwayMarksBands: string[] | undefined): number {
  if (!pathwayMarksBands || pathwayMarksBands.length === 0) {
    return 0.5;
  }

  if (!profileMarksBand) {
    return 0.5;
  }

  return pathwayMarksBands.includes(profileMarksBand) ? 1 : 0;
}

function compareScoredPathways(left: ScoredPathway, right: ScoredPathway): number {
  const scoreDifference = (right.fitScore ?? 0) - (left.fitScore ?? 0);
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const reachabilityDifference = right.explanation.reachability - left.explanation.reachability;
  if (reachabilityDifference !== 0) {
    return reachabilityDifference;
  }

  const priorityDifference = left.explanation.catalogPriority - right.explanation.catalogPriority;
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const titleDifference = normalizeTitle(left.title).localeCompare(normalizeTitle(right.title), "en");
  if (titleDifference !== 0) {
    return titleDifference;
  }

  return left.entityId.localeCompare(right.entityId, "en");
}

function collectSourceDataVersions(pathways: PathwayCatalogRecord[]): Record<string, string> {
  const versions = [...new Set(pathways.map((pathway) => pathway.datasetVersion))].sort();
  return { pathways: versions.join(",") };
}

function round(value: number, scale: number): number {
  const multiplier = 10 ** scale;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase("en");
}
