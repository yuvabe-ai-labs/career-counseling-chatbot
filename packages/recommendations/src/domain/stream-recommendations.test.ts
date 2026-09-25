import { describe, expect, it } from "vitest";
import type {
  MatchingConfig,
  ProfileSnapshotForRecommendations,
  StreamCatalogRecord,
} from "@yuvapath/contracts";
import { buildStreamRecommendationSet, scoreStreams } from "./stream-recommendations.js";

const createdAt = "2026-07-28T00:00:00.000Z";

const config: MatchingConfig = {
  algorithmVersion: "stream-fit-v1",
  weightsVersion: "stream-weights-v1",
  interestWeight: 0.5,
  valuesWeight: 0.2,
  feasibilityWeight: 0.15,
  contextWeight: 0.15,
  roundingScale: 6,
  feasibilityLookupVersion: "feasibility-v1",
  riasecTieOrder: ["R", "I", "A", "S", "E", "C"],
};

const profile: ProfileSnapshotForRecommendations = {
  profileSnapshotId: "00000000-0000-4000-8000-000000000500",
  profileVersion: "profile-v1",
  profileHash: "profile-hash",
  segment: "explorer",
  state: "Tamil Nadu",
  marksBand: "high",
  riasec: { R: 2, I: 10, A: 8, S: 4, E: 3, C: 1 },
};

const streams: StreamCatalogRecord[] = [
  {
    streamId: "00000000-0000-4000-8000-000000000601",
    title: "Science with Computer Science",
    riasecLetters: ["I", "A", "R", "C"],
    recommendedSegments: ["explorer", "pathfinder"],
    marksBands: ["high"],
    priority: 1,
    datasetVersion: "streams-2026-a",
    verified: true,
  },
  {
    streamId: "00000000-0000-4000-8000-000000000602",
    title: "Arts and Design",
    riasecLetters: ["A", "S"],
    recommendedSegments: ["explorer"],
    marksBands: ["medium", "high"],
    priority: 2,
    datasetVersion: "streams-2026-a",
    verified: true,
  },
  {
    streamId: "00000000-0000-4000-8000-000000000603",
    title: "Commerce",
    riasecLetters: ["E", "C"],
    recommendedSegments: ["pathfinder", "launcher"],
    marksBands: ["medium"],
    priority: 3,
    datasetVersion: "streams-2026-a",
    verified: true,
  },
];

