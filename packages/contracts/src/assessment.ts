import { z } from "zod";
import { IsoTimestampSchema, SegmentSchema, UuidSchema } from "./common.js";
import { AgeBandSchema, EducationStageSchema } from "./profile.js";

export const InstrumentCodeSchema = z.enum([
  "ip_60",
  "mini_ip_30",
  "photo_ip",
  "wip",
  "mini_ipip",
  "aptitude",
]);
export type InstrumentCode = z.infer<typeof InstrumentCodeSchema>;

export const AssessmentRunStatusSchema = z.enum([
  "created",
  "active",
  "paused",
  "completed",
  "scored",
  "abandoned",
]);
export type AssessmentRunStatus = z.infer<typeof AssessmentRunStatusSchema>;

export const AssessmentItemTypeSchema = z.enum([
  "likert",
  "photo_pair",
  "forced_choice",
  "mcq",
  "qc",
]);
export type AssessmentItemType = z.infer<typeof AssessmentItemTypeSchema>;

export const RiasecScaleSchema = z.enum(["R", "I", "A", "S", "E", "C"]);
export type RiasecScale = z.infer<typeof RiasecScaleSchema>;

export const WorkValueScaleSchema = z.enum([
  "achievement",
  "independence",
  "recognition",
  "relationships",
  "support",
  "working_conditions",
]);
export type WorkValueScale = z.infer<typeof WorkValueScaleSchema>;

export const ConfidenceSchema = z.enum(["normal", "soft"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const AssessmentOptionSchema = z.object({
  id: UuidSchema,
  optionKey: z.string().min(1),
  displayOrder: z.number().int().positive(),
  labelText: z.string().nullable(),
  assetRef: z.string().nullable(),
});
export type AssessmentOption = z.infer<typeof AssessmentOptionSchema>;

export const AssessmentItemSchema = z.object({
  id: UuidSchema,
  itemKey: z.string().min(1),
  displayOrder: z.number().int().positive(),
  itemType: AssessmentItemTypeSchema,
  promptText: z.string().nullable(),
  promptAssetRef: z.string().nullable(),
  scaleCode: z.string().nullable(),
  isQc: z.boolean(),
  options: z.array(AssessmentOptionSchema),
});
export type AssessmentItem = z.infer<typeof AssessmentItemSchema>;

export const AssessmentRunSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  journeySessionId: UuidSchema,
  assessmentVersionId: UuidSchema,
  instrumentCode: InstrumentCodeSchema,
  instrumentVersion: z.string().min(1),
  algorithmVersion: z.string().min(1),
  segment: SegmentSchema,
  status: AssessmentRunStatusSchema,
  currentPosition: z.number().int().min(0),
  startedAt: IsoTimestampSchema,
  lastAnsweredAt: IsoTimestampSchema.nullable(),
  completedAt: IsoTimestampSchema.nullable(),
  scoredAt: IsoTimestampSchema.nullable(),
  resumeExpiresAt: IsoTimestampSchema,
  attemptNumber: z.number().int().positive(),
  createdAt: IsoTimestampSchema,
});
export type AssessmentRun = z.infer<typeof AssessmentRunSchema>;

export const StartAssessmentRunRequestSchema = z.object({
  language: z.string().min(2).max(16).default("en"),
  mode: z.enum(["text", "photo"]).optional(),
  // Explicit override for AssessmentService.startRun's instrument-selection default (RIASEC
  // based on segment/mode). Lets a caller start mini_ipip/aptitude runs directly — those
  // instruments are defined but have no seed content yet, so a run request for one resolves
  // to the existing assessment_version_not_found (404) path rather than being silently
  // unreachable. See docs/poc/Validating-endpoints.md's Gap 4/5.
  instrumentCode: InstrumentCodeSchema.optional(),
});
export type StartAssessmentRunRequest = z.infer<typeof StartAssessmentRunRequestSchema>;

export const AssessmentRunResponseSchema = z.object({ run: AssessmentRunSchema });
export type AssessmentRunResponse = z.infer<typeof AssessmentRunResponseSchema>;

/** An already-answered item, its own content plus the saved response value — lets the client
 * page backward through reached questions and show/edit what was actually chosen, without a
 * separate per-item fetch. `responseValue` mirrors AssessmentResponse's own (nullable — an MCQ/
 * forced-choice item answered via selectedOptionId instead would have none). */
export const AssessmentAnsweredItemSchema = AssessmentItemSchema.extend({
  responseValue: z.number().int().nullable(),
});
export type AssessmentAnsweredItem = z.infer<typeof AssessmentAnsweredItemSchema>;

export const AssessmentNextResponseSchema = z.object({
  run: AssessmentRunSchema,
  progress: z.object({
    answered: z.number().int().min(0),
    total: z.number().int().min(0),
    nextPosition: z.number().int().min(0),
    isComplete: z.boolean(),
  }),
  items: z.array(AssessmentItemSchema),
  // Defaulted for backward compatibility with anything still expecting the older shape.
  answeredItems: z.array(AssessmentAnsweredItemSchema).default([]),
});
export type AssessmentNextResponse = z.infer<typeof AssessmentNextResponseSchema>;

export const SubmitAssessmentResponseRequestSchema = z.object({
  itemId: UuidSchema,
  selectedOptionId: UuidSchema.optional(),
  responseValue: z.number().int().min(1).max(5).optional(),
  responseJson: z.unknown().optional(),
  latencyMs: z.number().int().min(0).max(3_600_000).optional(),
  answeredAt: IsoTimestampSchema.optional(),
});
export type SubmitAssessmentResponseRequest = z.infer<
  typeof SubmitAssessmentResponseRequestSchema
