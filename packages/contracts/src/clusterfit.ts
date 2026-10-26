import { z } from "zod";
import { IsoTimestampSchema, UuidSchema } from "./common.js";

// Clusterfit plug-in (docs/clusterfit-prototype-plan.md §18). Separate from every core contract;
// nothing here is shared with or changes them. Delete this file to remove the plug-in.

export const ClusterCodeSchema = z.enum([
  "SCI",
  "ENG",
  "DIG",
  "HLT",
  "AGR",
  "BUS",
  "EDU",
  "GOV",
  "MED",
  "ART",
  "HOS",
  "CON",
]);
export const AptitudeDomainSchema = z.enum(["NUM", "VER", "LOG", "MEC", "PRA"]);
export const WorkStyleDimensionSchema = z.enum([
  "social",
  "initiative",
  "order",
  "curiosity",
  "steadiness",
]);
export const ClusterfitGradePathSchema = z.enum(["9_10", "11_12"]);
export type ClusterfitGradePath = z.infer<typeof ClusterfitGradePathSchema>;
export const ClusterfitPartSchema = z.enum(["B", "C", "D"]);
export type ClusterfitPart = z.infer<typeof ClusterfitPartSchema>;
export const ClusterfitBandSchema = z.enum(["strong", "explore", "low", "insufficient"]);
export const ClusterfitValueCardSchema = z.enum([
  "steady_income",
  "earn_early",
  "stay_close_home",
  "help_community",
  "own_boss",
  "learn_grow",
  "respect",
  "creative_freedom",
  "travel",
]);
export const ClusterfitValuesRankingSchema = z
  .array(z.object({ value: ClusterfitValueCardSchema, rank: z.number().int().min(1).max(3) }))
  .max(3);
export type ClusterfitValuesRanking = z.infer<typeof ClusterfitValuesRankingSchema>;

// ─── Scoring result (stored; flags are computed per the doc but not shown yet) ──

export const ClusterfitClusterResultSchema = z.object({
  code: ClusterCodeSchema,
  name: z.string(),
  /** Interest I, 0–8 (prorated when 3 of 4 answered); null when too few answers. */
  interest: z.number().int().min(0).max(8).nullable(),
  /** Aptitude fit A, 0–8. */
  aptitude: z.number().int().min(0).max(8),
  /** Style fit S, 0–4; null when a key dimension has too few answers. */
  style: z.number().int().min(0).max(4).nullable(),
  /** 6.25×I + 3.75×A + 5×S, 0–100, 2 decimals; null when insufficient. */
  index: z.number().min(0).max(100).nullable(),
  band: ClusterfitBandSchema,
  shownAs: z.enum(["strong", "explore", "hidden"]),
  flags: z.array(z.enum(["skills_to_build", "hidden_strength"])),
});
export type ClusterfitClusterResult = z.infer<typeof ClusterfitClusterResultSchema>;

export const ClusterfitResultSchema = z.object({
  scoringVersion: z.string(),
  contentVersion: z.string(),
  gradePath: ClusterfitGradePathSchema,
  inputHash: z.string(),
  clusters: z.array(ClusterfitClusterResultSchema).length(12),
  aptitude: z.record(
    AptitudeDomainSchema,
    z.object({ correct: z.number().int(), attempted: z.number().int(), score: z.number().int() }),
  ),
  workStyle: z.record(
    WorkStyleDimensionSchema,
    z.object({
      raw: z.number().int().nullable(),
      level: z.enum(["low", "mid", "high"]).nullable(),
      points: z.number().int().nullable(),
    }),
  ),
  profileFlags: z.object({
    flatProfile: z.boolean(),
    languageCaution: z.union([z.boolean(), z.literal("unknown")]),
  }),
  presentation: z.object({
    strong: z.array(ClusterCodeSchema),
    explore: z.array(ClusterCodeSchema),
    fallbackUsed: z.boolean(),
  }),
});
export type ClusterfitResult = z.infer<typeof ClusterfitResultSchema>;

// ─── Session and items (student-facing: never carry codes or the answer key) ───

export const ClusterfitPartProgressSchema = z.object({
  answered: z.number().int().min(0),
  total: z.number().int().min(0),
});
export const ClusterfitSessionSchema = z.object({
  sessionId: UuidSchema,
  status: z.enum(["in_progress", "scored", "abandoned"]),
  contentVersion: z.string(),
  /** Set once the class is confirmed (Part A); decides Part C. */
  gradePath: ClusterfitGradePathSchema.nullable(),
  progress: z.object({
    B: ClusterfitPartProgressSchema,
    C: ClusterfitPartProgressSchema,
    D: ClusterfitPartProgressSchema,
  }),
  startedAt: IsoTimestampSchema,
  scoredAt: IsoTimestampSchema.nullable(),
});
export type ClusterfitSession = z.infer<typeof ClusterfitSessionSchema>;
export const ClusterfitSessionResponseSchema = z.object({ session: ClusterfitSessionSchema });

export const StartClusterfitSessionRequestSchema = z.object({
  idempotencyKey: UuidSchema,
  journeySessionId: UuidSchema.optional(),
});

