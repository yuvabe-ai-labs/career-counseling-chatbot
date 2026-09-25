import { z } from "zod";
import { IsoTimestampSchema, SegmentSchema, StateSchema, TnDistrictSchema, UuidSchema } from "./common.js";

export const RiasecLetterSchema = z.enum(["R", "I", "A", "S", "E", "C"]);
export type RiasecLetter = z.infer<typeof RiasecLetterSchema>;

export const RiasecVectorSchema = z.object({
  R: z.number(),
  I: z.number(),
  A: z.number(),
  S: z.number(),
  E: z.number(),
  C: z.number(),
});
export type RiasecVector = z.infer<typeof RiasecVectorSchema>;

export const LocationPreferenceSchema = z.enum([
  "same_city",
  "same_state",
  "anywhere_in_india",
  "remote",
  "not_sure",
]);
export type LocationPreference = z.infer<typeof LocationPreferenceSchema>;

export const ProfileSnapshotForRecommendationsSchema = z.object({
  profileSnapshotId: UuidSchema,
  profileVersion: z.string().min(1),
  profileHash: z.string().min(1),
  segment: SegmentSchema,
  state: StateSchema.optional(),
  marksBand: z.string().min(1).optional(),
  locationPreference: LocationPreferenceSchema.optional(),
  // Read as a direct column off assessment.profile_snapshots.home_district (see
  // recommendation-data-source.ts's loadProfile()) — deliberately NOT via intake_summary_json/
  // readFirstString(), which has a confirmed unwrapping bug for that path's {value: "..."}-shaped
  // entries. Optional since snapshots taken before this field existed have no value.
  homeDistrict: TnDistrictSchema.optional(),
  riasec: RiasecVectorSchema,
  workValues: RiasecVectorSchema.optional(),
});
export type ProfileSnapshotForRecommendations = z.infer<
  typeof ProfileSnapshotForRecommendationsSchema
>;

export const MatchingConfigSchema = z.object({
  algorithmVersion: z.string().min(1),
  weightsVersion: z.string().min(1),
  interestWeight: z.number().min(0).max(1),
  valuesWeight: z.number().min(0).max(1),
  feasibilityWeight: z.number().min(0).max(1),
  contextWeight: z.number().min(0).max(1),
  roundingScale: z.number().int().min(0).max(8),
  feasibilityLookupVersion: z.string().min(1),
  riasecTieOrder: z.tuple([
    RiasecLetterSchema,
    RiasecLetterSchema,
    RiasecLetterSchema,
    RiasecLetterSchema,
    RiasecLetterSchema,
    RiasecLetterSchema,
  ]),
});
export type MatchingConfig = z.infer<typeof MatchingConfigSchema>;

export const CareerCatalogRecordSchema = z.object({
  careerId: UuidSchema,
  title: z.string().trim().min(1),
  riasec: RiasecVectorSchema,
  workValues: RiasecVectorSchema.optional(),
  routeIds: z.array(UuidSchema).min(1),
  datasetVersion: z.string().min(1),
  verified: z.literal(true),
  isVocationalRoute: z.boolean().default(false),
});
export type CareerCatalogRecord = z.infer<typeof CareerCatalogRecordSchema>;

export const StreamCatalogRecordSchema = z.object({
  streamId: UuidSchema,
  title: z.string().trim().min(1),
  /** knowledge.stream_options.description — the stream's own catalog blurb, not derived from
   *  scoring. Optional so older callers/fixtures that predate this field still validate. */
  description: z.string().trim().min(1).optional(),
  // Was .min(1) — relaxed for a stream reached ONLY via a knowledge.career_streams link (no
  // stream_maps row of its own to borrow a RIASEC pair from): it legitimately has no RIASEC
  // letters of its own rather than an unknown/omitted one. See loadStreams()'s comment.
  riasecLetters: z.array(RiasecLetterSchema),
  recommendedSegments: z.array(SegmentSchema).min(1),
  marksBands: z.array(z.string().min(1)).optional(),
  priority: z.number().int().nonnegative().default(100),
  datasetVersion: z.string().min(1),
  verified: z.literal(true),
  // knowledge.career_streams rows for this stream, restricted to the student's currently
  // ranked careers (see recommendation-data-source.ts's loadStreams()). Optional/absent for
  // streams reached only via the existing RIASEC-pair path with no career link at all — see
  // docs/architecture/career-stream-mapping-iteration-1-plan.md.
  careerLinks: z
    .array(
      z.object({
        careerId: UuidSchema,
        weight: z.number().min(0).max(1),
      }),
    )
    .optional(),
});
export type StreamCatalogRecord = z.infer<typeof StreamCatalogRecordSchema>;

