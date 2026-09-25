import type {
  AidSchemeCatalogRecord,
  CareerCatalogRecord,
  CollegeCatalogRecord,
  LocationPreference,
  MatchingConfig,
  PathwayCatalogRecord,
  PlanTemplateCatalogRecord,
  ProfileSnapshotForRecommendations,
  RiasecLetter,
  RiasecVector,
  StreamCatalogRecord,
  TnDistrict,
} from "@yuvapath/contracts";
import type { Pool } from "pg";
import type { FeasibilityRule } from "../domain/career-matching.js";
import type { StoredFacts } from "../domain/aid-recommendations.js";
import { ALL_TN_DISTRICTS } from "../domain/tn-district-regions.js";

const RIASEC_TIE_ORDER: [RiasecLetter, RiasecLetter, RiasecLetter, RiasecLetter, RiasecLetter, RiasecLetter] = [
  "R",
  "I",
  "A",
  "S",
  "E",
  "C",
];

export type RecommendationDataSource = {
  loadProfile(profileSnapshotId: string): Promise<ProfileSnapshotForRecommendations>;
  loadActiveConfig(configurationKey: string): Promise<MatchingConfig>;
  loadFeasibilityRules(config: MatchingConfig): Promise<FeasibilityRule[]>;
  loadCareers(): Promise<CareerCatalogRecord[]>;
  loadStreams(
    profile: ProfileSnapshotForRecommendations,
    limit?: number,
    rankedCareerIds?: string[],
  ): Promise<StreamCatalogRecord[]>;
  loadPathways(limit?: number): Promise<PathwayCatalogRecord[]>;
  loadColleges(limit?: number): Promise<CollegeCatalogRecord[]>;
  loadAidSchemes(limit?: number): Promise<AidSchemeCatalogRecord[]>;
  loadPlanTemplates(limit?: number): Promise<PlanTemplateCatalogRecord[]>;
  loadStoredFacts(profile: ProfileSnapshotForRecommendations): StoredFacts;
  loadLatestRankedEntityIds(
    profileSnapshotId: string,
    kind: "career" | "stream" | "pathway",
  ): Promise<string[]>;
  loadTargetDisciplineIds(pathwayId: string | undefined): Promise<string[]>;
  // Iteration 3 Phase A (docs/architecture/pathway-college-mapping-iteration-3-plan.md). The
  // pathway's own qualification, derived from its title the same way
  // countCollegesMatchingPathwayQualification() already does for Pathway's own scoring —
  // reused here so College's eligibility filter respects it too. undefined for an unresolved
  // pathwayId, never a guess.
  loadPathwayProgramType(pathwayId: string | undefined): Promise<string | undefined>;
  // Replaces the old loadTargetDisciplineIdsForCareer(), which unioned disciplines across EVERY
  // pathway linked to a career — the exact same qualification-leak shape as the primary
  // resolution path had before Phase A, just one level removed. Narrowed to return only the
  // single top-priority linked pathway (same relationship_type/display_order ordering as
  // before), so the career-fallback route resolves to one real pathway and reuses
  // loadTargetDisciplineIds()/loadPathwayProgramType() exactly like the primary path does.
  loadTopPathwayIdForCareer(careerId: string | undefined): Promise<string | undefined>;
};

