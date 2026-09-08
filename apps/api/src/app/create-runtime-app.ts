import type { Pool } from "pg";
import { createAssessmentFixtureRuntime } from "./create-assessment-fixture-runtime.js";
import { createAssessmentRuntime } from "./create-assessment-runtime.js";
import { createCounselorFixtureRuntime } from "./create-counselor-fixture-runtime.js";
import { createCounselorRuntime } from "./create-counselor-runtime.js";
import { createRecommendationFixtureRuntime } from "./create-recommendation-fixture-runtime.js";
import { createRecommendationRuntime } from "./create-recommendation-runtime.js";
import { createSupabaseUserResolver } from "../auth/supabase-user-resolver.js";
import { createApp, type CreateAppOptions } from "./create-app.js";
import { env } from "../config/env.js";
import { createDatabasePool, createSupabaseServerClient } from "@yuvanext/database";
import type { Express } from "express";

export type RuntimeApp = {
  app: Express;
  /** Present when a database-backed runtime was wired (i.e. not fixture mode). Callers own its lifecycle. */
  databasePool: Pool | null;
};

/**
 * Builds the fully-wired Express app: fixture runtimes in COUNSELOR_RUNTIME=fixture mode,
 * otherwise Postgres/Supabase-backed runtimes for assessment, recommendations, and the
 * counselor (AI provider, safety checker, report renderer). Shared by the long-running HTTP
 * server entrypoint (server.ts) and the Lambda entrypoint (lambda.ts) so the two never drift.
 */