>;

export const AssessmentResponseSchema = z.object({
  id: UuidSchema,
  assessmentRunId: UuidSchema,
  itemId: UuidSchema,
  selectedOptionId: UuidSchema.nullable(),
  responseValue: z.number().int().nullable(),
  responseJson: z.unknown().nullable(),
  latencyMs: z.number().int().nullable(),
  answeredAt: IsoTimestampSchema,
  receivedAt: IsoTimestampSchema,
});
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;

export const AssessmentResponseSaveResponseSchema = z.object({
  response: AssessmentResponseSchema,
  next: AssessmentNextResponseSchema,
});
export type AssessmentResponseSaveResponse = z.infer<
  typeof AssessmentResponseSaveResponseSchema
>;

export const RiasecScoresSchema = z.record(RiasecScaleSchema, z.number());
export const AssessmentScoresSchema = z.record(z.string().min(1), z.number());

export const AssessmentResultSchema = z.object({
  id: UuidSchema,
  assessmentRunId: UuidSchema,
  userId: UuidSchema,
  instrumentCode: InstrumentCodeSchema,
  instrumentVersion: z.string().min(1),
  algorithmVersion: z.string().min(1),
  rawScores: AssessmentScoresSchema,
  normalizedScores: AssessmentScoresSchema,
  resultCode: z.string().min(1),
  confidence: ConfidenceSchema,
  closeScores: z.boolean(),
  qcSummary: z.record(z.string(), z.unknown()),
  inputHash: z.string().min(1),
  outputHash: z.string().min(1),
  createdAt: IsoTimestampSchema,
});
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;

export const AssessmentResultResponseSchema = z.object({ result: AssessmentResultSchema });
export type AssessmentResultResponse = z.infer<typeof AssessmentResultResponseSchema>;

/**
 * Generic instrument-result summary, used for instruments (Big Five, Aptitude) that don't yet
 * have their own scale enum — see InstrumentCodeSchema's mini_ipip/aptitude, which are defined
 * but currently unreachable (no runs can be started for them; see AssessmentService.startRun).
 * Reuses AssessmentScoresSchema (the same score-map shape AssessmentResult itself uses) rather
 * than inventing scale names ahead of that content existing.
 */
const InstrumentResultSummarySchema = z.object({
  rawScores: AssessmentScoresSchema,
  normalizedScores: AssessmentScoresSchema,
  confidence: ConfidenceSchema,
  closeScores: z.boolean(),
  instrumentCode: InstrumentCodeSchema,
  instrumentVersion: z.string().min(1),
});

/**
 * The single canonical ProfileSnapshot shape, used by every route that creates or re-fetches
 * one (assessment-run-routes.ts's POST .../profile-snapshot, and assessment-snapshot-routes.ts's
 * GET /assessment-snapshots) and by every cross-module consumer (Module 2 recommendations,
 * Module 4 counselor). Previously this package defined two different, same-named
 * ProfileSnapshotSchema pairs (one here, one in integration.ts) that had drifted apart in shape
 * and response envelope — see docs/poc/Validating-endpoints.md's Gap 3.
 */
export const ProfileSnapshotSchema = z.object({
  snapshotId: UuidSchema,
  userId: UuidSchema,
  firstName: z.string().trim().min(1).max(100),
  segment: SegmentSchema,
  ageBand: AgeBandSchema,
  city: z.string().min(1),
  state: z.string().min(1),
  selfStage: EducationStageSchema,
  wantsAid: z.boolean(),
  intakeSummary: z.record(z.string(), z.unknown()),
  riasec: z
    .object({
      rawScores: RiasecScoresSchema,
      normalizedScores: RiasecScoresSchema,
      code: z.string().min(1),
      confidence: ConfidenceSchema,
      closeScores: z.boolean(),
      instrumentCode: InstrumentCodeSchema,
      instrumentVersion: z.string().min(1),
    })
    .optional(),
  values: z
    .object({
      rawScores: z.record(WorkValueScaleSchema, z.number()),
      normalizedScores: z.record(WorkValueScaleSchema, z.number()),
      topTwo: z.array(WorkValueScaleSchema).length(2),
      confidence: ConfidenceSchema,
      closeScores: z.boolean(),
      instrumentCode: z.literal("wip"),
      instrumentVersion: z.string().min(1),
    })
    .optional(),
  // Not yet populated by AssessmentService.buildAssessmentSnapshot — mini_ipip/aptitude runs
  // can't be started yet (see the instrument-selection gap in assessment-service.ts). Typed
  // now so a frontend/downstream consumer's contract doesn't change again once they are.
  bigFive: InstrumentResultSummarySchema.optional(),
  aptitude: InstrumentResultSummarySchema.optional(),
  profileVersion: z.number().int().positive(),
  algorithmVersion: z.string().min(1),
  sourceResultIds: z.array(UuidSchema),
  createdAt: IsoTimestampSchema,
});
export type ProfileSnapshot = z.infer<typeof ProfileSnapshotSchema>;

export const ProfileSnapshotResponseSchema = z.object({ snapshot: ProfileSnapshotSchema });
export type ProfileSnapshotResponse = z.infer<typeof ProfileSnapshotResponseSchema>;
