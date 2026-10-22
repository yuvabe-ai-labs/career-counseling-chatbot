import { createHash } from "node:crypto";
import type {
  ClusterfitClusterResult,
  ClusterfitGradePath,
  ClusterfitResult,
} from "@yuvapath/contracts";
import {
  APTITUDE_DOMAINS,
  CLUSTERS,
  CONTENT_VERSION,
  INTEREST_ITEMS,
  WORK_STYLE_DIMENSIONS,
  WORK_STYLE_ITEMS,
  type AptitudeDomain,
  type AptitudeOptionKey,
  type ClusterCode,
  type WorkStyleDimension,
} from "../content/v1/index.js";
import { aptitudeItemsForGradePath } from "./grade-path.js";
import type { ClusterfitScoringConfig } from "./scoring-config.js";

export type InterestAnswer = 0 | 1 | 2;
export type WorkStyleAnswer = 0 | 1 | 2 | 3;

/**
 * Raw answers exactly as stored. A missing key means "not answered". For Part C, `null` means the
 * student pressed "Skip for now"; both score 0, as on paper.
 */
export type ClusterfitScoringInput = {
  gradePath: ClusterfitGradePath;
  /** Canonical Part A medium; null when not collected, so language caution is "unknown". */
  medium: "english" | "tamil" | "hindi" | "other" | null;
  interest: Readonly<Record<string, InterestAnswer>>;
  aptitude: Readonly<Record<string, AptitudeOptionKey | null>>;
  workStyle: Readonly<Record<string, WorkStyleAnswer>>;
};

type AptitudeScore = { correct: number; attempted: number; score: number };
type StyleScore = {
  raw: number | null;
  level: "low" | "mid" | "high" | null;
  points: number | null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Sums a 4-item group; with 3 of 4 answered the sum is prorated (plan §4.6); fewer → null. */
const groupSum = (values: readonly (number | undefined)[], minAnswered: number): number | null => {
  const answered = values.filter((value): value is number => value !== undefined);
  if (answered.length < minAnswered) return null;
  const sum = answered.reduce((total, value) => total + value, 0);
  return answered.length === values.length
    ? sum
    : Math.round((sum * values.length) / answered.length);
};

const scoreAptitude = (input: ClusterfitScoringInput, config: ClusterfitScoringConfig) => {
  const items = aptitudeItemsForGradePath(input.gradePath);
  const multiplier = input.gradePath === "9_10" ? config.gradeNineTenAptitudeMultiplier : 1;
  const result = {} as Record<AptitudeDomain, AptitudeScore>;
  for (const domain of APTITUDE_DOMAINS) {
    let correct = 0;
    let attempted = 0;
    for (const item of items.filter((entry) => entry.domain === domain)) {
      const answer = input.aptitude[item.itemKey];
      if (answer === undefined || answer === null) continue;
      attempted += 1;
      if (answer === config.answerKey[item.itemKey]) correct += 1;
    }
    result[domain] = { correct, attempted, score: correct * multiplier };
  }
  return result;
};

const scoreWorkStyle = (input: ClusterfitScoringInput, config: ClusterfitScoringConfig) => {
  const result = {} as Record<WorkStyleDimension, StyleScore>;
  for (const dimension of WORK_STYLE_DIMENSIONS) {
    const values = WORK_STYLE_ITEMS.filter((item) => item.dimension === dimension).map((item) => {
      const answer = input.workStyle[item.itemKey];
      if (answer === undefined) return undefined;
      return item.reverse ? 3 - answer : answer;
    });
    const raw = groupSum(values, config.minAnsweredPerGroup);
    if (raw === null) {
      result[dimension] = { raw: null, level: null, points: null };
      continue;
    }
    const level =
      raw <= config.workStyleCutoffs.lowMax
        ? "low"
        : raw <= config.workStyleCutoffs.midMax
          ? "mid"
          : "high";
    result[dimension] = { raw, level, points: level === "low" ? 0 : level === "mid" ? 1 : 2 };
  }
  return result;
};

/** Tie-break approved in plan §16.1 (D2): index, then interest, then aptitude, then cluster order. */
const compareClusters = (
  left: ClusterfitClusterResult,
  right: ClusterfitClusterResult,
  order: ReadonlyMap<ClusterCode, number>,
): number =>
  (right.index ?? -1) - (left.index ?? -1) ||
  (right.interest ?? -1) - (left.interest ?? -1) ||
  right.aptitude - left.aptitude ||
  (order.get(left.code) ?? 0) - (order.get(right.code) ?? 0);

/** Every cluster with an index, best first, using the same order as scoring's presentation. */
export const rankedClusters = (
  clusters: readonly ClusterfitClusterResult[],
): ClusterfitClusterResult[] => {
  const order = new Map(CLUSTERS.map((cluster) => [cluster.code, cluster.order]));
  return clusters
    .filter((cluster) => cluster.index !== null)
    .sort((a, b) => compareClusters(a, b, order));
};

/** Deterministic hash of everything that can change a result (plan §6.2). */
export const clusterfitInputHash = (
  input: ClusterfitScoringInput,
  config: ClusterfitScoringConfig,
): string => {
  const sorted = (record: Readonly<Record<string, unknown>>) =>
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]);
  return createHash("sha256")
    .update(
      JSON.stringify({
        scoringVersion: config.version,
        contentVersion: CONTENT_VERSION,
        gradePath: input.gradePath,
        medium: input.medium,
        interest: sorted(input.interest),
        aptitude: sorted(input.aptitude),
        workStyle: sorted(input.workStyle),
      }),
    )
    .digest("hex");
};

