// One-off: make the Tamil Nadu official catalogue the source of truth for colleges.
//
// Everything below runs inside ONE transaction on ONE client: purge -> import pathways ->
// import colleges -> remap junk disciplines -> flip verified/published -> assert. Any failure,
// including a failed assertion, rolls the whole thing back.
//
// The CLI importers (scripts/ingest/import-colleges.ts, import-streams.ts) can't be chained for
// this, because withTransaction() opens its own pool connection and commits on its own - three
// commands would be three independent transactions with no shared rollback. So the official
// importCollegeDataset()/importStreamDataset() validators are used unchanged, but handed a
// publisher that writes through this transaction's client. Publisher SQL mirrors
// postgres-college-dataset-publisher.ts and postgres-stream-dataset-publisher.ts, except that
// rows are inserted in batches: one row per round trip means ~20k round trips against a remote
// database, which takes over an hour; batching the same statements takes minutes.
//
// Usage:  pnpm tsx scripts/ingest/apply-tn-catalogue.ts            (dry run, rolls back)
//         pnpm tsx scripts/ingest/apply-tn-catalogue.ts --apply    (commits)
import process from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabasePool } from "@yuvapath/database";
import { importCollegeDataset, importStreamDataset } from "@yuvapath/knowledge";
import type { PoolClient } from "pg";

const COLLEGE_DIR = "data/seed/knowledge/colleges/2026-09-16";
const STREAM_DIR = "data/seed/knowledge/streams/2026-09-16-tn-pathways";
const COLLEGE_DSV = "e84a2a7d-342d-569f-9dd9-4cbafcf22af6";
const STREAM_DSV = "0be66f6e-5caf-5432-9d3d-dc3718739f2e";
const EXPECTED_COLLEGES = 2896;
const CHUNK = 500;

/** Junk discipline code -> canonical code carrying the same subject. Links are MOVED, never dropped. */
const REMAP: Record<string, string> = {
  "tn-dce-physics-7": "physics",
  "tn-dce-zoology-e-m-6": "zoology-animal-science",
  "tn-dce-zoology-t-m-4": "zoology-animal-science",
  "tn-dce-botany-e-m-1": "botany-plant-science",
  "tn-dce-history-t-m-2": "history",
  "tn-dce-history-t-m-5": "history",
  "tn-dce-general-commerce-e-m-3": "commerce-accounting",
  "tn-dce-general-commerce-e-m-8": "commerce-accounting",
  "tn-dce-business-administration-e-m-9": "business-administration",
  "tn-dce-tamil-literature-10": "languages-literature",
  "MOCK-RENEWABLE-ENERGY": "renewable-energy-technology",
  "SYN-SOLAR-TECH": "renewable-energy-technology",
  "SYN-AGRI-DRONE": "agriculture-science",
  "SYN-CYBER": "cybersecurity",
  "SYN-DATA-AN": "data-science-analytics",
  "SYN-EARLY-ED": "early-childhood-education",
  "SYN-EV-TECH": "automobile-engineering",
  "SYN-MED-LAB": "medical-laboratory-technology",
  "SYN-PHYSIO-ASST": "physiotherapy",
  "SYN-SUPPLY": "supply-chain-logistics",
  "SYN-UX-DES": "visual-communication-design",
};

/** Mock pathways: the 14 rows from the mock/synthetic seed sources. They hold zero career links. */
const MOCK_PATHWAYS = `
  select p.id from knowledge.pathways p
  join knowledge.dataset_versions dv on dv.id = p.dataset_version_id
  join knowledge.knowledge_sources ks on ks.id = dv.source_id
  where ks.source_key like 'mock-source-%'
     or ks.source_key in ('yuvapath-full-knowledge-mock', 'yuvapath-synthetic-streams-poc')`;

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

/**
 * Insert rows in batches. `tuple` renders one VALUES tuple given the 1-based index of its first
 * parameter, so literals like `null` / `now()` stay inline exactly as the original publishers wrote
 * them.
 */
