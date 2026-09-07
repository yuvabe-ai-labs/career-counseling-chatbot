import { z } from "zod";
import { IsoTimestampSchema, SegmentSchema, UuidSchema } from "./common.js";

export const IntakeResponseTypeSchema = z.enum(["single_choice", "multi_choice", "short_text"]);
export type IntakeResponseType = z.infer<typeof IntakeResponseTypeSchema>;

export const IntakeQuestionSchema = z.object({
  id: UuidSchema,
  questionSetId: UuidSchema,
  questionSetVersion: z.string().min(1),
  segment: SegmentSchema,
  language: z.string().min(2).max(16),
  questionKey: z.string().min(1),
  displayOrder: z.number().int().positive(),
  promptText: z.string().min(1),
  responseType: IntakeResponseTypeSchema,
  options: z.unknown().nullable(),
  /** Example-answer hint shown as the input's placeholder (e.g. "Example: CBSE") — mainly
   * meaningful for short_text questions; null for anything that doesn't have one configured. */
  placeholderText: z.string().nullable(),
  isSensitive: z.boolean(),
  isRequired: z.boolean(),
});
export type IntakeQuestion = z.infer<typeof IntakeQuestionSchema>;

export const IntakeAnswerValueSchema = z.union([
  z.string().trim().min(1).max(500),
  z.array(z.string().trim().min(1).max(120)).min(1).max(12),
]);

export const UpsertIntakeAnswerRequestSchema = z.object({
  value: IntakeAnswerValueSchema,
});
export type UpsertIntakeAnswerRequest = z.infer<typeof UpsertIntakeAnswerRequestSchema>;

export const IntakeAnswerSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  sessionId: UuidSchema,
  questionId: UuidSchema,
  questionSetVersion: z.string().min(1),
  answer: z.object({ value: IntakeAnswerValueSchema }),
  answeredAt: IsoTimestampSchema,
});
export type IntakeAnswer = z.infer<typeof IntakeAnswerSchema>;

export const IntakeQuestionsResponseSchema = z.object({
  questionSet: z.object({
    id: UuidSchema,
    segment: SegmentSchema,
    version: z.string().min(1),
    language: z.string().min(2).max(16),
  }),
  questions: z.array(IntakeQuestionSchema),
  /**
   * The requesting user's own previously-saved answers for these exact questions, if any —
   * lets the client resume (prefill + skip-if-complete) instead of always starting blank.
   * Defaulted for backward compatibility with anything still expecting the older shape.
   */
  answers: z.array(IntakeAnswerSchema).default([]),
});
export type IntakeQuestionsResponse = z.infer<typeof IntakeQuestionsResponseSchema>;

export const IntakeAnswerResponseSchema = z.object({
  answer: IntakeAnswerSchema,
});
export type IntakeAnswerResponse = z.infer<typeof IntakeAnswerResponseSchema>;