describe("stream recommendations", () => {
  it("ranks streams using deterministic profile-to-catalog rules", () => {
    const items = scoreStreams({
      recommendationId: "stream-rec-1",
      profile,
      streams,
      rankedCareerIds: [],
      config,
      createdAt,
    });

    expect(items.map((item) => item.title)).toEqual([
      "Science with Computer Science",
      "Arts and Design",
      "Commerce",
    ]);
    expect(items[0]?.entityType).toBe("stream");
    expect(items[0]?.explanation.matchedLetters).toEqual(["I", "A"]);
    expect(items[0]?.explanation.segmentFit).toBe(1);
    expect(items[0]?.explanation.marksFit).toBe(1);
  });

  it("uses a neutral marks fit when marks are unknown or unrestricted", () => {
    const [item] = scoreStreams({
      recommendationId: "stream-rec-1",
      profile: { ...profile, marksBand: undefined },
      streams: [{ ...streams[0]!, marksBands: undefined }],
      rankedCareerIds: [],
      config,
      createdAt,
    });

    expect(item?.explanation.marksFit).toBe(0.5);
  });

  it("sorts exact stream ties by priority, title, then entity ID", () => {
    const tiedStreams: StreamCatalogRecord[] = [
      {
        ...streams[0]!,
        streamId: "00000000-0000-4000-8000-000000000702",
        title: "Same Stream",
        priority: 5,
      },
      {
        ...streams[0]!,
        streamId: "00000000-0000-4000-8000-000000000701",
        title: "Same Stream",
        priority: 5,
      },
    ];

    const items = scoreStreams({
      recommendationId: "stream-rec-1",
      profile,
      streams: tiedStreams,
      rankedCareerIds: [],
      config,
      createdAt,
    });

    expect(items.map((item) => item.entityId)).toEqual([
      "00000000-0000-4000-8000-000000000701",
      "00000000-0000-4000-8000-000000000702",
    ]);
  });

  it("produces the same stream output hash when input order changes", () => {
    const first = buildStreamRecommendationSet({
      recommendationId: "stream-rec-1",
      profile,
      streams,
      rankedCareerIds: [],
      config,
      createdAt,
    });
    const second = buildStreamRecommendationSet({
      recommendationId: "stream-rec-1",
      profile,
      streams: [...streams].reverse(),
      rankedCareerIds: [],
      config,
      createdAt,
    });

    expect(second.kind).toBe("stream");
    expect(second.items.map((item) => item.entityId)).toEqual(first.items.map((item) => item.entityId));
    expect(second.outputHash).toBe(first.outputHash);
  });

  // Iteration 1 (docs/architecture/career-stream-mapping-iteration-1-plan.md): the
  // career-driven careerAlignment factor must be a true no-op — byte-identical fitScore — when
  // there is no career signal, so this iteration was safe to ship with zero seeded
  // knowledge.career_streams rows. This is that guarantee, pinned as a test.
  it("regression: fitScore is unchanged from the pre-Iteration-1 formula when no career data exists", () => {
    const withoutRankedCareers = scoreStreams({
      recommendationId: "stream-rec-1",
      profile,
      streams,
      rankedCareerIds: [],
      config,
      createdAt,
    });
    const withRankedCareersButNoLinks = scoreStreams({
      recommendationId: "stream-rec-1",
      profile,
      streams,
      rankedCareerIds: ["00000000-0000-4000-8000-000000000901"],
      config,
      createdAt,
    });

    expect(withRankedCareersButNoLinks.map((item) => item.fitScore)).toEqual(
      withoutRankedCareers.map((item) => item.fitScore),
    );
    expect(withoutRankedCareers[0]?.explanation.careerAlignment).toBeUndefined();
    // Hand-computed from the documented pre-Iteration-1 formula: riasecOverlap=0.6667 (student's
    // top 3 letters by score are I/A/S; 2 of those 3 — I and A — are in the stream's own
    // I/A/R/C letters), segmentFit=1, marksFit=1, priorityFit=1/(1+1)=0.5.
    expect(withoutRankedCareers[0]?.fitScore).toBeCloseTo(0.6667 * 0.55 + 1 * 0.25 + 1 * 0.15 + 0.5 * 0.05, 3);
  });

  it("scores a stream higher once it has a career_streams link to the student's #1 ranked career", () => {
    const topCareerId = "00000000-0000-4000-8000-000000000901";
    // Weak RIASEC overlap by design (E/C, while the profile's top 3 are I/A/S) so the effect
    // under test — the career link raising the score — isn't confounded with RIASEC already
    // carrying it; segment/marks are set to fit this profile exactly so those factors don't
    // confound the comparison either.
    const baseStream: StreamCatalogRecord = {
      streamId: "00000000-0000-4000-8000-000000000801",
      title: "Weak RIASEC, strong career link",
      riasecLetters: ["E", "C"],
      recommendedSegments: ["explorer"],
      marksBands: ["high"],
      priority: 1,
      datasetVersion: "streams-2026-a",
      verified: true,
    };

    const [withoutLink] = scoreStreams({
      recommendationId: "stream-rec-1",
      profile,
      streams: [baseStream],
      rankedCareerIds: [topCareerId],
      config,
      createdAt,
    });
    const [withLink] = scoreStreams({
      recommendationId: "stream-rec-1",
      profile,
      streams: [{ ...baseStream, careerLinks: [{ careerId: topCareerId, weight: 1 }] }],
      rankedCareerIds: [topCareerId],
      config,
      createdAt,
    });

    expect(withoutLink?.explanation.careerAlignment).toBeUndefined();
    expect(withLink?.explanation.careerAlignment).toBe(1);
    expect(withLink?.explanation.matchedCareerIds).toEqual([topCareerId]);
    expect(withLink!.fitScore).toBeGreaterThan(withoutLink!.fitScore!);
  });
});
