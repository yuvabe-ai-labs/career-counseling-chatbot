// Contracts for the AI-assisted temporary catalog pipeline
// (docs/poc/ai-assisted-catalog-implementation-plan.md). Two concerns, kept separate:
//
// 1. Staging row shapes (AiGenerationRun/AiGenerationItem) — mirror
//    knowledge.ai_generation_runs/ai_generation_items (see the migration
//    20260911000100_knowledge_ai_generation_staging.sql).
// 2. Draft payload shapes (PathwayDraft/CollegeDraft/StreamMapItemDraft) — the exact,
//    deliberately narrow JSON shape Gemini is allowed to return for each target. Every field
//    absent from these schemas (fitScore, rank, ring, tier, eligibility, verificationStatus,
//    state, externalCode, websiteUrl — see the plan's §6 responsibility matrix) is not merely
//    discouraged by a prompt instruction, it is structurally impossible to pass validation:
//    every draft object below is `.strict()`, so any extra/forbidden property Gemini returns
//    fails Zod validation before the payload is ever written to a staging row.
import { z } from "zod";
import { IsoTimestampSchema, UuidSchema } from "./common.js";
import {
  AidStudentCategorySchema,
  CareerPathwayRelationshipTypeSchema,
  CareerStreamRelationshipTypeSchema,
  QualificationLevelSchema,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Staging rows
// ---------------------------------------------------------------------------

export const AiGenerationTargetTableSchema = z.enum([
  "pathways",
  "career_pathways",
  "pathway_disciplines",
  "colleges",
  "college_programs",
  "stream_map_items",
  "career_streams",
  "stream_pathways",
  "aid_schemes",
]);
export type AiGenerationTargetTable = z.infer<typeof AiGenerationTargetTableSchema>;

export const AiGenerationRunStatusSchema = z.enum([
  "pending_review",
  "approved",
  "rejected",
  "superseded",
  "failed",
]);
export type AiGenerationRunStatus = z.infer<typeof AiGenerationRunStatusSchema>;

export const AiGenerationRunSchema = z.object({
  id: UuidSchema,
  targetTable: AiGenerationTargetTableSchema,
  provider: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(120),
  promptVersion: z.string().trim().min(1).max(40),
  inputParamsJson: z.record(z.string(), z.unknown()),
  inputHash: z.string().trim().min(1).max(128),
  rawResponseJson: z.unknown().nullable(),
  status: AiGenerationRunStatusSchema,
  errorCode: z.string().trim().min(1).max(80).nullable(),
  errorMessage: z.string().trim().min(1).nullable(),
  reviewedBy: UuidSchema.nullable(),
  reviewedAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
});
export type AiGenerationRun = z.infer<typeof AiGenerationRunSchema>;

export const AiGenerationProposedEntityTypeSchema = z.enum([
  "pathway",
  "career_pathway",
  "pathway_discipline",
  "college",
  "college_program",
  "stream_map_item",
  "career_stream",
  "stream_pathway",
  "aid_scheme",
]);
export type AiGenerationProposedEntityType = z.infer<typeof AiGenerationProposedEntityTypeSchema>;

export const AiGenerationItemReviewStatusSchema = z.enum(["pending_review", "approved", "rejected"]);
export type AiGenerationItemReviewStatus = z.infer<typeof AiGenerationItemReviewStatusSchema>;

export const AiGenerationItemSchema = z.object({
  id: UuidSchema,
  generationRunId: UuidSchema,
  proposedEntityType: AiGenerationProposedEntityTypeSchema,
  proposedPayloadJson: z.record(z.string(), z.unknown()),
  naturalKey: z.string().trim().min(1).max(400),
  matchedExistingId: UuidSchema.nullable(),
  promotedEntityId: UuidSchema.nullable(),
  reviewStatus: AiGenerationItemReviewStatusSchema,
  reviewerNote: z.string().trim().min(1).nullable(),
  createdAt: IsoTimestampSchema,
});
export type AiGenerationItem = z.infer<typeof AiGenerationItemSchema>;

// ---------------------------------------------------------------------------
// Draft payloads — what Gemini is allowed to return, per target
// ---------------------------------------------------------------------------

/** Cross-reference to an already-published career, by natural key — never a UUID Gemini invents. */
export const PathwayDraftCareerLinkSchema = z
  .object({
    // Gemini should copy this from the trusted-context career list it was given (see plan
    // §19); the backend rejects any onetCode it doesn't already recognize (§5, §11).
    careerOnetCode: z.string().trim().min(1).max(20).nullable(),
    careerTitle: z.string().trim().min(1).max(200),
    relationshipType: CareerPathwayRelationshipTypeSchema,
  })
  .strict();
export type PathwayDraftCareerLink = z.infer<typeof PathwayDraftCareerLinkSchema>;

/** Cross-reference to an already-published discipline, by natural key. */
export const PathwayDraftDisciplineLinkSchema = z
  .object({
    disciplineCode: z.string().trim().min(1).max(80),
    // A structural affinity value describing the catalog, not a student fit score — still
    // backend-clamped and human-sanity-checked before publish (plan §6, open decision §28).
    relevanceWeight: z.number().min(0).max(1),
  })
  .strict();
export type PathwayDraftDisciplineLink = z.infer<typeof PathwayDraftDisciplineLinkSchema>;

export const PathwayDraftSchema = z
  .object({
    pathwayCode: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(600),
    // Natural key from the fixed, human-curated education-route list — never invented.
    educationRouteCode: z.string().trim().min(1).max(80),
    durationBand: z.string().trim().min(1).max(120).nullable(),
    backupRouteNote: z.string().trim().min(1).max(600).nullable(),
    relatedCareers: z.array(PathwayDraftCareerLinkSchema).min(1).max(5),
    relatedDisciplines: z.array(PathwayDraftDisciplineLinkSchema).min(1).max(3),
  })
  .strict();
export type PathwayDraft = z.infer<typeof PathwayDraftSchema>;

export const PathwayDraftBatchSchema = z
  .object({
    pathways: z.array(PathwayDraftSchema).min(1).max(10),
  })
  .strict();
export type PathwayDraftBatch = z.infer<typeof PathwayDraftBatchSchema>;

export const CollegeDraftProgramSchema = z
  .object({
    // Natural key from the fixed, human-curated discipline list.
    disciplineCode: z.string().trim().min(1).max(80),
    programName: z.string().trim().min(1).max(240),
    qualificationLevel: QualificationLevelSchema,
    durationBand: z.string().trim().min(1).max(120).nullable(),
    // Free-text, explicitly framed as unverified — see plan §6/§21: uncertain → omit rather
    // than invent a plausible-sounding value.
    admissionRoute: z.string().trim().min(1).max(300).nullable(),
    feesBand: z.string().trim().min(1).max(160).nullable(),
  })
  .strict();
export type CollegeDraftProgram = z.infer<typeof CollegeDraftProgramSchema>;

export const CollegeDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(160),
    // NOTE: no `state` field — the target state is supplied by the backend as trusted
    // context, never invented by Gemini (plan §6: eliminates an entire class of
    // wrong-state hallucination).
    institutionType: z.string().trim().min(1).max(100),
    programs: z.array(CollegeDraftProgramSchema).min(1).max(6),
    // NOTE: deliberately no `tier`, `websiteUrl`, `externalCode`, or `verificationStatus`
    // field anywhere in this schema — see the file header comment. `.strict()` enforces it.
  })
  .strict();
