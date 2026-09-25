import { describe, expect, it, vi } from "vitest";
import type { ProfileSnapshotForRecommendations } from "@yuvapath/contracts";
import {
  canonicalizeRiasecPair,
  createPostgresRecommendationDataSource,
} from "./recommendation-data-source.js";

const baseProfile: ProfileSnapshotForRecommendations = {
  profileSnapshotId: "00000000-0000-4000-8000-000000000900",
  profileVersion: "profile-v1",
  profileHash: "profile-hash",
  segment: "pathfinder",
  state: "Tamil Nadu",
  riasec: { R: 0.8, I: 0.9, A: 0.2, S: 0.1, E: 0.3, C: 0.05 },
};

function createFakePool(rows: unknown[]): { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  };
}

/** Returns each call's rows in sequence — needed for loadStreams()'s multi-query career path. */
function createSequencedPool(responses: unknown[][]): { query: ReturnType<typeof vi.fn> } {
  const query = vi.fn();
  for (const rows of responses) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("canonicalizeRiasecPair", () => {
  it("orders a pair the same way regardless of which letter scored higher", () => {
    // Same two letters, opposite score order — must produce the identical lookup key.
    expect(canonicalizeRiasecPair(["I", "R"])).toBe(canonicalizeRiasecPair(["R", "I"]));
    expect(canonicalizeRiasecPair(["I", "R"])).toBe("RI");
  });

  it("follows the fixed R,I,A,S,E,C tie-order for every pair", () => {
    expect(canonicalizeRiasecPair(["C", "A"])).toBe("AC");
    expect(canonicalizeRiasecPair(["E", "S"])).toBe("SE");
  });
});

describe("createPostgresRecommendationDataSource loadStreams", () => {
  it("prefers a segment-specific stream_maps row over a NULL-general row for the same pair", async () => {
    const pool = createFakePool([
      {
        id: "stream-general",
        title: "General Stream",
        rank: 1,
        top_two_code: "IR",
        map_segment: null,
        dataset_version: "v1",
      },
      {
        id: "stream-pathfinder",
        title: "Pathfinder-Specific Stream",
        rank: 1,
        top_two_code: "IR",
        map_segment: "pathfinder",
        dataset_version: "v1",
      },
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const streams = await dataSource.loadStreams(baseProfile);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.streamId).toBe("stream-pathfinder");
    expect(streams[0]?.recommendedSegments).toEqual(["pathfinder"]);
  });

  it("falls back to the NULL-general row when no segment-specific row exists", async () => {
    const pool = createFakePool([
      {
        id: "stream-general",
        title: "General Stream",
        rank: 1,
        top_two_code: "IR",
        map_segment: null,
        dataset_version: "v1",
      },
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const streams = await dataSource.loadStreams(baseProfile);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.streamId).toBe("stream-general");
    expect(streams[0]?.recommendedSegments).toEqual(["explorer", "pathfinder", "launcher"]);
  });

  it("queries using the canonical (tie-order) top-two code, not score order", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    // baseProfile has I scoring higher than R — the canonical lookup key must still be "RI".
    await dataSource.loadStreams(baseProfile);

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe("RI");
  });

  // Iteration 1 (docs/architecture/career-stream-mapping-iteration-1-plan.md): loadStreams()
  // becomes a union of the existing RIASEC-pair candidates and any career-linked candidates —
  // never a replacement.
  it("skips the career-driven query entirely when no rankedCareerIds are given", async () => {
    const pool = createFakePool([
      { id: "stream-riasec", title: "RIASEC Stream", rank: 1, top_two_code: "IR", map_segment: null, dataset_version: "v1" },
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const streams = await dataSource.loadStreams(baseProfile, undefined, []);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(streams).toHaveLength(1);
    expect(streams[0]?.careerLinks).toBeUndefined();
  });

  it("attaches careerLinks onto an existing RIASEC-pair candidate that also has a career_streams row", async () => {
    const pool = createSequencedPool([
      [{ id: "stream-riasec", title: "RIASEC Stream", rank: 1, top_two_code: "IR", map_segment: null, dataset_version: "v1" }],
      [{ id: "stream-riasec", title: "RIASEC Stream", description: "desc", career_id: "career-1", weight: "0.8" }],
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const streams = await dataSource.loadStreams(baseProfile, undefined, ["career-1"]);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.streamId).toBe("stream-riasec");
    expect(streams[0]?.careerLinks).toEqual([{ careerId: "career-1", weight: 0.8 }]);
    // Only 2 queries: the career_streams link query found a match already present in the
    // RIASEC-pair set, so the fallback-dataset-version lookup (only needed for a
    // career-only-reached synthesized candidate) is never issued.
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("synthesizes a new candidate for a stream reachable only via a career_streams link", async () => {
    const pool = createSequencedPool([
      [], // no RIASEC-pair candidates for this pair
      [{ id: "stream-career-only", title: "Career-Only Stream", description: "desc", career_id: "career-1", weight: "0.6" }],
      [{ version: "catalog-2026-a" }], // fallback dataset version lookup
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const streams = await dataSource.loadStreams(baseProfile, undefined, ["career-1"]);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.streamId).toBe("stream-career-only");
    expect(streams[0]?.riasecLetters).toEqual([]);
    expect(streams[0]?.careerLinks).toEqual([{ careerId: "career-1", weight: 0.6 }]);
    expect(streams[0]?.datasetVersion).toBe("catalog-2026-a");
  });
});

// Regression coverage for a real bug found live: loadPathways()/loadColleges() used to default
// to `limit = 30` and pass that straight into `... limit $1`, truncating the ranked-by-title
// SQL query to the alphabetically-first 30 rows BEFORE scorePathways()/resolveEligibleColleges()
// ever ran
// — with more than 30 published pathways (already true in production), every pathway past that
// alphabetical cutoff was invisible to every single student regardless of fit. Fixed by passing
// `null` through when no explicit limit is requested — `limit $1` with a null parameter is
// unlimited in Postgres — matching loadCareers()'s already-existing "load the complete
// catalogue, let scoring rank it" behavior. These tests assert the query parameter itself, since
// that's the exact thing that broke.
describe("createPostgresRecommendationDataSource — no default row cap when limit is omitted", () => {
  it("loadPathways passes null (unlimited), not a hardcoded 30, when no limit is given", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadPathways();

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBeNull();
  });

  it("loadPathways still honors an explicit limit when one is actually requested", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadPathways(10);

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(10);
  });

  it("loadPathways maps stream_option_ids onto streamOptionIds, with the same empty-set sentinel careerIds already uses (Iteration 2)", async () => {
    const pool = createFakePool([
      {
        id: "pathway-linked",
        title: "Linked Pathway",
        career_ids: [],
        stream_option_ids: ["stream-1", "stream-2"],
        dataset_version: "v1",
        route_level: "degree",
        backup_route_note: null,
      },
      {
        id: "pathway-unlinked",
        title: "Unlinked Pathway",
        career_ids: [],
        stream_option_ids: [],
        dataset_version: "v1",
        route_level: "degree",
        backup_route_note: null,
      },
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const pathways = await dataSource.loadPathways();

    const linked = pathways.find((pathway) => pathway.pathwayId === "pathway-linked");
    const unlinked = pathways.find((pathway) => pathway.pathwayId === "pathway-unlinked");
    expect(linked?.streamOptionIds).toEqual(["stream-1", "stream-2"]);
    expect(unlinked?.streamOptionIds).toEqual(["00000000-0000-4000-8000-000000000000"]);
  });

  it("loadColleges passes null (unlimited), not a hardcoded 30, when no limit is given", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadColleges();

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBeNull();
  });

  it("loadColleges enforces state = 'Tamil Nadu' as an explicit eligibility gate, not just a data assumption", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadColleges();

    const [sql] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("college.state = 'Tamil Nadu'");
  });

  it("loadColleges derives instituteKind/ownership from institution_type and programType from program_name", async () => {
    const pool = createFakePool([
      {
        id: "college-1",
        name: "Government College of Engineering, Salem",
        state: "Tamil Nadu",
        city: "Salem",
        tier: null,
        institution_type: "Engineering College - Government Aided",
        programs_json: [
          { discipline_id: "discipline-1", program_name: "B.E./B.Tech. Computer Science And Engineering", admission_route: "TNEA single-window counselling" },
          { discipline_id: "discipline-2", program_name: "5 Year B.A.LL.B. Degree Course", admission_route: "Direct application to the college" },
        ],
        dataset_version: "v1",
      },
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const [college] = await dataSource.loadColleges();

    expect(college?.district).toBe("Salem");
    expect(college?.instituteKind).toBe("Engineering College");
    expect(college?.ownership).toBe("government_aided");
    expect(college?.tier).toBe(3);
    expect(college?.programs).toEqual([
      { disciplineId: "discipline-1", programType: "B.E./B.Tech.", admissionRoute: "TNEA single-window counselling" },
      { disciplineId: "discipline-2", programType: "B.A.LL.B.", admissionRoute: "Direct application to the college" },
    ]);
  });

  it("loadColleges falls back to an 'other' ownership bucket for institution_type suffixes that aren't literally Government/Government Aided/Self-Financing", async () => {
    const pool = createFakePool([
      {
        id: "college-2",
        name: "TNAU Agricultural College",
        state: "Tamil Nadu",
        city: "Coimbatore",
        tier: null,
        institution_type: "Agriculture & Allied College - TNAU Constituent",
        programs_json: [],
        dataset_version: "v1",
      },
    ]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const [college] = await dataSource.loadColleges();

    expect(college?.instituteKind).toBe("Agriculture & Allied College");
    expect(college?.ownership).toBe("other");
    expect(college?.programs).toEqual([]);
  });

  it("loadStreams passes null (unlimited), not a hardcoded 30, when no limit is given", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadStreams(baseProfile);

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBeNull();
  });
});

// Iteration 3 Phase A (docs/architecture/pathway-college-mapping-iteration-3-plan.md): the
// qualification-leak fix. This is the regression test that would have caught the original bug —
// two pathways sharing one discipline at different qualification levels must resolve to
// DIFFERENT programType values, not the same undifferentiated result.
describe("createPostgresRecommendationDataSource — loadPathwayProgramType (Iteration 3 Phase A)", () => {
  it("derives the pathway's own qualification from its title", async () => {
    const pool = createFakePool([{ title: "B.Sc in Visual Communication & Design" }]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const programType = await dataSource.loadPathwayProgramType("pathway-1");

    expect(programType).toBe("B.Sc");
  });

  it("resolves two pathways sharing one discipline at different qualification levels to different programTypes", async () => {
    const bscPool = createFakePool([{ title: "B.Sc in Visual Communication & Design" }]);
    const btechPool = createFakePool([{ title: "B.E./B.Tech. in Visual Communication & Design" }]);

    const bscType = await createPostgresRecommendationDataSource(bscPool as never).loadPathwayProgramType("pathway-1");
    const btechType = await createPostgresRecommendationDataSource(btechPool as never).loadPathwayProgramType("pathway-2");

    expect(bscType).not.toBe(btechType);
    expect(bscType).toBe("B.Sc");
    expect(btechType).toBe("B.E./B.Tech.");
  });

  it("returns undefined for an unresolved pathway id, never a guess", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    expect(await dataSource.loadPathwayProgramType(undefined)).toBeUndefined();
    expect(await dataSource.loadPathwayProgramType("unknown-pathway")).toBeUndefined();
  });
});

describe("createPostgresRecommendationDataSource — loadTopPathwayIdForCareer (Iteration 3 Phase A)", () => {
  it("returns the single top-priority pathway id, not a union of every linked pathway", async () => {
    const pool = createFakePool([{ pathway_id: "top-priority-pathway" }]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    const pathwayId = await dataSource.loadTopPathwayIdForCareer("career-1");

    expect(pathwayId).toBe("top-priority-pathway");
    const [sql] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("limit 1");
  });

  it("returns undefined for a career with no linked pathway, or no careerId at all", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    expect(await dataSource.loadTopPathwayIdForCareer(undefined)).toBeUndefined();
    expect(await dataSource.loadTopPathwayIdForCareer("career-with-no-pathway")).toBeUndefined();
  });
});
