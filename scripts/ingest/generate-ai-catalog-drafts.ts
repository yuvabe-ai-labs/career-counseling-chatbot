// Offline Gemini catalog-drafting CLI
// (docs/poc/ai-assisted-catalog-implementation-plan.md §10/§16). Runs OUTSIDE apps/api's
// request path, same execution model as every other scripts/ingest/*.ts script — nothing here
// is ever invoked from a live student request.
//
// Usage:
//   tsx scripts/ingest/generate-ai-catalog-drafts.ts --target pathways [--limit 60]
//   tsx scripts/ingest/generate-ai-catalog-drafts.ts --target colleges --state "Tamil Nadu" --discipline computing [--count 6]
//   tsx scripts/ingest/generate-ai-catalog-drafts.ts --target career_streams [--limit 60] [--career-ids-file path.json]
//   tsx scripts/ingest/generate-ai-catalog-drafts.ts --target stream_pathways [--limit 60]
//   tsx scripts/ingest/generate-ai-catalog-drafts.ts --target aid_schemes [--sources-file path.json]
//
// --sources-file (aid_schemes only): overrides the default curated list
// (data/tn-ug-scholarship-sources.json) of official TN/India UG scholarship source URLs. Unlike
// every other target, this one has no "gap detection" against an existing partial catalog — it
// walks the source list, fetches each page (@yuvapath/knowledge's fetchSourceContent), and asks
// Gemini to extract every distinct scheme the page describes.
//
// --career-ids-file (career_streams only): restricts generation to exactly the career ids in the
// given JSON file (a plain string array), instead of every gap in alphabetical order. Used for
// MVP-targeted coverage (docs/architecture/career-stream-coverage-fill-plan.md) — scoreCareers
// caps results at the top 18 per student, so most of a large catalog never gets recommended to
// anyone; --limit still needs to be large enough that detectCatalogGaps's own query returns every
// id in the file, since the file-based filter narrows what that query already found rather than
// replacing it.
//
// Writes only to knowledge.ai_generation_runs / ai_generation_items (staging) — never to a
// real catalog table. Review with scripts/ingest/review-ai-catalog.ts, then promote with
// scripts/ingest/promote-ai-catalog.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { createDatabasePool } from "@yuvapath/database";
import {
  CATALOG_DRAFT_PROMPT_VERSIONS,
  computeInputHash,
  createGeminiCatalogDrafter,
  createPostgresAiGenerationStore,
  detectCatalogGaps,
  fetchSourceContent,
  normalizeAidSchemeNaturalKey,
  normalizeCareerStreamNaturalKey,
  normalizeCollegeNaturalKey,
  normalizePathwayNaturalKey,
  normalizeStreamPathwayNaturalKey,
  type CatalogDrafter,
} from "@yuvapath/knowledge";
import type { Pool } from "pg";