const insertBatched = async (
  client: PoolClient,
  label: string,
  head: string,
  tuple: (start: number) => string,
  rows: unknown[][],
  tail = "",
): Promise<void> => {
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const rendered = tuple(params.length + 1);
      params.push(...row);
      return rendered;
    });
    await client.query(`${head} values ${tuples.join(",")} ${tail}`, params);
  }
  if (rows.length > 0) log(`      ${String(rows.length).padStart(6)}  ${label}`);
};

// ---------------------------------------------------------------- publishers bound to our client
const publishShared = async (
  client: PoolClient,
  manifest: {
    datasetKey: string; version: string; datasetVersionId: string; checksumSha256: string;
    recordCount?: number; recordCounts: Record<string, number>;
    source: Record<string, string | null>;
  },
  recordCount: number,
): Promise<"already_published" | "continue"> => {
  const existing = await client.query<{ checksum: string }>(
    `select checksum from knowledge.dataset_versions where dataset_key = $1 and version = $2 for update`,
    [manifest.datasetKey, manifest.version],
  );
  if (existing.rows[0] !== undefined) {
    if (existing.rows[0].checksum !== manifest.checksumSha256) {
      throw new Error(`Dataset ${manifest.datasetKey}@${manifest.version} exists with a different checksum`);
    }
    return "already_published";
  }
  const source = manifest.source;
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
    [manifest.datasetVersionId, sourceResult.rows[0]?.id, manifest.datasetKey, manifest.version,
     manifest.checksumSha256, recordCount,
     JSON.stringify({ schemaVersion: 1, recordCounts: manifest.recordCounts, issues: [] })],
  );
  return "continue";
};

const markPublished = (client: PoolClient, datasetVersionId: string) =>
  client.query(
    `update knowledge.dataset_versions set import_status = 'published', published_at = now() where id = $1`,
    [datasetVersionId],
  );

const streamPublisher = (client: PoolClient) => ({
  async publish(input: any): Promise<"published" | "already_published"> {
    const records = input.records;
    const count = Object.values(records).reduce((total: number, rows: any) => total + rows.length, 0);
    if (await publishShared(client, input.manifest, count) === "already_published") {
      return "already_published";
    }

    await insertBatched(client, "education_routes",
      `insert into knowledge.education_routes (id, route_code, title, route_level, description, publication_status)`,
      (s) => `($${s},$${s + 1},$${s + 2},$${s + 3},$${s + 4},$${s + 5})`,
      records.educationRoutes.map((r: any) => [r.id, r.routeCode, r.title, r.routeLevel, r.description, r.publicationStatus]),
      `on conflict (id) do update set route_code = excluded.route_code, title = excluded.title,
         route_level = excluded.route_level, description = excluded.description,
         publication_status = excluded.publication_status`);

    await insertBatched(client, "pathways",
      `insert into knowledge.pathways
         (id, pathway_code, title, description, education_route_id, duration_band,
          backup_route_note, publication_status, dataset_version_id)`,
      (s) => `($${s},$${s + 1},$${s + 2},$${s + 3},$${s + 4},$${s + 5},$${s + 6},$${s + 7},$${s + 8})`,
      records.pathways.map((p: any) => [p.id, p.pathwayCode, p.title, p.description, p.educationRouteId,
        p.durationBand, p.backupRouteNote, p.publicationStatus, p.datasetVersionId]),
      `on conflict (id) do update set pathway_code = excluded.pathway_code, title = excluded.title,
         description = excluded.description, education_route_id = excluded.education_route_id,
         duration_band = excluded.duration_band, backup_route_note = excluded.backup_route_note,
         publication_status = excluded.publication_status, dataset_version_id = excluded.dataset_version_id`);

    await insertBatched(client, "career_pathways",
      `insert into knowledge.career_pathways (career_id, pathway_id, relationship_type, display_order)`,
      (s) => `($${s},$${s + 1},$${s + 2},$${s + 3})`,
      records.careerPathways.map((l: any) => [l.careerId, l.pathwayId, l.relationshipType, l.displayOrder]),
      `on conflict (career_id, pathway_id) do update set
         relationship_type = excluded.relationship_type, display_order = excluded.display_order`);

    await markPublished(client, input.manifest.datasetVersionId);
    return "published";
  },
});