export const PathwayCatalogRecordSchema = z.object({
  pathwayId: UuidSchema,
  title: z.string().trim().min(1),
  careerIds: z.array(UuidSchema).min(1),
  // knowledge.stream_pathways-derived (Iteration 2, see
  // docs/architecture/stream-pathway-mapping-iteration-2-plan.md). Same empty-set-sentinel
  // convention as careerIds — recommendation-data-source.ts's loadPathways() substitutes a
  // placeholder UUID when a pathway has zero real links, so scorePathways()'s rankedAlignment()
  // never has to special-case an empty array vs a genuine non-match.
  streamOptionIds: z.array(UuidSchema).min(1),
  recommendedSegments: z.array(SegmentSchema).min(1),
  marksBands: z.array(z.string().min(1)).optional(),
  reachability: z.number().min(0).max(1),
  hasBackupRoute: z.boolean(),
  // Real fact, not a guess: how many verified Tamil Nadu colleges actually offer a programme in
  // this pathway's linked discipline(s) (knowledge.pathway_disciplines -> college_programs).
  // scorePathways() log-normalizes this into collegeAvailability — see its own comment for why a
  // raw count needs log-scaling before it can be a fair scoring signal (the real distribution
  // spans 1 to 1287 colleges per pathway).
  collegeCount: z.number().int().nonnegative(),
  priority: z.number().int().nonnegative().default(100),
  datasetVersion: z.string().min(1),
  verified: z.literal(true),
});
export type PathwayCatalogRecord = z.infer<typeof PathwayCatalogRecordSchema>;

// Ownership derived from institution_type's real "<kind> - <ownership>" suffix (see
// deriveOwnership() in recommendation-data-source.ts). "other" is an honest bucket for the ~4%
// of records whose suffix doesn't literally say Government/Government Aided/Self-Financing —
// e.g. "TNAU Constituent", "Central Government Institute" — rather than a guess at which of the
// three they'd fall under.
export const CollegeOwnershipSchema = z.enum(["government", "government_aided", "private", "other"]);
export type CollegeOwnership = z.infer<typeof CollegeOwnershipSchema>;

// One verified programme at a college. `programType` is derived from the programme's own name
// (e.g. "B.E./B.Tech. Computer Science" -> "B.E./B.Tech.") and `admissionRoute` is the
// programme's own catalogue text — both real, not invented — so eligibility can be checked
// against the SAME programme that offers the target discipline, not just any programme at the
// college (see resolveEligibleColleges()'s doc comment for why this distinction matters).
export const CollegeProgramRecordSchema = z.object({
  disciplineId: UuidSchema,
  programType: z.string().trim().min(1),
  admissionRoute: z.string().trim().min(1),
});
export type CollegeProgramRecord = z.infer<typeof CollegeProgramRecordSchema>;

export const CollegeCatalogRecordSchema = z.object({
  collegeId: UuidSchema,
  title: z.string().trim().min(1),
  state: StateSchema,
  // Sourced from colleges.city, which holds district-level granularity in the source catalogue
  // (e.g. "Kanniyakumari", "Tiruvallur" are districts, not cities) — named `district` here to
  // match what the data actually represents.
  district: z.string().trim().min(1),
  // The institution_type column's "<kind>" prefix (e.g. "Engineering College", "Polytechnic
  // College") — see deriveInstituteKind(). Supersedes the old coarse 5-value `collegeType`
  // bucket, which this now subsumes.
  instituteKind: z.string().trim().min(1),
  ownership: CollegeOwnershipSchema,
  tier: z.number().int().positive(),
  programs: z.array(CollegeProgramRecordSchema),
  datasetVersion: z.string().min(1),
  verified: z.literal(true),
});
export type CollegeCatalogRecord = z.infer<typeof CollegeCatalogRecordSchema>;

export const AidCriterionSchema = z.object({
  factKey: z.string().trim().min(1),
  acceptedValues: z.array(z.string().trim().min(1)).optional(),
});
export type AidCriterion = z.infer<typeof AidCriterionSchema>;

