import type { ProfileSnapshotResponse } from "@yuvapath/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureProfileSnapshot } from "@/features/assessment/lib/ensure-profile-snapshot";
import {
  getStoredExploreGatingContext,
  getStoredProfileSnapshotId,
  setStoredProfileSnapshotId,
} from "@/lib/storage";

function snapshotResponse(intakeSummary: Record<string, unknown>): ProfileSnapshotResponse {
  return {
    snapshot: {
      snapshotId: "00000000-0000-4000-8000-000000000001",
      segment: "pathfinder",
      intakeSummary,
    },
  } as unknown as ProfileSnapshotResponse;
}

describe("ensureProfileSnapshot — seeksAid gating", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ["yes", true],
    ["no", false],
  ])("maps the seeks_aid intake answer %s to seeksAid=%s", async (answer, expected) => {
    await ensureProfileSnapshot(() =>
      Promise.resolve(snapshotResponse({ seeks_aid: { value: answer } })),
    );

    expect(getStoredExploreGatingContext()?.seeksAid).toBe(expected);
  });

  it("treats a missing seeks_aid answer as No", async () => {
    await ensureProfileSnapshot(() => Promise.resolve(snapshotResponse({})));

    expect(getStoredExploreGatingContext()?.seeksAid).toBe(false);
  });

  it("does not create a second snapshot when one is already stored", async () => {
    setStoredProfileSnapshotId("existing");
    const createSnapshot = vi.fn();

    await ensureProfileSnapshot(createSnapshot);

    expect(createSnapshot).not.toHaveBeenCalled();
    expect(getStoredProfileSnapshotId()).toBe("existing");
  });
});
