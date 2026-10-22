import { describe, expect, it } from "vitest";
import {
  APTITUDE_ANSWER_KEY,
  APTITUDE_ITEMS,
  CLUSTER_CODES,
  INTEREST_ITEMS,
  WORK_STYLE_ITEMS,
  type AptitudeOptionKey,
} from "../content/v1/index.js";
import { aptitudeItemsForGradePath, gradePathForGrade } from "./grade-path.js";
import {
  clusterfitInputHash,
  scoreClusterfit,
  type ClusterfitScoringInput,
  type InterestAnswer,
  type WorkStyleAnswer,
} from "./scoring.js";
import { CLUSTERFIT_SCORING_V1, validateScoringConfig } from "./scoring-config.js";

const config = CLUSTERFIT_SCORING_V1;
const Y = 2 as const;
const M = 1 as const;
const N = 0 as const;

/** Part B answers given per cluster in item order (k, k+12, k+24, k+36). */
const interestByCluster = (
  answers: Partial<Record<(typeof CLUSTER_CODES)[number], readonly InterestAnswer[]>>,
): Record<string, InterestAnswer> => {
  const result: Record<string, InterestAnswer> = {};
  for (const [code, values] of Object.entries(answers)) {
    INTEREST_ITEMS.filter((item) => item.clusterCode === code).forEach((item, index) => {
      const value = values?.[index];
      if (value !== undefined) result[item.itemKey] = value;
    });
  }
  return result;
};

const allCorrect = (gradePath: "9_10" | "11_12"): Record<string, AptitudeOptionKey> =>
  Object.fromEntries(
    aptitudeItemsForGradePath(gradePath).map((item) => [
      item.itemKey,
      APTITUDE_ANSWER_KEY[item.itemKey]!,
    ]),
  );

const wrong = (itemKey: string): AptitudeOptionKey =>
  (["A", "B", "C", "D"] as const).find((option) => option !== APTITUDE_ANSWER_KEY[itemKey])!;

const allWorkStyle = (value: WorkStyleAnswer): Record<string, WorkStyleAnswer> =>
  Object.fromEntries(
    WORK_STYLE_ITEMS.map((item) => [
      item.itemKey,
      item.reverse ? ((3 - value) as WorkStyleAnswer) : value,
    ]),
  );

const cluster = (result: ReturnType<typeof scoreClusterfit>, code: string) =>
  result.clusters.find((entry) => entry.code === code)!;

// Kavya, plan §13: Grade 11, Tamil medium. All numbers were recomputed by hand.
const kavyaInput = (medium: ClusterfitScoringInput["medium"]): ClusterfitScoringInput => ({
  gradePath: "11_12",
  medium,
  interest: interestByCluster({
    SCI: [Y, M, Y, N],
    ENG: [N, M, N, N],
    DIG: [M, Y, N, M],
    HLT: [Y, Y, M, Y],
    AGR: [Y, Y, Y, M],
    BUS: [M, Y, N, N],
    EDU: [Y, Y, Y, M],
    GOV: [N, M, Y, M],
    MED: [M, N, M, N],
    ART: [Y, M, M, N],
    HOS: [Y, M, M, N],
    CON: [N, N, M, N],
  }),
  // prettier-ignore
  aptitude: {
    NUM1: "A", NUM2: "C", NUM3: "B", NUM4: "A",
    VER1: "B", VER2: "D", VER3: "B", VER4: "C",
    LOG1: "C", LOG2: "A", LOG3: "C", LOG4: "B",
    MEC1: "D", MEC2: "B", MEC3: "B", MEC4: null,
    PRA1: "D", PRA2: "A", PRA3: "C", PRA4: "B",
  },
  // prettier-ignore
  workStyle: {
    D1: 2, D6: 3, D11: 1, D16: 1,
    D2: 1, D7: 2, D12: 1, D17: 1,
    D3: 3, D8: 2, D13: 1, D18: 2,
    D4: 2, D9: 2, D14: 2, D19: 2,
    D5: 2, D10: 3, D15: 0, D20: 2,
  },
});