export const AidSchemeCatalogRecordSchema = z.object({
  aidSchemeId: UuidSchema,
  title: z.string().trim().min(1),
  criteria: z.array(AidCriterionSchema).min(1),
  priority: z.number().int().nonnegative().default(100),
  sourceUrl: z.string().url().optional(),
  datasetVersion: z.string().min(1),
  verified: z.literal(true),
});
export type AidSchemeCatalogRecord = z.infer<typeof AidSchemeCatalogRecordSchema>;

export const PlanTemplateStepSchema = z.object({
  stepOrder: z.number().int().positive(),
  timeWindow: z.string().trim().min(1),
  actionTemplate: z.string().trim().min(1),
  isOptional: z.boolean().default(false),
});
export type PlanTemplateStep = z.infer<typeof PlanTemplateStepSchema>;

export const PlanTemplateCatalogRecordSchema = z.object({
  planTemplateId: UuidSchema,
  title: z.string().trim().min(1),
  segment: SegmentSchema,
  planType: z.enum(["exploration", "pathway", "career_90_day"]),
  targetEntityType: z.enum(["career", "stream", "pathway"]).optional(),
  priority: z.number().int().nonnegative().default(100),
  steps: z.array(PlanTemplateStepSchema).min(1),
  datasetVersion: z.string().min(1),
  verified: z.literal(true),
});
export type PlanTemplateCatalogRecord = z.infer<typeof PlanTemplateCatalogRecordSchema>;

export const CareerFitExplanationSchema = z.object({
  schemaVersion: z.literal(1),
  interestFit: z.number().min(0).max(1),
  valuesFit: z.number().min(0).max(1).optional(),
  feasibility: z.number().min(0).max(1),
  contextBoost: z.number().min(0).max(1),
  weights: z.object({
    interest: z.number().min(0).max(1),
    values: z.number().min(0).max(1),
    feasibility: z.number().min(0).max(1),
    context: z.number().min(0).max(1),
  }),
  topMatchingScales: z.array(RiasecLetterSchema),
  tradeoffKey: z.string().nullable(),
});
export type CareerFitExplanation = z.infer<typeof CareerFitExplanationSchema>;

export const StreamFitExplanationSchema = z.object({
  schemaVersion: z.literal(1),
  riasecOverlap: z.number().min(0).max(1),
  segmentFit: z.number().min(0).max(1),
  marksFit: z.number().min(0).max(1),
  catalogPriority: z.number().int().nonnegative(),
  topStudentLetters: z.array(RiasecLetterSchema),
  matchedLetters: z.array(RiasecLetterSchema),
  /** Carried straight from StreamCatalogRecord.description — optional so recommendation sets
   *  stored before this field existed still replay/validate correctly. */
  description: z.string().trim().min(1).optional(),
  /** Rank-weighted overlap between the student's ranked careers and this stream's
   *  knowledge.career_streams links (see career-stream-mapping-iteration-1-plan.md). Optional
   *  so recommendation sets stored before this field existed still replay/validate correctly;
   *  absent (not zero) also distinguishes "no career signal was available" from "career
   *  signal was available and scored zero" for anyone reading stored explanations later. */
  careerAlignment: z.number().min(0).max(1).optional(),
  matchedCareerIds: z.array(UuidSchema).optional(),
});
export type StreamFitExplanation = z.infer<typeof StreamFitExplanationSchema>;

// v1 had no streamAlignment — Stream's influence on Pathway was plumbed (rankedStreamIds
// accepted, folded into the cache-key inputHash) but never actually read by scoring (a real,
// documented gap — see docs/architecture/recommendation-flow-audit-2026-09-19.md §6.6/§16). v2
// (Iteration 2, docs/architecture/stream-pathway-mapping-iteration-2-plan.md) adds
// streamAlignment/matchedStreamOptionIds as real, always-computed fields (not optional, unlike
// Iteration 1's Stream-side careerAlignment — every pathway now gets a real streamAlignment,
// even 0 for an unmatched one, same as careerAlignment already does) and rebalances the fitScore
// weights to make room for it. Old stored v1 rows fail this schema and fall through to
// RecommendationItemSchema's z.record(...) catch-all on replay — an accepted, deliberate
// consequence of a real formula change, not a bug.
export const PathwayFitExplanationSchema = z.object({
  schemaVersion: z.literal(2),
  careerAlignment: z.number().min(0).max(1),
  streamAlignment: z.number().min(0).max(1),
  collegeAvailability: z.number().min(0).max(1),
  segmentFit: z.number().min(0).max(1),
  marksFit: z.number().min(0).max(1),
  reachability: z.number().min(0).max(1),
  backupRouteFit: z.number().min(0).max(1),
  catalogPriority: z.number().int().nonnegative(),
  matchedCareerIds: z.array(UuidSchema),
  matchedStreamOptionIds: z.array(UuidSchema),
});
export type PathwayFitExplanation = z.infer<typeof PathwayFitExplanationSchema>;