export function createPostgresRecommendationDataSource(pool: Pool): RecommendationDataSource {
  return {
    async loadProfile(profileSnapshotId) {
      const result = await pool.query<{
        id: string;
        profile_version: number;
        segment: "explorer" | "pathfinder" | "launcher";
        state: string;
        home_district: string | null;
        intake_summary_json: Record<string, unknown>;
        result_summary_json: Record<string, unknown>;
        payload_hash: string;
      }>(
        `select
          id,
          profile_version,
          segment,
          state,
          home_district,
          intake_summary_json,
          result_summary_json,
          payload_hash
        from assessment.profile_snapshots
        where id = $1`,
        [profileSnapshotId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(`Profile snapshot ${profileSnapshotId} was not found`);
      }

      return {
        profileSnapshotId: row.id,
        profileVersion: String(row.profile_version),
        profileHash: row.payload_hash,
        segment: row.segment,
        state: row.state,
        // A direct column read, unlike marksBand/locationPreference below — home_district is a
        // real assessment.profile_snapshots column (see the 20260923000100 migration), not an
        // intake_summary_json entry, so it deliberately skips readFirstString() (which has a
        // confirmed unwrapping bug for that {value: "..."}-shaped path — see
        // ensure-profile-snapshot.ts on the frontend for where that was first found).
        ...optionalHomeDistrict(row.home_district ?? undefined),
        ...optionalString("marksBand", readFirstString(row.intake_summary_json, ["marksBand", "marks_band"])),
        ...optionalLocationPreference(
          readFirstString(row.intake_summary_json, ["locationPreference", "location_preference"]),
        ),
        riasec: readRiasecVector(row.result_summary_json),
        ...optionalVector("workValues", readWorkValues(row.result_summary_json)),
      };
    },

    async loadActiveConfig(configurationKey) {
      return loadConfigByKey(pool, configurationKey);
    },

    async loadFeasibilityRules(config) {
      const result = await pool.query<{
        segment: ProfileSnapshotForRecommendations["segment"];
        marks_band: string;
        education_route_id: string;
        reachability: string;
        priority: number;
      }>(
        `select
          rule.segment,
          rule.marks_band,
          rule.education_route_id,
          rule.reachability,
          rule.priority
        from recommendation.feasibility_rules rule
        join recommendation.matching_configurations config on config.id = rule.configuration_id
        where config.algorithm_version = $1 and config.version = $2
        order by rule.priority asc`,
        [config.algorithmVersion, config.weightsVersion],
      );

      return result.rows.map((row) => ({
        segment: row.segment,
        marksBand: row.marks_band,
        routeId: row.education_route_id,
        reachability: normalizeReachability(row.reachability),
        priority: row.priority,
      }));
    },

    async loadCareers() {
      const result = await pool.query<{
        id: string;
        title: string;
        dataset_version: string;
        route_ids: string[];
        route_levels: string[];
        realistic: string;
        investigative: string;
        artistic: string;
        social: string;
        enterprising: string;
        conventional: string;
        achievement: string | null;
        independence: string | null;
        recognition: string | null;
        relationships: string | null;
        support: string | null;
        working_conditions: string | null;
      }>(
        `select
          career.id,
          career.title,
          dataset.version as dataset_version,
          array_remove(array_agg(distinct route.id), null) as route_ids,
          array_remove(array_agg(distinct route.route_level), null) as route_levels,
          interest.realistic,
          interest.investigative,
          interest.artistic,
          interest.social,
          interest.enterprising,
          interest.conventional,
          value_profile.achievement,
          value_profile.independence,
          value_profile.recognition,
          value_profile.relationships,
          value_profile.support,
          value_profile.working_conditions
        from knowledge.careers career
        join knowledge.dataset_versions dataset on dataset.id = career.dataset_version_id
        join knowledge.career_interest_profiles interest on interest.career_id = career.id
        left join knowledge.career_value_profiles value_profile on value_profile.career_id = career.id
        left join knowledge.career_pathways career_pathway on career_pathway.career_id = career.id
        left join knowledge.pathways pathway on pathway.id = career_pathway.pathway_id
        left join knowledge.education_routes route
          on route.id = coalesce(pathway.education_route_id, career.primary_education_route_id)
        where career.publication_status = 'published'
        group by career.id, dataset.version, interest.career_id, value_profile.career_id
        order by career.title asc`,
      );

      return result.rows.map((row) => ({
        careerId: row.id,
        title: row.title,
        riasec: {
          R: Number(row.realistic),
          I: Number(row.investigative),
          A: Number(row.artistic),
          S: Number(row.social),
          E: Number(row.enterprising),
          C: Number(row.conventional),
        },
        routeIds: row.route_ids.length === 0 ? ["00000000-0000-4000-8000-000000000000"] : row.route_ids,
        datasetVersion: row.dataset_version,
        verified: true,
        isVocationalRoute: row.route_levels.some((level) =>
          ["certificate", "iti", "diploma", "open"].includes(level),
        ),
        ...optionalVector("workValues", readCareerWorkValues(row)),
      }));
    },

    async loadStreams(profile, limit, rankedCareerIds = []) {
      const topTwo = topRiasecCode(profile.riasec);
      const result = await pool.query<{
        id: string;
        title: string;
        description: string;
        rank: number;
        top_two_code: string;
        map_segment: "explorer" | "pathfinder" | "launcher" | null;
        dataset_version: string;
      }>(
        `select
          stream.id,
          stream.title,
          stream.description,
          item.rank,
          map.top_two_code,
          map.segment as map_segment,
          dataset.version as dataset_version
        from knowledge.stream_maps map
        join knowledge.stream_map_items item on item.map_id = map.id
        join knowledge.stream_options stream on stream.id = item.stream_option_id
        join knowledge.dataset_versions dataset on dataset.id = map.dataset_version_id
        where map.status = 'published'
          and stream.status = 'active'
          and map.top_two_code = $1
          and (map.segment = $2 or map.segment is null)
        order by item.rank asc, stream.title asc
        limit $3`,
        [topTwo, profile.segment, limit ?? null],
      );

      // A stream_maps row scoped to the student's own segment always wins over a
      // NULL ("general", applies-to-every-segment) row for the same RIASEC pair —
      // the NULL rows only fill in where no segment-specific content exists yet.
      // See knowledge.stream_maps.segment (20260731000100_m3_stream_map_segment.sql):
      // the column was added specifically so this differentiation is possible; the
      // catalog loader previously ignored it entirely (fixed here).
      const segmentSpecificRows = result.rows.filter((row) => row.map_segment === profile.segment);
      const rows = segmentSpecificRows.length > 0
        ? segmentSpecificRows
        : result.rows.filter((row) => row.map_segment === null);
      const recommendedSegments: StreamCatalogRecord["recommendedSegments"] =
        segmentSpecificRows.length > 0
          ? [profile.segment]
          : ["explorer", "pathfinder", "launcher"];

      const riasecCandidates = new Map<string, StreamCatalogRecord>(
        rows.map((row) => [
          row.id,
          {
            streamId: row.id,
            title: row.title,
            description: row.description,
            riasecLetters: row.top_two_code.split("").filter(isRiasecLetter),
            recommendedSegments,
            priority: row.rank,
            datasetVersion: row.dataset_version,
            verified: true,
          },
        ]),
      );

      // Career -> Stream mapping layer (Iteration 1, see
      // docs/architecture/career-stream-mapping-iteration-1-plan.md). Additive, never a
      // replacement: every stream the RIASEC-pair path above already found stays a candidate
      // unchanged (just gains careerLinks if it also has a knowledge.career_streams row); a
      // stream reachable ONLY via a ranked career is synthesized as a new candidate so
      // scoreStreams() can surface it even outside the student's RIASEC-pair match. Skipped
      // entirely when rankedCareerIds is empty (no stored Career run yet) — the whole function
      // then behaves exactly as it did before this iteration.
      if (rankedCareerIds.length > 0) {
        const linkResult = await pool.query<{
          id: string;
          title: string;
          description: string;
          career_id: string;
          weight: string;
        }>(
          `select stream.id, stream.title, stream.description, link.career_id, link.weight
          from knowledge.career_streams link
          join knowledge.stream_options stream on stream.id = link.stream_option_id
          where stream.status = 'active'
            and link.career_id = any($1::uuid[])`,
          [rankedCareerIds],
        );

        if (linkResult.rows.length > 0) {
          // No per-row provenance exists for a career_streams link (see the table's own
          // comment) or for stream_options itself — stamp career-only-reached candidates with
          // the catalog's current published version rather than inventing a fake one. Fetched
          // lazily (only once, only if actually needed) so a run where every linked stream is
          // already in the RIASEC-pair set issues no extra query.
          let fallbackDatasetVersion: string | undefined;

          for (const row of linkResult.rows) {
            const existing = riasecCandidates.get(row.id);
            const link = { careerId: row.career_id, weight: Number(row.weight) };
            if (existing) {
              existing.careerLinks = [...(existing.careerLinks ?? []), link];
              continue;
            }
            fallbackDatasetVersion ??= await loadLatestPublishedDatasetVersion(pool);
            riasecCandidates.set(row.id, {
              streamId: row.id,
              title: row.title,
              description: row.description,
              // Synthesized candidate has no stream_maps row of its own to borrow a RIASEC
              // pair from (see loadStreams()'s pre-existing riasecLetters comment elsewhere in
              // this codebase) — empty is honest here, not a guess; riasecOverlap simply
              // scores 0 for it, same as any stream outside the student's RIASEC-pair match.
              riasecLetters: [],
              recommendedSegments: ["explorer", "pathfinder", "launcher"],
              priority: 100,
              datasetVersion: fallbackDatasetVersion,
              verified: true,
              careerLinks: [link],
            });
          }
        }
      }

      return [...riasecCandidates.values()];
    },

    async loadPathways(limit) {
      // Same reasoning as loadCareers()'s own comment: rank the complete published catalogue by
      // default. Limiting before scoring discards the student's best matches whenever they sort
      // later than whatever the cap happens to be — with more than `limit` published pathways
      // (already true today), `order by title asc limit N` truncates alphabetically BEFORE
      // scorePathways() ever runs, so every pathway past that cutoff is invisible to every
      // student regardless of fit. `limit $1` with a null parameter is unlimited in Postgres, so
      // this only actually caps the result when a caller explicitly asks for one.
      const [result, collegeProgramsByPathway] = await Promise.all([
        pool.query<{
          id: string;
          title: string;
          career_ids: string[];
          stream_option_ids: string[];
          dataset_version: string;
          route_level: string | null;
          backup_route_note: string | null;
        }>(
          `select
            pathway.id,
            pathway.title,
            array_remove(array_agg(distinct career_pathway.career_id), null) as career_ids,
            array_remove(array_agg(distinct stream_pathway.stream_option_id), null) as stream_option_ids,
            dataset.version as dataset_version,
            route.route_level,
            pathway.backup_route_note
          from knowledge.pathways pathway
          join knowledge.dataset_versions dataset on dataset.id = pathway.dataset_version_id
          join knowledge.education_routes route on route.id = pathway.education_route_id
          left join knowledge.career_pathways career_pathway on career_pathway.pathway_id = pathway.id
          left join knowledge.stream_pathways stream_pathway on stream_pathway.pathway_id = pathway.id
          where pathway.publication_status = 'published'
          group by pathway.id, dataset.version, route.route_level
          order by pathway.title asc
          limit $1`,
          [limit ?? null],
        ),
        loadPathwayCollegeProgramsByDiscipline(pool),
      ]);

      return result.rows.map((row, index) => ({
        pathwayId: row.id,
        title: row.title,
        careerIds: row.career_ids.length === 0 ? ["00000000-0000-4000-8000-000000000000"] : row.career_ids,
        // Iteration 2 (docs/architecture/stream-pathway-mapping-iteration-2-plan.md). Same
        // empty-set-sentinel convention as careerIds just above, for the same reason —
        // rankedAlignment()'s matchedIds.length === 0 check must only ever mean "genuinely no
        // overlap," never "this pathway happens to have zero real stream links."
        streamOptionIds:
          row.stream_option_ids.length === 0 ? ["00000000-0000-4000-8000-000000000000"] : row.stream_option_ids,
        recommendedSegments: ["explorer", "pathfinder", "launcher"],
        reachability: routeReachability(row.route_level),
        hasBackupRoute: Boolean(row.backup_route_note),
        // Real, qualification-aware availability — not just "colleges offering this discipline at
        // all". Two pathways can share a discipline (e.g. "B.E./B.Tech. in Visual Communication &
        // Design" and "B.Sc in Visual Communication & Design" both link to the same
        // "visual-communication-design" discipline) while being wildly different in how many
        // colleges actually offer THAT pathway's own qualification — 9 vs 136 here — and only
        // counting the ones that match the pathway's own qualification (parsed from its title via
        // the same deriveProgramType() used for college programs) captures that. Counting every
        // college offering the discipline under ANY qualification made both variants look equally
        // available and left the tie to fall back to an arbitrary alphabetical priority again.
        collegeCount: countCollegesMatchingPathwayQualification(
          row.title,
          collegeProgramsByPathway.get(row.id) ?? [],
        ),
        priority: index + 1,
        datasetVersion: row.dataset_version,
        verified: true,
      }));
    },

    async loadColleges(limit) {
      // Same reasoning as loadPathways() above (and loadCareers()'s original comment) — load the
      // complete verified catalogue by default; `limit $1` with a null parameter is unlimited.
      // `state = 'Tamil Nadu'` is an explicit eligibility gate, not just a reflection of current
      // data — see docs/recommendation-pipeline-explained.md's Tamil Nadu-Only College
      // Recommendation section for why this is enforced here rather than left implicit.
      //
      // Programmes are returned as a per-programme JSON array (discipline + program_name +
      // admission_route together), not a flattened discipline-id list — eligibility filtering
      // needs to check that ONE programme satisfies both the target discipline AND any selected
      // programme-level filter (programType/admissionRoute) at once. A college with "B.Sc
      // Computer Science" and separately "B.Voc Software Development" must not look eligible for
      // "Computer Science + B.Voc" just because each half matches a different programme.
      const result = await pool.query<{
        id: string;
        name: string;
        state: string;
        city: string;
        tier: number | null;
        institution_type: string;
        programs_json: Array<{ discipline_id: string; program_name: string; admission_route: string }>;
        dataset_version: string;
      }>(
        `select
          college.id,
          college.name,
          college.state,
          college.city,
          college.tier,
          college.institution_type,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'discipline_id', program.discipline_id,
                'program_name', program.program_name,
                'admission_route', program.admission_route
              )
            ) filter (where program.id is not null),
            '[]'
          ) as programs_json,
          dataset.version as dataset_version
        from knowledge.colleges college
        join knowledge.dataset_versions dataset on dataset.id = college.dataset_version_id
        left join knowledge.college_programs program
          on program.college_id = college.id and program.verification_status = 'verified'
        where college.verification_status = 'verified'
          and college.state = 'Tamil Nadu'
        group by college.id, college.name, college.state, college.city, college.tier,
          college.institution_type, dataset.version
        order by college.name asc
        limit $1`,
        [limit ?? null],
      );

      return result.rows.map((row) => ({
        collegeId: row.id,
        title: row.name,
        state: row.state,
        district: row.city,
        instituteKind: deriveInstituteKind(row.institution_type),
        ownership: deriveOwnership(row.institution_type),
        tier: row.tier ?? 3,
        programs: row.programs_json.map((program) => ({
          disciplineId: program.discipline_id,
          programType: deriveProgramType(program.program_name),
          admissionRoute: program.admission_route,
        })),
        datasetVersion: row.dataset_version,
        verified: true,
      }));
    },

    async loadAidSchemes(limit = 30) {
      const result = await pool.query<{
        id: string;
        name: string;
        application_url: string;
        dataset_version: string;
        criteria_json: Array<{ factKey: string; acceptedValues?: string[] }>;
      }>(
        `select
          scheme.id,
          scheme.name,
          scheme.application_url,
          dataset.version as dataset_version,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'factKey', criterion.criterion_type,
                'acceptedValues', criterion.value_json
              )
            ) filter (where criterion.id is not null),
            '[]'::jsonb
          ) as criteria_json
        from knowledge.aid_schemes scheme
        join knowledge.dataset_versions dataset on dataset.id = scheme.dataset_version_id
        left join knowledge.aid_criteria criterion on criterion.aid_scheme_id = scheme.id
        where scheme.verification_status = 'verified'
        group by scheme.id, dataset.version
        order by scheme.name asc
        limit $1`,
        [limit],
      );

      return result.rows
        .filter((row) => row.criteria_json.length > 0)
        .map((row, index) => ({
          aidSchemeId: row.id,
          title: row.name,
          criteria: row.criteria_json.map((criterion) => ({
            factKey: normalizeFactKey(criterion.factKey),
            acceptedValues: normalizeAcceptedValues(criterion.acceptedValues),
          })),
          priority: index + 1,
          sourceUrl: row.application_url,
          datasetVersion: row.dataset_version,
          verified: true,
        }));
    },

    async loadPlanTemplates(limit = 30) {
      const result = await pool.query<{
        id: string;
        template_key: string;
        segment: "explorer" | "pathfinder" | "launcher";
        plan_type: "exploration" | "pathway" | "career_90_day";
        version: string;
        steps_json: Array<{
          stepOrder: number;
          timeWindow: string;
          actionTemplate: string;
          isOptional: boolean;
        }>;
      }>(
        `select
          template.id,
          template.template_key,
          template.segment,
          template.plan_type,
          template.version,
          jsonb_agg(
            jsonb_build_object(
              'stepOrder', step.step_order,
              'timeWindow', step.time_window,
              'actionTemplate', step.action_key,
              'isOptional', step.is_optional
            )
            order by step.step_order asc
          ) as steps_json
        from recommendation.plan_templates template
        join recommendation.plan_template_steps step on step.plan_template_id = template.id
        where template.status = 'approved'
        group by template.id
        order by template.template_key asc
        limit $1`,
        [limit],
      );

      return result.rows.map((row, index) => ({
        planTemplateId: row.id,
        title: row.template_key,
        segment: row.segment,
        planType: row.plan_type,
        priority: index + 1,
        steps: row.steps_json,
        datasetVersion: row.version,
        verified: true,
      }));
    },

    loadStoredFacts(profile) {
      return {
        state: profile.state,
        marksBand: profile.marksBand,
        segment: profile.segment,
      };
    },

    async loadLatestRankedEntityIds(profileSnapshotId, kind) {
      // Only the single most recent completed run: joining every run concatenated earlier
      // rankings, so repeat visits duplicated ids and shifted rankedAlignment scores.
      const result = await pool.query<{ entity_id: string }>(
        `with latest_run as (
          select run.id
          from recommendation.recommendation_runs run
          where run.profile_snapshot_id = $1
            and run.kind = $2
            and run.status = 'completed'
          order by run.completed_at desc nulls last, run.created_at desc
          limit 1
        )
        select coalesce(
          item.career_id,
          item.stream_option_id,
          item.pathway_id,
          item.college_id,
          item.aid_scheme_id
        ) as entity_id
        from latest_run
        join recommendation.recommendation_items item on item.recommendation_run_id = latest_run.id
        order by item.rank asc`,
        [profileSnapshotId, kind],
      );

      return result.rows.map((row) => row.entity_id).filter(Boolean);
    },

    async loadTargetDisciplineIds(pathwayId) {
      if (!pathwayId) {
        return [];
      }

      const result = await pool.query<{ discipline_id: string }>(
        `select discipline_id
        from knowledge.pathway_disciplines
        where pathway_id = $1
        order by relevance_weight desc`,
        [pathwayId],
      );

      return result.rows.map((row) => row.discipline_id);
    },

    async loadPathwayProgramType(pathwayId) {
      if (!pathwayId) {
        return undefined;
      }

      const result = await pool.query<{ title: string }>(
        `select title from knowledge.pathways where id = $1`,
        [pathwayId],
      );

      const title = result.rows[0]?.title;
      return title ? deriveProgramType(title) : undefined;
    },

    // Fallback for segments/requests with no ranked pathway to key off (chiefly Launcher, whose
    // Stream/Pathway tabs are always off per tabsToShow() — deriveSegment() only puts students
    // already past the "which pathway" decision into Launcher — so loadLatestRankedEntityIds(…,
    // "pathway") is always empty for them, and college eligibility would otherwise resolve to
    // the empty set every time, showing "no eligible colleges" even though College is meant to
    // be on for them). Every segment gets a career recommendation, so walking the student's
    // top-ranked career to its single top-priority linked pathway (same "only what fits what
    // they matched with" narrowing the primary route already applies) gives the caller one real
    // pathway id to resolve disciplines/programType from exactly like the primary path does —
    // see docs/architecture/pathway-college-mapping-iteration-3-plan.md §A.3 for why this no
    // longer unions every linked pathway's disciplines the way it used to.
    async loadTopPathwayIdForCareer(careerId) {
      if (!careerId) {
        return undefined;
      }

      const result = await pool.query<{ pathway_id: string }>(
        `select career_pathway.pathway_id
        from knowledge.career_pathways career_pathway
        join knowledge.pathways pathway on pathway.id = career_pathway.pathway_id
        where career_pathway.career_id = $1 and pathway.publication_status = 'published'
        order by case career_pathway.relationship_type
          when 'primary' then 0 when 'alternative' then 1 else 2 end,
          career_pathway.display_order asc
        limit 1`,
        [careerId],
      );

      return result.rows[0]?.pathway_id;
    },
  };
}

// Every verified college programme offered in any pathway's linked discipline(s), grouped by
// pathway — raw (not yet counted/deduped) because counting has to happen AFTER filtering down to
// programmes matching that specific pathway's own qualification (see
// countCollegesMatchingPathwayQualification()); the qualification match can only be checked once
// each pathway's own title is available, so it can't be done inside this single up-front query.
// One query for every pathway at once (not a per-pathway correlated subquery) so a 158-pathway
// loadPathways() call stays fast.
async function loadPathwayCollegeProgramsByDiscipline(
  pool: Pool,
): Promise<Map<string, Array<{ collegeId: string; programName: string }>>> {
  const result = await pool.query<{ pathway_id: string; college_id: string; program_name: string }>(
    `select distinct pd.pathway_id, program.college_id, program.program_name
    from knowledge.pathway_disciplines pd
    join knowledge.college_programs program
      on program.discipline_id = pd.discipline_id and program.verification_status = 'verified'
    join knowledge.colleges college
      on college.id = program.college_id and college.verification_status = 'verified'`,
  );

  const byPathway = new Map<string, Array<{ collegeId: string; programName: string }>>();
  for (const row of result.rows) {
    const programs = byPathway.get(row.pathway_id) ?? [];
    programs.push({ collegeId: row.college_id, programName: row.program_name });
    byPathway.set(row.pathway_id, programs);
  }
  return byPathway;
}

// This is the real signal behind scorePathways()'s collegeAvailability: a pathway offered at 1
// college and one offered at 1000 colleges are not equally "reachable" in practice, even when
// every other catalog fact about them (route level, backup route, segment) is identical — see
// the investigation that led here (a niche B.E./B.Tech variant of a subject outranking the much
// more available B.Sc variant of the exact same subject, purely on an arbitrary alphabetical
// tie-break, because both variants share one discipline and every OTHER real signal is also
// identical between them).
function countCollegesMatchingPathwayQualification(
  pathwayTitle: string,
  candidatePrograms: Array<{ collegeId: string; programName: string }>,
): number {
  const pathwayQualification = deriveProgramType(pathwayTitle);
  const matchingCollegeIds = new Set(
    candidatePrograms
      .filter((program) => deriveProgramType(program.programName) === pathwayQualification)
      .map((program) => program.collegeId),
  );
  return matchingCollegeIds.size;
}

async function loadConfigByKey(pool: Pool, configurationKey: string): Promise<MatchingConfig> {
  const result = await pool.query<{
    algorithm_version: string;
    version: string;
    interest_weight: string | null;
    values_weight: string | null;
    feasibility_weight: string | null;
    context_weight: string | null;
    rounding_scale: number;
    riasec_tie_order: RiasecLetter[] | null;
  }>(
    `select
      algorithm_version,
      version,
      interest_weight,
      values_weight,
      feasibility_weight,
      context_weight,
      rounding_scale,
      riasec_tie_order
    from recommendation.matching_configurations
    where configuration_key = $1 and status = 'active'
    order by approved_at desc nulls last, created_at desc
    limit 1`,
    [configurationKey],
  );
  const row = result.rows[0];
  if (!row && configurationKey !== "career_match") {
    return loadConfigByKey(pool, "career_match");
  }

  if (!row) {
    throw new Error(`No active matching configuration found for ${configurationKey}`);
  }

  return {
    algorithmVersion: row.algorithm_version,
    weightsVersion: row.version,
    interestWeight: toNumber(row.interest_weight, 0.5),
    valuesWeight: toNumber(row.values_weight, 0.2),
    feasibilityWeight: toNumber(row.feasibility_weight, 0.15),
    contextWeight: toNumber(row.context_weight, 0.15),
    roundingScale: row.rounding_scale,
    feasibilityLookupVersion: row.version,
    riasecTieOrder: normalizeTieOrder(row.riasec_tie_order),
  };
}

function readRiasecVector(summary: Record<string, unknown>): RiasecVector {
  const riasec = readNestedRecord(summary, ["riasec", "interest", "interests"]);
  const normalized = readNestedRecord(riasec, ["normalizedScores", "normalized_scores", "scores"]);
  const raw = readNestedRecord(riasec, ["rawScores", "raw_scores"]);
  const source = Object.keys(normalized).length > 0 ? normalized : raw;
  return {
    R: readNumber(source, ["R", "realistic"]),
    I: readNumber(source, ["I", "investigative"]),
    A: readNumber(source, ["A", "artistic"]),
    S: readNumber(source, ["S", "social"]),
    E: readNumber(source, ["E", "enterprising"]),
    C: readNumber(source, ["C", "conventional"]),
  };
}

function readWorkValues(summary: Record<string, unknown>): RiasecVector | undefined {
  const values = readNestedRecord(summary, ["workValues", "work_values", "values"]);
  const normalized = readNestedRecord(values, ["normalizedScores", "normalized_scores", "scores"]);
  const source = Object.keys(normalized).length > 0 ? normalized : values;
  const vector = {
    R: readOptionalNumber(source, ["R", "achievement"]),
    I: readOptionalNumber(source, ["I", "independence"]),
    A: readOptionalNumber(source, ["A", "recognition"]),
    S: readOptionalNumber(source, ["S", "relationships"]),
    E: readOptionalNumber(source, ["E", "support"]),
    C: readOptionalNumber(source, ["C", "working_conditions", "workingConditions"]),
  };

  const { R, I, A, S, E, C } = vector;
  if (R === undefined || I === undefined || A === undefined || S === undefined || E === undefined || C === undefined) {
    return undefined;
  }

  return { R, I, A, S, E, C };
}

function readCareerWorkValues(row: {
  achievement: string | null;
  independence: string | null;
  recognition: string | null;
  relationships: string | null;
  support: string | null;
  working_conditions: string | null;
}): RiasecVector | undefined {
  if (
    !row.achievement ||
    !row.independence ||
    !row.recognition ||
    !row.relationships ||
    !row.support ||
    !row.working_conditions
  ) {
    return undefined;
  }

  return {
    R: Number(row.achievement),
    I: Number(row.independence),
    A: Number(row.recognition),
    S: Number(row.relationships),
    E: Number(row.support),
    C: Number(row.working_conditions),
  };
}

function readNestedRecord(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return {};
}

function readNumber(source: Record<string, unknown>, keys: string[]): number {
  const value = readOptionalNumber(source, keys);
  if (value === undefined) {
    throw new Error(`Profile snapshot is missing RIASEC value ${keys.join("/")}`);
  }

  return value;
}

function readOptionalNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
  }

  return undefined;
}

function readFirstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function optionalString<Key extends string>(key: Key, value: string | undefined): Record<Key, string> | object {
  return value ? { [key]: value } : {};
}

const LOCATION_PREFERENCE_VALUES: readonly LocationPreference[] = [
  "same_city",
  "same_state",
  "anywhere_in_india",
  "remote",
  "not_sure",
];

function optionalLocationPreference(
  value: string | undefined,
): { locationPreference: LocationPreference } | object {
  const match = LOCATION_PREFERENCE_VALUES.find((candidate) => candidate === value);
  return match ? { locationPreference: match } : {};
}

/** Reuses tn-district-regions.ts's own canonical district list rather than a third copy of it
 *  (TnDistrictSchema in contracts is the other one) — same narrowing-with-fallback shape as
 *  optionalLocationPreference above, so a corrupted/legacy value degrades to "no home district"
 *  instead of throwing. */
function optionalHomeDistrict(value: string | undefined): { homeDistrict: TnDistrict } | object {
  const match = ALL_TN_DISTRICTS.find((candidate) => candidate === value);
  return match ? { homeDistrict: match as TnDistrict } : {};
}

function optionalVector<Key extends string>(key: Key, value: RiasecVector | undefined): Record<Key, RiasecVector> | object {
  return value ? { [key]: value } : {};
}

