import {
  APTITUDE_ANSWER_KEY,
  APTITUDE_DOMAINS,
  APTITUDE_ITEMS,
  CLUSTER_CODES,
  CLUSTER_MATRIX,
  INTEREST_ITEMS,
  WORK_STYLE_DIMENSIONS,
  WORK_STYLE_ITEMS,
  type AptitudeOptionKey,
} from "../content/v1/index.js";

/**
 * Every number the doc calls provisional lives here, so the pilot can revise it by publishing a
 * new version and re-scoring stored answers (plan §5.6). Values are the doc's unless noted.
 */
export type ClusterfitScoringConfig = {
  version: string;
  /** index = interest × I + aptitude × A + style × S (doc: 6.25 / 3.75 / 5 → 50% / 30% / 20%). */
  weights: { interest: number; aptitude: number; style: number };
  /** Work-style raw 0–12 → Low (≤ lowMax) / Mid (≤ midMax) / High. Doc: 0–4, 5–8, 9–12. */
  workStyleCutoffs: { lowMax: number; midMax: number };
  bands: { strongMin: number; exploreMin: number };
  /** Doc: "show at most 3" strong clusters. */
  maxStrongShown: number;
  /** Plan §8.1: the student sees 2–3 "worth exploring" clusters. */
  maxExploreShown: number;
  flatProfileGap: number;
  skillsToBuild: { minInterest: number; maxAptitude: number };
  hiddenStrength: { minAptitude: number; maxInterest: number };
  /** Grades 9–10 answer items 1–2 of each domain; the doc doubles their domain score. */
  gradeNineTenAptitudeMultiplier: number;
  testLanguage: "english";
  /** Plan §4.6 (approved, §16.1 D2): a 4-item group with fewer answers is "insufficient". */
  minAnsweredPerGroup: number;
  matrix: typeof CLUSTER_MATRIX;
  answerKey: Readonly<Record<string, AptitudeOptionKey>>;
};

export const CLUSTERFIT_SCORING_V1: ClusterfitScoringConfig = {
  version: "CLUSTERFIT_SCORING_V1",
  weights: { interest: 6.25, aptitude: 3.75, style: 5 },
  workStyleCutoffs: { lowMax: 4, midMax: 8 },
  bands: { strongMin: 65, exploreMin: 50 },
  maxStrongShown: 3,
  maxExploreShown: 3,
  flatProfileGap: 10,
  skillsToBuild: { minInterest: 6, maxAptitude: 4 },
  hiddenStrength: { minAptitude: 7, maxInterest: 3 },
  gradeNineTenAptitudeMultiplier: 2,
  testLanguage: "english",
  minAnsweredPerGroup: 3,
  matrix: CLUSTER_MATRIX,
  answerKey: APTITUDE_ANSWER_KEY,
};

/** Fails fast on a content or config mistake (plan §6.4). Called once when the plug-in starts. */
export const validateScoringConfig = (config: ClusterfitScoringConfig): void => {
  const problems: string[] = [];

  if (new Set(INTEREST_ITEMS.map((item) => item.itemKey)).size !== 48) {
    problems.push("Part B must have 48 unique items");
  }
  for (const code of CLUSTER_CODES) {
    const owned = INTEREST_ITEMS.filter((item) => item.clusterCode === code).length;
    if (owned !== 4) problems.push(`${code} must own exactly 4 Part B items`);
    const entry = config.matrix[code];
    if (entry.aptitudes.length !== 2 || entry.styles.length !== 2) {
      problems.push(`${code} needs 2 key aptitudes and 2 key work styles`);
    }
  }

  if (new Set(APTITUDE_ITEMS.map((item) => item.itemKey)).size !== 20) {
    problems.push("Part C must have 20 unique items");
  }
  for (const domain of APTITUDE_DOMAINS) {
    if (APTITUDE_ITEMS.filter((item) => item.domain === domain).length !== 4) {
      problems.push(`${domain} must have 4 Part C items`);
    }
  }
  for (const item of APTITUDE_ITEMS) {
    if (!config.answerKey[item.itemKey]) problems.push(`answer key missing ${item.itemKey}`);
  }
  if (Object.keys(config.answerKey).length !== 20) problems.push("answer key must have 20 entries");

  if (new Set(WORK_STYLE_ITEMS.map((item) => item.itemKey)).size !== 20) {
    problems.push("Part D must have 20 unique items");
  }
  for (const dimension of WORK_STYLE_DIMENSIONS) {
    if (WORK_STYLE_ITEMS.filter((item) => item.dimension === dimension).length !== 4) {
      problems.push(`${dimension} must have 4 Part D items`);
    }
  }

  const max = config.weights.interest * 8 + config.weights.aptitude * 8 + config.weights.style * 4;
  if (Math.abs(max - 100) > 1e-9)
    problems.push(`weights must give a maximum index of 100, got ${max}`);
  if (!(config.workStyleCutoffs.lowMax < config.workStyleCutoffs.midMax)) {
    problems.push("work-style cut-offs out of order");
  }
  if (!(config.bands.exploreMin < config.bands.strongMin))
    problems.push("band cut-offs out of order");

  if (problems.length > 0) {
    throw new Error(`Invalid clusterfit scoring config ${config.version}: ${problems.join("; ")}`);
  }
};