/** The doc's scoring worksheet as a pure function (plan §5–§6, §8). No I/O; same input → same result. */
export const scoreClusterfit = (
  input: ClusterfitScoringInput,
  config: ClusterfitScoringConfig,
): ClusterfitResult => {
  const aptitude = scoreAptitude(input, config);
  const workStyle = scoreWorkStyle(input, config);
  const clusters: ClusterfitClusterResult[] = CLUSTERS.map((cluster) => {
    const values = INTEREST_ITEMS.filter((item) => item.clusterCode === cluster.code).map(
      (item) => input.interest[item.itemKey],
    );
    const interest = groupSum(values, config.minAnsweredPerGroup);
    const matrix = config.matrix[cluster.code];
    const aptitudeFit = matrix.aptitudes.reduce(
      (total, domain) => total + aptitude[domain].score,
      0,
    );
    const stylePoints = matrix.styles.map((dimension) => workStyle[dimension].points);
    const style = stylePoints.some((points) => points === null)
      ? null
      : stylePoints.reduce<number>((total, points) => total + (points ?? 0), 0);
    const index =
      interest === null || style === null
        ? null
        : round2(
            config.weights.interest * interest +
              config.weights.aptitude * aptitudeFit +
              config.weights.style * style,
          );
    const band =
      index === null
        ? "insufficient"
        : index >= config.bands.strongMin
          ? "strong"
          : index >= config.bands.exploreMin
            ? "explore"
            : "low";
    const flags: ClusterfitClusterResult["flags"] = [];
    if (interest !== null) {
      if (
        interest >= config.skillsToBuild.minInterest &&
        aptitudeFit <= config.skillsToBuild.maxAptitude
      ) {
        flags.push("skills_to_build");
      }
      if (
        aptitudeFit >= config.hiddenStrength.minAptitude &&
        interest <= config.hiddenStrength.maxInterest
      ) {
        flags.push("hidden_strength");
      }
    }
    return {
      code: cluster.code,
      name: cluster.name,
      interest,
      aptitude: aptitudeFit,
      style,
      index,
      band,
      shownAs: "hidden",
      flags,
    };
  });

  // Presentation (plan §8.1): at most 3 strong; extra strong ones are demoted to explore (§16.1
  // D2); with no strong cluster, the top 3 are shown as "strongest signals so far".
  const ranked = rankedClusters(clusters);
  const strongCandidates = ranked.filter((cluster) => cluster.band === "strong");
  const fallbackUsed = strongCandidates.length === 0;
  const strong = (fallbackUsed ? ranked : strongCandidates).slice(0, config.maxStrongShown);
  const strongCodes = new Set(strong.map((cluster) => cluster.code));
  const explore = ranked
    .filter(
      (cluster) =>
        !strongCodes.has(cluster.code) && (cluster.band === "strong" || cluster.band === "explore"),
    )
    .slice(0, config.maxExploreShown);
  const exploreCodes = new Set(explore.map((cluster) => cluster.code));
  for (const cluster of clusters) {
    cluster.shownAs = strongCodes.has(cluster.code)
      ? "strong"
      : exploreCodes.has(cluster.code)
        ? "explore"
        : "hidden";
  }

  const fifth = ranked[4];
  const flatProfile =
    fifth !== undefined && (ranked[0]!.index ?? 0) - (fifth.index ?? 0) < config.flatProfileGap;

  // Doc rule: VER is the lowest domain (ties count, §16.1 D2) and the medium differs from the test
  // language. No medium → "unknown", never false.
  const verIsLowest = APTITUDE_DOMAINS.every(
    (domain) => aptitude.VER.score <= aptitude[domain].score,
  );
  const languageCaution: boolean | "unknown" =
    input.medium === null ? "unknown" : verIsLowest && input.medium !== config.testLanguage;

  return {
    scoringVersion: config.version,
    contentVersion: CONTENT_VERSION,
    gradePath: input.gradePath,
    inputHash: clusterfitInputHash(input, config),
    clusters,
    aptitude,
    workStyle,
    profileFlags: { flatProfile, languageCaution },
    presentation: {
      strong: strong.map((cluster) => cluster.code),
      explore: explore.map((cluster) => cluster.code),
      fallbackUsed,
    },
  };
};
