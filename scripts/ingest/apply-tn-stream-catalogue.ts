// One-off: replace every knowledge.stream_options / stream_maps / stream_map_items row with the
// curated tn-stream-catalogue dataset (data/seed/knowledge/streams/2026-09-18-tn-stream-catalogue).
//
// Today's live rows are a mix of five uncoordinated batches never cleaned up: three real curated
// drops (2026-07-31, 2026-08-11, 2026-09-11 — 20 stream_options / 20 stream_maps between them,
// with duplicate titles like "Agriculture" and "Commerce with Mathematics" appearing twice under
// different ids) plus MOCK-/SYN-prefixed rows and fixture UUIDs (a1111111-…, f7000000-…) left
// behind by three early demo-seed migrations (20260805000100/200/300_*.sql) that were never
// purged for streams the way apply-tn-catalogue.ts already purged mock colleges/pathways and
// remove-ai-pathways.ts already purged AI-generated pathways. Every RIASEC pair also only ever
// had 2 ranked options, and no pair distinguished a post-10th "which school stream" decision
// (explorer) from a post-12th "which UG discipline" decision (pathfinder/launcher) — the same
// generic list was reused as both, which is what made stream recommendations feel wrong/limited.
//
// This is a full purge-and-replace (same pattern as apply-tn-catalogue.ts), not an in-place
// merge, run inside one transaction: purge stored recommendation history (the FK from
// recommendation.recommendation_items.stream_option_id is NOT NULL-safe but ON DELETE NO ACTION,
// so any stored run referencing a removed stream option blocks the delete) -> purge every
// existing stream_options/stream_maps/stream_map_items row -> import the new dataset via the
// real, unmodified importStreamDataset() validator -> assert. Any failure rolls everything back.
//
// Usage:  pnpm tsx scripts/ingest/apply-tn-stream-catalogue.ts            (dry run, rolls back)
//         pnpm tsx scripts/ingest/apply-tn-stream-catalogue.ts --apply    (commits)
import process from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabasePool } from "@yuvapath/database";
import { importStreamDataset } from "@yuvapath/knowledge";
import type { PoolClient } from "pg";

const STREAM_DIR = "data/seed/knowledge/streams/2026-09-18-tn-stream-catalogue";
const EXPECTED_STREAM_OPTIONS = 27;
const EXPECTED_STREAM_MAPS = 30;
const EXPECTED_STREAM_MAP_ITEMS = 90;

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

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

const purgeStreamCatalogue = async (client: PoolClient): Promise<void> => {
  const steps: Array<[string, string]> = [
    ["stream_map_items (all)", `delete from knowledge.stream_map_items`],
    ["stream_maps (all)", `delete from knowledge.stream_maps`],
    ["stream_options (all)", `delete from knowledge.stream_options`],
  ];
  for (const [label, sql] of steps) {
    const result = await client.query(sql);
    log(`   ${String(result.rowCount).padStart(6)}  ${label}`);
  }
};

const streamPublisher = (client: PoolClient) => ({
  async publish(input: any): Promise<"published" | "already_published"> {
    const records = input.records;
    const count = Object.values(records).reduce((total: number, rows: any) => total + rows.length, 0);

    const existing = await client.query<{ checksum: string }>(
      `select checksum from knowledge.dataset_versions where dataset_key = $1 and version = $2 for update`,
      [input.manifest.datasetKey, input.manifest.version],
    );
    if (existing.rows[0] !== undefined) {
      if (existing.rows[0].checksum !== input.manifest.checksumSha256) {
        throw new Error(`Dataset ${input.manifest.datasetKey}@${input.manifest.version} exists with a different checksum`);
      }
      return "already_published";
    }

    const source = input.manifest.source;
    const sourceResult = await client.query<{ id: string }>(
      `insert into knowledge.knowledge_sources
         (id, source_key, name, source_type, base_url, publisher, license_ref, trust_level, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
       on conflict (source_key) do update set
         name = excluded.name, source_type = excluded.source_type, base_url = excluded.base_url,
         publisher = excluded.publisher, license_ref = excluded.license_ref,
         trust_level = excluded.trust_level, status = excluded.status, updated_at = now()
       returning id`,
      [source.id, source.sourceKey, source.name, source.sourceType, source.baseUrl,
       source.publisher, source.licenseRef, source.trustLevel, source.status],
    );
    await client.query(
      `insert into knowledge.dataset_versions
         (id, source_id, dataset_key, version, checksum, record_count, import_status,
          validation_report_json, imported_at, published_at, created_by)
       values ($1,$2,$3,$4,$5,$6,'staged',$7::jsonb, now(), null, null)`,
      [input.manifest.datasetVersionId, sourceResult.rows[0]?.id, input.manifest.datasetKey, input.manifest.version,
       input.manifest.checksumSha256, count,
       JSON.stringify({ schemaVersion: 1, recordCounts: input.manifest.recordCounts, issues: [] })],
    );

    for (const option of records.streamOptions) {
      await client.query(
        `insert into knowledge.stream_options (id, stream_code, title, description, status)
         values ($1,$2,$3,$4,$5)`,
        [option.id, option.streamCode, option.title, option.description, option.status],
      );
    }

    for (const map of records.streamMaps) {
      await client.query(
        `insert into knowledge.stream_maps (id, top_two_code, segment, version, dataset_version_id, status)
         values ($1,$2,$3,$4,$5,$6)`,
        [map.id, map.topTwoCode, map.segment, map.version, map.datasetVersionId, map.status],
      );
    }

    for (const item of records.streamMapItems) {
      await client.query(
        `insert into knowledge.stream_map_items (map_id, stream_option_id, rank, reason_key)
         values ($1,$2,$3,$4)`,
        [item.mapId, item.streamOptionId, item.rank, item.reasonKey],
      );
    }

    await client.query(
      `update knowledge.dataset_versions set import_status = 'published', published_at = now() where id = $1`,
      [input.manifest.datasetVersionId],
    );
    return "published";
  },
});

