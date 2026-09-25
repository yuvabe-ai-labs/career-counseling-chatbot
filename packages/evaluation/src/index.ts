import type { ModuleDescriptor } from "@yuvapath/contracts";
export { registerEvaluationRoutes } from "./http/evaluation-routes.js";
export {
  getSyntheticEvaluationRun,
  runSyntheticEvaluation,
  syntheticEvaluationResults,
} from "./domain/evaluation-runs.js";
export {
  createPostgresEvaluationRunRepository,
  type EvaluationRunRepository,
} from "./infrastructure/evaluation-run-repository.js";

export const evaluationModule: ModuleDescriptor = {
  code: "m5-evaluation",
  name: "Evaluation",
  packageName: "@yuvapath/evaluation",
  status: "in_progress",
};
