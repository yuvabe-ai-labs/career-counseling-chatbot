import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  importCollegeDataset,
  importStreamDataset,
  type CollegeDatasetPublisher,
  type StreamDatasetPublisher,
} from "../src/index.js";

// Phase 1 of docs/poc/ai-assisted-catalog-implementation-plan.md §8/§24 — the curated
// (human-authored, not Gemini-drafted) base vocabulary: education routes, stream options,
// RIASEC stream maps, and disciplines. This proves the generated fixture files actually pass
// through the existing, unchanged dataset-import pipeline before anyone runs the real import
// script against a live database.

describe("curated base vocabulary — streams dataset (education routes, stream options, stream maps)", () => {
  it("publishes cleanly through the existing stream dataset importer", async () => {
    const directory = resolve("data/seed/knowledge/streams/2026-09-11");
    const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as unknown;
    const records = await readFile(resolve(directory, "streams.json"), "utf8");
    const publish = vi.fn<StreamDatasetPublisher["publish"]>().mockResolvedValue("published");

    const report = await importStreamDataset(manifest, records, { publish });

    expect(report.status).toBe("published");
    expect(report.issues).toEqual([]);
    expect(publish).toHaveBeenCalledOnce();

    const published = publish.mock.calls[0]?.[0];
    // Only route_level values not already published by the pre-existing 2026-07-31 streams
    // fixture ("degree"/"iti"/"diploma" already exist there, route_code is separately unique
    // from id — see the generator script's own comment for why those three are excluded).
    expect(published?.records.educationRoutes).toHaveLength(4);
    expect(published?.records.streamOptions).toHaveLength(12);
    expect(published?.records.streamMaps).toHaveLength(15);
    expect(published?.records.streamMapItems).toHaveLength(30);
    // Every stream_maps row is the MVP "general" mapping — segment=null — per plan §8/§14.
    expect(published?.records.streamMaps.every((map) => map.segment === null)).toBe(true);
    // All 15 unordered RIASEC pairs are covered, each written in canonical (tie-order) form.
    const codes = new Set(published?.records.streamMaps.map((map) => map.topTwoCode));
    expect(codes.size).toBe(15);
  });
});

describe("curated base vocabulary — disciplines dataset", () => {
  it("publishes cleanly through the existing college dataset importer", async () => {
    const directory = resolve("data/seed/knowledge/disciplines/2026-09-11");
    const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as unknown;
    const records = await readFile(resolve(directory, "disciplines.json"), "utf8");
    const publish = vi.fn<CollegeDatasetPublisher["publish"]>().mockResolvedValue("published");

    const report = await importCollegeDataset(manifest, records, { publish });

    expect(report.status).toBe("published");
    expect(report.issues).toEqual([]);
    const published = publish.mock.calls[0]?.[0];
    expect(published?.records.disciplines.length).toBeGreaterThanOrEqual(40);
    expect(published?.records.colleges).toEqual([]);
    expect(published?.records.programs).toEqual([]);
  });
});
