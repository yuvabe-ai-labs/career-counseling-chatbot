import type { ProfileSnapshotResponse } from "@yuvanext/contracts";
import {
  getStoredProfileSnapshotId,
  setStoredExploreGatingContext,
  setStoredProfileSnapshotId,
} from "@/lib/storage";

/**
 * `ProfileSnapshot.intakeSummary` entries are stored as `{ value: "..." }` (confirmed against
 * real assessment.profile_snapshots rows — verified via psql, e.g. `current_goal:
 * { value: "skill_building" }`), not plain scalars, so a naive `typeof intakeSummary[key] ===
 * "string"` check always fails on real data.
 */
export function readIntakeAnswer(
  intakeSummary: Record<string, unknown>,
  key: string,
): string | undefined {
  const entry = intakeSummary[key];
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "value" in entry && typeof entry.value === "string") {
    return entry.value;
  }
  return undefined;
}

/**
 * The one piece of state Explore Path actually needs that nothing creates automatically:
 * `profileSnapshotId` + the gating context (segment/wantsAid/currentGoal), both only ever
 * produced by `createAssessmentSnapshot` — a non-idempotent call (a fresh snapshot row every
 * time), so this only ever calls it when nothing is stored yet.
 *
 * Shared by every place that can now land a student on Explore Path — RiasecResultsPage's own
 * "Explore Path" button (the original, explicit case) and RiasecAssessmentPage's silent-resume
 * redirect (a student arriving with an assessment that was already fully complete before this
 * page even loaded, not one they just finished answering here — see that page's own comment) —
 * so neither has to duplicate the snapshot-then-store sequence.
 */
export async function ensureProfileSnapshot(
  createSnapshot: () => Promise<ProfileSnapshotResponse>,
): Promise<void> {
  if (getStoredProfileSnapshotId()) return;

  const { snapshot } = await createSnapshot();
  setStoredProfileSnapshotId(snapshot.snapshotId);
  setStoredExploreGatingContext({
    segment: snapshot.segment,
    wantsAid: snapshot.wantsAid,
    currentGoal: readIntakeAnswer(snapshot.intakeSummary, "current_goal"),
  });
}