const collegePublisher = (client: PoolClient) => ({
  async publish(input: any): Promise<"published" | "already_published"> {
    const records = input.records;
    if (await publishShared(client, input.manifest, input.manifest.recordCount) === "already_published") {
      return "already_published";
    }

    await insertBatched(client, "disciplines",
      `insert into knowledge.disciplines (id, discipline_code, title, domain_code, status)`,
      (s) => `($${s},$${s + 1},$${s + 2},$${s + 3},$${s + 4})`,
      records.disciplines.map((d: any) => [d.id, d.disciplineCode, d.title, d.domainCode, d.status]),
      `on conflict (id) do update set discipline_code = excluded.discipline_code, title = excluded.title,
         domain_code = excluded.domain_code, status = excluded.status`);

    await insertBatched(client, "colleges",
      `insert into knowledge.colleges
         (id, external_code, name, city, state, institution_type, tier, admission_route, fees_band,
          website_url, verification_status, last_verified_at, dataset_version_id, created_at, updated_at)`,
      (s) => `($${s},$${s + 1},$${s + 2},$${s + 3},$${s + 4},$${s + 5},null,$${s + 6},$${s + 7},` +
             `$${s + 8},$${s + 9},$${s + 10},$${s + 11}, now(), now())`,
      records.colleges.map((c: any) => [c.id, c.externalCode ?? null, c.name, c.city, c.state,
        c.institutionType, c.admissionRoute ?? null, c.feesBand ?? null, c.websiteUrl,
        c.verificationStatus, c.lastVerifiedAt, c.datasetVersionId]),
      `on conflict (id) do update set external_code = excluded.external_code, name = excluded.name,
         city = excluded.city, state = excluded.state, institution_type = excluded.institution_type,
         admission_route = excluded.admission_route, fees_band = excluded.fees_band,
         website_url = excluded.website_url, verification_status = excluded.verification_status,
         last_verified_at = excluded.last_verified_at, dataset_version_id = excluded.dataset_version_id,
         updated_at = now()`);

    await insertBatched(client, "college_programs",
      `insert into knowledge.college_programs
         (id, college_id, discipline_id, program_name, qualification_level, duration_band,
          admission_route, fees_band, verification_status, last_verified_at, dataset_version_id)`,
      (s) => `($${s},$${s + 1},$${s + 2},$${s + 3},$${s + 4},$${s + 5},$${s + 6},$${s + 7},$${s + 8},$${s + 9},$${s + 10})`,
      records.programs.map((p: any) => [p.id, p.collegeId, p.disciplineId, p.programName,
        p.qualificationLevel, p.durationBand, p.admissionRoute, p.feesBand,
        p.verificationStatus, p.lastVerifiedAt, p.datasetVersionId]));

    await insertBatched(client, "pathway_disciplines",
      `insert into knowledge.pathway_disciplines (pathway_id, discipline_id, relevance_weight, mapping_version)`,
      (s) => `($${s},$${s + 1},$${s + 2},$${s + 3})`,
      records.pathwayDisciplines.map((m: any) => [m.pathwayId, m.disciplineId, m.relevanceWeight, m.mappingVersion]),
      `on conflict (pathway_id, discipline_id) do update set
         relevance_weight = excluded.relevance_weight, mapping_version = excluded.mapping_version`);

    await markPublished(client, input.manifest.datasetVersionId);
    return "published";
  },
});