function toNumber(value: string | null, fallback: number): number {
  return value === null ? fallback : Number(value);
}

function normalizeTieOrder(value: RiasecLetter[] | null): typeof RIASEC_TIE_ORDER {
  if (!value || value.length !== 6 || !value.every(isRiasecLetter)) {
    return RIASEC_TIE_ORDER;
  }

  return value as typeof RIASEC_TIE_ORDER;
}

function isRiasecLetter(value: string): value is RiasecLetter {
  return ["R", "I", "A", "S", "E", "C"].includes(value);
}

// A stream reached only via knowledge.career_streams (no stream_maps row of its own) has no
// per-row dataset provenance to inherit — neither that table nor knowledge.stream_options
// carries a dataset_version_id. Stamps it with whatever the catalog's most recently published
// dataset version is, rather than inventing a fake one.
async function loadLatestPublishedDatasetVersion(pool: Pool): Promise<string> {
  const result = await pool.query<{ version: string }>(
    `select version from knowledge.dataset_versions
     where import_status = 'published'
     order by published_at desc nulls last, imported_at desc
     limit 1`,
  );
  return result.rows[0]?.version ?? "unknown";
}

// Picks the student's top two RIASEC letters by score (unchanged, score-driven — this is
// the part that must never change), then re-orders just those two letters into the fixed
// RIASEC_TIE_ORDER sequence before joining them into a lookup key. Without this second
// step, two students with the exact same top-two letters but a different higher scorer
// (e.g. I=0.9,R=0.8 vs R=0.9,I=0.8) would produce different strings ("IR" vs "RI") and,
// since knowledge.stream_maps.top_two_code is matched by exact string equality in
// loadStreams(), one of the two orderings would silently match zero catalog rows. Every
// existing stream_maps row already happens to use the canonical (tie-order) ordering
// (see the mock seed's RI/RA/RS/RE/RC/IA/IS/IE/IC/AS codes), so canonicalizing here reads
// the existing data correctly instead of requiring new data.
export function canonicalizeRiasecPair(letters: readonly RiasecLetter[]): string {
  return [...letters]
    .sort((left, right) => RIASEC_TIE_ORDER.indexOf(left) - RIASEC_TIE_ORDER.indexOf(right))
    .join("");
}

