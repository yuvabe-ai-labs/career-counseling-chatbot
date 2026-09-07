import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(scriptDir, "../../../.env"),
  resolve(scriptDir, "../../.env"),
];
const envPath = envCandidates.find((candidate) => existsSync(candidate));
if (envPath) {
  process.loadEnvFile(envPath);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed ip_60 assessment catalog data.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10_000,
});

type Scale = "R" | "I" | "A" | "S" | "E" | "C";

type SeedItem = {
  key: string;
  order: number;
  scale: Scale;
  prompt: string;
};

const instrument = {
  code: "ip_60",
  name: "YuvaNext Interest Profiler 60",
  construct: "interest",
  // v2.0 reduces the item bank from 60 items (10 waves x 6 scales) to 30 (5 waves x 6 scales).
  // Item selection is a stratified sample across waves 1, 3, 5, 7, 9 (every other wave) rather
  // than a first-half truncation (that's what mini_ip_30 already does, and it biases toward
  // only the "direct enjoyment" framings from waves 1-5). Sampling every other wave keeps one
  // item per scale from each distinct framing style used across the original 60 (direct
  // enjoyment, preference, career-interest, tool/comparison, motivation), so the reduced set
  // still spans the full construct the same way the 60-item version did. Scoring is unaffected:
  // scoreAssessmentResponses() (../src/domain/scoring.ts) sums whatever responses exist per
  // scale and normalizes against that run's own max scale, so it is already item-count-agnostic
  // and needs no change — halving the items per scale simply raises measurement noise per
  // person a little, it does not bias the ranking, since every scale lost the same number of
  // items. The prior 60-item bank stays in place under version 1.0 (retired below) for audit
  // history; existing assessment_runs/assessment_results keep referencing it unchanged.
  version: "2.0",
  language: "en",
  ageMin: 12,
  ageMax: 99,
  batchSize: 10,
  scoringAlgorithmVersion: "riasec-deterministic-v1",
  contentLicenseRef: "yuvanext-mock-content-v1",
  reviewStatus: "mock",
} as const;

const retiredVersion = "1.0";

const items: SeedItem[] = [
  // Wave 1 — direct enjoyment framing
  { key: "r_01_build_fix_tools", order: 1, scale: "R", prompt: "I enjoy building, fixing, or working with tools and materials." },
  { key: "i_01_solve_science_questions", order: 2, scale: "I", prompt: "I enjoy solving science, technology, or research-based questions." },
  { key: "a_01_create_original_work", order: 3, scale: "A", prompt: "I enjoy creating original work such as art, writing, music, or design." },
  { key: "s_01_help_people_learn", order: 4, scale: "S", prompt: "I enjoy helping people learn, understand, or feel supported." },
  { key: "e_01_lead_people", order: 5, scale: "E", prompt: "I enjoy leading people, presenting ideas, or persuading others." },
  { key: "c_01_organize_details", order: 6, scale: "C", prompt: "I enjoy organizing information, records, schedules, or details." },
  // Wave 3 — preference framing
  { key: "r_03_use_hands", order: 7, scale: "R", prompt: "I prefer tasks where I can use my hands and see a practical result." },
  { key: "i_03_experiment", order: 8, scale: "I", prompt: "I enjoy experimenting, testing ideas, and learning from evidence." },
  { key: "a_03_design_new_things", order: 9, scale: "A", prompt: "I enjoy designing new things, even when there is no single correct answer." },
  { key: "s_03_teach_or_care", order: 10, scale: "S", prompt: "I enjoy teaching, caring, guiding, or working closely with people." },
  { key: "e_03_sell_or_pitch", order: 11, scale: "E", prompt: "I enjoy selling, pitching, debating, or influencing decisions." },
  { key: "c_03_manage_numbers", order: 12, scale: "C", prompt: "I enjoy working with numbers, forms, checklists, or structured data." },
  // Wave 5 — career-interest framing
  { key: "r_05_physical_systems", order: 13, scale: "R", prompt: "Careers involving machines, agriculture, construction, or physical systems interest me." },
  { key: "i_05_technical_ideas", order: 14, scale: "I", prompt: "Careers involving investigation, coding, medicine, or technical ideas interest me." },
  { key: "a_05_creative_fields", order: 15, scale: "A", prompt: "Careers involving design, media, language, or creative expression interest me." },
  { key: "s_05_people_service", order: 16, scale: "S", prompt: "Careers involving teaching, social impact, service, or guidance interest me." },
  { key: "e_05_enterprise", order: 17, scale: "E", prompt: "Careers involving entrepreneurship, leadership, sales, or public influence interest me." },
  { key: "c_05_operations", order: 18, scale: "C", prompt: "Careers involving finance, administration, operations, or compliance interest me." },
  // Wave 7 — tools/comparison framing
  { key: "r_07_tools_equipment", order: 19, scale: "R", prompt: "I would enjoy learning to use technical tools, equipment, or instruments." },
  { key: "i_07_compare_evidence", order: 20, scale: "I", prompt: "I like comparing evidence before choosing the best answer." },
  { key: "a_07_perform_or_present", order: 21, scale: "A", prompt: "I enjoy performing, presenting, writing, or showing creative work." },
  { key: "s_07_team_support", order: 22, scale: "S", prompt: "I enjoy being part of a team where people support each other." },
  { key: "e_07_compete_goals", order: 23, scale: "E", prompt: "I enjoy competition, goals, and situations where results can be achieved." },
  { key: "c_07_keep_records", order: 24, scale: "C", prompt: "I like keeping records clear, complete, and easy to find." },
  // Wave 9 — motivation framing
  { key: "r_09_active_work", order: 25, scale: "R", prompt: "I prefer active work over sitting still for long periods." },
  { key: "i_09_complex_questions", order: 26, scale: "I", prompt: "I enjoy complex questions that require patient thinking." },
  { key: "a_09_open_ended_tasks", order: 27, scale: "A", prompt: "I enjoy open-ended tasks where the final result can be unique." },
  { key: "s_09_improve_lives", order: 28, scale: "S", prompt: "I feel motivated by work that improves people's lives." },
  { key: "e_09_influence_outcomes", order: 29, scale: "E", prompt: "I feel motivated by work where I can influence outcomes and decisions." },
  { key: "c_09_accuracy_rules", order: 30, scale: "C", prompt: "I feel motivated by work that values accuracy, rules, and dependable execution." },
];