// v1 (removed) was a weighted fitScore (disciplineAlignment/tierFit/accessRouteFit) — proven
// constant for every eligible college on every real pathway, so removed rather than tuned. v2
// was a bare eligibility explanation (matchedDisciplineIds + collegeType). v3 adds the real
// catalogue facts the comprehensive filtering pass introduced: institute kind, ownership,
// district — still no derived score, just which facts made this college eligible. v4 adds the
// first real derived score since v1's was removed: locationProximity, a same-district/
// same-region/rest-of-Tamil-Nadu tier comparing the student's own homeDistrict against this
// college's district (see college-recommendations.ts's LOCATION_PROXIMITY_TIER_SCORES) — unlike
// v1, this one genuinely varies per student rather than being constant across the catalogue, so
// it's a differentiating signal rather than a fabricated one. Same accepted consequence as
// PathwayFitExplanationSchema's 1->2 bump: a v3 explanation row read back after this change fails
// this schema and falls through to RecommendationItemSchema's z.record() catch-all on replay —
// deliberate, not a bug.
export const CollegeEligibilityExplanationSchema = z.object({
  schemaVersion: z.literal(4),
  matchedDisciplineIds: z.array(UuidSchema).min(1),
  instituteKind: z.string().trim().min(1),
  ownership: CollegeOwnershipSchema,
  district: z.string().trim().min(1),
  // programType/admissionRoute of the specific matching programme(s) — not every programme this
  // college offers. Lets the frontend derive its filter dropdown options directly from an
  // unfiltered baseline response instead of a hardcoded, driftable reference list.
  matchedProgramTypes: z.array(z.string().trim().min(1)).min(1),
  matchedAdmissionRoutes: z.array(z.string().trim().min(1)).min(1),
  locationProximity: z.number().min(0).max(1),
  locationProximityTier: z.enum(["same_district", "same_region", "rest_of_tamil_nadu", "unknown"]),
});
export type CollegeEligibilityExplanation = z.infer<typeof CollegeEligibilityExplanationSchema>;

export const AidLikelihoodLabelSchema = z.enum(["likely", "check_conditions", "explore"]);
export type AidLikelihoodLabel = z.infer<typeof AidLikelihoodLabelSchema>;

export const AidFitExplanationSchema = z.object({
  schemaVersion: z.literal(1),
  likelihoodLabel: AidLikelihoodLabelSchema,
  knownMatchedFactKeys: z.array(z.string()),
  unknownFactKeys: z.array(z.string()),
  mismatchedFactKeys: z.array(z.string()),
  evidenceScore: z.number().min(0).max(1),
  catalogPriority: z.number().int().nonnegative(),
  sourceUrl: z.string().url().optional(),
});
export type AidFitExplanation = z.infer<typeof AidFitExplanationSchema>;

export const GeneratedPlanStepSchema = z.object({
  stepOrder: z.number().int().positive(),
  timeWindow: z.string().min(1),
  actionText: z.string().min(1),
  isOptional: z.boolean(),
});
export type GeneratedPlanStep = z.infer<typeof GeneratedPlanStepSchema>;

export const PlanFitExplanationSchema = z.object({
  schemaVersion: z.literal(1),
  templateId: UuidSchema,
  planType: z.enum(["exploration", "pathway", "career_90_day"]),
  segment: SegmentSchema,
  targetEntityType: z.enum(["career", "stream", "pathway"]).optional(),
  targetEntityId: UuidSchema.optional(),
  catalogPriority: z.number().int().nonnegative(),
  generatedSteps: z.array(GeneratedPlanStepSchema),
});
export type PlanFitExplanation = z.infer<typeof PlanFitExplanationSchema>;

