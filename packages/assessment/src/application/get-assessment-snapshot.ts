import {
  ProfileSnapshotResponseSchema,
  UuidSchema,
  type ProfileSnapshotResponse,
} from "@yuvanext/contracts";
import type { AssessmentSnapshotReader } from "./assessment-snapshot-reader.js";

export class AssessmentSnapshotNotFoundError extends Error {
  constructor() {
    super("Assessment snapshot was not found");
    this.name = "AssessmentSnapshotNotFoundError";
  }
}

export type GetAssessmentSnapshotCommand = {
  userId: string;
  profileSnapshotId?: string;
};

export class GetAssessmentSnapshotService {
  constructor(private readonly profiles: AssessmentSnapshotReader) {}

  async execute(command: GetAssessmentSnapshotCommand): Promise<ProfileSnapshotResponse> {
    const userId = UuidSchema.parse(command.userId);
    const profileSnapshotId = command.profileSnapshotId
      ? UuidSchema.parse(command.profileSnapshotId)
      : undefined;
    const profile = await this.profiles.getProfileSnapshot({
      userId,
      ...(profileSnapshotId ? { profileSnapshotId } : {}),
    });
    if (!profile) {
      throw new AssessmentSnapshotNotFoundError();
    }
    // Envelope key matches the POST-create route's ({ snapshot: ... }) — previously this used
    // { profile: ... } while the create route used { snapshot: ... } for the same data shape;
    // see docs/poc/Validating-endpoints.md's Gap 3/8.
    return ProfileSnapshotResponseSchema.parse({ snapshot: profile });
  }
}
