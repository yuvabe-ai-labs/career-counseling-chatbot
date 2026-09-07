import { Pool } from "pg";

process.loadEnvFile("../../.env");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10_000,
});

const sets = [
  { segment: "explorer", version: "1.0", language: "en" },
  { segment: "pathfinder", version: "1.0", language: "en" },
  { segment: "launcher", version: "1.0", language: "en" },
] as const;

/**
 * Response type per question is a deliberate content call, not a blanket "all dropdown" or "all
 * free text" — single_choice for anything with a small, standardized real-world answer set (board
 * names, class levels, ranges/bands), a sensitive topic (constraints — a fixed list with "prefer
 * not to say" is easier and safer to answer than typing), or a routing question the app maps to a
 * specific feature (every support_needed). short_text for genuinely open/personal questions where
 * nothing downstream matches the value exactly and a short fixed list would be reductive
 * (favorite_subject, flow_activity, preferred_work_style, field_of_study) — confirmed via
 * packages/recommendations: the only intake field actually consumed by exact-match recommendation
 * logic anywhere is marks_band (against feasibility_rules.marks_band), so it's the one field that
 * must stay single_choice regardless of content judgment calls on the rest.
 */
const questions = {
  explorer: [
    ["school_board", 1, "Which school board are you studying in?", "single_choice", ["cbse", "state_board", "icse", "other", "prefer_not_to_say"], false, true, null],
    ["class_level", 2, "Which class are you currently in?", "single_choice", ["class_7", "class_8", "class_9", "class_10", "other"], false, true, null],
    ["favorite_subject", 3, "Which subject do you enjoy most?", "short_text", null, false, true, "Example: Mathematics"],
    ["flow_activity", 4, "What activity makes time pass quickly for you?", "short_text", null, false, true, "Example: Reading books"],
    ["support_needed", 5, "What kind of support would help you most now?", "single_choice", ["choose_stream", "understand_strengths", "study_plan", "career_ideas", "scholarship_or_aid", "not_sure"], false, true, null],
  ],
  pathfinder: [
    ["education_stage", 11, "Where are you in your education journey?", "single_choice", ["class_11", "class_12", "diploma", "gap_year", "other"], false, true, null],
    ["current_stream", 12, "Which stream or subject group are you in?", "single_choice", ["science_pcm", "science_pcb", "commerce", "arts_humanities", "vocational", "not_decided", "other"], false, true, null],
    ["marks_band", 13, "Which marks band best describes your recent performance?", "single_choice", ["below_50", "50_60", "60_75", "75_90", "90_plus", "prefer_not_to_say"], true, true, null],
    ["preferred_work_style", 14, "How do you prefer to work?", "short_text", null, false, true, "Example: Working independently"],
    ["decision_confidence", 15, "How confident are you about your next step?", "single_choice", ["very_confident", "somewhat_confident", "confused", "starting_from_zero"], false, true, null],
    ["constraints", 16, "Which constraint matters most right now?", "single_choice", ["fees", "distance", "family_expectations", "entrance_exam", "language", "none", "prefer_not_to_say"], true, true, null],
    ["support_needed", 17, "What should YuvaNext help with first?", "single_choice", ["stream_choice", "career_shortlist", "college_pathway", "exam_plan", "aid_options", "not_sure"], false, true, null],
  ],
  launcher: [
    ["current_status", 21, "What are you doing right now?", "single_choice", ["college", "graduate", "working", "job_search", "gap_year", "other"], false, true, null],
    ["current_goal", 22, "What is your current goal?", "single_choice", ["job", "higher_studies", "career_switch", "skill_building", "business", "not_sure"], false, true, null],
    ["education_level", 23, "What is your highest completed education level?", "single_choice", ["class_12", "diploma", "bachelors", "masters", "iti", "other"], false, true, null],
    ["field_of_study", 24, "Which field is closest to your study or work?", "short_text", null, false, true, "Example: Computer Science Engineering"],
    ["experience_band", 25, "How much work experience do you have?", "single_choice", ["none", "less_than_1_year", "1_3_years", "3_5_years", "5_plus_years"], false, true, null],
    ["marks_band", 26, "Which academic performance band best represents you?", "single_choice", ["below_50", "50_60", "60_75", "75_90", "90_plus", "prefer_not_to_say"], true, true, null],
    ["preferred_work_style", 27, "What type of work feels most natural to you?", "short_text", null, false, true, "Example: Hands-on problem solving"],
    ["location_preference", 28, "What location option do you prefer?", "single_choice", ["same_city", "same_state", "anywhere_in_india", "remote", "not_sure"], false, true, null],
    ["support_needed", 29, "What support do you want first?", "single_choice", ["career_shortlist", "job_roles", "higher_study_path", "skills_plan", "aid_options", "not_sure"], false, true, null],
  ],
} as const;

