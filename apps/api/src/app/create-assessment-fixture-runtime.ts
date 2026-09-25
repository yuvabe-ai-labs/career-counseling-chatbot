import { GetAssessmentSnapshotService, type AssessmentHttpDependencies } from "@yuvapath/assessment";
import { FixtureProfileReader } from "@yuvapath/counselor";
import { validProfileSnapshot } from "@yuvapath/test-fixtures";

export const createAssessmentFixtureRuntime = (
  bearerToken: string,
): Required<AssessmentHttpDependencies> => ({
  getAssessmentSnapshot: new GetAssessmentSnapshotService(
    new FixtureProfileReader([validProfileSnapshot]),
  ),
  resolveUserId: (request) => {
    const authorization = request.header("authorization");
    const match = authorization ? /^Bearer\s+(\S+)$/i.exec(authorization.trim()) : null;
    return Promise.resolve(match?.[1] === bearerToken ? validProfileSnapshot.userId : null);
  },
});
