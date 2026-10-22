// Public surface of the clusterfit module: the student journey (docs/clusterfit-prototype-plan.md).
export {
  clusterfitModule,
  registerClusterfitModule,
  type ClusterfitModuleOptions,
} from "./module.js";
export { ClusterfitService, buildScoringInput } from "./application/clusterfit-service.js";
export { SituationService } from "./application/situation-service.js";
export { ClusterfitApplicationError } from "./application/errors.js";
export type {
  ClusterfitRepository,
  ClusterfitStudentProfileReader,
  ContextExtractor,
  LiveTokenIssuer,
  WellbeingCopyReader,
} from "./application/ports.js";
export { InMemoryClusterfitRepository } from "./infrastructure/in-memory-clusterfit-repository.js";
export { PostgresClusterfitRepository } from "./infrastructure/pg-clusterfit-repository.js";
export { GeminiContextExtractor, GeminiLiveTokenIssuer } from "./infrastructure/gemini-clients.js";
export {
  scoreClusterfit,
  clusterfitInputHash,
  type ClusterfitScoringInput,
} from "./domain/scoring.js";
export {
  CLUSTERFIT_SCORING_V1,
  validateScoringConfig,
  type ClusterfitScoringConfig,
} from "./domain/scoring-config.js";
export { CLUSTERS, CONTENT_VERSION } from "./content/v1/index.js";
