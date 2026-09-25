import type {
  MatchingConfig,
  ProfileSnapshotForRecommendations,
  RecommendationItem,
  RecommendationSet,
  RiasecLetter,
  StreamCatalogRecord,
  StreamFitExplanation,
} from "@yuvapath/contracts";
import { stableHash } from "./career-matching.js";

export type StreamRecommendationInput = {
  recommendationId: string;
  profile: ProfileSnapshotForRecommendations;
  streams: StreamCatalogRecord[];
  // Student's most recently stored Career ranking, best rank first — same shape/source as
  // PathwayRecommendationInput.rankedCareerIds. Empty when the student has never had a Career
  // recommendation computed; scoreStreams() degrades gracefully to today's exact formula in
  // that case (see careerStreamAlignment()'s own comment). See
  // docs/architecture/career-stream-mapping-iteration-1-plan.md.
  rankedCareerIds: string[];
  config: MatchingConfig;
  createdAt: string;
};

export type ScoredStream = RecommendationItem & {
  entityType: "stream";
  explanation: StreamFitExplanation;
};

export function scoreStreams(input: StreamRecommendationInput): ScoredStream[] {
  const topStudentLetters = topRiasecLetters(input.profile.riasec, input.config.riasecTieOrder, 3);

  return input.streams
    .filter((stream) => stream.verified)
    .map((stream) => {
      const matchedLetters = topStudentLetters.filter((letter) =>
        stream.riasecLetters.includes(letter),
      );
      const riasecOverlap = round(matchedLetters.length / topStudentLetters.length, input.config.roundingScale);
      const segmentFit = stream.recommendedSegments.includes(input.profile.segment) ? 1 : 0;
      const marksFit = calculateMarksFit(input.profile.marksBand, stream.marksBands);
      const priorityFit = 1 / (stream.priority + 1);
      const { careerAlignment, matchedCareerIds } = careerStreamAlignment(
        stream,
        input.rankedCareerIds,
        input.config.roundingScale,
      );
      // Redistribute weight toward careerAlignment only when a real career signal exists for
      // THIS stream — same "missing input redistributes weight" degradation pattern already
      // used for Career's valuesFit (career-matching.ts). With zero knowledge.career_streams
      // rows seeded (day one), careerAlignment is always 0 for every stream, so this branch
      // never fires and fitScore is byte-identical to the pre-Iteration-1 formula — see
      // stream-recommendations.test.ts's regression pin.
      const fitScore = round(
        careerAlignment > 0
          ? riasecOverlap * 0.30 + careerAlignment * 0.35 + segmentFit * 0.20 + marksFit * 0.10 + priorityFit * 0.05
          : riasecOverlap * 0.55 + segmentFit * 0.25 + marksFit * 0.15 + priorityFit * 0.05,
        input.config.roundingScale,
      );

      const item: ScoredStream = {
        itemId: `stream:${stream.streamId}`,
        entityType: "stream",
        entityId: stream.streamId,
        title: stream.title,
        rank: 1,
        fitScore,
        explanation: {
          schemaVersion: 1 as const,
          riasecOverlap,
          segmentFit,
          marksFit,
          catalogPriority: stream.priority,
          topStudentLetters,
          matchedLetters,
          ...(stream.description ? { description: stream.description } : {}),
          ...(careerAlignment > 0 ? { careerAlignment, matchedCareerIds } : {}),
        },
        entityDatasetVersion: stream.datasetVersion,
      };

      return item;
    })
    .sort(compareScoredStreams)
    .map((stream, index) => ({ ...stream, rank: index + 1 }));
}

export function buildStreamRecommendationSet(input: StreamRecommendationInput): RecommendationSet {
  const items = scoreStreams(input);
  const sourceDataVersions = collectSourceDataVersions(input.streams);
  const inputHash = stableHash({
    profile: input.profile,
    config: input.config,
    rankedCareerIds: input.rankedCareerIds,
    streamIds: input.streams
      .map((stream) => ({
        streamId: stream.streamId,
        datasetVersion: stream.datasetVersion,
      }))
      .sort((left, right) => left.streamId.localeCompare(right.streamId, "en")),
    sourceDataVersions,
  });
  const outputHash = stableHash({
    kind: "stream",
    items,
    algorithmVersion: input.config.algorithmVersion,
    weightsVersion: input.config.weightsVersion,
  });

  return {
    recommendationId: input.recommendationId,
    profileSnapshotId: input.profile.profileSnapshotId,
    kind: "stream",
    items,
    algorithmVersion: input.config.algorithmVersion,
    weightsVersion: input.config.weightsVersion,
    sourceDataVersions,
    inputHash,
    outputHash,
    createdAt: input.createdAt,
  };
}

function topRiasecLetters(
  vector: ProfileSnapshotForRecommendations["riasec"],
  tieOrder: MatchingConfig["riasecTieOrder"],
  count: number,
): RiasecLetter[] {
  return [...tieOrder]
    .sort((left, right) => {
      const scoreDifference = vector[right] - vector[left];
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return tieOrder.indexOf(left) - tieOrder.indexOf(right);
    })
    .slice(0, count);
}

// Rank-weighted overlap between the student's ranked careers and this stream's own
// knowledge.career_streams links, each link's weight multiplying its contribution — same
// Σ 1/(rank+1) shape as pathway-recommendations.ts's rankedAlignment() (duplicated here rather
// than shared, matching this file's existing convention of not sharing scoring helpers across
// the two domain files, e.g. calculateMarksFit below). Returns 0 (not undefined) when there's
// no rankedCareerIds or no careerLinks at all — scoreStreams() treats 0 as "no signal" for the
// weight-redistribution decision.
function careerStreamAlignment(
  stream: StreamCatalogRecord,
  rankedCareerIds: string[],
  roundingScale: number,
): { careerAlignment: number; matchedCareerIds: string[] } {
  if (rankedCareerIds.length === 0 || !stream.careerLinks || stream.careerLinks.length === 0) {
    return { careerAlignment: 0, matchedCareerIds: [] };
  }

  const totalWeight = rankedCareerIds.reduce((sum, _id, index) => sum + 1 / (index + 1), 0);
  const matchedCareerIds: string[] = [];
  const matchedWeight = stream.careerLinks.reduce((sum, link) => {
    const rank = rankedCareerIds.indexOf(link.careerId);
    if (rank === -1) return sum;
    matchedCareerIds.push(link.careerId);
    return sum + link.weight * (1 / (rank + 1));
  }, 0);

  return {
    careerAlignment: round(matchedWeight / totalWeight, roundingScale),
    matchedCareerIds,
  };
}

function calculateMarksFit(profileMarksBand: string | undefined, streamMarksBands: string[] | undefined): number {
  if (!streamMarksBands || streamMarksBands.length === 0) {
    return 0.5;
  }

  if (!profileMarksBand) {
    return 0.5;
  }

  return streamMarksBands.includes(profileMarksBand) ? 1 : 0;
}

function compareScoredStreams(left: ScoredStream, right: ScoredStream): number {
  const scoreDifference = (right.fitScore ?? 0) - (left.fitScore ?? 0);
  if (scoreDifference !== 0) {
    return scoreDifference;
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

function collectSourceDataVersions(streams: StreamCatalogRecord[]): Record<string, string> {
  const versions = [...new Set(streams.map((stream) => stream.datasetVersion))].sort();
  return { streams: versions.join(",") };
}

function round(value: number, scale: number): number {
  const multiplier = 10 ** scale;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase("en");
}
