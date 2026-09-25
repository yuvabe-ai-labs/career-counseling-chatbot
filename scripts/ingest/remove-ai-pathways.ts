// One-off: remove every pathway NOT sourced from the two Tamil Nadu Excel workbooks
// (tamil_nadu_colleges.xlsx / tamil_nadu_pathways.xlsx -> dataset_key 'tn-official-pathways'),
// so knowledge.pathways contains only the 158 TN-official pathways.
//
// Removes: 479 AI-generated pathways (dataset_key 'ai-pathways') and 7 older hand-authored
// crosswalk pathways (dataset_key 'tn-dce-career-pathway-crosswalk'), plus their career_pathways
// and pathway_disciplines rows, plus all stored recommendation history (every FK into
// knowledge.pathways is ON DELETE NO ACTION, so any run/item referencing a removed pathway must
// go first - all 14 runs are this session's own test data, not real user history).
//
// Left untouched, on purpose: knowledge.colleges, college_programs, disciplines, careers (923,
// single O*NET source, never AI) and education_routes (some become unused by this deletion, but
// removing them is a separate task - same call made for the earlier TN catalogue cleanup).
//
// Runs inside ONE transaction: purge history -> delete non-TN pathway_disciplines/career_pathways
// -> delete non-TN pathways -> assert. Any failure rolls everything back.
//
// Usage:  pnpm tsx scripts/ingest/remove-ai-pathways.ts            (dry run, rolls back)
//         pnpm tsx scripts/ingest/remove-ai-pathways.ts --apply    (commits)
import process from "node:process";
import { createDatabasePool } from "@yuvapath/database";
import type { PoolClient } from "pg";

const KEEP_DATASET_KEY = "tn-official-pathways";

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const NON_TN_PATHWAYS = `
  select p.id from knowledge.pathways p
  join knowledge.dataset_versions dv on dv.id = p.dataset_version_id
  where dv.dataset_key <> '${KEEP_DATASET_KEY}'`;

const purgeRecommendationHistory = async (client: PoolClient): Promise<void> => {
  const steps: Array<[string, string]> = [
    ["counselor.journey_states -> clear recommendation pointer",
     `update counselor.journey_states set current_recommendation_id = null where current_recommendation_id is not null`],
    ["counselor.exploration_events", `delete from counselor.exploration_events`],
    ["recommendation.missions", `delete from recommendation.missions`],
    ["recommendation.generated_plan_steps", `delete from recommendation.generated_plan_steps`],
    ["recommendation.generated_plans", `delete from recommendation.generated_plans`],
    ["recommendation.recommendation_items", `delete from recommendation.recommendation_items`],
    ["recommendation.recommendation_rings", `delete from recommendation.recommendation_rings`],
    ["recommendation.recommendation_runs", `delete from recommendation.recommendation_runs`],
  ];
  for (const [label, sql] of steps) {
    const result = await client.query(sql);
    log(`   ${String(result.rowCount).padStart(6)}  ${label}`);
  }
};

const removeNonTnPathways = async (client: PoolClient): Promise<void> => {
  const steps: Array<[string, string]> = [
    ["pathway_disciplines of non-TN pathways",
     `delete from knowledge.pathway_disciplines where pathway_id in (${NON_TN_PATHWAYS})`],
    ["career_pathways of non-TN pathways",
     `delete from knowledge.career_pathways where pathway_id in (${NON_TN_PATHWAYS})`],
    ["pathways (non-TN)", `delete from knowledge.pathways where id in (${NON_TN_PATHWAYS})`],
  ];
  for (const [label, sql] of steps) {
    const result = await client.query(sql);
    log(`   ${String(result.rowCount).padStart(6)}  ${label}`);
  }
};

const assertHealthy = async (client: PoolClient): Promise<void> => {
  const one = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
  const checks: Array<[string, () => Promise<boolean>, string]> = [
    ["only tn-official-pathways pathways remain",
     async () => (await one(`select count(*)::int n from knowledge.pathways p
        join knowledge.dataset_versions dv on dv.id = p.dataset_version_id
        where dv.dataset_key <> '${KEEP_DATASET_KEY}'`)) === 0, ""],
    ["exactly 158 pathways remain",
     async () => (await one(`select count(*)::int n from knowledge.pathways`)) === 158, ""],
    ["no orphan pathway_disciplines", async () => (await one(`select count(*)::int n from knowledge.pathway_disciplines pd
        where not exists (select 1 from knowledge.pathways p where p.id = pd.pathway_id)`)) === 0, ""],
    ["no orphan career_pathways", async () => (await one(`select count(*)::int n from knowledge.career_pathways cp
        where not exists (select 1 from knowledge.pathways p where p.id = cp.pathway_id)`)) === 0, ""],
    ["colleges untouched (2896)", async () => (await one(`select count(*)::int n from knowledge.colleges`)) === 2896, ""],
    ["college_programs untouched (15563)", async () => (await one(`select count(*)::int n from knowledge.college_programs`)) === 15563, ""],
    ["careers untouched (923)", async () => (await one(`select count(*)::int n from knowledge.careers`)) === 923, ""],
    ["every remaining pathway still has >=1 discipline",
     async () => (await one(`select count(*)::int n from knowledge.pathways p
        where not exists (select 1 from knowledge.pathway_disciplines pd where pd.pathway_id = p.id)`)) === 0, ""],
  ];
  for (const [label, check, extra] of checks) {
    const passed = await check();
    log(`   ${passed ? "PASS" : "FAIL"}  ${label}${passed ? "" : ` (${extra})`}`);
    if (!passed) throw new Error(`Assertion failed: ${label}`);
  }
};

const run = async (): Promise<void> => {
  try { process.loadEnvFile(); } catch { /* .env is optional */ }
  const apply = process.argv.includes("--apply");
  if (process.env.DATABASE_URL === undefined) throw new Error("DATABASE_URL is required");

  const started = Date.now();
  const elapsed = (): string => `${((Date.now() - started) / 1000).toFixed(1)}s`;
  const pool = createDatabasePool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL !== "false",
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    log(`1. purge stored recommendation history (all of it is this session's own test data)  [${elapsed()}]`);
    await purgeRecommendationHistory(client);
    log(`2. remove pathways not sourced from '${KEEP_DATASET_KEY}'  [${elapsed()}]`);
    await removeNonTnPathways(client);
    log(`3. assertions  [${elapsed()}]`);
    await assertHealthy(client);

    if (apply) {
      await client.query("commit");
      log(`\nCOMMITTED  [${elapsed()}]`);
    } else {
      await client.query("rollback");
      log(`\nDRY RUN - transaction rolled back, database unchanged. Re-run with --apply to commit.  [${elapsed()}]`);
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
  process.stderr.write(`remove-ai-pathways failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});
