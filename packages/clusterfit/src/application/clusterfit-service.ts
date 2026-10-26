import { randomUUID } from "node:crypto";
import type {
  ClusterfitGradePath,
  ClusterfitPart,
  ClusterfitSession,
  ClusterfitValuesRanking,
  SaveClusterfitResponseRequest,
} from "@yuvapath/contracts";
import {
  CLUSTERS,
  CONTENT_VERSION,
  INTEREST_ITEMS,
  WORK_STYLE_ITEMS,
  type AptitudeOptionKey,
} from "../content/v1/index.js";
import { aptitudeItemsForGradePath, puzzleGradePath } from "../domain/grade-path.js";
import {
  rankedClusters,
  scoreClusterfit,
  type ClusterfitScoringInput,
  type InterestAnswer,
  type WorkStyleAnswer,
} from "../domain/scoring.js";
import type { ClusterfitScoringConfig } from "../domain/scoring-config.js";
import { CANONICAL_VERSION } from "../situation/mapper.js";
import {
  gradeRequired,
  invalidAnswer,
  notReadyToScore,
  profileNotFound,
  reattemptNotAllowed,
  resultNotFound,
  sessionLocked,
  sessionNotFound,
} from "./errors.js";
import type {
  ClusterfitRepository,
  ClusterfitResponseRow,
  ClusterfitSessionRow,
  ClusterfitStudentProfileReader,
  ClusterfitStudentStageWriter,
} from "./ports.js";

const INTEREST_OPTIONS = [
  { key: "yes", label: "Yes" },
  { key: "maybe", label: "Maybe / never tried" },
  { key: "no", label: "No" },
];
const INTEREST_VALUES: Readonly<Record<string, InterestAnswer>> = { yes: 2, maybe: 1, no: 0 };
const INTEREST_LABELS: Readonly<Record<number, string>> = { 2: "yes", 1: "maybe", 0: "no" };
const WORK_STYLE_OPTIONS = [
  { key: "0", label: "Not like me" },
  { key: "1", label: "A little like me" },
  { key: "2", label: "Mostly like me" },
  { key: "3", label: "Very like me" },
];

/** The results page lists all 12 clusters and highlights the top 3 (product decision, 2026-10-22). */
const STUDENT_TOP_CLUSTERS = 3;
const SIGNAL_FOR_BAND: Partial<Record<string, "strong" | "explore">> = {
  strong: "strong",
  explore: "explore",
};

export type ClusterfitServiceDependencies = {
  repository: ClusterfitRepository;
  profiles: ClusterfitStudentProfileReader;
  config: ClusterfitScoringConfig;
  /** Absent in the fixture runtime, where there is no profile table to update. */
  stages?: ClusterfitStudentStageWriter | undefined;
  now?: () => Date;
};

const partItems = (part: ClusterfitPart, gradePath: ClusterfitGradePath | null) => {
  if (part === "B") {
    return INTEREST_ITEMS.map((item) => ({
      itemKey: item.itemKey,
      position: item.position,
      text: item.text,
      options: INTEREST_OPTIONS,
    }));
  }
  if (part === "D") {
    return WORK_STYLE_ITEMS.map((item) => ({
      itemKey: item.itemKey,
      position: item.position,
      text: item.text,
      options: WORK_STYLE_OPTIONS,
    }));
  }
  if (!gradePath) throw gradeRequired();
  return aptitudeItemsForGradePath(gradePath).map((item, index) => ({
    itemKey: item.itemKey,
    position: index + 1,
    text: item.text,
    options: (["A", "B", "C", "D"] as const).map((key) => ({ key, label: item.options[key] })),
  }));
};

const progressFor = (
  responses: readonly ClusterfitResponseRow[],
  gradePath: ClusterfitGradePath | null,
) => {
  // A puzzle skipped before skips were removed (stored as null) still counts as unanswered.
  const answered = new Set(
    responses
      .filter((response) => !(response.part === "C" && response.optionKey === null))
      .map((response) => response.itemKey),
  );
  const count = (keys: readonly string[]) => keys.filter((key) => answered.has(key)).length;
  const aptitudeKeys = gradePath
    ? aptitudeItemsForGradePath(gradePath).map((item) => item.itemKey)
    : [];
  return {
    B: {
      answered: count(INTEREST_ITEMS.map((item) => item.itemKey)),
      total: INTEREST_ITEMS.length,
    },
    C: { answered: count(aptitudeKeys), total: aptitudeKeys.length },
    D: {
      answered: count(WORK_STYLE_ITEMS.map((item) => item.itemKey)),
      total: WORK_STYLE_ITEMS.length,
    },
  };
};