const client = await pool.connect();

try {
  await client.query("begin");

  const definitionResult = await client.query<{ id: string }>(
    `
      insert into assessment.assessment_definitions
        (id, instrument_code, name, construct, status, created_at)
      values
        (gen_random_uuid(), $1, $2, $3, 'active', now())
      on conflict (instrument_code) do update set
        name = excluded.name,
        construct = excluded.construct,
        status = excluded.status
      returning id
    `,
    [instrument.code, instrument.name, instrument.construct],
  );
  const definitionId = definitionResult.rows[0]?.id;
  if (!definitionId) {
    throw new Error("Assessment definition upsert returned no id.");
  }

  const versionResult = await client.query<{ id: string }>(
    `
      insert into assessment.assessment_versions
        (
          id, definition_id, version, language, age_min, age_max, item_count, batch_size,
          scoring_algorithm_version, content_license_ref, review_status, effective_from,
          retired_at, created_at
        )
      values
        (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() - interval '1 day', null, now())
      on conflict (definition_id, version) do update set
        language = excluded.language,
        age_min = excluded.age_min,
        age_max = excluded.age_max,
        item_count = excluded.item_count,
        batch_size = excluded.batch_size,
        scoring_algorithm_version = excluded.scoring_algorithm_version,
        content_license_ref = excluded.content_license_ref,
        review_status = excluded.review_status,
        effective_from = excluded.effective_from,
        retired_at = excluded.retired_at
      returning id
    `,
    [
      definitionId,
      instrument.version,
      instrument.language,
      instrument.ageMin,
      instrument.ageMax,
      items.length,
      instrument.batchSize,
      instrument.scoringAlgorithmVersion,
      instrument.contentLicenseRef,
      instrument.reviewStatus,
    ],
  );
  const versionId = versionResult.rows[0]?.id;
  if (!versionId) {
    throw new Error("Assessment version upsert returned no id.");
  }

  // Retire the prior 60-item version so findActiveVersion() (pg-assessment-repository.ts) stops
  // selecting it for new runs. It is left in place (not deleted) so existing assessment_runs and
  // assessment_results that reference it keep resolving for audit/history.
  await client.query(
    `
      update assessment.assessment_versions
      set retired_at = now()
      where definition_id = $1 and version = $2 and retired_at is null
    `,
    [definitionId, retiredVersion],
  );

  let insertedItems = 0;
  for (const item of items) {
    const existingItem = await client.query<{ id: string }>(
      `
        select id
        from assessment.assessment_items
        where assessment_version_id = $1 and item_key = $2
        limit 1
      `,
      [versionId, item.key],
    );
    if (existingItem.rowCount === 0) {
      await client.query(
        `
          insert into assessment.assessment_items
            (
              id, assessment_version_id, item_key, display_order, item_type, prompt_text,
              prompt_asset_ref, scale_code, is_reverse_scored, is_qc, qc_rule_json,
              is_tie_break, review_status, created_at
            )
          values
            (gen_random_uuid(), $1, $2, $3, 'likert', $4, null, $5, false, false, null, false, 'mock', now())
        `,
        [versionId, item.key, item.order, item.prompt, item.scale],
      );
      insertedItems += 1;
    }
  }

  await client.query("commit");

  const summary = await client.query(
    `
      select ad.instrument_code, av.version, av.language, av.age_min, av.age_max,
        av.review_status, av.item_count, count(ai.id)::int as stored_item_count
      from assessment.assessment_definitions ad
      join assessment.assessment_versions av on av.definition_id = ad.id
      left join assessment.assessment_items ai on ai.assessment_version_id = av.id
      where ad.instrument_code = $1
      group by ad.instrument_code, av.version, av.language, av.age_min, av.age_max, av.review_status, av.item_count
      order by av.version
    `,
    [instrument.code],
  );

  console.log(JSON.stringify({ insertedItems, summary: summary.rows }, null, 2));
} catch (error) {
  await client.query("rollback");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