export type CollegeDraft = z.infer<typeof CollegeDraftSchema>;

export const CollegeDraftBatchSchema = z
  .object({
    colleges: z.array(CollegeDraftSchema).min(1).max(10),
  })
  .strict();
export type CollegeDraftBatch = z.infer<typeof CollegeDraftBatchSchema>;

/**
 * Only the descriptive `reason_key` text for an already-fixed (stream, rank) pairing —
 * `top_two_code`, `segment`, and `rank` are all deterministically assigned by the backend
 * (plan §6); Gemini only drafts why a stream fits.
 */
export const StreamMapItemDraftSchema = z
  .object({
    streamCode: z.string().trim().min(1).max(80),
    reasonText: z.string().trim().min(1).max(400),
  })
  .strict();
export type StreamMapItemDraft = z.infer<typeof StreamMapItemDraftSchema>;

export const StreamMapItemDraftBatchSchema = z
  .object({
    items: z.array(StreamMapItemDraftSchema).min(1).max(12),
  })
  .strict();
export type StreamMapItemDraftBatch = z.infer<typeof StreamMapItemDraftBatchSchema>;

/**
 * Career → Stream link drafts (docs/architecture/career-stream-mapping-iteration-1-plan.md).
 * Scoped per seed career, same shape as draftPathways — Gemini never sees or invents a
 * career_id/stream_option_id; `streamCode` must be copied from the trusted-context stream
 * option list it was given, exactly like PathwayDraftCareerLink.careerOnetCode above.
 */
export const CareerStreamDraftLinkSchema = z
  .object({
    streamCode: z.string().trim().min(1).max(80),
    relationshipType: CareerStreamRelationshipTypeSchema,
    // A structural affinity value describing the catalog, not a student fit score — same
    // framing as PathwayDraftDisciplineLink.relevanceWeight above.
    weight: z.number().min(0).max(1),
  })
  .strict();
export type CareerStreamDraftLink = z.infer<typeof CareerStreamDraftLinkSchema>;

export const CareerStreamDraftBatchSchema = z
  .object({
    careerStreams: z.array(CareerStreamDraftLinkSchema).min(1).max(6),
  })
  .strict();
export type CareerStreamDraftBatch = z.infer<typeof CareerStreamDraftBatchSchema>;