describe("content and config", () => {
  it("passes the startup validator", () => {
    expect(() => validateScoringConfig(config)).not.toThrow();
  });

  it("gives cluster k items k, k+12, k+24 and k+36", () => {
    CLUSTER_CODES.forEach((code, index) => {
      const k = index + 1;
      const keys = INTEREST_ITEMS.filter((item) => item.clusterCode === code).map(
        (item) => item.itemKey,
      );
      expect(keys).toEqual([`B${k}`, `B${k + 12}`, `B${k + 24}`, `B${k + 36}`]);
    });
  });

  it("marks exactly D11–D15 as reverse-scored", () => {
    expect(WORK_STYLE_ITEMS.filter((item) => item.reverse).map((item) => item.itemKey)).toEqual([
      "D11",
      "D12",
      "D13",
      "D14",
      "D15",
    ]);
  });

  it("rejects weights that don't reach 100 and a 19-entry key", () => {
    expect(() =>
      validateScoringConfig({ ...config, weights: { interest: 6, aptitude: 3.75, style: 5 } }),
    ).toThrow(/maximum index of 100/);
    const answerKey = Object.fromEntries(
      Object.entries(APTITUDE_ANSWER_KEY).filter(([key]) => key !== "PRA4"),
    );
    expect(() => validateScoringConfig({ ...config, answerKey })).toThrow(/answer key/);
  });
});

describe("answer key, derived from the arithmetic in each item", () => {
  const options = (itemKey: string) =>
    APTITUDE_ITEMS.find((item) => item.itemKey === itemKey)!.options;
  it.each([
    ["NUM1", "₹36 profit"], // 12 × 18 = 216 − 180 = 36
    ["NUM2", "17.5 litres"], // 5 / 2 × 7
    ["NUM3", "Plan 2, about ₹1.75 cheaper per day"], // 299/28 = 10.68, 749/84 = 8.92
    ["NUM4", "₹4,500"], // 500 + 600 + … + 1000
    ["LOG1", "Bala"], // Esha, Asha, Bala, Chitra, Dev
    ["LOG2", "42"], // +4, +6, +8, +10, +12
    ["LOG3", "O"], // +2, +3, +4, +5
    ["MEC3", "4"], // folded twice → 4 layers
    ["MEC4", "It stays balanced"], // 30 × 2 = 20 × 3 (doc key says B; fixed, §16.1 D2)
    ["PRA2", "July"], // +120 is the largest rise
    ["PRA3", "Form, lunch, books"], // form 10:00–10:30, lunch to 11:00, books 11:00–11:20
    ["PRA4", "10:00 a.m."], // 10:00 + 1:45 = 11:45 ≤ 12:00
  ])("%s → %s", (itemKey, expected) => {
    expect(options(itemKey)[APTITUDE_ANSWER_KEY[itemKey]!]).toBe(expected);
  });
});

describe("grade path", () => {
  it("maps grades to paths and serves 10 or 20 puzzles", () => {
    expect([gradePathForGrade(9), gradePathForGrade(12), gradePathForGrade(null)]).toEqual([
      "9_10",
      "11_12",
      null,
    ]);
    expect(aptitudeItemsForGradePath("9_10")).toHaveLength(10);
    expect(aptitudeItemsForGradePath("9_10").every((item) => item.level <= 2)).toBe(true);
    expect(aptitudeItemsForGradePath("11_12")).toHaveLength(20);
  });
});