const assertHealthy = async (client: PoolClient): Promise<void> => {
  const one = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
  const checks: Array<[string, () => Promise<boolean>, string]> = [
    ["exactly the new stream_options remain",
     async () => (await one(`select count(*)::int n from knowledge.stream_options`)) === EXPECTED_STREAM_OPTIONS,
     `expected ${EXPECTED_STREAM_OPTIONS}`],
    ["exactly the new stream_maps remain",
     async () => (await one(`select count(*)::int n from knowledge.stream_maps`)) === EXPECTED_STREAM_MAPS,
     `expected ${EXPECTED_STREAM_MAPS}`],
    ["exactly the new stream_map_items remain",
     async () => (await one(`select count(*)::int n from knowledge.stream_map_items`)) === EXPECTED_STREAM_MAP_ITEMS,
     `expected ${EXPECTED_STREAM_MAP_ITEMS}`],
    ["no mock/synthetic stream data remains",
     async () => (await one(`select count(*)::int n from knowledge.stream_options
        where stream_code ilike 'MOCK-%' or stream_code ilike 'SYN-%' or title ilike '[MOCK]%'`)) === 0, ""],
    ["no duplicate stream titles",
     async () => (await one(`select count(*)::int n from (
        select title from knowledge.stream_options group by title having count(*) > 1) t`)) === 0, ""],
    ["all 15 RIASEC pairs published for explorer",
     async () => (await one(`select count(distinct top_two_code)::int n from knowledge.stream_maps
        where segment = 'explorer' and status = 'published'`)) === 15, ""],
    ["all 15 RIASEC pairs published for the general (null-segment) fallback",
     async () => (await one(`select count(distinct top_two_code)::int n from knowledge.stream_maps
        where segment is null and status = 'published'`)) === 15, ""],
    ["every stream_map has exactly 3 ranked items",
     async () => (await one(`select count(*)::int n from (
        select map_id, count(*) c from knowledge.stream_map_items group by map_id having count(*) <> 3) t`)) === 0, ""],
    ["no stream_map_item points at a missing option",
     async () => (await one(`select count(*)::int n from knowledge.stream_map_items smi
        where not exists (select 1 from knowledge.stream_options so where so.id = smi.stream_option_id)`)) === 0, ""],
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
    log(`2. purge every existing stream_options/stream_maps/stream_map_items row  [${elapsed()}]`);
    await purgeStreamCatalogue(client);
    log(`3. import the tn-stream-catalogue dataset  [${elapsed()}]`);
    const manifest = JSON.parse(await readFile(resolve(STREAM_DIR, "manifest.json"), "utf8"));
    const text = await readFile(resolve(STREAM_DIR, manifest.recordsFile ?? "records.json"), "utf8");
    const report = await importStreamDataset(manifest, text, streamPublisher(client));
    if (report.status === "rejected") {
      throw new Error(`${STREAM_DIR} rejected: ${JSON.stringify(report.issues, null, 2)}`);
    }
    log(`   ${report.status}: ${manifest.datasetKey}@${manifest.version}`);
    log(`4. assertions  [${elapsed()}]`);
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
  process.stderr.write(`apply-tn-stream-catalogue failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});
