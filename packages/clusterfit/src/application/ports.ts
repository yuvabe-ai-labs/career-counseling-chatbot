import type {
  ClusterfitGradePath,
  ClusterfitResult,
  ClusterfitSituationCanonical,
  ClusterfitValuesRanking,
} from "@yuvapath/contracts";
import type {
  ConversationContextV3,
  KnownContext,
  TranscriptTurn,
} from "../situation/conversation-context.js";

export type ClusterfitSessionRow = {
  id: string;
  userId: string;
  journeySessionId: string | null;
  contentVersion: string;
  gradePath: ClusterfitGradePath | null;
  status: "in_progress" | "scored" | "abandoned";
  liveTokensIssued: number;
  coverageChecks: number;
  attemptNumber: number;
  idempotencyKey: string | null;
  startedAt: string;
  scoredAt: string | null;
};

export type ClusterfitResponseRow = {
  part: "B" | "C" | "D";
  itemKey: string;
  value: number | null;
  optionKey: "A" | "B" | "C" | "D" | null;
  latencyMs: number | null;
  answeredAt: string;
};

export type ClusterfitSituationRow = {
  canonical: ClusterfitSituationCanonical;
  canonicalVersion: string;
  mapperVersion: string | null;
  missingFields: string[];
  unmappedFields: string[];
  studentEdited: boolean;
  latestCaptureId: string | null;
};

export type ClusterfitCaptureRow = {
  id: string;
  sessionId: string;
  source: "live" | "form";
  fieldSchemaVersion: string;
  rawFields: Record<string, unknown>;
  derived: Record<string, unknown>;
  transcriptText: string | null;
  wellbeingFlag: boolean;
  idempotencyKey: string | null;
  capturedAt: string;
};

/** Persistence for the `clusterfit` schema (6 tables). Postgres in production, in-memory in tests. */
export interface ClusterfitRepository {
  findSessionByIdempotencyKey(idempotencyKey: string): Promise<ClusterfitSessionRow | null>;
  findLatestSessionForUser(userId: string): Promise<ClusterfitSessionRow | null>;
  countSessionsForUser(userId: string): Promise<number>;
  createSession(row: ClusterfitSessionRow): Promise<ClusterfitSessionRow>;
  getSession(sessionId: string): Promise<ClusterfitSessionRow | null>;
  updateSession(
    sessionId: string,
    patch: Partial<Pick<ClusterfitSessionRow, "gradePath" | "status" | "scoredAt">> & {
      lastAnsweredAt?: string;
    },
  ): Promise<void>;
  /** Atomically increments a rate-limit counter; Lambda keeps no memory between requests (plan §16.2 F3). */
  incrementCounter(
    sessionId: string,
    counter: "liveTokensIssued" | "coverageChecks",
  ): Promise<number>;

  upsertResponse(
    sessionId: string,
    row: ClusterfitResponseRow & { idempotencyKey: string | null },
  ): Promise<void>;
  listResponses(sessionId: string): Promise<ClusterfitResponseRow[]>;

  insertCapture(row: ClusterfitCaptureRow): Promise<ClusterfitCaptureRow>;
  findCaptureByIdempotencyKey(idempotencyKey: string): Promise<ClusterfitCaptureRow | null>;
  getSituation(sessionId: string): Promise<ClusterfitSituationRow | null>;
  upsertSituation(sessionId: string, row: ClusterfitSituationRow): Promise<void>;
  upsertValues(sessionId: string, ranking: ClusterfitValuesRanking | null): Promise<void>;

  findResultByHash(sessionId: string, inputHash: string): Promise<ClusterfitResult | null>;
  getCurrentResult(sessionId: string): Promise<ClusterfitResult | null>;
  /** Stores the result and makes it current (a re-score keeps earlier ones). */
  insertResult(input: {
    id: string;
    sessionId: string;
    userId: string;
    result: ClusterfitResult;
  }): Promise<void>;
}

/** The few profile facts clusterfit needs, read through the assessment module's public exports. */
export interface ClusterfitStudentProfileReader {
  getStudent(userId: string): Promise<{
    firstName: string;
    segment: "explorer" | "pathfinder";
    state: string;
    city: string;
  } | null>;
}

/**
 * Records the student's education stage on their profile once the confirm card knows the class
 * (sign-up fixes it to Higher secondary while clusterfit is on). Implemented through the
 * assessment module's public export, never its tables.
 */
export interface ClusterfitStudentStageWriter {
  setStage(userId: string, stage: "school" | "higher_secondary"): Promise<void>;
}

/** The POC's post-chat extraction (Gemini structured output). */
export interface ContextExtractor {
  extract(input: {
    knownContext: KnownContext;
    transcript: readonly TranscriptTurn[];
  }): Promise<{ model: string; context: ConversationContextV3 }>;
}

/** Mints a single-use, constrained Gemini Live token. */
export interface LiveTokenIssuer {
  issue(input: {
    systemInstruction: string;
  }): Promise<{ token: string; expiresAt: string; model: string }>;
}

/** Approved wellbeing copy from the safety module. Never invented here (AGENTS.md). */
export interface WellbeingCopyReader {
  getWellbeingCopy(): Promise<string | null>;
}
