import { z } from "zod";
import { AssessmentResultSchema } from "./assessment.js";
import { SegmentSchema, UuidSchema } from "./common.js";

/**
 * Counselor dashboard stats (Figma node 779:1815 — "home"). See
 * docs/architecture/counselor-auth-landing-page-plan.md for the auth model these routes reuse
 * (x-yuvapath-counselor-id header, verified against operations.staff_role_assignments on every
 * call — never inferred from the response alone, same as counselor sign-in itself).
 *
 * "In progress" (Figma's "Assessment Paused", renamed per this feature's own spec) and
 * "completed" are counted per DISTINCT student, never per run — a student can have more than one
 * assessment_runs row (retakes, instrument variants), and a student who has ever completed one
 * is never also counted as in-progress even if a separate, newer run is still active. See
 * PgCounselorDashboardRepository's own query comment for the exact definition.
 */
export const CounselorDashboardStatsResponseSchema = z.object({
  totalStudents: z.number().int().nonnegative(),
  assessmentCompleted: z.number().int().nonnegative(),
  assessmentInProgress: z.number().int().nonnegative(),
});
export type CounselorDashboardStatsResponse = z.infer<typeof CounselorDashboardStatsResponseSchema>;

/**
 * A student's assessment-completion bucket, reused verbatim from the same 3-way split
 * PgCounselorDashboardRepository already computes ("completed"/"scored" runs -> completed,
 * an "active" run with no completed one -> in_progress, no run at all -> not_started). Figma
 * node 888:8336 ("counsellor view list")'s status filter only shows "All Students"/"Completed"/
 * "In Progress" (no "Paused", matching PgCounselorDashboardRepository's own comment that
 * 'paused'/'abandoned' are never actually written) — not_started exists here because real data
 * has students who haven't started at all, unlike the Figma mock's 500=420+80 split.
 */
export const CounselorStudentStatusSchema = z.enum(["not_started", "in_progress", "completed"]);
export type CounselorStudentStatus = z.infer<typeof CounselorStudentStatusSchema>;

/** The subset of a student's own profile a counselor's student list/report screens may read —
 *  deliberately narrow (no city/state/email/etc.) since the "View Students" screen (Figma node
 *  888:8336) only ever surfaces a name and a segment on each card. */
export const CounselorStudentSummarySchema = z.object({
  userId: UuidSchema,
  firstName: z.string(),
  segment: SegmentSchema,
  status: CounselorStudentStatusSchema,
});
export type CounselorStudentSummary = z.infer<typeof CounselorStudentSummarySchema>;

/** Counts are always computed over the full (unfiltered-by-search) student set, independent of
 *  whichever `status`/`search` combination the request itself used — this is what lets the
 *  status-filter dropdown show a stable count next to each option (matching Figma's own
 *  "All Students — 500", "Completed — 420", "In Progress — 80" dropdown rows) rather than a
 *  count that shifts as the counselor types into the search box. */
export const CounselorStudentListResponseSchema = z.object({
  students: z.array(CounselorStudentSummarySchema),
  counts: z.object({
    all: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    notStarted: z.number().int().nonnegative(),
  }),
});
export type CounselorStudentListResponse = z.infer<typeof CounselorStudentListResponseSchema>;

export const CounselorStudentListQuerySchema = z.object({
  // Name-only: the student profile schema has no school/institution field to search against
  // (see UserProfileSchema in profile.ts), unlike Figma's "Search by student name or school"
  // placeholder copy.
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["all", "completed", "in_progress", "not_started"]).optional(),
});
export type CounselorStudentListQuery = z.infer<typeof CounselorStudentListQuerySchema>;

/** One stored top match (career/stream/pathway) as the Report Card shows it: the same fields the
 *  student's own report reads from RecommendationItem, minus ids/scores the card never displays. */
export const CounselorReportMatchSchema = z.object({
  itemId: z.string().min(1),
  title: z.string().min(1),
  rank: z.number().int().positive(),
  ring: z.enum(["inner", "middle", "outer"]).optional(),
  explanation: z.record(z.string(), z.unknown()),
});
export type CounselorReportMatch = z.infer<typeof CounselorReportMatchSchema>;

/** Backs GET /api/v1/counselor/students/:studentId/report — a counselor-gated read of one
 *  student's own latest RIASEC result, independent of the run/journey-session ownership check
 *  AssessmentService.scoreRun applies for the student's own self-service results page
 *  (RiasecResultsPage); authorization here is "caller is an active counselor" only, verified by
 *  the same CounselorDirectory.isActiveCounselor check every other counselor route uses. `result`
 *  is null when the student hasn't completed a RIASEC run yet (status "not_started"/"in_progress"). */
export const CounselorStudentReportResponseSchema = z.object({
  profile: z.object({
    userId: UuidSchema,
    firstName: z.string(),
    segment: SegmentSchema,
    ageAtOnboarding: z.number().int(),
    city: z.string(),
    state: z.string(),
    countryCode: z.string(),
  }),
  result: AssessmentResultSchema.nullable(),
  /** Non-sensitive, single-value intake answers by question key (what the Profile tags read). */
  profileAnswers: z.record(z.string(), z.string()),
  /** Top stored matches per kind from the student's latest completed runs. */
  matches: z.object({
    career: z.array(CounselorReportMatchSchema),
    stream: z.array(CounselorReportMatchSchema),
    pathway: z.array(CounselorReportMatchSchema),
  }),
});
export type CounselorStudentReportResponse = z.infer<typeof CounselorStudentReportResponseSchema>;
