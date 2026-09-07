import { z } from "zod";
import { IsoTimestampSchema, UuidSchema } from "./common.js";

// ProfileSnapshotSchema/ProfileSnapshotResponseSchema live in ./assessment.js (the single
// canonical definition — see the comment there) and are re-exported unaliased from the barrel
// (index.ts). This file used to define its own second, looser copy that had drifted apart in
// shape and response envelope from assessment.ts's; see docs/poc/Validating-endpoints.md's Gap 3.

export const RecommendationKindSchema = z.enum([
  "career",
  "stream",
  "pathway",
  "college",
  "aid",
  "plan",
]);
export type RecommendationKind = z.infer<typeof RecommendationKindSchema>;

export const RecommendationItemSchema = z
  .object({
    itemId: UuidSchema,
    entityType: z.string().trim().min(1),
    entityId: UuidSchema,
    rank: z.number().int().positive(),
    fitScore: z.number().optional(),
    ring: z.enum(["inner", "middle", "outer"]).optional(),
    explanation: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

export const RecommendationSetSchema = z
  .object({
    recommendationId: UuidSchema,
    profileSnapshotId: UuidSchema,
    kind: RecommendationKindSchema,
    items: z.array(RecommendationItemSchema),
    algorithmVersion: z.string().trim().min(1),
    weightsVersion: z.string().trim().min(1),
    sourceDataVersions: z.record(z.string(), z.string().trim().min(1)),
    inputHash: z.string().trim().min(1),
    outputHash: z.string().trim().min(1),
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type RecommendationSet = z.infer<typeof RecommendationSetSchema>;

export const RecommendationSetResponseSchema = z
  .object({
    recommendation: RecommendationSetSchema,
  })
  .strict();
export type RecommendationSetResponse = z.infer<typeof RecommendationSetResponseSchema>;

export const CatalogEntityTypeSchema = z.enum([
  "career",
  "pathway",
  "stream",
  "college",
  "program",
  "aid",
]);
export type CatalogEntityType = z.infer<typeof CatalogEntityTypeSchema>;

export const CatalogEntitySchema = z
  .object({
    id: UuidSchema,
    entityType: CatalogEntityTypeSchema,
    title: z.string().trim().min(1),
    status: z.enum(["published", "retired"]),
    datasetVersion: z.string().trim().min(1),
    sourceRefs: z.array(z.string().trim().min(1)),
    lastVerifiedAt: IsoTimestampSchema.optional(),
  })
  .strict();
export type CatalogEntity = z.infer<typeof CatalogEntitySchema>;

export const RetrievedEvidenceSchema = z
  .object({
    queryType: z.string().trim().min(1),
    entities: z.array(CatalogEntitySchema),
    sourceVersions: z.record(z.string(), z.string().trim().min(1)),
    retrievedAt: IsoTimestampSchema,
  })
  .strict();
export type RetrievedEvidence = z.infer<typeof RetrievedEvidenceSchema>;
