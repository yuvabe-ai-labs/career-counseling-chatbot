import type { Pool } from "pg";
import type {
  CounselorStudentListFilters,
  CounselorStudentListResult,
  CounselorStudentRecord,
  CounselorStudentReportExtras,
  CounselorStudentRepository,
} from "../application/counselor-student-repository.js";

type StudentRow = {
  user_id: string;
  first_name: string;
  segment: CounselorStudentRecord["segment"];
  status: CounselorStudentRecord["status"];
};

type MatchRow = {
  kind: "career" | "stream" | "pathway";
  rank: number;
  ring_code: "inner" | "middle" | "outer" | null;
  entity_snapshot_json: { itemId?: string; title?: string } | null;
  fit_explanation_json: Record<string, unknown> | null;
};

// A few more than the card shows, so ordering/ties match the student's own view.
const MATCHES_PER_KIND = 5;

type CountsRow = {
  completed: string;
  in_progress: string;
  not_started: string;
  total: string;
};

/**
 * Same per-student status derivation PgCounselorDashboardRepository's aggregate query already
 * uses (only 'active'/'completed'/'scored' are ever written to assessment_runs.status — see that
 * repository's own comment) — a `left join lateral` here rather than the dashboard's two CTEs,
 * since this query needs the status as a per-row column, not a count.
 */
const STUDENT_STATUS_SELECT = `
  select
    up.user_id,
    up.first_name,
    up.segment,
    case
      when exists (
        select 1 from assessment.assessment_runs ar
        where ar.user_id = up.user_id and ar.status in ('completed', 'scored')
      ) then 'completed'
      when exists (
        select 1 from assessment.assessment_runs ar
        where ar.user_id = up.user_id and ar.status = 'active'
      ) then 'in_progress'
      else 'not_started'
    end as status
  from assessment.user_profiles up
  where up.deleted_at is null
`;

export class PgCounselorStudentRepository implements CounselorStudentRepository {
  constructor(private readonly pool: Pool) {}

  async listStudents(filters: CounselorStudentListFilters): Promise<CounselorStudentListResult> {
    const status = filters.status && filters.status !== "all" ? filters.status : null;
    const search = filters.search?.trim() || null;

    const [studentsResult, countsResult] = await Promise.all([
      this.pool.query<StudentRow>(
        `with students as (${STUDENT_STATUS_SELECT})
         select user_id, first_name, segment, status
         from students
         where ($1::text is null or status = $1)
           and ($2::text is null or first_name ilike '%' || $2 || '%')
         order by first_name asc`,
        [status, search],
      ),
      // Always unfiltered-by-search/status — see CounselorStudentListResponseSchema's own
      // comment on why the dropdown's counts stay stable while the search box is used.
      this.pool.query<CountsRow>(
        `with students as (${STUDENT_STATUS_SELECT})
         select
           count(*) filter (where status = 'completed') as completed,
           count(*) filter (where status = 'in_progress') as in_progress,
           count(*) filter (where status = 'not_started') as not_started,
           count(*) as total
         from students`,
      ),
    ]);

    const countsRow = countsResult.rows[0];
    return {
      students: studentsResult.rows.map((row) => ({
        userId: row.user_id,
        firstName: row.first_name,
        segment: row.segment,
        status: row.status,
      })),
      counts: {
        all: Number(countsRow?.total ?? 0),
        completed: Number(countsRow?.completed ?? 0),
        inProgress: Number(countsRow?.in_progress ?? 0),
        notStarted: Number(countsRow?.not_started ?? 0),
      },
    };
  }

  /**
   * Read-only, for the counselor's copy of a student's Report Card. Reads the student's latest
   * completed career/stream/pathway runs straight from the recommendation schema (rows only, no
   * scoring is re-run) so the counselor sees exactly the matches the student saw; the ring/title/
   * explanation mapping mirrors the recommendation store's own item read.
   */
  async findReportExtras(
    userId: string,
    answerKeys: readonly string[],
  ): Promise<CounselorStudentReportExtras> {
    const [answersResult, matchesResult] = await Promise.all([
      this.pool.query<{ question_key: string; answer_json: { value: string | string[] } }>(
        `select iq.question_key, ia.answer_json
         from assessment.intake_answers ia
         join assessment.intake_questions iq on iq.id = ia.question_id
         where ia.user_id = $1 and iq.question_key = any($2::text[])
         order by ia.answered_at asc`,
        [userId, [...answerKeys]],
      ),
      this.pool.query<MatchRow>(
        `with latest as (
           select distinct on (run.kind) run.id, run.kind
           from recommendation.recommendation_runs run
           join assessment.profile_snapshots ps on ps.id = run.profile_snapshot_id
           where ps.user_id = $1 and run.status = 'completed'
             and run.kind in ('career', 'stream', 'pathway')
           order by run.kind, run.created_at desc
         )
         select latest.kind, item.rank, ring.ring_code,
                item.entity_snapshot_json, item.fit_explanation_json
         from latest
         join recommendation.recommendation_items item on item.recommendation_run_id = latest.id
         left join recommendation.recommendation_rings ring on ring.id = item.ring_id
         where item.rank <= $2
         order by latest.kind, item.rank asc`,
        [userId, MATCHES_PER_KIND],
      ),
    ]);

    // A later answer to the same key (newer question-set version) overrides an earlier one.
    const profileAnswers: Record<string, string> = {};
    for (const row of answersResult.rows) {
      const value = row.answer_json.value;
      if (typeof value === "string" && value.trim()) profileAnswers[row.question_key] = value;
    }

    const matches: CounselorStudentReportExtras["matches"] = {
      career: [],
      stream: [],
      pathway: [],
    };
    for (const row of matchesResult.rows) {
      const title = row.entity_snapshot_json?.title;
      if (!title) continue;
      matches[row.kind].push({
        itemId: row.entity_snapshot_json?.itemId ?? `${row.kind}:${row.rank}`,
        title,
        rank: row.rank,
        ...(row.ring_code ? { ring: row.ring_code } : {}),
        explanation: row.fit_explanation_json ?? {},
      });
    }
    return { profileAnswers, matches };
  }
}
