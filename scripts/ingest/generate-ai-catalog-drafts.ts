// Offline Gemini catalog-drafting CLI
// (docs/poc/ai-assisted-catalog-implementation-plan.md §10/§16). Runs OUTSIDE apps/api's
// request path, same execution model as every other scripts/ingest/*.ts script — nothing here
// is ever invoked from a live student request.
//
// Usage:
//   tsx scripts/ingest/generate-ai-catalog-drafts.ts --target pathways [--limit 60]
//   tsx scripts/ingest/generate-ai-catalog-drafts.ts --target colleges --state "Tamil Nadu" --discipline computing [--count 6]
//
// Writes only to knowledge.ai_generation_runs / ai_generation_items (staging) — never to a
// real catalog table. Review with scripts/ingest/review-ai-catalog.ts, then promote with
// scripts/ingest/promote-ai-catalog.ts.
import process from "node:process";
import { createDatabasePool } from "@yuvanext/database";
import {
  CATALOG_DRAFT_PROMPT_VERSIONS,
  computeInputHash,
  createGeminiCatalogDrafter,
  createPostgresAiGenerationStore,
  detectCatalogGaps,
  normalizeCollegeNaturalKey,
  normalizePathwayNaturalKey,
  type CatalogDrafter,
} from "@yuvanext/knowledge";
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

  for (const gap of gaps) {
    if (gap.type !== "no_pathway_for_career") continue;

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
      continue;
    }

    console.log(`  Drafting pathway(s) for career: ${gap.careerTitle}`);
    const result = await drafter.draftPathways({
      seedCareer: { onetCode: career.onet_code, title: gap.careerTitle, domainCode: career.domain_code },
      knownEducationRoutes,
      knownDisciplines,
      existingPathwayTitlesInScope,
    });

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

const run = async (): Promise<void> => {
  loadLocalEnvironment();
  const args = process.argv.slice(2);
  const target = readFlag(args, "target");
  if (target !== "pathways" && target !== "colleges") {
    throw new Error('Pass --target pathways or --target colleges');
  }

  const pool = createDatabasePool({
    connectionString: requireEnv("DATABASE_URL"),
    ssl: process.env.DATABASE_SSL !== "false",
    max: 1,
  });
  const drafter = createGeminiCatalogDrafter({
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: requireEnv("GEMINI_MODEL"),
    maxTokens: Number(process.env.GEMINI_MAX_TOKENS ?? 1500),
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 60_000),
  });

  try {
    if (target === "pathways") {
      const limit = Number(readFlag(args, "limit") ?? 60);
      await generatePathwayDrafts(pool, drafter, limit);
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