export const createRuntimeApp = async (
  appOptions: Pick<CreateAppOptions, "docs" | "cors"> = {},
): Promise<RuntimeApp> => {
  const fixtureMode = env.COUNSELOR_RUNTIME === "fixture";
  if (fixtureMode && env.NODE_ENV === "production") {
    throw new Error("COUNSELOR_RUNTIME=fixture is forbidden in production");
  }

  const databasePool =
    !fixtureMode && env.DATABASE_URL
      ? createDatabasePool({
          connectionString: env.DATABASE_URL,
          ssl: env.DATABASE_SSL,
          connectionTimeoutMillis: 10_000,
        })
      : null;
  const supabase =
    !fixtureMode && env.SUPABASE_URL && env.SUPABASE_ANON_KEY
      ? createSupabaseServerClient({ url: env.SUPABASE_URL, apiKey: env.SUPABASE_ANON_KEY })
      : null;
  const supabaseService =
    !fixtureMode && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseServerClient({ url: env.SUPABASE_URL, apiKey: env.SUPABASE_SERVICE_ROLE_KEY })
      : null;
  const counselor = fixtureMode
    ? createCounselorFixtureRuntime(env.COUNSELOR_FIXTURE_TOKEN)
    : databasePool && supabase && supabaseService
      ? await (async () => {
          const [
            assessmentPackage,
            recommendationPackage,
            knowledgePackage,
            counselorPackage,
            safetyPackage,
          ] = await Promise.all([
            import("@yuvanext/assessment"),
            import("@yuvanext/recommendations"),
            import("@yuvanext/knowledge"),
            import("@yuvanext/counselor"),
            import("@yuvanext/safety"),
          ]);
          const geminiConfigured = Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
          const anthropicConfigured = Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL);
          const selectedAiProvider =
            env.AI_PROVIDER === "auto"
              ? geminiConfigured
                ? "gemini"
                : anthropicConfigured
                  ? "anthropic"
                  : "disabled"
              : env.AI_PROVIDER;
          const aiConfigured =
            (selectedAiProvider === "gemini" && geminiConfigured) ||
            (selectedAiProvider === "anthropic" && anthropicConfigured);
          // Safety is a same-process module here, so call it directly rather than over HTTP
          // (the POC spec describes it as "a synchronous pre-check port," not a network call).
          // SAFETY_SERVICE_URL remains a fallback for a genuinely separate safety deployment.
          const safetyOperations = safetyPackage.createPostgresSafetyOperationsRepository(databasePool);
          const safety = safetyOperations
            ? new counselorPackage.InProcessSafetyChecker(safetyOperations)
            : env.SAFETY_SERVICE_URL
              ? new counselorPackage.HttpSafetyChecker({
                  baseUrl: env.SAFETY_SERVICE_URL,
                  timeoutMs: env.SAFETY_SERVICE_TIMEOUT_MS,
                })
              : new counselorPackage.UnavailableSafetyChecker();
          return createCounselorRuntime({
            databasePool,
            supabaseAuth: supabase,
            profiles: new assessmentPackage.PostgresAssessmentSnapshotReader(databasePool),
            recommendations: new recommendationPackage.PostgresRecommendationSetReader(databasePool),
            knowledge: new knowledgePackage.PostgresKnowledgeReader(databasePool),
            safety,
            ai:
              selectedAiProvider === "gemini" && geminiConfigured
                ? new counselorPackage.GeminiAiProvider({
                    apiKey: env.GEMINI_API_KEY!,
                    model: env.GEMINI_MODEL!,
                    maxTokens: env.GEMINI_MAX_TOKENS,
                    timeoutMs: env.GEMINI_TIMEOUT_MS,
                    thinkingLevel: env.GEMINI_THINKING_LEVEL,
                  })
                : selectedAiProvider === "anthropic" && anthropicConfigured
                  ? new counselorPackage.AnthropicAiProvider({
                      apiKey: env.ANTHROPIC_API_KEY!,
                      model: env.ANTHROPIC_MODEL!,
                      maxTokens: env.ANTHROPIC_MAX_TOKENS,
                      timeoutMs: env.ANTHROPIC_TIMEOUT_MS,
                    })
                  : new counselorPackage.DisabledAiProvider(),
            approvedCopy: new counselorPackage.ConfiguredApprovedCopyReader({
              version: env.COUNSELOR_COPY_VERSION,
              welcomeBySegment: {
                explorer: env.COUNSELOR_WELCOME_EXPLORER,
                pathfinder: env.COUNSELOR_WELCOME_PATHFINDER,
                launcher: env.COUNSELOR_WELCOME_LAUNCHER,
              },
              fallback: env.COUNSELOR_FALLBACK_COPY,
              safety: new safetyPackage.PostgresApprovedSafetyCopyReader(databasePool),
            }),
            reportRenderer: new counselorPackage.SupabaseReportRenderer({
              client: supabaseService,
              privateBucket: env.COUNSELOR_PRIVATE_REPORT_BUCKET,
              shareBucket: env.COUNSELOR_SHARE_CARD_BUCKET,
            }),
            privateAssetTtlMs: env.COUNSELOR_PRIVATE_ASSET_TTL_MS,
            shareAssetTtlMs: env.COUNSELOR_SHARE_ASSET_TTL_MS,
            aiMode: aiConfigured ? "enabled" : "degraded",
          });
        })()
      : undefined;
  const assessment = fixtureMode
    ? createAssessmentFixtureRuntime(env.COUNSELOR_FIXTURE_TOKEN)
    : databasePool && supabase
      ? createAssessmentRuntime(databasePool, supabase)
      : undefined;
  const recommendations = fixtureMode
    ? createRecommendationFixtureRuntime(env.COUNSELOR_FIXTURE_TOKEN)
    : databasePool && supabase
      ? createRecommendationRuntime(databasePool, supabase)
      : undefined;

  const app = createApp({
    ...appOptions,
    ...(fixtureMode ? { database: false, databaseRequired: false } : {}),
    ...(databasePool
      ? {
          checkDatabase: async () => {
            await databasePool.query("select 1");
            return true;
          },
        }
      : {}),
    ...(counselor ? { counselor } : {}),
    ...(assessment ? { assessment } : {}),
    ...(recommendations ? { recommendations } : {}),
    ...(supabase ? { resolveSafetyUserId: createSupabaseUserResolver(supabase) } : {}),
    ...(databasePool
      ? await (async () => {
          const [evaluationPackage, safetyPackage] = await Promise.all([
            import("@yuvanext/evaluation"),
            import("@yuvanext/safety"),
          ]);
          return {
            evaluationRunRepository:
              evaluationPackage.createPostgresEvaluationRunRepository(databasePool),
            privacyJobRepository: safetyPackage.createPostgresPrivacyJobRepository(databasePool),
            safetyOperationsRepository:
              safetyPackage.createPostgresSafetyOperationsRepository(databasePool),
          };
        })()
      : {}),
  });

  return { app, databasePool };
};