export const RecommendationItemSchema = z.object({
  itemId: z.string().min(1),
  entityType: z.enum(["career", "stream", "pathway", "college", "aid", "plan"]),
  entityId: UuidSchema,
  title: z.string().min(1),
  rank: z.number().int().positive(),
  fitScore: z.number().min(0).max(1).optional(),
  ring: z.enum(["inner", "middle", "outer"]).optional(),
  explanation: CareerFitExplanationSchema.or(StreamFitExplanationSchema)
    .or(PathwayFitExplanationSchema)
    .or(CollegeEligibilityExplanationSchema)
    .or(AidFitExplanationSchema)
    .or(PlanFitExplanationSchema)
    .or(z.record(z.string(), z.unknown())),
  entityDatasetVersion: z.string().min(1),
});
export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

export const RecommendationSetSchema = z.object({
  recommendationId: UuidSchema,
  profileSnapshotId: UuidSchema,
  kind: z.enum(["career", "stream", "pathway", "college", "aid", "plan"]),
  items: z.array(RecommendationItemSchema),
  rings: z
    .object({
      inner: z.array(RecommendationItemSchema),
      middle: z.array(RecommendationItemSchema),
      outer: z.array(RecommendationItemSchema),
    })
    .optional(),
  algorithmVersion: z.string().min(1),
  weightsVersion: z.string().min(1),
  sourceDataVersions: z.record(z.string(), z.string()),
  inputHash: z.string().min(1),
  outputHash: z.string().min(1),
  createdAt: IsoTimestampSchema,
});
export type RecommendationSet = z.infer<typeof RecommendationSetSchema>;

export const RecommendationSetResponseSchema = z.object({
  recommendation: RecommendationSetSchema,
});
export type RecommendationSetResponse = z.infer<typeof RecommendationSetResponseSchema>;

const RecommendationSetResponseBodySchema = RecommendationSetSchema.omit({
  recommendationId: true,
});

export const CareerRecommendationSetResponseSchema = RecommendationSetResponseBodySchema.extend({
  careerRecommendationId: UuidSchema,
});
export type CareerRecommendationSetResponse = z.infer<
  typeof CareerRecommendationSetResponseSchema
>;

export const StreamRecommendationSetResponseSchema = RecommendationSetResponseBodySchema.extend({
  streamRecommendationId: UuidSchema,
});
export type StreamRecommendationSetResponse = z.infer<
  typeof StreamRecommendationSetResponseSchema
>;

export const PathwayRecommendationSetResponseSchema = RecommendationSetResponseBodySchema.extend({
  pathwayRecommendationId: UuidSchema,
});
export type PathwayRecommendationSetResponse = z.infer<
  typeof PathwayRecommendationSetResponseSchema
>;

export const CollegeRecommendationSetResponseSchema = RecommendationSetResponseBodySchema.extend({
  collegeRecommendationId: UuidSchema,
});
export type CollegeRecommendationSetResponse = z.infer<
  typeof CollegeRecommendationSetResponseSchema
>;

export const AidRecommendationSetResponseSchema = RecommendationSetResponseBodySchema.extend({
  aidRecommendationId: UuidSchema,
});
export type AidRecommendationSetResponse = z.infer<typeof AidRecommendationSetResponseSchema>;

export const PlanRecommendationSetResponseSchema = RecommendationSetResponseBodySchema.extend({
  planRecommendationId: UuidSchema,
});
export type PlanRecommendationSetResponse = z.infer<
  typeof PlanRecommendationSetResponseSchema
>;

export const RecommendationIdParamsSchema = z.object({
  id: UuidSchema,
});
export type RecommendationIdParams = z.infer<typeof RecommendationIdParamsSchema>;

export const RecommendationReplayResultSchema = z.object({
  recommendationId: UuidSchema,
  replayedAt: IsoTimestampSchema,
  originalOutputHash: z.string().min(1),
  replayOutputHash: z.string().min(1),
  matches: z.boolean(),
  recommendation: RecommendationSetSchema,
});
export type RecommendationReplayResult = z.infer<typeof RecommendationReplayResultSchema>;

const RecommendationBaseRequestSchema = z.object({
  recommendationId: UuidSchema.optional(),
  profileSnapshotId: UuidSchema.optional(),
  profile: ProfileSnapshotForRecommendationsSchema.optional(),
  config: MatchingConfigSchema.optional(),
  createdAt: IsoTimestampSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
}).refine((request) => request.profileSnapshotId || request.profile, {
  message: "Either profileSnapshotId or profile is required.",
  path: ["profileSnapshotId"],
});

