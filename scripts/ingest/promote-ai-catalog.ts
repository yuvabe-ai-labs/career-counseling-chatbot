// Promotes APPROVED staged AI catalog items into the real knowledge.* tables, by assembling
// them into the SAME manifest+records shape the existing hand-authored dataset importers
// already use, then calling those existing (or, for career_pathways, additively extended)
// importers — no parallel catalog-writing mechanism.
// (docs/poc/ai-assisted-catalog-implementation-plan.md §12/§22).
//
// Every promoted row is written verification_status='unverified' (colleges/programs) or
// publication_status='draft' (pathways) — NEVER auto-verified/published. A further, separate,
// explicit human action is required before a promoted row becomes visible to students (§13).
//
// Usage:
//   tsx scripts/ingest/promote-ai-catalog.ts --run <runId>
import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import { createDatabasePool } from "@yuvanext/database";
import {
  createPostgresAiGenerationStore,
  importCollegeDataset,
  importStreamDataset,
  PostgresCollegeDatasetPublisher,
  PostgresStreamDatasetPublisher,
} from "@yuvanext/knowledge";
import type {
  AiGenerationItem,
  CareerPathwayLink,
  CollegeDatasetRecords,
  CollegeDraft,
  CollegeProgram,
  College,
  Pathway,
  PathwayDraft,
  StreamDatasetRecords,
} from "@yuvanext/contracts";
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

function nowIso(): string {
  return new Date().toISOString();
}

function buildSource(runId: string) {
  return {
    id: randomUUID(),
    sourceKey: `ai-generated-run-${runId}`,
    name: "AI-generated catalog draft (Gemini), human-reviewed",
    sourceType: "ai_generated_reviewed",
    publisher: "YuvaNext",
    trustLevel: "ai_generated_reviewed",
    status: "active" as const,
    baseUrl: null,
    licenseRef:
      "Drafted by Gemini, approved by a human reviewer; content is unverified until separately marked verified.",
  };
}

