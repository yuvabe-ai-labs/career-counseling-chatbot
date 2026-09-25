import type { Pool } from "pg";
import type {
  CounselorDashboardRepository,
  CounselorDashboardStats,
} from "../application/counselor-dashboard-repository.js";

type StatsRow = {
  total_students: string;
  assessment_completed: string;
  assessment_in_progress: string;
};

/**
 * Only 3 of the 6 documented assessment_runs.status values are ever written by real application
 * code: 'active', 'completed', 'scored' ('created', 'paused', 'abandoned' are not — confirmed by
 * reading every writer of this column). "Assessment Paused" in the Figma design is therefore
 * renamed to "Assessment In Progress" here and counts 'active' runs instead, per this feature's
 * own spec.
 *
 * Both "completed" and "in progress" are counted per DISTINCT student, never per run — a student
 * can have more than one assessment_runs row (retakes, instrument variants). A student who has
 * ever completed one run counts as completed even if a separate, newer run of theirs is still
 * active, so the two counts never double-count the same student.
 */
export class PgCounselorDashboardRepository implements CounselorDashboardRepository {
  constructor(private readonly pool: Pool) {}

  async getStats(): Promise<CounselorDashboardStats> {
    const result = await this.pool.query<StatsRow>(
      `with completed_students as (
        select distinct user_id
        from assessment.assessment_runs
        where status in ('completed', 'scored')
      ),
      in_progress_students as (
        select distinct ar.user_id
        from assessment.assessment_runs ar
        where ar.status = 'active'
          and ar.user_id not in (select user_id from completed_students)
      )
      select
        (select count(*) from assessment.user_profiles where deleted_at is null) as total_students,
        (select count(*) from completed_students) as assessment_completed,
        (select count(*) from in_progress_students) as assessment_in_progress`,
    );
    const row = result.rows[0];
    return {
      totalStudents: Number(row?.total_students ?? 0),
      assessmentCompleted: Number(row?.assessment_completed ?? 0),
      assessmentInProgress: Number(row?.assessment_in_progress ?? 0),
    };
  }
}