const client = await pool.connect();

try {
  await client.query("begin");
  const setIds: Record<string, string> = {};

  for (const set of sets) {
    const result = await client.query<{ id: string }>(
      `
        insert into assessment.intake_question_sets
          (id, segment, version, language, status, effective_from, retired_at, created_at)
        values
          (gen_random_uuid(), $1, $2, $3, 'approved', now() - interval '1 day', null, now())
        on conflict (segment, version) do update set
          status = excluded.status,
          language = excluded.language,
          effective_from = excluded.effective_from
        returning id
      `,
      [set.segment, set.version, set.language],
    );
    setIds[set.segment] = result.rows[0]?.id ?? "";
  }

  // A real upsert (on conflict (question_set_id, question_key) do update — see this migration's
  // added unique index), not insert-if-missing: editing a question's content above (response
  // type, options, placeholder) and re-running this script now actually applies to already-seeded
  // rows instead of silently no-op'ing, which is what an insert-only version of this script would
  // otherwise do to anyone editing an existing question after its first seed.
  let insertedQuestions = 0;
  let updatedQuestions = 0;
  for (const [segment, segmentQuestions] of Object.entries(questions)) {
    const questionSetId = setIds[segment];
    for (const [key, order, prompt, type, options, sensitive, required, placeholder] of segmentQuestions) {
      const result = await client.query<{ inserted: boolean }>(
        `
          insert into assessment.intake_questions
            (
              id, question_set_id, question_key, display_order, prompt_text, response_type,
              options_json, placeholder_text, is_sensitive, is_required
            )
          values
            (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
          on conflict (question_set_id, question_key) do update set
            display_order = excluded.display_order,
            prompt_text = excluded.prompt_text,
            response_type = excluded.response_type,
            options_json = excluded.options_json,
            placeholder_text = excluded.placeholder_text,
            is_sensitive = excluded.is_sensitive,
            is_required = excluded.is_required
          returning (xmax = 0) as inserted
        `,
        [
          questionSetId,
          key,
          order,
          prompt,
          type,
          options === null ? null : JSON.stringify(options),
          placeholder,
          sensitive,
          required,
        ],
      );
      if (result.rows[0]?.inserted) {
        insertedQuestions += 1;
      } else {
        updatedQuestions += 1;
      }
    }
  }

  await client.query("commit");

  // client.query, not pool.query: with max: 1, the transaction's own client above is still
  // checked out at this point (not released until the finally block below) — pool.query() would
  // need a second connection from the same one-connection pool and deadlock waiting for it.
  const counts = await client.query(
    `
      select s.segment, s.version, count(q.id)::int as question_count
      from assessment.intake_question_sets s
      left join assessment.intake_questions q on q.question_set_id = s.id
      group by s.segment, s.version
      order by s.segment
    `,
  );
  console.log(JSON.stringify({ insertedQuestions, updatedQuestions, counts: counts.rows }, null, 2));
} catch (error) {
  await client.query("rollback");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