// ---------------------------------------------------------------- steps
const purge = async (client: PoolClient): Promise<void> => {
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
    ["pathway_disciplines of mock pathways",
     `delete from knowledge.pathway_disciplines where pathway_id in (${MOCK_PATHWAYS})`],
    ["career_pathways of mock pathways (expected 0)",
     `delete from knowledge.career_pathways where pathway_id in (${MOCK_PATHWAYS})`],
    ["pathways (mock only)", `delete from knowledge.pathways where id in (${MOCK_PATHWAYS})`],
    ["college_programs (all)", `delete from knowledge.college_programs`],
    ["colleges (all)", `delete from knowledge.colleges`],
  ];
  for (const [label, sql] of steps) {
    const result = await client.query(sql);
    log(`   ${String(result.rowCount).padStart(6)}  ${label}`);
  }
};

const importDataset = async (
  client: PoolClient,
  directory: string,
  recordsFallback: string,
  run: (manifest: unknown, text: string, publisher: unknown) => Promise<any>,
): Promise<void> => {
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  const text = await readFile(resolve(directory, manifest.recordsFile ?? recordsFallback), "utf8");
  const publisher = directory === COLLEGE_DIR ? collegePublisher(client) : streamPublisher(client);
  const report = await run(manifest, text, publisher);
  if (report.status === "rejected") {
    throw new Error(`${directory} rejected: ${JSON.stringify(report.issues, null, 2)}`);
  }
  log(`   ${report.status}: ${manifest.datasetKey}@${manifest.version}`);
};

const remapDisciplines = async (client: PoolClient): Promise<void> => {
  const codes = await client.query<{ id: string; discipline_code: string }>(
    `select id, discipline_code from knowledge.disciplines`);
  const idByCode = new Map(codes.rows.map((row) => [row.discipline_code, row.id]));
  const missing = [...new Set(Object.values(REMAP))].filter((code) => !idByCode.has(code));
  if (missing.length > 0) {
    throw new Error(`Remap targets missing after import: ${missing.join(", ")}`);
  }
  let moved = 0, collapsed = 0, removed = 0;
  for (const [junkCode, canonicalCode] of Object.entries(REMAP)) {
    const junkId = idByCode.get(junkCode);
    if (junkId === undefined) continue;
    const canonicalId = idByCode.get(canonicalCode);
    const collide = await client.query(
      `delete from knowledge.pathway_disciplines pd
       where pd.discipline_id = $1
         and exists (select 1 from knowledge.pathway_disciplines other
                     where other.pathway_id = pd.pathway_id and other.discipline_id = $2)`,
      [junkId, canonicalId]);
    const move = await client.query(
      `update knowledge.pathway_disciplines set discipline_id = $2 where discipline_id = $1`,
      [junkId, canonicalId]);
    const drop = await client.query(`delete from knowledge.disciplines where id = $1`, [junkId]);
    collapsed += collide.rowCount ?? 0; moved += move.rowCount ?? 0; removed += drop.rowCount ?? 0;
  }
  log(`   remapped ${moved} links, collapsed ${collapsed} duplicates, removed ${removed} junk disciplines`);
};

const publishCatalogue = async (client: PoolClient): Promise<void> => {
  const colleges = await client.query(
    `update knowledge.colleges set verification_status = 'verified', last_verified_at = now()
     where dataset_version_id = $1 and verification_status = 'unverified'`, [COLLEGE_DSV]);
  const programs = await client.query(
    `update knowledge.college_programs set verification_status = 'verified', last_verified_at = now()
     where dataset_version_id = $1 and verification_status = 'unverified'`, [COLLEGE_DSV]);
  const pathways = await client.query(
    `update knowledge.pathways set publication_status = 'published'
     where dataset_version_id = $1 and publication_status = 'draft'`, [STREAM_DSV]);
  log(`   verified ${colleges.rowCount} colleges, ${programs.rowCount} programmes; published ${pathways.rowCount} pathways`);
  log(`   ('stale' TNEA-2023 rows deliberately left stale)`);
};

