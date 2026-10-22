import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { PgUserProfileRepository } from "@yuvapath/assessment";
import type { ModuleDescriptor } from "@yuvapath/contracts";
import { PostgresApprovedSafetyCopyReader, SAFETY_POLICY_VERSION } from "@yuvapath/safety";
import type { Express } from "express";
import type { Pool } from "pg";
import { ClusterfitService } from "./application/clusterfit-service.js";
import type {
  ClusterfitRepository,
  ClusterfitStudentProfileReader,
  ClusterfitStudentStageWriter,
  WellbeingCopyReader,
} from "./application/ports.js";
import { SituationService } from "./application/situation-service.js";
import { CLUSTERFIT_SCORING_V1, validateScoringConfig } from "./domain/scoring-config.js";
import { registerClusterfitRoutes } from "./http/clusterfit-routes.js";
import { registerClusterfitSituationRoutes } from "./http/situation-routes.js";
import { GeminiContextExtractor, GeminiLiveTokenIssuer } from "./infrastructure/gemini-clients.js";
import { InMemoryClusterfitRepository } from "./infrastructure/in-memory-clusterfit-repository.js";
import { PostgresClusterfitRepository } from "./infrastructure/pg-clusterfit-repository.js";

/** The student journey: chat (Parts A + E), activities, puzzles, work style and results. */
export const clusterfitModule: ModuleDescriptor = {
  code: "clusterfit",
  name: "Clusterfit journey",
  packageName: "@yuvapath/clusterfit",
  status: "in_progress",
};

export type ClusterfitModuleOptions = {
  /** Postgres in every real environment; without one (tests, local without a database) the
   *  module keeps its data in memory and uses a fixed demo student. */
  databasePool: Pool | undefined;
  /** Without a key the chat is unavailable (the confirm card still works). */
  geminiApiKey: string | undefined;
  liveModel: string;
  /** Tried in order for the post-chat extraction. */
  extractionModels: readonly string[];
  /** Total time for all extraction attempts; keep under the hosting timeout (Lambda: 30 s). */
  extractionBudgetMs: number;
  /** The dev-only extraction route is registered outside production. */
  nodeEnv: string;
};

const demoStudent: ClusterfitStudentProfileReader = {
  getStudent: () =>
    Promise.resolve({
      firstName: "Student",
      segment: "explorer",
      state: "Tamil Nadu",
      city: "Chennai",
    }),
};

/** Registers every /api/v1/clusterfit/* route. */
export const registerClusterfitModule = (
  app: Express,
  registry: OpenAPIRegistry,
  options: ClusterfitModuleOptions,
): void => {
  validateScoringConfig(CLUSTERFIT_SCORING_V1);
  const pool = options.databasePool;

  const repository: ClusterfitRepository = pool
    ? new PostgresClusterfitRepository(pool)
    : new InMemoryClusterfitRepository();
  // Profile facts through the assessment module's public export, never its tables (AGENTS.md).
  const profiles: ClusterfitStudentProfileReader = pool
    ? {
        getStudent: async (userId) => {
          const profile = await new PgUserProfileRepository(pool).findByUserId(userId);
          if (!profile || profile.profileStatus !== "active") return null;
          return {
            firstName: profile.firstName,
            segment: profile.segment,
            state: profile.state,
            city: profile.city,
          };
        },
      }
    : demoStudent;
  // Sign-up records every student as "In school"; the confirmed class updates the stage.
  const stages: ClusterfitStudentStageWriter | undefined = pool
    ? {
        setStage: async (userId, stage) => {
          await new PgUserProfileRepository(pool).updateEducationStage({
            userId,
            selfStage: stage,
            now: new Date().toISOString(),
          });
        },
      }
    : undefined;
  // Approved copy only, never invented here (AGENTS.md). Tier 1 = urgent support.
  const wellbeingCopy: WellbeingCopyReader | undefined = pool
    ? {
        getWellbeingCopy: async () =>
          (
            await new PostgresApprovedSafetyCopyReader(pool).getCopy({
              key: "mock_safety.tier_1",
              version: SAFETY_POLICY_VERSION,
              language: "en",
            })
          )?.text ?? null,
      }
    : undefined;

  registerClusterfitRoutes(
    app,
    registry,
    new ClusterfitService({ repository, profiles, stages, config: CLUSTERFIT_SCORING_V1 }),
  );
  registerClusterfitSituationRoutes(
    app,
    registry,
    new SituationService({
      repository,
      profiles,
      ...(options.geminiApiKey
        ? {
            extractor: new GeminiContextExtractor({
              apiKey: options.geminiApiKey,
              models: options.extractionModels,
              budgetMs: options.extractionBudgetMs,
            }),
            tokenIssuer: new GeminiLiveTokenIssuer({
              apiKey: options.geminiApiKey,
              model: options.liveModel,
            }),
          }
        : {}),
      ...(wellbeingCopy ? { wellbeingCopy } : {}),
    }),
    { devRoutes: options.nodeEnv !== "production" },
  );
};
