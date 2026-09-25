import { describe, expect, it } from "vitest";
import type {
  MatchingConfig,
  PathwayCatalogRecord,
  ProfileSnapshotForRecommendations,
} from "@yuvapath/contracts";
import { buildPathwayRecommendationSet, scorePathways } from "./pathway-recommendations.js";

const createdAt = "2026-07-28T00:00:00.000Z";
const careerA = "00000000-0000-4000-8000-000000000801";
const careerB = "00000000-0000-4000-8000-000000000802";
const careerC = "00000000-0000-4000-8000-000000000803";
const streamA = "00000000-0000-4000-8000-000000000901";
const streamB = "00000000-0000-4000-8000-000000000902";
const streamC = "00000000-0000-4000-8000-000000000903"; // never in rankedStreamIds — an unmatched control

const config: MatchingConfig = {
  algorithmVersion: "pathway-fit-v1",
  weightsVersion: "pathway-weights-v1",
  interestWeight: 0.5,
  valuesWeight: 0.2,
  feasibilityWeight: 0.15,
  contextWeight: 0.15,
  roundingScale: 6,
  feasibilityLookupVersion: "feasibility-v1",
  riasecTieOrder: ["R", "I", "A", "S", "E", "C"],
};

const profile: ProfileSnapshotForRecommendations = {
  profileSnapshotId: "00000000-0000-4000-8000-000000000700",
  profileVersion: "profile-v1",
  profileHash: "profile-hash",
  segment: "pathfinder",
  state: "Tamil Nadu",
  marksBand: "high",
  riasec: { R: 2, I: 10, A: 8, S: 4, E: 3, C: 1 },
};

const pathways: PathwayCatalogRecord[] = [
  {
    pathwayId: "00000000-0000-4000-8000-000000001001",
    title: "BSc Computer Science",
    careerIds: [careerA, careerB],
    streamOptionIds: [streamC],
    collegeCount: 50,
    recommendedSegments: ["pathfinder", "launcher"],
    marksBands: ["high"],
    reachability: 0.9,
    hasBackupRoute: true,
    priority: 1,
    datasetVersion: "pathways-2026-a",
    verified: true,
  },
  {
    pathwayId: "00000000-0000-4000-8000-000000001002",
    title: "Design Diploma",
    careerIds: [careerB],
    streamOptionIds: [streamC],
    collegeCount: 20,
    recommendedSegments: ["explorer", "pathfinder"],
    marksBands: ["medium", "high"],
    reachability: 0.75,
    hasBackupRoute: true,
    priority: 2,
    datasetVersion: "pathways-2026-a",
    verified: true,
  },
  {
    pathwayId: "00000000-0000-4000-8000-000000001003",
    title: "Commerce Foundation",
    careerIds: [careerC],
    streamOptionIds: [streamC],
    collegeCount: 5,
    recommendedSegments: ["launcher"],
    marksBands: ["medium"],
    reachability: 0.6,
    hasBackupRoute: false,
    priority: 3,
    datasetVersion: "pathways-2026-a",
    verified: true,
  },
];