describe("scoreClusterfit", () => {
  it("reproduces the doc's worked example: SCI = 85", () => {
    const aptitude = allCorrect("11_12");
    aptitude.LOG4 = wrong("LOG4"); // LOG 3, NUM 4 → A = 7
    // prettier-ignore
    const workStyle = {
      ...allWorkStyle(1),
      D4: 3, D9: 3, D14: 0, D19: 3, // curiosity raw 12 → High
      D5: 2, D10: 2, D15: 1, D20: 2, // steadiness raw 8 → Mid
    } as Record<string, WorkStyleAnswer>;
    const result = scoreClusterfit(
      {
        gradePath: "11_12",
        medium: "english",
        interest: interestByCluster({ SCI: [Y, Y, Y, M] }),
        aptitude,
        workStyle,
      },
      config,
    );
    const sci = cluster(result, "SCI");
    expect([sci.interest, sci.aptitude, sci.style, sci.index, sci.band]).toEqual([
      7,
      7,
      3,
      85,
      "strong",
    ]);
  });

  it("reproduces plan §5.5 example 2: Grade 9 DIG = 75 with the ×2 rule", () => {
    const aptitude = allCorrect("9_10");
    aptitude.PRA2 = wrong("PRA2"); // PRA 1/2 → 2; LOG 2/2 → 4
    // prettier-ignore
    const workStyle = {
      ...allWorkStyle(1),
      D4: 3, D9: 3, D14: 1, D19: 2, // curiosity raw 10 → High
      D3: 2, D8: 2, D13: 2, D18: 2, // order raw 7 → Mid
    } as Record<string, WorkStyleAnswer>;
    const result = scoreClusterfit(
      {
        gradePath: "9_10",
        medium: "english",
        interest: interestByCluster({ DIG: [Y, Y, M, M] }),
        aptitude,
        workStyle,
      },
      config,
    );
    const dig = cluster(result, "DIG");
    expect([dig.interest, dig.aptitude, dig.style, dig.index]).toEqual([6, 6, 3, 75]);
    expect(result.aptitude.PRA).toEqual({ correct: 1, attempted: 2, score: 2 });
  });

  describe("Kavya (plan §13) golden case", () => {
    const result = scoreClusterfit(kavyaInput("tamil"), config);

    it("matches all 12 indices", () => {
      expect(Object.fromEntries(result.clusters.map((entry) => [entry.code, entry.index]))).toEqual(
        {
          SCI: 68.75,
          ENG: 40,
          DIG: 66.25,
          HLT: 81.25,
          AGR: 81.25,
          BUS: 55,
          EDU: 76.25,
          GOV: 58.75,
          MED: 45,
          ART: 50,
          HOS: 62.5,
          CON: 45,
        },
      );
    });

    it("scores aptitude and work style as the worksheet does", () => {
      expect(
        Object.fromEntries(
          Object.entries(result.aptitude).map(([key, value]) => [key, value.score]),
        ),
      ).toEqual({
        NUM: 3,
        VER: 2,
        LOG: 3,
        MEC: 2,
        PRA: 4,
      });
      expect(
        Object.fromEntries(
          Object.entries(result.workStyle).map(([key, value]) => [key, value.raw]),
        ),
      ).toEqual({
        social: 8,
        initiative: 6,
        order: 9,
        curiosity: 7,
        steadiness: 10,
      });
    });

    it("breaks the HLT/AGR tie on cluster order and demotes SCI and DIG", () => {
      expect(result.presentation).toEqual({
        strong: ["HLT", "AGR", "EDU"],
        explore: ["SCI", "DIG", "HOS"],
        fallbackUsed: false,
      });
      expect(cluster(result, "SCI")).toMatchObject({ band: "strong", shownAs: "explore" });
      expect(cluster(result, "GOV").shownAs).toBe("hidden");
    });

    it("flags BUS as a hidden strength, and nothing else", () => {
      expect(
        result.clusters
          .filter((entry) => entry.flags.length > 0)
          .map((entry) => [entry.code, entry.flags]),
      ).toEqual([["BUS", ["hidden_strength"]]]);
      expect(result.profileFlags.flatProfile).toBe(false);
    });

    it("raises language caution when medium is known, and reports unknown without it", () => {
      expect(result.profileFlags.languageCaution).toBe(true);
      expect(scoreClusterfit(kavyaInput(null), config).profileFlags.languageCaution).toBe(
        "unknown",
      );
      expect(scoreClusterfit(kavyaInput("english"), config).profileFlags.languageCaution).toBe(
        false,
      );
    });
  });

  it("gives 100 at the maximum and 0 at the minimum, with the fallback when nothing is strong", () => {
    const all = (value: InterestAnswer) =>
      Object.fromEntries(INTEREST_ITEMS.map((item) => [item.itemKey, value])) as Record<
        string,
        InterestAnswer
      >;
    const top = scoreClusterfit(
      {
        gradePath: "11_12",
        medium: "english",
        interest: all(2),
        aptitude: allCorrect("11_12"),
        workStyle: allWorkStyle(3),
      },
      config,
    );
    expect(top.clusters.every((entry) => entry.index === 100)).toBe(true);
    expect(top.profileFlags.flatProfile).toBe(true);
    const bottom = scoreClusterfit(
      {
        gradePath: "11_12",
        medium: "english",
        interest: all(0),
        aptitude: {},
        workStyle: allWorkStyle(0),
      },
      config,
    );
    expect(bottom.clusters.every((entry) => entry.index === 0)).toBe(true);
    expect(bottom.presentation).toMatchObject({
      fallbackUsed: true,
      strong: ["SCI", "ENG", "DIG"],
      explore: [],
    });
  });

  it("applies the work-style cut-offs at raw 4/5 and 8/9", () => {
    const base = {
      gradePath: "11_12" as const,
      medium: "english" as const,
      interest: {},
      aptitude: {},
    };
    const levels = [
      [1, 1, 1, 1],
      [2, 1, 1, 1],
      [2, 2, 2, 2],
      [3, 2, 2, 2],
    ].map(
      ([a, b, c, d]) =>
        scoreClusterfit(
          {
            ...base,
            workStyle: { D1: a, D6: b, D11: 3 - c!, D16: d } as Record<string, WorkStyleAnswer>,
          },
          config,
        ).workStyle.social.level,
    );
    expect(levels).toEqual(["low", "mid", "mid", "high"]);
  });

  it("prorates a group with 3 of 4 answers and marks 2 of 4 insufficient", () => {
    const result = scoreClusterfit(
      {
        gradePath: "11_12",
        medium: "english",
        interest: interestByCluster({ SCI: [Y, Y, M], ENG: [Y, Y] }),
        aptitude: allCorrect("11_12"),
        workStyle: allWorkStyle(2),
      },
      config,
    );
    expect(cluster(result, "SCI").interest).toBe(7); // 5 × 4 / 3 = 6.67 → 7
    expect(cluster(result, "ENG")).toMatchObject({
      interest: null,
      index: null,
      band: "insufficient",
      shownAs: "hidden",
    });
  });

  it("fires flags exactly at their boundaries", () => {
    const aptitude = allCorrect("11_12");
    for (const key of ["MEC2", "MEC3", "MEC4", "NUM4"]) aptitude[key] = wrong(key); // MEC 1, NUM 3, PRA 4
    const result = scoreClusterfit(
      {
        gradePath: "11_12",
        medium: "english",
        interest: interestByCluster({ ENG: [Y, Y, M, M], BUS: [Y, M, N, N] }),
        aptitude,
        workStyle: allWorkStyle(2),
      },
      config,
    );
    expect(cluster(result, "ENG")).toMatchObject({
      interest: 6,
      aptitude: 4,
      flags: ["skills_to_build"],
    });
    expect(cluster(result, "BUS")).toMatchObject({
      interest: 3,
      aptitude: 7,
      flags: ["hidden_strength"],
    });
  });

  it("is deterministic and versioned through the input hash", () => {
    const input = kavyaInput("tamil");
    expect(scoreClusterfit(input, config)).toEqual(scoreClusterfit(input, config));
    expect(clusterfitInputHash(input, { ...config, version: "CLUSTERFIT_SCORING_V2" })).not.toBe(
      clusterfitInputHash(input, config),
    );
  });
});
