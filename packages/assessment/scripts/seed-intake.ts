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
    ["support_needed", 17, "What should YuvaPath help with first?", "single_choice", ["stream_choice", "career_shortlist", "college_pathway", "exam_plan", "aid_options", "not_sure"], false, true, null],
    // display_order is globally unique across every segment's questions (each segment reserves
    // a block of 10: explorer 1-10, pathfinder 11-20, launcher 21-30) — 18 is pathfinder's next
    // free slot within its own block, added after support_needed rather than renumbering it.
    ["location_preference", 18, "What location option do you prefer?", "single_choice", ["same_city", "same_state", "anywhere_in_india", "remote", "not_sure"], false, true, null],
    // The single source of truth for "show this student scholarships/aid" (replaces the removed
    // signup `wantsAid` flag): Yes -> Explore Path shows the Scholarships & Aid screen. Optional
    // on purpose, so students who already finished intake aren't sent back; unanswered = No.
    ["seeks_aid", 19, "Do you want to see scholarship and financial aid options?", "single_choice", ["yes", "no"], false, false, null],
  ],
  launcher: [
    // current_status (display_order 21) removed: its 3 main options (college/graduate/working)
    // just repeated signup's own "Current stage" field, which is what routes someone into
    // launcher in the first place (deriveSegment() in user-profile.ts). Its only two options that
    // added anything (job_search/gap_year) weren't worth a whole repeat-feeling question for.
    ["current_goal", 22, "What is your current goal?", "single_choice", ["job", "higher_studies", "career_switch", "skill_building", "business", "not_sure"], false, true, null],
    ["education_level", 23, "What is your highest completed education level?", "single_choice", ["class_12", "diploma", "bachelors", "masters", "iti", "other"], false, true, null],
    // field_of_study: brought back after being removed for the same reason as experience_band/
    // preferred_work_style below it (unread by any automated scoring) — re-added for a different
    // consumer than the recommendation pipeline: a human counselor needs to know what a
    // college/graduate student actually studied to give relevant advice, even though no
    // eligibility rule reads it today.
    ["field_of_study", 24, "Which field is closest to your study or work?", "short_text", null, false, true, "Example: Computer Science Engineering"],
    // decision_confidence / constraints: new to launcher, not invented — reusing pathfinder's own
    // questions/options verbatim (display_order 15/16 there) since launcher had no equivalent
    // signal at all for how much guidance a student needs or what's practically constraining
    // their choices. Same counselor-context rationale as field_of_study above, not automated
    // scoring — see HandoffProfileContext (packages/counselor) for the separate, still-open gap
    // that no intake answer (old or new) reaches a counselor's screen yet.
    ["decision_confidence", 25, "How confident are you about your next step?", "single_choice", ["very_confident", "somewhat_confident", "confused", "starting_from_zero"], false, true, null],
    ["marks_band", 26, "Which academic performance band best represents you?", "single_choice", ["below_50", "50_60", "60_75", "75_90", "90_plus", "prefer_not_to_say"], true, true, null],
    ["constraints", 27, "Which constraint matters most right now?", "single_choice", ["fees", "distance", "family_expectations", "entrance_exam", "language", "none", "prefer_not_to_say"], true, true, null],
    // location_preference (28) removed: resolveGeoScope() (geo-scope.ts) already implements real
    // ranking logic for this answer, but it's not wired into college-recommendations.ts yet
    // (Phase A is Tamil Nadu-only, so there's no state comparison to make). Re-add when a
    // multi-state ranking phase actually turns it on — no point collecting it with zero effect
    // until then.
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

  // Cleanup pass: a question_key present in a question_set_id but no longer in `questions` above
  // was deliberately removed from the source (e.g. launcher's current_status) — the upsert loop
  // above only ever inserts/updates, so without this the DB would keep serving a retired question
  // forever, the same silent-drift failure mode this script's own upsert (vs. insert-only) was
  // written to avoid in the first place. Any answers already recorded against a removed question
  // go with it (FK requires it) — fine here since removing a question is a content decision, not
  // a routine edit, and any such answers are for a question that no longer exists to display.
  let removedQuestions = 0;
  for (const [segment, segmentQuestions] of Object.entries(questions)) {
    const questionSetId = setIds[segment];
    const currentKeys = segmentQuestions.map(([key]) => key);
    const removedAnswers = await client.query(
      `
        delete from assessment.intake_answers
        where question_id in (
          select id from assessment.intake_questions
          where question_set_id = $1 and not (question_key = any($2::text[]))
        )
      `,
      [questionSetId, currentKeys],
    );
    const removed = await client.query<{ question_key: string }>(
      `
        delete from assessment.intake_questions
        where question_set_id = $1 and not (question_key = any($2::text[]))
        returning question_key
      `,
      [questionSetId, currentKeys],
    );
    if (removed.rowCount) {
      removedQuestions += removed.rowCount;
      console.log(
        `Removed from ${segment}: ${removed.rows.map((r) => r.question_key).join(", ")} (${removedAnswers.rowCount ?? 0} answers cascaded)`,
      );
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
  console.log(
    JSON.stringify({ insertedQuestions, updatedQuestions, removedQuestions, counts: counts.rows }, null, 2),
  );
} catch (error) {
  await client.query("rollback");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