describe("pathway recommendations", () => {
  it("ranks pathways from deterministic career, college-availability, segment, marks, and reachability signals", () => {
    const items = scorePathways({
      recommendationId: "pathway-rec-1",
      profile,
      pathways,
      rankedCareerIds: [careerA, careerB, careerC],
      rankedStreamIds: [streamA, streamB],
      config,
      createdAt,
    });

    expect(items.map((item) => item.title)).toEqual([
      "BSc Computer Science",
      "Design Diploma",
      "Commerce Foundation",
    ]);
    expect(items[0]?.entityType).toBe("pathway");
    expect(items[0]?.explanation.matchedCareerIds).toEqual([careerA, careerB]);
    expect(items[0]?.explanation.collegeAvailability).toBeGreaterThan(0);
    expect(items[0]?.explanation.segmentFit).toBe(1);
    // None of the fixture pathways link to streamA/streamB (Iteration 2) — streamAlignment must
    // read as a real 0, not redistribute weight elsewhere (see this file's own weight comments).
    expect(items[0]?.explanation.streamAlignment).toBe(0);
    expect(items[0]?.explanation.matchedStreamOptionIds).toEqual([]);
  });

  it("ranks a widely-available pathway above a near-identical but rarely-offered one", () => {
    // Regression for a real bug: two pathways for the same subject that differ only in how many
    // colleges actually offer them ("B.E./B.Tech in X" at 9 colleges vs "B.Sc in X" at 136
    // colleges) used to tie on every real signal and fall back to an arbitrary alphabetical
    // priority, letting the rare variant outrank the common one.
    const rare: PathwayCatalogRecord = { ...pathways[0]!, pathwayId: "00000000-0000-4000-8000-000000001201", collegeCount: 9, priority: 1 };
    const common: PathwayCatalogRecord = { ...pathways[0]!, pathwayId: "00000000-0000-4000-8000-000000001202", collegeCount: 136, priority: 2 };

    const items = scorePathways({
      recommendationId: "pathway-rec-1",
      profile,
      pathways: [rare, common],
      rankedCareerIds: [careerA, careerB, careerC],
      rankedStreamIds: [streamA, streamB],
      config,
      createdAt,
    });

    expect(items[0]?.entityId).toBe(common.pathwayId);
    expect(items[0]!.explanation.collegeAvailability).toBeGreaterThan(items[1]!.explanation.collegeAvailability);
  });

  it("uses neutral marks fit when marks are unknown or unrestricted", () => {
    const [item] = scorePathways({
      recommendationId: "pathway-rec-1",
      profile: { ...profile, marksBand: undefined },
      pathways: [{ ...pathways[0]!, marksBands: undefined }],
      rankedCareerIds: [careerA],
      rankedStreamIds: [streamA],
      config,
      createdAt,
    });

    expect(item?.explanation.marksFit).toBe(0.5);
  });

  it("sorts exact pathway ties by reachability, priority, title, then entity ID", () => {
    const tiedPathways: PathwayCatalogRecord[] = [
      {
        ...pathways[0]!,
        pathwayId: "00000000-0000-4000-8000-000000001102",
        title: "Same Pathway",
        priority: 5,
      },
      {
        ...pathways[0]!,
        pathwayId: "00000000-0000-4000-8000-000000001101",
        title: "Same Pathway",
        priority: 5,
      },
    ];

    const items = scorePathways({
      recommendationId: "pathway-rec-1",
      profile,
      pathways: tiedPathways,
      rankedCareerIds: [careerA],
      rankedStreamIds: [streamA],
      config,
      createdAt,
    });

    expect(items.map((item) => item.entityId)).toEqual([
      "00000000-0000-4000-8000-000000001101",
      "00000000-0000-4000-8000-000000001102",
    ]);
  });

  it("produces the same pathway output hash when catalog input order changes", () => {
    const first = buildPathwayRecommendationSet({
      recommendationId: "pathway-rec-1",
      profile,
      pathways,
      rankedCareerIds: [careerA, careerB, careerC],
      rankedStreamIds: [streamA, streamB],
      config,
      createdAt,
    });
    const second = buildPathwayRecommendationSet({
      recommendationId: "pathway-rec-1",
      profile,
      pathways: [...pathways].reverse(),
      rankedCareerIds: [careerA, careerB, careerC],
      rankedStreamIds: [streamA, streamB],
      config,
      createdAt,
    });

    expect(second.kind).toBe("pathway");
    expect(second.items.map((item) => item.entityId)).toEqual(first.items.map((item) => item.entityId));
    expect(second.outputHash).toBe(first.outputHash);
  });

  // Iteration 2 (docs/architecture/stream-pathway-mapping-iteration-2-plan.md): streamAlignment
  // must actually move fitScore now that it's a real, always-computed factor (not the pre-2 gap
  // where rankedStreamIds was accepted and hashed but never read by scoring).
  it("ranks a pathway higher once it has a stream_pathways link to the student's #1 ranked stream", () => {
    const base: PathwayCatalogRecord = {
      pathwayId: "00000000-0000-4000-8000-000000001301",
      title: "Neutral pathway",
      careerIds: ["00000000-0000-4000-8000-000000000000"], // sentinel — never in rankedCareerIds
      streamOptionIds: ["00000000-0000-4000-8000-000000000000"],
      collegeCount: 20,
      recommendedSegments: ["pathfinder"],
      marksBands: ["high"],
      reachability: 0.9,
      hasBackupRoute: true,
      priority: 1,
      datasetVersion: "pathways-2026-a",
      verified: true,
    };

    const [withoutLink] = scorePathways({
      recommendationId: "pathway-rec-1",
      profile,
      pathways: [base],
      rankedCareerIds: [],
      rankedStreamIds: [streamA],
      config,
      createdAt,
    });
    const [withLink] = scorePathways({
      recommendationId: "pathway-rec-1",
      profile,
      pathways: [{ ...base, streamOptionIds: [streamA] }],
      rankedCareerIds: [],
      rankedStreamIds: [streamA],
      config,
      createdAt,
    });

    expect(withoutLink?.explanation.streamAlignment).toBe(0);
    expect(withLink?.explanation.streamAlignment).toBe(1);
    expect(withLink?.explanation.matchedStreamOptionIds).toEqual([streamA]);
    expect(withLink!.fitScore).toBeGreaterThan(withoutLink!.fitScore!);
  });

  it("pins the v2 rebalanced fitScore formula", () => {
    // Hand-computed from CAREER_ALIGNMENT_WEIGHT=0.4, STREAM_ALIGNMENT_WEIGHT=0.3,
    // COLLEGE_AVAILABILITY_WEIGHT=0.15, SEGMENT_FIT_WEIGHT=0.06, MARKS_FIT_WEIGHT=0.04,
    // REACHABILITY_WEIGHT=0.045, BACKUP_ROUTE_FIT_WEIGHT=0.005 (pathway-recommendations.ts).
    const pathway: PathwayCatalogRecord = {
      pathwayId: "00000000-0000-4000-8000-000000001302",
      title: "Fully-matched pathway",
      careerIds: [careerA],
      streamOptionIds: [streamA],
      collegeCount: 20, // log(21)/log(1501) ≈ 0.416497
      recommendedSegments: ["pathfinder"],
      marksBands: ["high"],
      reachability: 0.9,
      hasBackupRoute: true,
      priority: 1,
      datasetVersion: "pathways-2026-a",
      verified: true,
    };

    const [item] = scorePathways({
      recommendationId: "pathway-rec-1",
      profile,
      pathways: [pathway],
      rankedCareerIds: [careerA],
      rankedStreamIds: [streamA],
      config,
      createdAt,
    });

    // careerAlignment=1, streamAlignment=1, segmentFit=1, marksFit=1, backupRouteFit=1,
    // reachability=0.9, collegeAvailability≈0.416497.
    const expected = 1 * 0.4 + 1 * 0.3 + 0.416497 * 0.15 + 1 * 0.04 + 1 * 0.06 + 0.9 * 0.045 + 1 * 0.005;
    expect(item?.fitScore).toBeCloseTo(expected, 3);
  });
});