/** Assertions run inside the transaction: any failure rolls the entire operation back. */
const assertHealthy = async (client: PoolClient): Promise<void> => {
  const one = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
  const checks: Array<[string, () => Promise<boolean>, string]> = [
    ["Tamil Nadu colleges present",
     async () => (await one(`select count(*)::int n from knowledge.colleges`)) === EXPECTED_COLLEGES,
     `expected ${EXPECTED_COLLEGES}`],
    ["no non-Tamil-Nadu colleges",
     async () => (await one(`select count(*)::int n from knowledge.colleges where state <> 'Tamil Nadu'`)) === 0, ""],
    ["no mock/synthetic colleges",
     async () => (await one(`select count(*)::int n from knowledge.colleges
        where name ilike '%mock%' or name ilike '%synthetic%' or website_url ilike '%example.%'
           or external_code like 'SYN-%' or external_code like 'MOCK-%'`)) === 0, ""],
    ["no duplicate college external_code",
     async () => (await one(`select count(*)::int n from (
        select external_code from knowledge.colleges where external_code is not null
        group by external_code having count(*) > 1) t`)) === 0, ""],
    ["every pathway has >= 1 discipline",
     async () => (await one(`select count(*)::int n from knowledge.pathways p
        where not exists (select 1 from knowledge.pathway_disciplines pd where pd.pathway_id = p.id)`)) === 0, ""],
    ["no discipline link points at a missing discipline",
     async () => (await one(`select count(*)::int n from knowledge.pathway_disciplines pd
        where not exists (select 1 from knowledge.disciplines d where d.id = pd.discipline_id)`)) === 0, ""],
    ["no junk discipline codes remain",
     async () => (await one(`select count(*)::int n from knowledge.disciplines
        where discipline_code like 'SYN-%' or discipline_code like 'MOCK-%' or discipline_code like 'tn-dce-%'`)) === 0, ""],
    ["careers still linked to pathways",
     async () => (await one(`select count(*)::int n from knowledge.career_pathways`)) > 0, ""],
    ["career -> pathway -> discipline -> programme -> college resolves",
     async () => (await one(`select count(*)::int n
        from knowledge.career_pathways cp
        join knowledge.pathway_disciplines pd on pd.pathway_id = cp.pathway_id
        join knowledge.college_programs prog on prog.discipline_id = pd.discipline_id
        join knowledge.colleges col on col.id = prog.college_id
        where col.verification_status = 'verified' and prog.verification_status = 'verified'`)) > 0, ""],
  ];
  for (const [label, check, extra] of checks) {
    const passed = await check();
    log(`   ${passed ? "PASS" : "FAIL"}  ${label}${passed ? "" : ` (${extra})`}`);
    if (!passed) throw new Error(`Assertion failed: ${label}`);
  }
};

// ---------------------------------------------------------------- main
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
    log(`1. purge mock / non-Tamil-Nadu catalogue rows and dependent test history  [${elapsed()}]`);
    await purge(client);
    log(`2. import pathways + career links  [${elapsed()}]`);
    await importDataset(client, STREAM_DIR, "records.json",
      (manifest, text, publisher) => importStreamDataset(manifest, text, publisher as never));
    log(`3. import colleges + disciplines + programmes + pathway links  [${elapsed()}]`);
    await importDataset(client, COLLEGE_DIR, "colleges.json",
      (manifest, text, publisher) => importCollegeDataset(manifest, text, publisher as never));
    log(`4. remap junk disciplines onto canonical subjects, then drop them  [${elapsed()}]`);
    await remapDisciplines(client);
    log(`5. mark the Tamil Nadu dataset verified / published  [${elapsed()}]`);
    await publishCatalogue(client);
    log(`6. assertions  [${elapsed()}]`);
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
  process.stderr.write(`apply-tn-catalogue failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});
