// One-off: recommendation.matching_configurations only ever had a 'career_match' row. Stream,
// pathway and college recommendations all fall back to it via loadConfigByKey()'s
// configurationKey !== "career_match" branch (recommendation-data-source.ts) whenever their own
// key has no active row — harmless today (stream/pathway scoring only actually reads
// roundingScale/riasecTieOrder off the config, and college scoring reads neither), but it means
// every response is mislabeled with algorithmVersion/weightsVersion "module-2-live-v1" /
// "…-default-weights-v1" regardless of which recommendation kind produced it. This gives each
// kind its own real, active, correctly-labeled config row instead.
//
// Purely additive (insert ... on conflict do nothing keyed by configuration_key+status='active'
// via a partial check first) — no purge, no destructive step, safe to run any time.
//
// Usage:  pnpm tsx scripts/ingest/seed-recommendation-configs.ts            (dry run, rolls back)
//         pnpm tsx scripts/ingest/seed-recommendation-configs.ts --apply    (commits)
import process from "node:process";
import { randomUUID } from "node:crypto";
import { createDatabasePool } from "@yuvapath/database";
import type { PoolClient } from "pg";

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const CONFIGS: Array<{ key: string; version: string }> = [
  { key: "stream_rank", version: "module-2-live-stream-weights-v1" },
  { key: "pathway_rank", version: "module-2-live-pathway-weights-v1" },
  { key: "college_rank", version: "module-2-live-college-weights-v1" },
];

const seedConfigs = async (client: PoolClient): Promise<void> => {
  for (const config of CONFIGS) {
    const existing = await client.query(
      `select 1 from recommendation.matching_configurations where configuration_key = $1 and status = 'active'`,
      [config.key],
    );
    if (existing.rows.length > 0) {
      log(`   skip    ${config.key} already has an active configuration`);
      continue;
    }
    await client.query(
      `insert into recommendation.matching_configurations
         (id, configuration_key, version, status, algorithm_version, rounding_scale, riasec_tie_order, rules_json, created_at)
       values ($1, $2, $3, 'active', 'module-2-live-v1', 6, array['R','I','A','S','E','C'], '{}'::jsonb, now())`,
      [randomUUID(), config.key, config.version],
    );
    log(`   added   ${config.key} -> ${config.version}`);
  }
};

const assertHealthy = async (client: PoolClient): Promise<void> => {
  const result = await client.query<{ configuration_key: string; n: string }>(
    `select configuration_key, count(*)::int as n from recommendation.matching_configurations
     where status = 'active' group by configuration_key`,
  );
  const byKey = new Map(result.rows.map((row) => [row.configuration_key, Number(row.n)]));
  for (const kind of ["career_match", "stream_rank", "pathway_rank", "college_rank"]) {
    const count = byKey.get(kind) ?? 0;
    const passed = count === 1;
    log(`   ${passed ? "PASS" : "FAIL"}  exactly one active config for ${kind} (found ${count})`);
    if (!passed) throw new Error(`Assertion failed: exactly one active config for ${kind}`);
  }
};

const run = async (): Promise<void> => {
  try { process.loadEnvFile(); } catch { /* .env is optional */ }
  const apply = process.argv.includes("--apply");
  if (process.env.DATABASE_URL === undefined) throw new Error("DATABASE_URL is required");

  const pool = createDatabasePool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL !== "false",
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    log("1. seed missing active configurations for stream_rank/pathway_rank/college_rank");
    await seedConfigs(client);
    log("2. assertions");
    await assertHealthy(client);

    if (apply) {
      await client.query("commit");
      log("\nCOMMITTED");
    } else {
      await client.query("rollback");
      log("\nDRY RUN - transaction rolled back, database unchanged. Re-run with --apply to commit.");
    }
  } catch (error) {
    await client.query("rollback");
    log(`\nROLLED BACK: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`seed-recommendation-configs failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});
