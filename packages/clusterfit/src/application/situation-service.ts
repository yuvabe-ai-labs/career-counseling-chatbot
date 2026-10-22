import { randomUUID } from "node:crypto";
import {
  FIELD_SCHEMA_VERSION_V3,
  PROMPT_VERSION_V3,
  buildLivePrompt,
  coverageInstruction,
  deriveFromContext,
  missingTopics,
  type KnownContext,
  type TranscriptTurn,
} from "../situation/conversation-context.js";
import { liveWebSocketUrl } from "../situation/live-config.js";
import { CANONICAL_VERSION, mapSituation } from "../situation/mapper.js";
import { KICKOFF_TEXT, MAX_COVERAGE_CHECKS, TOOL_RESULTS } from "../situation/poc-constants.js";
import {
  emptyTranscript,
  extractionFailed,
  liveTokenLimit,
  liveUnavailable,
  profileNotFound,
  sessionLocked,
  sessionNotFound,
} from "./errors.js";
import type {
  ClusterfitRepository,
  ClusterfitStudentProfileReader,
  ContextExtractor,
  LiveTokenIssuer,
  WellbeingCopyReader,
} from "./ports.js";

/** One token per connection, a fresh one on each of up to 3 resumptions (plan §14.7). */
export const MAX_LIVE_TOKENS_PER_SESSION = 3;

export type SituationServiceDependencies = {
  repository: ClusterfitRepository;
  profiles: ClusterfitStudentProfileReader;
  /** Absent when GEMINI_API_KEY is not set; the confirm-card form still works. */
  extractor?: ContextExtractor;
  tokenIssuer?: LiveTokenIssuer;
  wellbeingCopy?: WellbeingCopyReader;
};

/** Part A + Part E: the Gemini Live POC's chat, ported (plan §14, §18.2). */
export class SituationService {
  constructor(private readonly deps: SituationServiceDependencies) {}

  private async context(userId: string, sessionId: string, requireInProgress = true) {
    const session = await this.deps.repository.getSession(sessionId);
    if (!session || session.userId !== userId) throw sessionNotFound();
    if (requireInProgress && session.status !== "in_progress") throw sessionLocked();
    const student = await this.deps.profiles.getStudent(userId);
    if (!student) throw profileNotFound();
    // already_answered is empty: clusterfit skips intake, so the guide covers every topic (§16.1 D3).
    const knownContext: KnownContext = {
      segment: student.segment,
      state: student.state,
      city: student.city,
      already_answered: "",
    };
    return { session, student, knownContext };
  }

  async issueLiveToken(userId: string, sessionId: string) {
    const { student, knownContext } = await this.context(userId, sessionId);
    if (!this.deps.tokenIssuer) throw liveUnavailable();
    const issued = await this.deps.repository.incrementCounter(sessionId, "liveTokensIssued");
    if (issued > MAX_LIVE_TOKENS_PER_SESSION) throw liveTokenLimit();
    const systemInstruction = buildLivePrompt({ first_name: student.firstName, ...knownContext });
    const token = await this.deps.tokenIssuer.issue({ systemInstruction }).catch(() => {
      throw liveUnavailable();
    });
    return {
      token: token.token,
      expiresAt: token.expiresAt,
      model: token.model,
      websocketUrl: liveWebSocketUrl(token.token),
      kickoffText: KICKOFF_TEXT,
      toolResults: { ...TOOL_RESULTS },
      promptVersion: PROMPT_VERSION_V3,
      connectionsLeft: MAX_LIVE_TOKENS_PER_SESSION - issued,
    };
  }

  /** The check_coverage tool. Never blocks the chat from closing (POC rule): any failure → "covered". */
  async coverageCheck(userId: string, sessionId: string, transcript: readonly TranscriptTurn[]) {
    const { knownContext } = await this.context(userId, sessionId);
    const checks = await this.deps.repository.incrementCounter(sessionId, "coverageChecks");
    if (checks > MAX_COVERAGE_CHECKS || !this.deps.extractor)
      return { instruction: coverageInstruction([]) };
    try {
      const { context } = await this.deps.extractor.extract({ knownContext, transcript });
      return { instruction: coverageInstruction(missingTopics(context, knownContext.segment)) };
    } catch {
      return { instruction: coverageInstruction([]) };
    }
  }

  /** end_discovery: extract, store the raw capture, map it (class → grade path, Part E → values). */
  async captureSituation(
    userId: string,
    sessionId: string,
    input: {
      transcript: readonly TranscriptTurn[];
      idempotencyKey: string;
      wellbeingFlagged?: boolean | undefined;
    },
  ) {
    const { session, knownContext } = await this.context(userId, sessionId);
    const replay = await this.deps.repository.findCaptureByIdempotencyKey(input.idempotencyKey);
    if (replay && replay.sessionId === sessionId) {
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
        warnings: [] as string[],
      };
    }
    if (!input.transcript.some((turn) => turn.speaker === "student" && turn.text.trim()))
      throw emptyTranscript();
    if (!this.deps.extractor) throw liveUnavailable();

    const { model, context } = await this.deps.extractor
      .extract({ knownContext, transcript: input.transcript })
      .catch(() => {
        throw extractionFailed();
      });
    const derived = deriveFromContext(context, knownContext.segment);
    const capture = await this.deps.repository.insertCapture({
      id: randomUUID(),
      sessionId,
      source: "live",
      fieldSchemaVersion: FIELD_SCHEMA_VERSION_V3,
      rawFields: context,
      derived: { model, promptVersion: PROMPT_VERSION_V3, ...derived },
      transcriptText: input.transcript.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
      // Goes to the safety flow only, never into scoring or the situation view (POC rule §4.D).
      wellbeingFlag: context.wellbeing_flag || Boolean(input.wellbeingFlagged),
      idempotencyKey: input.idempotencyKey,
      capturedAt: new Date().toISOString(),
    });

    const mapping = mapSituation(FIELD_SCHEMA_VERSION_V3, capture.rawFields);
    await this.deps.repository.upsertSituation(sessionId, {
      canonical: mapping.canonical,
      canonicalVersion: CANONICAL_VERSION,
      mapperVersion: mapping.mapperVersion,
      missingFields: mapping.missingFields,
      unmappedFields: mapping.unmappedFields,
      studentEdited: false,
      latestCaptureId: capture.id,
    });
    await this.deps.repository.upsertValues(sessionId, mapping.canonical.values);
    // The grade path is set when "About you" is completed (ClusterfitService.completeSituation),
    // never here: a capture can finish after the student has already moved on.
    return {
      situation: {
        canonical: mapping.canonical,
        missingFields: mapping.missingFields,
        studentEdited: false,
      },
      gradePath: session.gradePath,
      warnings: derived.warnings,
    };
  }

  /** flag_wellbeing_concern: the safety module's approved message, or null (nothing is invented). */
  async wellbeingMessage(userId: string, sessionId: string) {
    await this.context(userId, sessionId, false);
    return { message: (await this.deps.wellbeingCopy?.getWellbeingCopy()) ?? null };
  }

  /** Dev-only twin of the POC's /api/extract, for comparing outputs on a pasted transcript. */
  async devExtract(knownContext: KnownContext, transcript: readonly TranscriptTurn[]) {
    if (!this.deps.extractor) throw liveUnavailable();
    if (!transcript.some((turn) => turn.speaker === "student")) throw emptyTranscript();
    const { model, context } = await this.deps.extractor.extract({ knownContext, transcript });
    return { model, context, ...deriveFromContext(context, knownContext.segment) };
  }
}