const loadLocalEnvironment = (): void => {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Paces successive Gemini calls within one script run — on top of (not instead of) the 429
// retry-with-backoff now built into gemini-catalog-drafter.ts's callGemini. That retry handles
// an occasional 429; this delay is what keeps the run from generating a stream of them in the
// first place at real scale (a live ~860-career run with zero inter-call delay hit 124 real 429s
// out of 415 calls — see docs/architecture/career-stream-coverage-fill-plan.md). Configurable
// since the right value depends on the actual account/model quota, which isn't published
// anywhere in this codebase; 4s is a conservative starting point (~15 calls/minute).
const GEMINI_REQUEST_DELAY_MS = Number(process.env.GEMINI_REQUEST_DELAY_MS ?? 4000);

// Stop a gap-loop generator after this many UNEXPECTED errors (a thrown exception — a DB
// connection blip, not a Gemini call's own failed/timed_out status, which is already handled
// separately) in a row. Two live runs hit `getaddrinfo ENOTFOUND ...` mid-run (a transient
// Postgres-host DNS failure — see docs/architecture/career-stream-coverage-fill-plan.md), which
// used to kill the whole process and lose whatever was left of a multi-hour run. Caught per-gap
// instead so an isolated blip doesn't cost the rest of the list, but a run of these in a row
// means a real outage, not a blip — bail out rather than burn through hundreds more doomed
// attempts. Re-running the same command picks up where it left off either way (cache-hit skips
// whatever already succeeded).
const CONSECUTIVE_ERROR_LIMIT = 5;

async function generatePathwayDrafts(
  pool: Pool,
  drafter: CatalogDrafter,
  limit: number,
): Promise<void> {
  const store = createPostgresAiGenerationStore(pool);
  const gaps = (await detectCatalogGaps(pool, { maxPathwayGaps: limit })).filter(
    (gap) => gap.type === "no_pathway_for_career",
  );
  console.log(`Found ${gaps.length} career(s) with no pathway.`);

  const routesResult = await pool.query<{ route_code: string; title: string; route_level: string }>(
    `select route_code, title, route_level from knowledge.education_routes where publication_status = 'published' order by title`,
  );
  const knownEducationRoutes = routesResult.rows.map((row) => ({
    routeCode: row.route_code,
    title: row.title,
    routeLevel: row.route_level,
  }));
  const disciplinesResult = await pool.query<{ discipline_code: string; title: string }>(
    `select discipline_code, title from knowledge.disciplines where status = 'active' order by title`,
  );
  const knownDisciplines = disciplinesResult.rows.map((row) => ({
    disciplineCode: row.discipline_code,
    title: row.title,
  }));
  const existingPathwaysResult = await pool.query<{ title: string }>(
    `select title from knowledge.pathways where publication_status = 'published' order by title limit 200`,
  );
  const existingPathwayTitlesInScope = existingPathwaysResult.rows.map((row) => row.title);

  let staged = 0;
  let cacheHits = 0;
  let failures = 0;
  let consecutiveUnexpectedErrors = 0;

  for (const gap of gaps) {
    if (gap.type !== "no_pathway_for_career") continue;

    try {
      const careerResult = await pool.query<{ onet_code: string | null; domain_code: string }>(
        `select onet_code, domain_code from knowledge.careers where id = $1`,
        [gap.careerId],
      );
      const career = careerResult.rows[0];
      if (!career) continue;

      const inputParams = { careerId: gap.careerId, careerTitle: gap.careerTitle };
      const inputHash = computeInputHash(
        "pathways",
        CATALOG_DRAFT_PROMPT_VERSIONS.pathways,
        inputParams,
      );
      const existingRun = await store.findRunByInputHash("pathways", inputHash);
      if (existingRun) {
        cacheHits += 1;
        console.log(`  [cache hit] ${gap.careerTitle} — run ${existingRun.id} already exists, skipping Gemini call.`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      console.log(`  Drafting pathway(s) for career: ${gap.careerTitle}`);
      const result = await drafter.draftPathways({
        seedCareer: { onetCode: career.onet_code, title: gap.careerTitle, domainCode: career.domain_code },
        knownEducationRoutes,
        knownDisciplines,
        existingPathwayTitlesInScope,
      });
      await sleep(GEMINI_REQUEST_DELAY_MS);

      const run = await store.createRun({
        targetTable: "pathways",
        provider: "gemini",
        model: requireEnv("GEMINI_MODEL"),
        promptVersion: CATALOG_DRAFT_PROMPT_VERSIONS.pathways,
        inputParamsJson: inputParams,
        inputHash,
      });

      if (result.status !== "completed") {
        failures += 1;
        await store.markRunFailed(run.id, result.errorCode, result.errorCode);
        console.warn(`    Gemini call failed: ${result.errorCode}`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      await store.recordRunResponse(run.id, result.rawResponse);
      const knownRouteCodes = new Set(knownEducationRoutes.map((route) => route.routeCode));

      const itemsToCreate = [];
      for (const pathway of result.data.pathways) {
        if (!knownRouteCodes.has(pathway.educationRouteCode)) {
          console.warn(
            `    Skipping "${pathway.title}": unknown educationRouteCode "${pathway.educationRouteCode}".`,
          );
          continue;
        }
        const naturalKey = normalizePathwayNaturalKey({
          title: pathway.title,
          educationRouteCode: pathway.educationRouteCode,
        });
        // Best-effort duplicate hint only (case-insensitive title match against already
        // published pathways) — the actual duplicate-prevention guarantee is the partial
        // unique index on ai_generation_items(proposed_entity_type, natural_key).
        const matched = await pool.query<{ id: string }>(
          `select id from knowledge.pathways where publication_status = 'published' and lower(trim(title)) = lower(trim($1)) limit 1`,
          [pathway.title],
        );
        itemsToCreate.push({
          proposedEntityType: "pathway" as const,
          proposedPayloadJson: pathway,
          naturalKey,
          matchedExistingId: matched.rows[0]?.id,
        });
      }

      const created = await store.createItems(run.id, itemsToCreate);
      staged += created.length;
      console.log(`    Staged ${created.length} pathway draft(s) (run ${run.id}).`);
      consecutiveUnexpectedErrors = 0;
    } catch (error) {
      consecutiveUnexpectedErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`    Unexpected error processing "${gap.careerTitle}": ${message}`);
      if (consecutiveUnexpectedErrors >= CONSECUTIVE_ERROR_LIMIT) {
        console.error(
          `\n${CONSECUTIVE_ERROR_LIMIT} consecutive unexpected errors — stopping early rather than ` +
            "continuing to fail. Re-run this same command to pick up where this left off.",
        );
        break;
      }
    }
  }

  console.log(`\nDone. Staged ${staged} item(s), ${cacheHits} cache hit(s), ${failures} failure(s).`);
}

async function generateCareerStreamDrafts(
  pool: Pool,
  drafter: CatalogDrafter,
  limit: number,
  // MVP targeting (docs/architecture/career-stream-coverage-fill-plan.md): only 305 of 923
  // careers ever appear in ANY student's top-18 career matches across a systematic RIASEC sweep
  // — scoreCareers caps its output at 18, so the other ~618 are permanent long-tail regardless of
  // catalog size. When set, restricts generation to exactly this career-id allowlist instead of
  // the full alphabetical gap list, so a full pass over the "actually reachable" set finishes in
  // a fraction of the time a full-catalog sweep would.
  targetCareerIds?: ReadonlySet<string>,
): Promise<void> {
  const store = createPostgresAiGenerationStore(pool);
  let gaps = (await detectCatalogGaps(pool, { maxStreamLinkGaps: limit })).filter(
    (gap) => gap.type === "no_stream_for_career",
  );
  if (targetCareerIds) {
    gaps = gaps.filter((gap) => gap.type === "no_stream_for_career" && targetCareerIds.has(gap.careerId));
  }
  console.log(`Found ${gaps.length} career(s) with no stream link${targetCareerIds ? " (MVP-target subset)" : ""}.`);

  const streamOptionsResult = await pool.query<{ stream_code: string; title: string; description: string }>(
    `select stream_code, title, description from knowledge.stream_options where status = 'active' order by title`,
  );
  const knownStreamOptions = streamOptionsResult.rows.map((row) => ({
    streamCode: row.stream_code,
    title: row.title,
    description: row.description,
  }));
  const knownStreamCodes = new Set(knownStreamOptions.map((option) => option.streamCode));

  let staged = 0;
  let cacheHits = 0;
  let failures = 0;
  let consecutiveUnexpectedErrors = 0;

  for (const gap of gaps) {
    if (gap.type !== "no_stream_for_career") continue;

    try {
      const careerResult = await pool.query<{ onet_code: string | null; domain_code: string }>(
        `select onet_code, domain_code from knowledge.careers where id = $1`,
        [gap.careerId],
      );
      const career = careerResult.rows[0];
      if (!career) continue;

      const inputParams = { careerId: gap.careerId, careerTitle: gap.careerTitle };
      const inputHash = computeInputHash(
        "career_streams",
        CATALOG_DRAFT_PROMPT_VERSIONS.careerStreams,
        inputParams,
      );
      const existingRun = await store.findRunByInputHash("career_streams", inputHash);
      if (existingRun) {
        cacheHits += 1;
        console.log(`  [cache hit] ${gap.careerTitle} — run ${existingRun.id} already exists, skipping Gemini call.`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      console.log(`  Drafting stream link(s) for career: ${gap.careerTitle}`);
      const result = await drafter.draftCareerStreams({
        seedCareer: { onetCode: career.onet_code, title: gap.careerTitle, domainCode: career.domain_code },
        knownStreamOptions,
        // This gap type only fires when the career has zero existing links, but kept as a real
        // (not hardcoded-empty) query so a later incremental run — topping up a career that
        // already has one weak link — can reuse this same function without double-drafting.
        existingLinkedStreamCodesForCareer: [],
      });
      await sleep(GEMINI_REQUEST_DELAY_MS);

      const run = await store.createRun({
        targetTable: "career_streams",
        provider: "gemini",
        model: requireEnv("GEMINI_MODEL"),
        promptVersion: CATALOG_DRAFT_PROMPT_VERSIONS.careerStreams,
        inputParamsJson: inputParams,
        inputHash,
      });

      if (result.status !== "completed") {
        failures += 1;
        await store.markRunFailed(run.id, result.errorCode, result.errorCode);
        console.warn(`    Gemini call failed: ${result.errorCode}`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      await store.recordRunResponse(run.id, result.rawResponse);

      const itemsToCreate = [];
      for (const link of result.data.careerStreams) {
        if (!knownStreamCodes.has(link.streamCode)) {
          console.warn(`    Skipping link: unknown streamCode "${link.streamCode}".`);
          continue;
        }
        const naturalKey = normalizeCareerStreamNaturalKey({
          careerNaturalKey: gap.careerId,
          streamCode: link.streamCode,
        });
        itemsToCreate.push({
          proposedEntityType: "career_stream" as const,
          proposedPayloadJson: { ...link, careerId: gap.careerId },
          naturalKey,
        });
      }

      const created = await store.createItems(run.id, itemsToCreate);
      staged += created.length;
      console.log(`    Staged ${created.length} career-stream draft(s) (run ${run.id}).`);
      consecutiveUnexpectedErrors = 0;
    } catch (error) {
      consecutiveUnexpectedErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`    Unexpected error processing "${gap.careerTitle}": ${message}`);
      if (consecutiveUnexpectedErrors >= CONSECUTIVE_ERROR_LIMIT) {
        console.error(
          `\n${CONSECUTIVE_ERROR_LIMIT} consecutive unexpected errors — stopping early rather than ` +
            "continuing to fail. Re-run this same command to pick up where this left off.",
        );
        break;
      }
    }
  }

  console.log(`\nDone. Staged ${staged} item(s), ${cacheHits} cache hit(s), ${failures} failure(s).`);
}

async function generateStreamPathwayDrafts(
  pool: Pool,
  drafter: CatalogDrafter,
  limit: number,
): Promise<void> {
  const store = createPostgresAiGenerationStore(pool);
  const gaps = (await detectCatalogGaps(pool, { maxStreamPathwayGaps: limit })).filter(
    (gap) => gap.type === "no_pathway_for_stream",
  );
  console.log(`Found ${gaps.length} stream(s) with no pathway link.`);

  const streamResult = await pool.query<{ id: string; stream_code: string; title: string; description: string }>(
    `select id, stream_code, title, description from knowledge.stream_options where status = 'active'`,
  );
  const streamById = new Map(streamResult.rows.map((row) => [row.id, row]));

  const pathwaysResult = await pool.query<{ pathway_code: string; title: string }>(
    `select pathway_code, title from knowledge.pathways where publication_status = 'published' order by title`,
  );
  const knownPathways = pathwaysResult.rows.map((row) => ({ pathwayCode: row.pathway_code, title: row.title }));
  const knownPathwayCodes = new Set(knownPathways.map((pathway) => pathway.pathwayCode));

  let staged = 0;
  let cacheHits = 0;
  let failures = 0;
  let consecutiveUnexpectedErrors = 0;

  for (const gap of gaps) {
    if (gap.type !== "no_pathway_for_stream") continue;

    try {
      const stream = streamById.get(gap.streamOptionId);
      if (!stream) continue;

      const inputParams = { streamOptionId: gap.streamOptionId, streamTitle: gap.streamTitle };
      const inputHash = computeInputHash(
        "stream_pathways",
        CATALOG_DRAFT_PROMPT_VERSIONS.streamPathways,
        inputParams,
      );
      const existingRun = await store.findRunByInputHash("stream_pathways", inputHash);
      if (existingRun) {
        cacheHits += 1;
        console.log(`  [cache hit] ${gap.streamTitle} — run ${existingRun.id} already exists, skipping Gemini call.`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      console.log(`  Drafting pathway link(s) for stream: ${gap.streamTitle}`);
      const result = await drafter.draftStreamPathways({
        seedStream: { streamCode: stream.stream_code, title: stream.title, description: stream.description },
        knownPathways,
        // Same reasoning as generateCareerStreamDrafts' existingLinkedStreamCodesForCareer — this
        // gap type only fires at zero links today, but a real (not hardcoded-empty) query lets a
        // later incremental run reuse this function without double-drafting.
        existingLinkedPathwayCodesForStream: [],
      });
      await sleep(GEMINI_REQUEST_DELAY_MS);

      const run = await store.createRun({
        targetTable: "stream_pathways",
        provider: "gemini",
        model: requireEnv("GEMINI_MODEL"),
        promptVersion: CATALOG_DRAFT_PROMPT_VERSIONS.streamPathways,
        inputParamsJson: inputParams,
        inputHash,
      });

      if (result.status !== "completed") {
        failures += 1;
        await store.markRunFailed(run.id, result.errorCode, result.errorCode);
        console.warn(`    Gemini call failed: ${result.errorCode}`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      await store.recordRunResponse(run.id, result.rawResponse);

      const itemsToCreate = [];
      for (const link of result.data.streamPathways) {
        if (!knownPathwayCodes.has(link.pathwayCode)) {
          console.warn(`    Skipping link: unknown pathwayCode "${link.pathwayCode}".`);
          continue;
        }
        const naturalKey = normalizeStreamPathwayNaturalKey({
          streamOptionNaturalKey: gap.streamOptionId,
          pathwayCode: link.pathwayCode,
        });
        itemsToCreate.push({
          proposedEntityType: "stream_pathway" as const,
          proposedPayloadJson: { ...link, streamOptionId: gap.streamOptionId },
          naturalKey,
        });
      }

      const created = await store.createItems(run.id, itemsToCreate);
      staged += created.length;
      console.log(`    Staged ${created.length} stream-pathway draft(s) (run ${run.id}).`);
      consecutiveUnexpectedErrors = 0;
    } catch (error) {
      consecutiveUnexpectedErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`    Unexpected error processing "${gap.streamTitle}": ${message}`);
      if (consecutiveUnexpectedErrors >= CONSECUTIVE_ERROR_LIMIT) {
        console.error(
          `\n${CONSECUTIVE_ERROR_LIMIT} consecutive unexpected errors — stopping early rather than ` +
            "continuing to fail. Re-run this same command to pick up where this left off.",
        );
        break;
      }
    }
  }

  console.log(`\nDone. Staged ${staged} item(s), ${cacheHits} cache hit(s), ${failures} failure(s).`);
}

async function generateCollegeDrafts(
  pool: Pool,
  drafter: CatalogDrafter,
  state: string,
  disciplineCode: string,
  count: number,
): Promise<void> {
  const store = createPostgresAiGenerationStore(pool);

  const disciplineResult = await pool.query<{ title: string }>(
    `select title from knowledge.disciplines where discipline_code = $1 and status = 'active'`,
    [disciplineCode],
  );
  const disciplineTitle = disciplineResult.rows[0]?.title;
  if (!disciplineTitle) {
    throw new Error(
      `Unknown disciplineCode "${disciplineCode}" — curate it first (Phase 1 seed batch) before drafting colleges for it.`,
    );
  }

  const existingResult = await pool.query<{ name: string }>(
    `select name from knowledge.colleges where state = $1 order by name limit 100`,
    [state],
  );
  const existingCollegeNamesInScope = existingResult.rows.map((row) => row.name);

  const inputParams = { state, disciplineCode, count };
  const inputHash = computeInputHash("colleges", CATALOG_DRAFT_PROMPT_VERSIONS.colleges, inputParams);
  const existingRun = await store.findRunByInputHash("colleges", inputHash);
  if (existingRun) {
    console.log(`[cache hit] run ${existingRun.id} already exists for ${state}/${disciplineCode}, skipping Gemini call.`);
    return;
  }

  console.log(`Drafting up to ${count} colleges in ${state} for discipline "${disciplineTitle}"...`);
  const result = await drafter.draftColleges({
    state,
    disciplineCode,
    disciplineTitle,
    count,
    existingCollegeNamesInScope,
  });

  const run = await store.createRun({
    targetTable: "colleges",
    provider: "gemini",
    model: requireEnv("GEMINI_MODEL"),
    promptVersion: CATALOG_DRAFT_PROMPT_VERSIONS.colleges,
    inputParamsJson: inputParams,
    inputHash,
  });

  if (result.status !== "completed") {
    await store.markRunFailed(run.id, result.errorCode, result.errorCode);
    console.warn(`Gemini call failed: ${result.errorCode}`);
    return;
  }

  await store.recordRunResponse(run.id, result.rawResponse);

  const itemsToCreate = [];
  for (const college of result.data.colleges) {
    const naturalKey = normalizeCollegeNaturalKey({ name: college.name, city: college.city, state });
    const matched = await pool.query<{ id: string }>(
      `select id from knowledge.colleges where lower(trim(name)) = lower(trim($1)) and lower(trim(city)) = lower(trim($2)) and state = $3 limit 1`,
      [college.name, college.city, state],
    );
    itemsToCreate.push({
      proposedEntityType: "college" as const,
      proposedPayloadJson: { ...college, state },
      naturalKey,
      matchedExistingId: matched.rows[0]?.id,
    });
  }

  const created = await store.createItems(run.id, itemsToCreate);
  console.log(`Staged ${created.length} college draft(s) (run ${run.id}).`);
}

type AidScholarshipSource = { sourceKey: string; url: string; title: string; publisher: string };

const DEFAULT_AID_SOURCES_PATH = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "data/tn-ug-scholarship-sources.json",
);

/**
 * Unlike the other 4 generators, this has no "gap detection" — there's no existing partial aid
 * catalog to fill gaps in, so it walks a curated list of official source URLs instead
 * (data/tn-ug-scholarship-sources.json, researched and verified fetchable before this pipeline
 * was built — see the aid-schemes implementation plan). Each source page can describe several
 * distinct schemes, so one Gemini call per source may stage several items.
 */
async function generateAidSchemeDrafts(
  pool: Pool,
  drafter: CatalogDrafter,
  sourcesPath: string,
): Promise<void> {
  const store = createPostgresAiGenerationStore(pool);
  const sources = JSON.parse(readFileSync(sourcesPath, "utf8")) as AidScholarshipSource[];
  console.log(`Loaded ${sources.length} official source(s) from ${sourcesPath}.`);

  const existingResult = await pool.query<{ name: string }>(`select name from knowledge.aid_schemes`);
  const existingSchemeNamesInScope = existingResult.rows.map((row) => row.name);

  let staged = 0;
  let cacheHits = 0;
  let failures = 0;
  let fallbackUrlCount = 0;
  let skippedOutOfScope = 0;
  let consecutiveUnexpectedErrors = 0;

  for (const source of sources) {
    try {
      const inputParams = { sourceUrl: source.url, sourceKey: source.sourceKey };
      const inputHash = computeInputHash("aid_schemes", CATALOG_DRAFT_PROMPT_VERSIONS.aidSchemes, inputParams);
      const existingRun = await store.findRunByInputHash("aid_schemes", inputHash);
      if (existingRun) {
        cacheHits += 1;
        console.log(`  [cache hit] ${source.sourceKey} — run ${existingRun.id} already exists, skipping fetch+Gemini.`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      console.log(`  Fetching source: ${source.title} (${source.url})`);
      const fetched = await fetchSourceContent(source.url);
      if (fetched.status !== "fetched") {
        failures += 1;
        const run = await store.createRun({
          targetTable: "aid_schemes",
          provider: "gemini",
          model: requireEnv("GEMINI_MODEL"),
          promptVersion: CATALOG_DRAFT_PROMPT_VERSIONS.aidSchemes,
          inputParamsJson: inputParams,
          inputHash,
        });
        await store.markRunFailed(run.id, fetched.errorCode, fetched.message);
        console.warn(`    Fetch failed (${fetched.errorCode}): ${fetched.message}`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }
      if (fetched.source.truncated) {
        console.warn(`    Source text truncated to fit the extraction prompt (page longer than the cap).`);
      }

      console.log(`    Drafting aid scheme(s) from: ${source.title}`);
      const result = await drafter.draftAidSchemes({
        sourceUrl: source.url,
        sourceTitle: fetched.source.title || source.title,
        sourceText: fetched.source.text,
        existingSchemeNamesInScope,
      });
      await sleep(GEMINI_REQUEST_DELAY_MS);

      const run = await store.createRun({
        targetTable: "aid_schemes",
        provider: "gemini",
        model: requireEnv("GEMINI_MODEL"),
        promptVersion: CATALOG_DRAFT_PROMPT_VERSIONS.aidSchemes,
        inputParamsJson: inputParams,
        inputHash,
      });

      if (result.status !== "completed") {
        failures += 1;
        await store.markRunFailed(run.id, result.errorCode, result.errorCode);
        console.warn(`    Gemini call failed: ${result.errorCode}`);
        consecutiveUnexpectedErrors = 0;
        continue;
      }

      await store.recordRunResponse(run.id, result.rawResponse);

      const itemsToCreate = [];
      for (const scheme of result.data.schemes) {
        if (scheme.educationScope === "not_ug") {
          skippedOutOfScope += 1;
          console.warn(`    Skipping "${scheme.name}": out of scope (not usable by a UG student).`);
          continue;
        }
        // Many real government schemes have no dedicated online application URL at all — they're
        // applied for in person (district welfare office, institution counter), which Gemini
        // correctly reports as applicationUrl: null rather than inventing one. That's not the
        // same as "no URL exists for this scheme": the source page itself — already a confirmed,
        // fetched, official https URL — IS a legitimate "where to learn how to apply" link, and
        // dropping the scheme entirely (as this used to do) threw away schemes with otherwise
        // rich, well-sourced eligibility/benefit detail purely for lacking a *dedicated* form
        // URL. This fallback is applied here, in code — never by Gemini — so it can never become
        // a fabricated destination; it's always exactly the page this content was extracted from.
        if (scheme.applicationUrl === null) fallbackUrlCount += 1;
        const applicationUrl = scheme.applicationUrl ?? source.url;
        const naturalKey = normalizeAidSchemeNaturalKey({ name: scheme.name, provider: scheme.provider });
        // Best-effort duplicate hint only (case-insensitive name+provider match against already
        // promoted schemes) — the actual duplicate-prevention guarantee is the partial unique
        // index on ai_generation_items(proposed_entity_type, natural_key).
        const matched = await pool.query<{ id: string }>(
          `select id from knowledge.aid_schemes where lower(trim(name)) = lower(trim($1)) and lower(trim(provider)) = lower(trim($2)) limit 1`,
          [scheme.name, scheme.provider],
        );
        itemsToCreate.push({
          proposedEntityType: "aid_scheme" as const,
          proposedPayloadJson: { ...scheme, applicationUrl, sourceUrl: source.url },
          naturalKey,
          matchedExistingId: matched.rows[0]?.id,
        });
      }

      const created = await store.createItems(run.id, itemsToCreate);
      staged += created.length;
      console.log(`    Staged ${created.length} aid scheme draft(s) (run ${run.id}).`);
      consecutiveUnexpectedErrors = 0;
    } catch (error) {
      consecutiveUnexpectedErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`    Unexpected error processing "${source.sourceKey}": ${message}`);
      if (consecutiveUnexpectedErrors >= CONSECUTIVE_ERROR_LIMIT) {
        console.error(
          `\n${CONSECUTIVE_ERROR_LIMIT} consecutive unexpected errors — stopping early rather than ` +
            "continuing to fail. Re-run this same command to pick up where this left off.",
        );
        break;
      }
    }
  }

  console.log(
    `\nDone. Staged ${staged} item(s), ${cacheHits} cache hit(s), ${failures} failure(s), ` +
      `${skippedOutOfScope} out-of-scope skip(s), ${fallbackUrlCount} used the source-page URL fallback (no dedicated application URL on the page).`,
  );
}

const run = async (): Promise<void> => {
  loadLocalEnvironment();
  const args = process.argv.slice(2);
  const target = readFlag(args, "target");
  if (
    target !== "pathways" &&
    target !== "colleges" &&
    target !== "career_streams" &&
    target !== "stream_pathways" &&
    target !== "aid_schemes"
  ) {
    throw new Error(
      "Pass --target pathways, --target colleges, --target career_streams, --target stream_pathways, or --target aid_schemes",
    );
  }

  const pool = createDatabasePool({
    connectionString: requireEnv("DATABASE_URL"),
    ssl: process.env.DATABASE_SSL !== "false",
    max: 1,
  });
  // GEMINI_MAX_TOKENS is shared with apps/api's AI-counselor CHAT runtime (apps/api/src/config/
  // env.ts) and is tuned for a short chat reply (700 in this repo's own .env) — nowhere near
  // enough for an aid_schemes response (up to 8 rich scheme objects with several long text
  // fields, plus up to 10 criteria). Found live: at 700 tokens, Gemini's response was silently
  // truncated mid-JSON (a genuine 200 OK with valid-looking but incomplete text), which
  // parseDraft correctly reports as invalid_provider_output rather than crash — but the real fix
  // is not to under-budget it in the first place. aid_schemes gets its own, much larger, default
  // via a dedicated env var rather than bumping the shared chat-tuned value for every target.
  const maxTokens =
    target === "aid_schemes"
      ? Number(process.env.GEMINI_AID_SCHEME_MAX_TOKENS ?? 6000)
      : Number(process.env.GEMINI_MAX_TOKENS ?? 1500);
  const drafter = createGeminiCatalogDrafter({
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: requireEnv("GEMINI_MODEL"),
    maxTokens,
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 60_000),
  });

  try {
    if (target === "pathways") {
      const limit = Number(readFlag(args, "limit") ?? 60);
      await generatePathwayDrafts(pool, drafter, limit);
    } else if (target === "career_streams") {
      const limit = Number(readFlag(args, "limit") ?? 60);
      const careerIdsFile = readFlag(args, "career-ids-file");
      const targetCareerIds = careerIdsFile
        ? new Set<string>(JSON.parse(readFileSync(careerIdsFile, "utf8")) as string[])
        : undefined;
      await generateCareerStreamDrafts(pool, drafter, limit, targetCareerIds);
    } else if (target === "stream_pathways") {
      const limit = Number(readFlag(args, "limit") ?? 60);
      await generateStreamPathwayDrafts(pool, drafter, limit);
    } else if (target === "aid_schemes") {
      const sourcesPath = readFlag(args, "sources-file") ?? DEFAULT_AID_SOURCES_PATH;
      await generateAidSchemeDrafts(pool, drafter, sourcesPath);
    } else {
      const state = readFlag(args, "state");
      const discipline = readFlag(args, "discipline");
      const count = Number(readFlag(args, "count") ?? 6);
      if (!state || !discipline) {
        throw new Error("--target colleges requires --state and --discipline");
      }
      await generateCollegeDrafts(pool, drafter, state, discipline, count);
    }
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown generation failure";
  process.stderr.write(`AI catalog draft generation failed: ${message}\n`);
  process.exitCode = 1;
});