export const CareerRecommendationRouteRequestSchema = RecommendationBaseRequestSchema.extend({
  careers: z.array(CareerCatalogRecordSchema).min(1).optional(),
  feasibilityRules: z
    .array(
      z.object({
        segment: SegmentSchema,
        marksBand: z.string().min(1),
        routeId: UuidSchema,
        reachability: z.union([z.literal(0.3), z.literal(0.65), z.literal(1)]),
        priority: z.number().int(),
      }),
    )
    .optional(),
  counselorPriorities: z
    .array(
      z.object({
        careerId: UuidSchema,
        boost: z.number().min(0).max(1),
      }),
    )
    .optional(),
});

export const StreamRecommendationRouteRequestSchema = RecommendationBaseRequestSchema.extend({
  streams: z.array(StreamCatalogRecordSchema).min(1).optional(),
  // Same override precedent as PathwayRecommendationRouteRequestSchema.rankedCareerIds below —
  // real requests never send this; it defaults to the student's latest stored Career run.
  rankedCareerIds: z.array(UuidSchema).optional(),
});

export const PathwayRecommendationRouteRequestSchema = RecommendationBaseRequestSchema.extend({
  pathways: z.array(PathwayCatalogRecordSchema).min(1).optional(),
  rankedCareerIds: z.array(UuidSchema).optional(),
  rankedStreamIds: z.array(UuidSchema).optional(),
});

// Optional, composable eligibility filters (see college-recommendations.ts). Each narrows the
// mandatory TN + discipline eligibility result; an omitted filter never restricts it. Only
// fields the data audit found reliably populated are exposed here — no education level or
// duration filter (qualification_level is a catalogue-wide constant "ug"; duration_band is
// ~78% null).
export const CollegeRecommendationRouteRequestSchema = RecommendationBaseRequestSchema.extend({
  colleges: z.array(CollegeCatalogRecordSchema).min(1).optional(),
  targetDisciplineIds: z.array(UuidSchema).min(1).optional(),
  targetPathwayId: UuidSchema.optional(),
  programType: z.string().trim().min(1).optional(),
  instituteKind: z.string().trim().min(1).optional(),
  ownership: CollegeOwnershipSchema.optional(),
  district: z.string().trim().min(1).optional(),
  admissionRoute: z.string().trim().min(1).optional(),
  // Ranking-only override for resolveEligibleColleges()'s location-proximity signal — distinct
  // from `district` above (a hard filter that excludes non-matching colleges; this never hides
  // anything, it only reorders). Real requests send this when the student has picked a district
  // on the College screen; omitted, ranking falls back to the stored profile snapshot's own
  // homeDistrict (usually absent today, since nothing else sets it — see
  // UserProfileSchema.homeDistrict's own comment). Same override precedent as
  // StreamRecommendationRouteRequestSchema.rankedCareerIds above.
  homeDistrict: TnDistrictSchema.optional(),
});

export const AidRecommendationRouteRequestSchema = RecommendationBaseRequestSchema.extend({
  aidSchemes: z.array(AidSchemeCatalogRecordSchema).min(1).optional(),
  storedFacts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const PlanTargetSchema = z.object({
  entityType: z.enum(["career", "stream", "pathway"]),
  entityId: UuidSchema,
  title: z.string().min(1),
});

export const PlanRecommendationRouteRequestSchema = RecommendationBaseRequestSchema.extend({
  templates: z.array(PlanTemplateCatalogRecordSchema).min(1).optional(),
  target: PlanTargetSchema.optional(),
});

export type CareerRecommendationRouteRequest = z.infer<
  typeof CareerRecommendationRouteRequestSchema
>;
export type StreamRecommendationRouteRequest = z.infer<
  typeof StreamRecommendationRouteRequestSchema
>;
export type PathwayRecommendationRouteRequest = z.infer<
  typeof PathwayRecommendationRouteRequestSchema
>;
export type CollegeRecommendationRouteRequest = z.infer<
  typeof CollegeRecommendationRouteRequestSchema
>;
export type AidRecommendationRouteRequest = z.infer<
  typeof AidRecommendationRouteRequestSchema
>;
export type PlanRecommendationRouteRequest = z.infer<
  typeof PlanRecommendationRouteRequestSchema
>;