/**
 * Stream → Pathway link drafts (docs/architecture/stream-pathway-mapping-iteration-2-plan.md).
 * Scoped per seed stream, same shape/reasoning as CareerStreamDraftLinkSchema above —
 * `pathwayCode` must be copied from the trusted-context pathway list it was given.
 */
export const StreamPathwayDraftLinkSchema = z
  .object({
    pathwayCode: z.string().trim().min(1).max(80),
    relationshipType: CareerStreamRelationshipTypeSchema,
    weight: z.number().min(0).max(1),
  })
  .strict();
export type StreamPathwayDraftLink = z.infer<typeof StreamPathwayDraftLinkSchema>;

export const StreamPathwayDraftBatchSchema = z
  .object({
    streamPathways: z.array(StreamPathwayDraftLinkSchema).min(1).max(6),
  })
  .strict();
export type StreamPathwayDraftBatch = z.infer<typeof StreamPathwayDraftBatchSchema>;

/**
 * TN UG scholarship/financial-aid draft, extracted from one fetched official source page.
 * Deliberately excludes id, aidCode, verificationStatus, lastVerifiedAt, and datasetVersionId —
 * all backend-assigned, same convention as every other draft type in this file — and excludes
 * any fit score/rank/eligibility decision: Gemini extracts facts stated in the source, it never
 * decides who a scheme is recommended to.
 */
export const AidSchemeDraftCriterionSchema = z
  .object({
    criterionType: z.enum(["annual_income_max", "student_category"]),
    operator: z.enum(["lte", "in"]),
    value: z.union([
      z.object({ amount: z.number().nonnegative() }).strict(),
      z.object({ values: z.array(AidStudentCategorySchema).min(1) }).strict(),
    ]),
    isRequired: z.boolean(),
    // The exact source sentence/clause this criterion was extracted from — required, not
    // optional: an eligibility rule with no traceable source text is exactly the kind of
    // plausible-sounding-but-unverifiable claim the extraction rules exist to prevent.
    sourceText: z.string().trim().min(1).max(500),
  })
  .strict();
export type AidSchemeDraftCriterion = z.infer<typeof AidSchemeDraftCriterionSchema>;

/**
 * Scope classification Gemini must commit to, kept separate from the free-text `level`
 * description below — this is what scope validation actually gates on (only ug_only /
 * ug_and_other_levels survive; not_ug is always rejected before staging), rather than the
 * generator trying to pattern-match arbitrary free text.
 */
export const AidSchemeDraftEducationScopeSchema = z.enum(["ug_only", "ug_and_other_levels", "not_ug"]);
export type AidSchemeDraftEducationScope = z.infer<typeof AidSchemeDraftEducationScopeSchema>;

export const AidSchemeDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(240),
    providerType: z.string().trim().min(1).max(80).nullable(),
    provider: z.string().trim().min(1).max(200),
    // Free-text description exactly as stated by the source (e.g. "Undergraduate", "UG & PG") —
    // copied through to aid_schemes.level as-is. educationScope above is the real scope gate.
    level: z.string().trim().min(1).max(100),
    educationScope: AidSchemeDraftEducationScopeSchema,
    states: z.array(z.string().trim().min(1).max(120)).min(1),
    eligibilitySummary: z.string().trim().min(1).max(1000).nullable(),
    benefitSummary: z.string().trim().min(1).max(1000).nullable(),
    amountText: z.string().trim().min(1).max(200).nullable(),
    // Nullable here even though aid_schemes.application_url is NOT NULL in the real table: an
    // extraction that genuinely can't confirm a dedicated application URL (common for schemes
    // applied for in person, e.g. at a district welfare office) must be able to say so honestly
    // rather than invent one. The generator (generate-ai-catalog-drafts.ts) falls back to the
    // already-confirmed source page URL in that case — never Gemini's choice, always the
    // caller's own fetched URL — so the real table's NOT NULL constraint is satisfied without
    // ever fabricating a destination.
    applicationUrl: z
      .string()
      .url()
      .refine((url) => url.startsWith("https://"), { message: "Aid application URL must use HTTPS" })
      .nullable(),
    portalName: z.string().trim().min(1).max(160).nullable(),
    applyWindowStart: z.string().date().nullable(),
    applyWindowEnd: z.string().date().nullable(),
    criteria: z.array(AidSchemeDraftCriterionSchema).max(6),
  })
  .strict();
export type AidSchemeDraft = z.infer<typeof AidSchemeDraftSchema>;

export const AidSchemeDraftBatchSchema = z
  .object({
    // A single official page routinely lists several distinct schemes (e.g. the TN DCE
    // scholarships page) — Gemini must extract every distinct one, not collapse the page into
    // one entry.
    schemes: z.array(AidSchemeDraftSchema).min(1).max(8),
  })
  .strict();
export type AidSchemeDraftBatch = z.infer<typeof AidSchemeDraftBatchSchema>;
