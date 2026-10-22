import type { Pool } from "pg";
import { createDatabasePool } from "@yuvapath/database";
import type { Express } from "express";
import { env } from "../config/env.js";
import { createApp, type CreateAppOptions } from "./create-app.js";

export type RuntimeApp = {
  app: Express;
  /** Present when DATABASE_URL is set. Callers own its lifecycle. */
  databasePool: Pool | null;
};

/**
 * Builds the fully-wired Express app with a database health check. Shared by the long-running
 * HTTP server entrypoint (server.ts) and the Lambda entrypoint (lambda.ts) so the two never drift.
 */
export const createRuntimeApp = async (
  appOptions: Pick<CreateAppOptions, "docs" | "cors"> = {},
): Promise<RuntimeApp> => {
  const databasePool = env.DATABASE_URL
    ? createDatabasePool({
        connectionString: env.DATABASE_URL,
        ssl: env.DATABASE_SSL,
        connectionTimeoutMillis: 10_000,
      })
    : null;

  const app = createApp({
    ...appOptions,
    ...(databasePool
      ? {
          checkDatabase: async () => {
            await databasePool.query("select 1");
            return true;
          },
        }
      : { database: false, databaseRequired: false }),
  });

  return Promise.resolve({ app, databasePool });
};