/** Stored answers → scoring input (one place, so scoring and any later re-score read answers the same way). */
export const buildScoringInput = (
  gradePath: ClusterfitGradePath,
  medium: ClusterfitScoringInput["medium"],
  responses: readonly ClusterfitResponseRow[],
): ClusterfitScoringInput => {
  const interest: Record<string, InterestAnswer> = {};
  const aptitude: Record<string, AptitudeOptionKey | null> = {};
  const workStyle: Record<string, WorkStyleAnswer> = {};
  for (const response of responses) {
    if (response.part === "B" && response.value !== null)
      interest[response.itemKey] = response.value as InterestAnswer;
    if (response.part === "C") aptitude[response.itemKey] = response.optionKey;
    if (response.part === "D" && response.value !== null)
      workStyle[response.itemKey] = response.value as WorkStyleAnswer;
  }
  return { gradePath, medium, interest, aptitude, workStyle };
};

/** Sessions, Parts B–D, the confirm card, scoring and the student result (plan §18). */
export class ClusterfitService {
  constructor(private readonly deps: ClusterfitServiceDependencies) {}

  private now(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  async ownedSession(userId: string, sessionId: string): Promise<ClusterfitSessionRow> {
    const session = await this.deps.repository.getSession(sessionId);
    // Someone else's session is reported as missing, so ids can't be probed.
    if (!session || session.userId !== userId) throw sessionNotFound();
    return session;
  }

  private async toDto(session: ClusterfitSessionRow): Promise<ClusterfitSession> {
    const responses = await this.deps.repository.listResponses(session.id);
    return {
      sessionId: session.id,
      status: session.status,
      contentVersion: session.contentVersion,
      gradePath: session.gradePath,
      progress: progressFor(responses, session.gradePath),
      startedAt: session.startedAt,
      scoredAt: session.scoredAt,
    };
  }

  /** Starts a session, or resumes the student's latest one. Idempotent on the key. */
  async startSession(input: {
    userId: string;
    idempotencyKey: string;
    journeySessionId?: string | undefined;
  }) {
    const { repository } = this.deps;
    const replay = await repository.findSessionByIdempotencyKey(input.idempotencyKey);
    if (replay) {
      if (replay.userId !== input.userId) throw sessionNotFound();
      return this.toDto(replay);
    }
    const student = await this.deps.profiles.getStudent(input.userId);
    if (!student) throw profileNotFound();

    // Resume the latest session, including a scored one, until the student chooses to retake
    // (a retake archives it as abandoned, §18.1 R4).
    const latest = await repository.findLatestSessionForUser(input.userId);
    if (latest && latest.status !== "abandoned") return this.toDto(latest);

    return this.toDto(
      await this.createAttempt(input.userId, input.idempotencyKey, input.journeySessionId ?? null),
    );
  }

  private async createAttempt(
    userId: string,
    idempotencyKey: string,
    journeySessionId: string | null,
  ): Promise<ClusterfitSessionRow> {
    const { repository } = this.deps;
    return repository.createSession({
      id: randomUUID(),
      userId,
      journeySessionId,
      contentVersion: CONTENT_VERSION,
      gradePath: null,
      status: "in_progress",
      liveTokensIssued: 0,
      coverageChecks: 0,
      attemptNumber: (await repository.countSessionsForUser(userId)) + 1,
      idempotencyKey,
      startedAt: this.now(),
      scoredAt: null,
    });
  }

  /**
   * "Retake the test" on the results page: archives the scored session as abandoned (its answers,
   * chat and results are kept, never shown again) and starts a new attempt from About you.
   * Idempotent on the key. Not one transaction: if the new attempt fails to save, the next
   * POST /sessions finds the latest session abandoned and starts it anyway.
   */
  async reattempt(userId: string, sessionId: string, idempotencyKey: string) {
    const replay = await this.deps.repository.findSessionByIdempotencyKey(idempotencyKey);
    if (replay) {
      if (replay.userId !== userId) throw sessionNotFound();
      return this.toDto(replay);
    }
    const session = await this.ownedSession(userId, sessionId);
    if (session.status !== "scored") throw reattemptNotAllowed();
    await this.deps.repository.updateSession(sessionId, { status: "abandoned" });
    return this.toDto(await this.createAttempt(userId, idempotencyKey, session.journeySessionId));
  }

  async getSession(userId: string, sessionId: string) {
    return this.toDto(await this.ownedSession(userId, sessionId));
  }

  async getPartItems(userId: string, sessionId: string, part: ClusterfitPart) {
    const session = await this.ownedSession(userId, sessionId);
    const items = partItems(part, session.gradePath);
    const keys = new Set(items.map((item) => item.itemKey));
    const responses = (await this.deps.repository.listResponses(sessionId)).filter((response) =>
      keys.has(response.itemKey),
    );
    const answers: Record<string, string | number | null> = {};
    for (const response of responses) {
      answers[response.itemKey] =
        part === "B"
          ? (INTEREST_LABELS[response.value ?? -1] ?? null)
          : part === "C"
            ? response.optionKey
            : response.value;
    }
    const answered = Object.values(answers).filter((answer) => answer !== null).length;
    return { part, items, answers, progress: { answered, total: items.length } };
  }

  async saveResponse(userId: string, sessionId: string, request: SaveClusterfitResponseRequest) {
    const session = await this.ownedSession(userId, sessionId);
    if (session.status !== "in_progress") throw sessionLocked();
    const { itemKey, answer } = request;
    const base = { itemKey, latencyMs: request.latencyMs ?? null, answeredAt: this.now() };

    let row: ClusterfitResponseRow;
    if (INTEREST_ITEMS.some((item) => item.itemKey === itemKey)) {
      if (typeof answer !== "string" || !(answer in INTEREST_VALUES))
        throw invalidAnswer(`${itemKey} takes "yes", "maybe" or "no".`);
      row = { ...base, part: "B", value: INTEREST_VALUES[answer]!, optionKey: null };
    } else if (WORK_STYLE_ITEMS.some((item) => item.itemKey === itemKey)) {
      if (typeof answer !== "number" || answer < 0 || answer > 3)
        throw invalidAnswer(`${itemKey} takes 0–3.`);
      row = { ...base, part: "D", value: answer, optionKey: null };
    } else {
      if (!session.gradePath) throw gradeRequired();
      // Puzzles outside the student's grade path are rejected, not stored (plan §13.3).
      if (!aptitudeItemsForGradePath(session.gradePath).some((item) => item.itemKey === itemKey)) {
        throw invalidAnswer(`${itemKey} is not a puzzle for this student.`);
      }
      // Every puzzle must be answered: skipping is no longer offered.
      if (!(typeof answer === "string" && ["A", "B", "C", "D"].includes(answer))) {
        throw invalidAnswer(`${itemKey} takes "A"–"D".`);
      }
      row = { ...base, part: "C", value: null, optionKey: answer as AptitudeOptionKey };
    }

    await this.deps.repository.upsertResponse(sessionId, {
      ...row,
      idempotencyKey: request.idempotencyKey,
    });
    await this.deps.repository.updateSession(sessionId, { lastAnsweredAt: base.answeredAt });
    const progress = progressFor(
      await this.deps.repository.listResponses(sessionId),
      session.gradePath,
    );
    return { part: row.part, progress: progress[row.part] };
  }

  /** The confirm card after the chat: class (required, sets the grade path) and the Part E top 3. */
  async saveSituationEdits(
    userId: string,
    sessionId: string,
    edits: { grade: 9 | 10 | 11 | 12; values?: ClusterfitValuesRanking | undefined },
  ) {
    const session = await this.ownedSession(userId, sessionId);
    if (session.status !== "in_progress") throw sessionLocked();
    if (edits.values) {
      const values = new Set(edits.values.map((entry) => entry.value));
      const ranks = new Set(edits.values.map((entry) => entry.rank));
      if (values.size !== edits.values.length || ranks.size !== edits.values.length) {
        throw invalidAnswer("Each value and each rank can be chosen once.");
      }
    }
    const existing = await this.deps.repository.getSituation(sessionId);
    const values = edits.values
      ? [...edits.values].sort((a, b) => a.rank - b.rank)
      : (existing?.canonical.values ?? null);
    const situation = {
      canonical: {
        grade: edits.grade,
        medium: existing?.canonical.medium ?? null,
        values: values && values.length > 0 ? values : null,
        context: existing?.canonical.context ?? {},
      },
      canonicalVersion: CANONICAL_VERSION,
      mapperVersion: existing?.mapperVersion ?? null,
      missingFields: values && values.length > 0 ? [] : ["values"],
      unmappedFields: existing?.unmappedFields ?? [],
      studentEdited: true,
      latestCaptureId: existing?.latestCaptureId ?? null,
    };
    await this.deps.repository.upsertSituation(sessionId, situation);
    await this.deps.repository.upsertValues(sessionId, situation.canonical.values);
    const gradePath = puzzleGradePath();
    await this.deps.repository.updateSession(sessionId, { gradePath });
    // Sign-up didn't ask for the stage, so the confirmed class records it (and the segment).
    await this.deps.stages?.setStage(userId, edits.grade <= 10 ? "school" : "higher_secondary");
    return {
      situation: {
        canonical: situation.canonical,
        missingFields: situation.missingFields,
        studentEdited: true,
      },
      gradePath,
    };
  }

  /**
   * Ends "About you" (the chat finished, failed, or the student skipped it) and opens the
   * activities. While the confirm card is switched off (plan §18.1 R11), this is what sets the
   * session's grade path; a class the chat caught is recorded as the profile stage.
   */
  async completeSituation(userId: string, sessionId: string) {
    const session = await this.ownedSession(userId, sessionId);
    if (session.status !== "in_progress") throw sessionLocked();
    const gradePath = puzzleGradePath();
    if (session.gradePath !== gradePath) {
      await this.deps.repository.updateSession(sessionId, { gradePath });
    }
    const grade = (await this.deps.repository.getSituation(sessionId))?.canonical.grade ?? null;
    if (grade !== null) {
      await this.deps.stages?.setStage(userId, grade <= 10 ? "school" : "higher_secondary");
    }
    return { gradePath };
  }

  async getSituation(userId: string, sessionId: string) {
    const session = await this.ownedSession(userId, sessionId);
    const row = await this.deps.repository.getSituation(sessionId);
    return {
      situation: row
        ? {
            canonical: row.canonical,
            missingFields: row.missingFields,
            studentEdited: row.studentEdited,
          }
        : null,
      gradePath: session.gradePath,
    };
  }

  /** "See my clusters" after Part D (plan §18.1 R3). Unchanged answers return the stored result. */
  async score(userId: string, sessionId: string) {
    const session = await this.ownedSession(userId, sessionId);
    const current = await this.deps.repository.getCurrentResult(sessionId);
    if (session.status === "scored" && current) return current;
    if (!session.gradePath) throw gradeRequired();

    const [responses, situation] = await Promise.all([
      this.deps.repository.listResponses(sessionId),
      this.deps.repository.getSituation(sessionId),
    ]);
    const progress = progressFor(responses, session.gradePath);
    // Every item in Parts B, C and D must be answered before scoring.
    const missing = (["B", "C", "D"] as const)
      .filter((part) => progress[part].answered < progress[part].total)
      .map((part) => `Part ${part} ${progress[part].answered}/${progress[part].total}`);
    if (missing.length > 0) throw notReadyToScore(missing);

    const result = scoreClusterfit(
      buildScoringInput(session.gradePath, situation?.canonical.medium ?? null, responses),
      this.deps.config,
    );
    const stored = await this.deps.repository.findResultByHash(sessionId, result.inputHash);
    if (!stored)
      await this.deps.repository.insertResult({ id: randomUUID(), sessionId, userId, result });
    await this.deps.repository.updateSession(sessionId, { status: "scored", scoredAt: this.now() });
    return stored ?? result;
  }

  /**
   * Student view: all 12 clusters in the doc's ranking order, the top 3 marked as recommended.
   * Each carries its band as a plain signal word and the doc's roles and routes. No indices or
   * flags.
   */
  async getStudentResult(userId: string, sessionId: string) {
    await this.ownedSession(userId, sessionId);
    const result = await this.deps.repository.getCurrentResult(sessionId);
    if (!result) throw resultNotFound();
    const ranked = rankedClusters(result.clusters);
    // Clusters without an index (only possible in sessions from before every answer was
    // required) go last.
    const unranked = result.clusters.filter((cluster) => cluster.index === null);
    return {
      fallbackUsed: result.presentation.fallbackUsed,
      clusters: [...ranked, ...unranked].map((entry, position) => {
        const cluster = CLUSTERS.find((candidate) => candidate.code === entry.code)!;
        return {
          code: cluster.code,
          name: cluster.name,
          exampleRoles: cluster.exampleRoles,
          entryRoutes: cluster.entryRoutes,
          signal: SIGNAL_FOR_BAND[entry.band] ?? ("low" as const),
          recommended: position < STUDENT_TOP_CLUSTERS && entry.index !== null,
        };
      }),
    };
  }
}