function topRiasecCode(vector: RiasecVector): string {
  const topTwo = [...RIASEC_TIE_ORDER]
    .sort((left, right) => vector[right] - vector[left])
    .slice(0, 2);
  return canonicalizeRiasecPair(topTwo);
}

function normalizeReachability(value: string): 0.3 | 0.65 | 1 {
  const numeric = Number(value);
  if (numeric <= 0.3) return 0.3;
  if (numeric >= 1) return 1;
  return 0.65;
}

function routeReachability(routeLevel: string | null): number {
  if (routeLevel && ["degree", "school_stream"].includes(routeLevel)) {
    return 1;
  }

  if (routeLevel && ["diploma", "iti", "certificate", "open"].includes(routeLevel)) {
    return 0.65;
  }

  return 0.5;
}

// knowledge.colleges.institution_type is always "<kind> - <ownership>" (e.g. "Engineering
// College - Government Aided"). Splitting on the first " - " is a direct parse of that real
// text, not a guess — see the college-scoring/filtering audit for the full distinct-value survey.
function deriveInstituteKind(institutionType: string): string {
  const separatorIndex = institutionType.indexOf(" - ");
  return separatorIndex === -1 ? institutionType.trim() : institutionType.slice(0, separatorIndex).trim();
}

// "other" is an honest bucket for the ~4% of rows whose ownership suffix doesn't literally start
// with one of these three canonical terms (e.g. "TNAU Constituent", "Central Government
// Institute", "University Department") — those are real, government-linked or public
// institutions, but classifying which bucket they'd fall into would be a guess this function
// deliberately doesn't make.
function deriveOwnership(institutionType: string): CollegeCatalogRecord["ownership"] {
  const separatorIndex = institutionType.indexOf(" - ");
  const suffix = separatorIndex === -1 ? "" : institutionType.slice(separatorIndex + 3).trim();
  if (suffix.startsWith("Government Aided")) return "government_aided";
  if (suffix.startsWith("Government")) return "government";
  if (suffix.startsWith("Self-Financing") || suffix.startsWith("Private")) return "private";
  return "other";
}