async function promotePathwayItems(
  pool: Pool,
  runId: string,
  items: AiGenerationItem[],
): Promise<void> {
  const pathwayItems = items.filter((item) => item.proposedEntityType === "pathway");
  if (pathwayItems.length === 0) return;

  const routesResult = await pool.query<{ id: string; route_code: string }>(
    `select id, route_code from knowledge.education_routes where publication_status = 'published'`,
  );
  const routeIdByCode = new Map(routesResult.rows.map((row) => [row.route_code, row.id]));

  // Gemini invents pathwayCode per call without seeing every other code ever generated, so two
  // independently-drafted pathways (different careers, different titles) can still propose the
  // identical code — pathway_code is globally unique, so that's a real DB conflict, not a
  // duplicate-content case (the natural-key dedupe in §11 is based on title+route, not code).
  // Disambiguate deterministically rather than fail the whole batch over a cosmetic code clash.
  const existingCodesResult = await pool.query<{ pathway_code: string }>(
    `select pathway_code from knowledge.pathways`,
  );
  const usedPathwayCodes = new Set(existingCodesResult.rows.map((row) => row.pathway_code));

  function uniquePathwayCode(candidate: string, itemId: string): string {
    if (!usedPathwayCodes.has(candidate)) {
      usedPathwayCodes.add(candidate);
      return candidate;
    }
    const disambiguated = `${candidate}-${itemId.slice(0, 8)}`;
    usedPathwayCodes.add(disambiguated);
    return disambiguated;
  }

  const pathways: Pathway[] = [];
  const careerPathways: CareerPathwayLink[] = [];
  // Collected for EVERY pathway item, whether newly promoted in this call or already promoted
  // by a prior (partially-failed) run — pathway_disciplines uses an upsert
  // (`on conflict (pathway_id, discipline_id) do update`), so re-promoting these links is
  // always safe and must not be skipped just because the pathway itself already exists.
  const disciplineLinksToPromote: Array<{ pathwayId: string; disciplineCode: string; relevanceWeight: number }> = [];
  const promotedIdByItemId = new Map<string, string>();
  const resolvedCareerIds = new Set<string>();
  // One dataset_versions row per promotion batch, not per pathway — every pathway in this
  // call must reference the SAME id the manifest declares.
  const datasetVersionId = randomUUID();

  for (const item of pathwayItems) {
    const draft = item.proposedPayloadJson as unknown as PathwayDraft;

    if (item.promotedEntityId) {
      // Already promoted by an earlier, partially-completed run of this script — don't
      // re-insert the pathway (pathway_code is globally unique), just make sure its
      // discipline links still get a chance to land.
      for (const link of draft.relatedDisciplines) {
        disciplineLinksToPromote.push({
          pathwayId: item.promotedEntityId,
          disciplineCode: link.disciplineCode,
          relevanceWeight: link.relevanceWeight,
        });
      }
      continue;
    }

    const educationRouteId = routeIdByCode.get(draft.educationRouteCode);
    if (!educationRouteId) {
      console.warn(
        `  Skipping pathway "${draft.title}" (item ${item.id}): unknown educationRouteCode "${draft.educationRouteCode}".`,
      );
      continue;
    }

    const pathwayId = randomUUID();
    pathways.push({
      id: pathwayId,
      pathwayCode: uniquePathwayCode(draft.pathwayCode, item.id),
      title: draft.title,
      description: draft.description,
      educationRouteId,
      durationBand: draft.durationBand,
      backupRouteNote: draft.backupRouteNote,
      // Never auto-published — a further explicit human action publishes it (plan §13).
      publicationStatus: "draft",
      datasetVersionId,
    });
    promotedIdByItemId.set(item.id, pathwayId);

    for (const link of draft.relatedCareers) {
      const careerResult = await pool.query<{ id: string }>(
        link.careerOnetCode
          ? `select id from knowledge.careers where onet_code = $1`
          : `select id from knowledge.careers where lower(trim(title)) = lower(trim($1))`,
        [link.careerOnetCode ?? link.careerTitle],
      );
      const careerId = careerResult.rows[0]?.id;
      if (!careerId) {
        console.warn(
          `  Skipping career link "${link.careerTitle}" for pathway "${draft.title}": career not found.`,
        );
        continue;
      }
      resolvedCareerIds.add(careerId);
      careerPathways.push({
        careerId,
        pathwayId,
        relationshipType: link.relationshipType,
        displayOrder: careerPathways.length + 1,
      });
    }

    for (const link of draft.relatedDisciplines) {
      disciplineLinksToPromote.push({
        pathwayId,
        disciplineCode: link.disciplineCode,
        relevanceWeight: link.relevanceWeight,
      });
    }
  }

  const store = createPostgresAiGenerationStore(pool);

  if (pathways.length > 0) {
    const records: StreamDatasetRecords = {
      educationRoutes: [],
      pathways,
      careerPathways,
      streamOptions: [],
      streamMaps: [],
      streamMapItems: [],
    };
    const recordsText = JSON.stringify(records);
    const checksumSha256 = createHash("sha256").update(recordsText).digest("hex");
    const manifest = {
      schemaVersion: 1 as const,
      datasetKey: "ai-pathways",
      version: `run-${runId}`,
      datasetVersionId,
      recordsFile: "records.json",
      recordCounts: {
        educationRoutes: 0,
        pathways: pathways.length,
        careerPathways: careerPathways.length,
        streamOptions: 0,
        streamMaps: 0,
        streamMapItems: 0,
      },
      checksumSha256,
      reviewStatus: "approved" as const,
      createdAt: nowIso(),
      source: buildSource(runId),
    };

    const report = await importStreamDataset(manifest, recordsText, new PostgresStreamDatasetPublisher(pool), {
      knownEducationRouteIds: [...routeIdByCode.values()],
      knownCareerIds: [...resolvedCareerIds],
    });
    if (report.status === "rejected") {
      throw new Error(`Pathway promotion rejected: ${JSON.stringify(report.issues)}`);
    }
    console.log(`  Promoted ${pathways.length} pathway(s), ${careerPathways.length} career link(s).`);

    for (const [itemId, pathwayId] of promotedIdByItemId) {
      await store.markItemPromoted(itemId, pathwayId);
    }
  } else {
    console.log("  All pathway items in this run were already promoted; re-checking discipline links only.");
  }

  if (disciplineLinksToPromote.length > 0) {
    await promotePathwayDisciplineLinks(pool, runId, disciplineLinksToPromote);
  }
}

