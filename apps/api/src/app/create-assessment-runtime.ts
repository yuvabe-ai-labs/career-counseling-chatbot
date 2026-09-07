import {
  GetAssessmentSnapshotService,
  PostgresAssessmentSnapshotReader,
  type AssessmentHttpDependencies,
} from "@yuvanext/assessment";
import {
  createSupabaseUserResolver,
  type SupabaseAuthClient,
} from "../auth/supabase-user-resolver.js";

type AssessmentDatabasePool = ConstructorParameters<typeof PostgresAssessmentSnapshotReader>[0];

export const createAssessmentRuntime = (
  databasePool: AssessmentDatabasePool,
  supabaseAuth: SupabaseAuthClient,
): Required<AssessmentHttpDependencies> => ({
  getAssessmentSnapshot: new GetAssessmentSnapshotService(
    new PostgresAssessmentSnapshotReader(databasePool),
  ),
  resolveUserId: createSupabaseUserResolver(supabaseAuth),
});