export const ClusterfitItemSchema = z.object({
  itemKey: z.string(),
  position: z.number().int().positive(),
  text: z.string(),
  options: z.array(z.object({ key: z.string(), label: z.string() })),
});
export const ClusterfitPartItemsResponseSchema = z.object({
  part: ClusterfitPartSchema,
  items: z.array(ClusterfitItemSchema),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  progress: ClusterfitPartProgressSchema,
});

/** B: "yes" | "maybe" | "no"; C: "A"–"D"; D: 0–3 as ticked. Every item must be answered. */
export const SaveClusterfitResponseRequestSchema = z.object({
  itemKey: z.string().min(2).max(8),
  answer: z.union([
    z.enum(["yes", "maybe", "no", "A", "B", "C", "D"]),
    z.number().int().min(0).max(3),
  ]),
  latencyMs: z.number().int().min(0).max(3_600_000).optional(),
  idempotencyKey: UuidSchema,
});
export type SaveClusterfitResponseRequest = z.infer<typeof SaveClusterfitResponseRequestSchema>;
export const SaveClusterfitResponseResponseSchema = z.object({
  part: ClusterfitPartSchema,
  progress: ClusterfitPartProgressSchema,
});

export const ScoreClusterfitRequestSchema = z.object({ idempotencyKey: UuidSchema });

/** Retake from the results page: archives the scored session and starts a new attempt. */
export const ReattemptClusterfitRequestSchema = z.object({ idempotencyKey: UuidSchema });

const ClusterCardSchema = z.object({
  code: ClusterCodeSchema,
  name: z.string(),
  exampleRoles: z.string(),
  entryRoutes: z.string(),
});
/**
 * Student view: all 12 clusters, best first, the top 3 marked `recommended`. Each has a plain
 * signal word ("strong" ≥ 65, "explore" 50–64, "low" below 50) and the doc's roles/routes.
 * No indices or flags.
 */
export const ClusterfitStudentResultResponseSchema = z.object({
  result: z.object({
    fallbackUsed: z.boolean(),
    clusters: z.array(
      ClusterCardSchema.extend({
        signal: z.enum(["strong", "explore", "low"]),
        recommended: z.boolean(),
      }),
    ),
  }),
});

// ─── Part A + Part E (Gemini Live chat and confirm card) ───────────────────────

export const ClusterfitSituationCanonicalSchema = z.object({
  grade: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]).nullable(),
  /** Not collected by the POC fields, so language caution stays "unknown". */
  medium: z.enum(["english", "tamil", "hindi", "other"]).nullable(),
  /** Part E top 3, from the chat or the confirm card. */
  values: ClusterfitValuesRankingSchema.nullable(),
  /** Every other extracted field, passed through unchanged. */
  context: z.record(z.string(), z.unknown()),
});
export type ClusterfitSituationCanonical = z.infer<typeof ClusterfitSituationCanonicalSchema>;

export const ClusterfitSituationViewSchema = z.object({
  canonical: ClusterfitSituationCanonicalSchema,
  missingFields: z.array(z.string()),
  studentEdited: z.boolean(),
});
export const ClusterfitSituationResponseSchema = z.object({
  situation: ClusterfitSituationViewSchema.nullable(),
  gradePath: ClusterfitGradePathSchema.nullable(),
});

/** Confirm card: class is required (it decides Part C); values may stay empty (Part E is unscored). */
export const SaveClusterfitSituationRequestSchema = z.object({
  grade: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]),
  values: ClusterfitValuesRankingSchema.optional(),
});

/** "About you" finished (chat ended, failed or skipped): the activities open. */
export const ClusterfitCompleteSituationResponseSchema = z.object({
  gradePath: ClusterfitGradePathSchema,
});

export const ClusterfitTranscriptSchema = z
  .array(z.object({ speaker: z.enum(["student", "guide"]), text: z.string().max(8000) }))
  .max(600);
export type ClusterfitTranscript = z.infer<typeof ClusterfitTranscriptSchema>;

export const ClusterfitLiveTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: IsoTimestampSchema,
  model: z.string(),
  websocketUrl: z.string(),
  kickoffText: z.string(),
  toolResults: z.record(z.string(), z.string()),
  promptVersion: z.string(),
  connectionsLeft: z.number().int().min(0),
});

export const ClusterfitCoverageRequestSchema = z.object({ transcript: ClusterfitTranscriptSchema });
export const ClusterfitCoverageResponseSchema = z.object({ instruction: z.string() });

export const ClusterfitCaptureRequestSchema = z.object({
  transcript: ClusterfitTranscriptSchema,
  idempotencyKey: UuidSchema,
  wellbeingFlagged: z.boolean().optional(),
});
export const ClusterfitCaptureResponseSchema = z.object({
  situation: ClusterfitSituationViewSchema.nullable(),
  gradePath: ClusterfitGradePathSchema.nullable(),
  warnings: z.array(z.string()),
});

export const ClusterfitWellbeingRequestSchema = z.object({ idempotencyKey: UuidSchema });
export const ClusterfitWellbeingResponseSchema = z.object({ message: z.string().nullable() });

export const ClusterfitDevExtractRequestSchema = z.object({
  known_context: z.object({
    segment: z.enum(["explorer", "pathfinder"]),
    state: z.string(),
    city: z.string(),
    already_answered: z.string(),
  }),
  transcript: ClusterfitTranscriptSchema,
});
