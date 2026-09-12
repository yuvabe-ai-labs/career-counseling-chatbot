import type { Pool } from "pg";

// Deterministic catalog-coverage gap detection
// (docs/poc/ai-assisted-catalog-implementation-plan.md §9). Every check here is a plain
// counting query against already-published/verified rows — no Gemini, no heuristics that could
// vary run to run. This module is read-only and is meant to run as an offline/scheduled batch
// (e.g. from a CLI script), never from a live student request — a thin/empty result here never
// blocks or degrades a live recommendation; it only feeds the next offline generation run.

// The 15 unordered RIASEC letter pairs, each written in the same canonical (tie-order) form
// recommendation-data-source.ts's canonicalizeRiasecPair() produces — see that file's own
// comment for why the ordering matters.
const RIASEC_ORDER = ["R", "I", "A", "S", "E", "C"] as const;
export const ALL_RIASEC_PAIRS: readonly string[] = RIASEC_ORDER.flatMap((left, leftIndex) =>
  RIASEC_ORDER.slice(leftIndex + 1).map((right) => `${left}${right}`),
);

export type CatalogGap =
  | { type: "no_stream_candidates"; topTwoCode: string }
  | { type: "thin_stream_candidates"; topTwoCode: string; count: number; threshold: number }
  | { type: "no_pathway_for_career"; careerId: string; careerTitle: string }
  | { type: "no_discipline_mapping"; pathwayId: string; pathwayTitle: string }
  | { type: "no_verified_colleges"; state: string; disciplineCode: string }
  | { type: "thin_colleges_in_scope"; state: string; disciplineCode: string; count: number; threshold: number }
  | { type: "missing_college_programs"; collegeId: string; collegeName: string };

export type DetectCatalogGapsOptions = {
  /** Below this many published stream options for a RIASEC pair, flag it as "thin". Default 2. */
  thinStreamThreshold?: number;
  /** Below this many verified colleges for a (state, discipline) pair, flag it as "thin". Default 5. */
  thinCollegeThreshold?: number;
  /**
   * College coverage gaps are only checked for these (state, disciplineCode) pairs — geographic/
   * discipline priority is a product decision (plan §8/§28), not something this function
   * guesses. Omit to skip college coverage checks entirely.
   */
  collegeCoverageTargets?: ReadonlyArray<{ state: string; disciplineCode: string }>;
  /** Cap how many "career has no pathway" gaps are returned in one call (default 100). */
  maxPathwayGaps?: number;
};

export async function detectCatalogGaps(
  pool: Pool,
  options: DetectCatalogGapsOptions = {},
): Promise<CatalogGap[]> {
  const thinStreamThreshold = options.thinStreamThreshold ?? 2;
  const thinCollegeThreshold = options.thinCollegeThreshold ?? 5;

  const [streamGaps, pathwayGaps, disciplineMappingGaps, collegeGaps, programGaps] = await Promise.all([
    detectStreamGaps(pool, thinStreamThreshold),
    detectPathwayGaps(pool, options.maxPathwayGaps ?? 100),
    detectDisciplineMappingGaps(pool),
    detectCollegeCoverageGaps(pool, thinCollegeThreshold, options.collegeCoverageTargets ?? []),
    detectMissingCollegeProgramGaps(pool),
  ]);

  return [...streamGaps, ...pathwayGaps, ...disciplineMappingGaps, ...collegeGaps, ...programGaps];
}

async function detectStreamGaps(pool: Pool, threshold: number): Promise<CatalogGap[]> {
  const result = await pool.query<{ top_two_code: string; candidate_count: string }>(
    `select
      pair.code as top_two_code,
      count(item.stream_option_id) as candidate_count
    from unnest($1::text[]) as pair(code)
    left join knowledge.stream_maps map
      on map.top_two_code = pair.code and map.status = 'published'
    left join knowledge.stream_map_items item on item.map_id = map.id
    left join knowledge.stream_options stream
      on stream.id = item.stream_option_id and stream.status = 'active'
    group by pair.code
    order by pair.code`,
    [ALL_RIASEC_PAIRS],
  );

  return result.rows.flatMap((row): CatalogGap[] => {
    const count = Number(row.candidate_count);
    if (count === 0) {
      return [{ type: "no_stream_candidates", topTwoCode: row.top_two_code }];
    }
    if (count < threshold) {
      return [{ type: "thin_stream_candidates", topTwoCode: row.top_two_code, count, threshold }];
    }
    return [];
  });
}

async function detectPathwayGaps(pool: Pool, limit: number): Promise<CatalogGap[]> {
  const result = await pool.query<{ id: string; title: string }>(
    `select career.id, career.title
    from knowledge.careers career
    left join knowledge.career_pathways cp on cp.career_id = career.id
    where career.publication_status = 'published' and cp.pathway_id is null
    order by career.title asc
    limit $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    type: "no_pathway_for_career" as const,
    careerId: row.id,
    careerTitle: row.title,
  }));
}

async function detectDisciplineMappingGaps(pool: Pool): Promise<CatalogGap[]> {
  const result = await pool.query<{ id: string; title: string }>(
    `select pathway.id, pathway.title
    from knowledge.pathways pathway
    left join knowledge.pathway_disciplines pd on pd.pathway_id = pathway.id
    where pathway.publication_status = 'published'
    group by pathway.id, pathway.title
    having count(pd.discipline_id) = 0`,
  );

  return result.rows.map((row) => ({
    type: "no_discipline_mapping" as const,
    pathwayId: row.id,
    pathwayTitle: row.title,
  }));
}

async function detectCollegeCoverageGaps(
  pool: Pool,
  threshold: number,
  targets: ReadonlyArray<{ state: string; disciplineCode: string }>,
): Promise<CatalogGap[]> {
  const gaps: CatalogGap[] = [];
  for (const target of targets) {
    const result = await pool.query<{ verified_count: string }>(
      `select count(distinct college.id) as verified_count
      from knowledge.colleges college
      join knowledge.college_programs program
        on program.college_id = college.id and program.verification_status = 'verified'
      join knowledge.disciplines discipline on discipline.id = program.discipline_id
      where college.verification_status = 'verified'
        and college.state = $1
        and discipline.discipline_code = $2`,
      [target.state, target.disciplineCode],
    );
    const count = Number(result.rows[0]?.verified_count ?? 0);
    if (count === 0) {
      gaps.push({ type: "no_verified_colleges", state: target.state, disciplineCode: target.disciplineCode });
    } else if (count < threshold) {
      gaps.push({
        type: "thin_colleges_in_scope",
        state: target.state,
        disciplineCode: target.disciplineCode,
        count,
        threshold,
      });
    }
  }
  return gaps;
}

async function detectMissingCollegeProgramGaps(pool: Pool): Promise<CatalogGap[]> {
  const result = await pool.query<{ id: string; name: string }>(
    `select college.id, college.name
    from knowledge.colleges college
    left join knowledge.college_programs program
      on program.college_id = college.id and program.verification_status = 'verified'
    where college.verification_status = 'verified'
    group by college.id, college.name
    having count(program.id) = 0`,
  );

  return result.rows.map((row) => ({
    type: "missing_college_programs" as const,
    collegeId: row.id,
    collegeName: row.name,
  }));
}