async function promotePathwayDisciplineLinks(
  pool: Pool,
  runId: string,
  links: Array<{ pathwayId: string; disciplineCode: string; relevanceWeight: number }>,
): Promise<void> {
  const disciplineResult = await pool.query<{ id: string; discipline_code: string }>(
    `select id, discipline_code from knowledge.disciplines where status = 'active'`,
  );
  const disciplineIdByCode = new Map(disciplineResult.rows.map((row) => [row.discipline_code, row.id]));

  const pathwayDisciplines = links
    .map((link) => {
      const disciplineId = disciplineIdByCode.get(link.disciplineCode);
      if (!disciplineId) {
        console.warn(`  Skipping discipline link: unknown disciplineCode "${link.disciplineCode}".`);
        return undefined;
      }
      return {
        pathwayId: link.pathwayId,
        disciplineId,
        relevanceWeight: Math.max(0, Math.min(1, link.relevanceWeight)),
        mappingVersion: `ai-run-${runId}`,
      };
    })
    .filter((link): link is NonNullable<typeof link> => link !== undefined);

  if (pathwayDisciplines.length === 0) return;

  const records: CollegeDatasetRecords = { colleges: [], disciplines: [], programs: [], pathwayDisciplines };
  const recordsText = JSON.stringify(records);
  const checksumSha256 = createHash("sha256").update(recordsText).digest("hex");
  const manifest = {
    schemaVersion: 1 as const,
    datasetKey: "ai-pathway-disciplines",
    version: `run-${runId}`,
    datasetVersionId: randomUUID(),
    recordsFile: "records.json",
    recordCount: pathwayDisciplines.length,
    recordCounts: { colleges: 0, disciplines: 0, programs: 0, pathwayDisciplines: pathwayDisciplines.length },
    checksumSha256,
    reviewStatus: "approved" as const,
    createdAt: nowIso(),
    source: buildSource(runId),
  };

  const report = await importCollegeDataset(manifest, recordsText, new PostgresCollegeDatasetPublisher(pool), {
    knownPathwayIds: pathwayDisciplines.map((link) => link.pathwayId),
    knownDisciplineIds: [...disciplineIdByCode.values()],
  });
  if (report.status === "rejected") {
    throw new Error(`Pathway-discipline promotion rejected: ${JSON.stringify(report.issues)}`);
  }
  console.log(`  Promoted ${pathwayDisciplines.length} pathway-discipline link(s).`);
}

