import {
  registerAssessmentRoutes,
  SmtpEmailProvider,
  type EmailProvider,
  type IdentityUserDirectory,
  type LocationRepository,
} from "@yuvapath/assessment";
import { registerClusterfitModule } from "@yuvapath/clusterfit";
import { createOpenApiRegistry, generateOpenApiDocument } from "@yuvapath/contracts";
import { createDatabasePool, createSupabaseServerClient } from "@yuvapath/database";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { SupabaseIdentityDirectory } from "../auth/supabase-identity-directory.js";
import { env } from "../config/env.js";
import { errorHandler, notFoundHandler } from "../middleware/error-handler.js";
import { requestLogger } from "../middleware/request-logger.js";
import { registerHealthRoute } from "../routes/health.js";
import { modules } from "./modules.js";

export type CreateAppOptions = {
  logging?: boolean;
  /**
   * Mount the interactive Swagger UI at /docs. Defaults to true. The Lambda entrypoint sets
   * this to false: swagger-ui-express serves static HTML/CSS/JS from swagger-ui-dist on disk,
   * which doesn't survive esbuild bundling into a single file. /openapi.json (pure JSON, no
   * static assets) stays available either way.
   */
  docs?: boolean;
  /**
   * Apply the `cors` middleware (Access-Control-Allow-Origin etc., from CORS_ORIGIN). Defaults
   * to true. The Lambda entrypoint sets this to false: the Lambda Function URL already adds its
   * own CORS headers (see infra/bootstrap-aws.sh), so leaving this on there means every response
   * carries two, comma-joined Access-Control-Allow-Origin values — which browsers reject outright.
   */
  cors?: boolean;
  checkDatabase?: () => Promise<boolean>;
  databaseRequired?: boolean;
  /** Connect to DATABASE_URL. Defaults to true outside tests; false keeps every module in memory. */
  database?: boolean;
  identityUserDirectory?: IdentityUserDirectory;
  locationRepository?: LocationRepository;
  emailProvider?: EmailProvider;
  /** Overrides GEMINI_API_KEY for the clusterfit chat; null turns the chat off (tests). */
  geminiApiKey?: string | null;
};

/**
 * The API: student accounts (sign-up, sign-in, guardian consent, profile, state/city search) and
 * the clusterfit journey. Every public endpoint is in the OpenAPI document served at /docs.
 */
export const createApp = (options: CreateAppOptions = {}): Express => {
  const app = express();
  const registry = createOpenApiRegistry();
  const shouldUseDatabase = options.database ?? env.NODE_ENV !== "test";
  const databasePool =
    env.DATABASE_URL && shouldUseDatabase
      ? createDatabasePool({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL })
      : undefined;

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  if (options.cors ?? true) {
    app.use(
      cors({
        origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
        credentials: true,
      }),
    );
  }
  app.use(express.json({ limit: "1mb" }));

  if (options.logging !== false) {
    app.use(requestLogger);
  }

  registerHealthRoute(
    app,
    registry,
    modules,
    options.checkDatabase,
    options.databaseRequired ?? true,
  );

  // No dev-echo/no-op fallback — unconfigured SMTP means OTP requests fail with a clear 503
  // (UnavailableEmailProvider, @yuvapath/assessment's own default) rather than a silent fake
  // send. env.ts's superRefine guarantees these are set in production.
  const emailProvider: EmailProvider | undefined =
    options.emailProvider ??
    (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD
      ? new SmtpEmailProvider({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          from: env.SMTP_FROM ?? env.SMTP_USER,
        })
      : undefined);

  // Needs the Supabase service-role client (admin.createUser) for password-based sign-up.
  const identityUserDirectory: IdentityUserDirectory | undefined =
    options.identityUserDirectory ??
    (databasePool && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseIdentityDirectory({
          pool: databasePool,
          client: createSupabaseServerClient({
            url: env.SUPABASE_URL,
            apiKey: env.SUPABASE_SERVICE_ROLE_KEY,
          }),
        })
      : undefined);

  registerAssessmentRoutes(app, registry, {
    ...(databasePool ? { pool: databasePool } : {}),
    ...(emailProvider ? { emailProvider } : {}),
    ...(identityUserDirectory ? { identityUserDirectory } : {}),
    ...(options.locationRepository ? { locationRepository: options.locationRepository } : {}),
    enableGuardianOtpDebugRoute: env.NODE_ENV !== "production",
  });

  registerClusterfitModule(app, registry, {
    databasePool,
    geminiApiKey:
      options.geminiApiKey === undefined ? env.GEMINI_API_KEY : (options.geminiApiKey ?? undefined),
    liveModel: env.GEMINI_LIVE_MODEL,
    extractionModels: env.CLUSTERFIT_EXTRACTION_MODELS.split(",")
      .map((model) => model.trim())
      .filter(Boolean),
    extractionBudgetMs: env.CLUSTERFIT_EXTRACTION_BUDGET_MS,
    nodeEnv: env.NODE_ENV,
  });

  const openApiDocument = generateOpenApiDocument(registry);
  app.get("/openapi.json", (_request, response) => response.json(openApiDocument));
  if (options.docs ?? true) {
    app.use(
      "/docs",
      swaggerUi.serve,
      swaggerUi.setup(undefined, { swaggerOptions: { url: "/openapi.json" } }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
