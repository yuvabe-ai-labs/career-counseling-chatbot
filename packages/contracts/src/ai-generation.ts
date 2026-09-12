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
import { CareerPathwayRelationshipTypeSchema, QualificationLevelSchema } from "./catalog.js";

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