// college_programs.program_name is free text like "B.E./B.Tech. Computer Science" or, for two
// integrated law degrees, "5 Year B.A.LL.B. Degree Course" (duration-first instead of
// degree-first). Stripping a leading "<N> Year " prefix before taking the first token handles
// both shapes with the same rule, not a special case invented for those two rows.
const DURATION_PREFIX = /^\d+\s*½?\s*Year\s+/i;

// A handful of program_name rows spell the identical degree with different trailing punctuation
// (or, for B.Tech., without the joint "B.E./" designation the dataset otherwise uses for every
// other Engineering row) — these are the only aliases the actual data contains; anything else
// keeps its own literal leading token as its programType, real or not otherwise seen elsewhere.
const PROGRAM_TYPE_ALIASES: Record<string, string> = {
  "B.Sc.": "B.Sc",
  "B.A.": "B.A",
  "B.B.A.": "B.B.A",
  "B.Tech.": "B.E./B.Tech.",
};

function deriveProgramType(programName: string): string {
  const withoutDuration = programName.trim().replace(DURATION_PREFIX, "");
  const leadingToken = (withoutDuration.split(/\s+/)[0] ?? withoutDuration).replace(/,$/, "");
  return PROGRAM_TYPE_ALIASES[leadingToken] ?? leadingToken;
}

function normalizeFactKey(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en");
  if (normalized === "marks_band") return "marksBand";
  if (normalized === "income_band") return "incomeBand";
  return normalized;
}

function normalizeAcceptedValues(values: unknown): string[] | undefined {
  if (Array.isArray(values)) {
    return values.map(String);
  }

  if (values && typeof values === "object") {
    const record = values as Record<string, unknown>;
    if (Array.isArray(record.values)) {
      return record.values.map(String);
    }

    if (typeof record.value === "string" || typeof record.value === "number" || typeof record.value === "boolean") {
      return [String(record.value)];
    }
  }

  if (typeof values === "string" || typeof values === "number" || typeof values === "boolean") {
    return [String(values)];
  }

  return undefined;
}