async function promoteCollegeItems(pool: Pool, runId: string, items: AiGenerationItem[]): Promise<void> {
  const collegeItems = items.filter((item) => item.proposedEntityType === "college");
  if (collegeItems.length === 0) return;

  const disciplineResult = await pool.query<{ id: string; discipline_code: string }>(
    `select id, discipline_code from knowledge.disciplines where status = 'active'`,
  );
  const disciplineIdByCode = new Map(disciplineResult.rows.map((row) => [row.discipline_code, row.id]));

  const colleges: College[] = [];
  const programs: CollegeProgram[] = [];
  const promotedIdByItemId = new Map<string, string>();
  const datasetVersionId = randomUUID();

  for (const item of collegeItems) {
    const draft = item.proposedPayloadJson as unknown as CollegeDraft & { state: string };

    if (item.promotedEntityId) {
      // Already promoted by an earlier run — a college and its programs are inserted together
      // in one importCollegeDataset() transaction (see below), so if the college landed, its
      // programs did too. Re-adding them here would both violate no real constraint (program
      // ids are fresh randomUUIDs every time) AND force a new, unnecessary dataset_versions
      // row — skip entirely rather than mirroring promotePathwayItems' "still reprocess
      // sub-links" pattern (pathway_disciplines is a genuine upsert; college_programs has no
      // natural key to upsert against, so it can only ever be an unconditional insert).
      continue;
    }

    const collegeId = randomUUID();
    colleges.push({
      id: collegeId,
      name: draft.name,
      city: draft.city,
      state: draft.state,
      institutionType: draft.institutionType,
      externalCode: null,
      admissionRoute: null,
      feesBand: null,
      websiteUrl: null,
      // Never auto-verified — a further explicit human action verifies it (plan §13).
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      datasetVersionId,
    });
    promotedIdByItemId.set(item.id, collegeId);

    for (const program of draft.programs) {
      const disciplineId = disciplineIdByCode.get(program.disciplineCode);
      if (!disciplineId) {
        console.warn(
          `  Skipping program "${program.programName}" for "${draft.name}": unknown disciplineCode "${program.disciplineCode}".`,
        );
        continue;
      }
      programs.push({
        id: randomUUID(),
        collegeId,
        disciplineId,
        programName: program.programName,
        qualificationLevel: program.qualificationLevel,
        durationBand: program.durationBand,
        admissionRoute: program.admissionRoute,
        feesBand: program.feesBand,
        verificationStatus: "unverified",
        lastVerifiedAt: null,
        datasetVersionId,
      });
    }
  }

  if (colleges.length === 0 && programs.length === 0) {
    console.log("  All college items in this run were already promoted; nothing new to do.");
    return;
  }

  const records: CollegeDatasetRecords = { colleges, disciplines: [], programs, pathwayDisciplines: [] };
  const recordsText = JSON.stringify(records);
  const checksumSha256 = createHash("sha256").update(recordsText).digest("hex");
  const manifest = {
    schemaVersion: 1 as const,
    datasetKey: "ai-colleges",
    version: `run-${runId}`,
    datasetVersionId,
    recordsFile: "records.json",
    recordCount: colleges.length + programs.length,
    recordCounts: { colleges: colleges.length, disciplines: 0, programs: programs.length, pathwayDisciplines: 0 },
    checksumSha256,
    reviewStatus: "approved" as const,
    createdAt: nowIso(),
    source: buildSource(runId),
  };

  const report = await importCollegeDataset(manifest, recordsText, new PostgresCollegeDatasetPublisher(pool), {
    knownDisciplineIds: [...disciplineIdByCode.values()],
    knownCollegeIds: collegeItems
      .map((item) => item.promotedEntityId)
      .filter((id): id is string => id !== null),
  });
  if (report.status === "rejected") {
    throw new Error(`College promotion rejected: ${JSON.stringify(report.issues)}`);
  }
  console.log(`  Promoted ${colleges.length} college(s), ${programs.length} program(s).`);

  const store = createPostgresAiGenerationStore(pool);
  for (const [itemId, collegeId] of promotedIdByItemId) {
    await store.markItemPromoted(itemId, collegeId);
  }
}

async function promoteOneRun(pool: Pool, store: ReturnType<typeof createPostgresAiGenerationStore>, runId: string): Promise<void> {
  const generationRun = await store.getRun(runId);
  if (!generationRun) {
    throw new Error(`No ai_generation_runs row found for ${runId}`);
  }
  const items = (await store.listItemsForRun(runId)).filter((item) => item.reviewStatus === "approved");
  if (items.length === 0) {
    console.log(`Run ${runId}: no approved items — nothing to promote.`);
    return;
  }
  console.log(`Run ${runId}: promoting ${items.length} approved item(s) (${generationRun.targetTable})...`);

  await promotePathwayItems(pool, runId, items);
  await promoteCollegeItems(pool, runId, items);

  await store.updateRunStatus(runId, "approved");
}

const run = async (): Promise<void> => {
  loadLocalEnvironment();
  const args = process.argv.slice(2);
  const runId = readFlag(args, "run");
  const promoteAll = args.includes("--all");
  if (!runId && !promoteAll) {
    throw new Error("Pass --run <runId>, or --all to promote every run with at least one approved item");
  }

  const pool = createDatabasePool({
    connectionString: requireEnv("DATABASE_URL"),
    ssl: process.env.DATABASE_SSL !== "false",
    max: 1,
  });
  const store = createPostgresAiGenerationStore(pool);

  try {
    if (promoteAll) {
      const result = await pool.query<{ generation_run_id: string }>(
        `select distinct generation_run_id from knowledge.ai_generation_items where review_status = 'approved'`,
      );
      console.log(`Found ${result.rows.length} run(s) with at least one approved item.`);
      for (const row of result.rows) {
        try {
          await promoteOneRun(pool, store, row.generation_run_id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error(`  Run ${row.generation_run_id} failed to promote: ${message}`);
        }
      }
      console.log("Done.");
      return;
    }

    if (runId) {
      await promoteOneRun(pool, store, runId);
      console.log("Done.");
    }
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown promotion failure";
  process.stderr.write(`AI catalog promotion failed: ${message}\n`);
  process.exitCode = 1;
});
