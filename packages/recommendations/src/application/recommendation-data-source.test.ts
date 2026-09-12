import { describe, expect, it, vi } from "vitest";
import type { ProfileSnapshotForRecommendations } from "@yuvanext/contracts";
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
});

// Regression coverage for a real bug found live: loadPathways()/loadColleges() used to default
// to `limit = 30` and pass that straight into `... limit $1`, truncating the ranked-by-title
// SQL query to the alphabetically-first 30 rows BEFORE scorePathways()/scoreColleges() ever ran
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

    // loadPathways() queries loadActiveStreamIds() first, then the pathways SELECT itself.
    const [, params] = pool.query.mock.calls[1] as [string, unknown[]];
    expect(params[params.length - 1]).toBeNull();
  });

  it("loadPathways still honors an explicit limit when one is actually requested", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadPathways(10);

    const [, params] = pool.query.mock.calls[1] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(10);
  });

  it("loadColleges passes null (unlimited), not a hardcoded 30, when no limit is given", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadColleges();

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBeNull();
  });

  it("loadStreams passes null (unlimited), not a hardcoded 30, when no limit is given", async () => {
    const pool = createFakePool([]);
    const dataSource = createPostgresRecommendationDataSource(pool as never);

    await dataSource.loadStreams(baseProfile);

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBeNull();
  });
});
