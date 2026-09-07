import type { ProfileSnapshot } from "@yuvanext/contracts";

export type ReadAssessmentSnapshotInput = {
  userId: string;
  profileSnapshotId?: string;
};

export type HandoffProfileContext = {
  firstName: string;
  ageBand: string;
  segment: "explorer" | "pathfinder" | "launcher";
  profileSnapshotId: string;
  code?: string;
  confidence?: "normal" | "soft";
  consentedContactAvailable: boolean;
};

// Method names below (getProfileSnapshot / getJourneySessionId / getHandoffProfile) are
// pinned: Module 4 (Counselor)'s own ProfileReader port
// (packages/counselor/src/application/ports/profile-reader.ts) is structurally identical
// to this interface, and PostgresAssessmentSnapshotReader is handed to Counselor
// wherever that port is expected (see apps/api/src/server.ts). Renaming a method here
// without renaming Counselor's port in lockstep would break that structural match.
export interface AssessmentSnapshotReader {
  getProfileSnapshot(input: ReadAssessmentSnapshotInput): Promise<ProfileSnapshot | null>;
  getJourneySessionId(input: Required<ReadAssessmentSnapshotInput>): Promise<string | null>;
  getHandoffProfile(
    input: Required<ReadAssessmentSnapshotInput>,
  ): Promise<HandoffProfileContext | null>;
}
