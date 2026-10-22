import type { ClusterfitResult, ClusterfitValuesRanking } from "@yuvapath/contracts";
import type { Pool } from "pg";
import type {
  ClusterfitCaptureRow,
  ClusterfitRepository,
  ClusterfitResponseRow,
  ClusterfitSessionRow,
  ClusterfitSituationRow,
} from "../application/ports.js";

type Row = Record<string, unknown>;

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value);
const isoOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : iso(value);

const toSession = (row: Row): ClusterfitSessionRow => ({
  id: String(row.id),
  userId: String(row.user_id),
  journeySessionId: (row.journey_session_id as string | null) ?? null,
  contentVersion: String(row.content_version),
  gradePath: (row.grade_path as ClusterfitSessionRow["gradePath"]) ?? null,
  status: row.status as ClusterfitSessionRow["status"],
  liveTokensIssued: Number(row.live_tokens_issued),
  coverageChecks: Number(row.coverage_checks),
  attemptNumber: Number(row.attempt_number),
  idempotencyKey: (row.idempotency_key as string | null) ?? null,
  startedAt: iso(row.started_at),
  scoredAt: isoOrNull(row.scored_at),
});

const toCapture = (row: Row): ClusterfitCaptureRow => ({
  id: String(row.id),
  sessionId: String(row.session_id),
  source: row.source as ClusterfitCaptureRow["source"],
  fieldSchemaVersion: String(row.field_schema_version),
  rawFields: row.raw_fields_json as Record<string, unknown>,
  derived: row.derived_json as Record<string, unknown>,
  transcriptText: (row.transcript_text as string | null) ?? null,
  wellbeingFlag: Boolean(row.wellbeing_flag),
  idempotencyKey: (row.idempotency_key as string | null) ?? null,
  capturedAt: iso(row.captured_at),
});

const SESSION_COLUMNS = `id, user_id, journey_session_id, content_version, grade_path, status, live_tokens_issued,
  coverage_checks, attempt_number, idempotency_key, started_at, scored_at`;

/** Postgres ClusterfitRepository: owns all SQL for the `clusterfit` schema and nothing else. */
export class PostgresClusterfitRepository implements ClusterfitRepository {
  constructor(private readonly pool: Pool) {}

  async findSessionByIdempotencyKey(idempotencyKey: string) {
    const { rows } = await this.pool.query<Row>(
      `select ${SESSION_COLUMNS} from clusterfit.sessions where idempotency_key = $1`,
      [idempotencyKey],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async findLatestSessionForUser(userId: string) {
    const { rows } = await this.pool.query<Row>(
      `select ${SESSION_COLUMNS} from clusterfit.sessions where user_id = $1
       order by started_at desc, attempt_number desc limit 1`,
      [userId],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async countSessionsForUser(userId: string) {
    const { rows } = await this.pool.query<Row>(
      "select count(*)::int as n from clusterfit.sessions where user_id = $1",
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async createSession(row: ClusterfitSessionRow) {
    const { rows } = await this.pool.query<Row>(
      `insert into clusterfit.sessions
         (id, user_id, journey_session_id, content_version, grade_path, status, attempt_number, idempotency_key, started_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (idempotency_key) do update set updated_at = clusterfit.sessions.updated_at
       returning ${SESSION_COLUMNS}`,
      [
        row.id,
        row.userId,
        row.journeySessionId,
        row.contentVersion,
        row.gradePath,
        row.status,
        row.attemptNumber,
        row.idempotencyKey,
        row.startedAt,
      ],
    );
    return toSession(rows[0]!);
  }

  async getSession(sessionId: string) {
    const { rows } = await this.pool.query<Row>(
      `select ${SESSION_COLUMNS} from clusterfit.sessions where id = $1`,
      [sessionId],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async updateSession(
    sessionId: string,
    patch: Partial<Pick<ClusterfitSessionRow, "gradePath" | "status" | "scoredAt">> & {
      lastAnsweredAt?: string;
    },
  ) {
    const columns: [string, unknown][] = [];
    if (patch.gradePath !== undefined) columns.push(["grade_path", patch.gradePath]);
    if (patch.status !== undefined) columns.push(["status", patch.status]);
    if (patch.scoredAt !== undefined) columns.push(["scored_at", patch.scoredAt]);
    if (patch.lastAnsweredAt !== undefined)
      columns.push(["last_answered_at", patch.lastAnsweredAt]);
    if (columns.length === 0) return;
    const assignments = columns.map(([column], index) => `${column} = $${index + 2}`).join(", ");
    await this.pool.query(
      `update clusterfit.sessions set ${assignments}, updated_at = now() where id = $1`,
      [sessionId, ...columns.map(([, value]) => value)],
    );
  }

  async incrementCounter(sessionId: string, counter: "liveTokensIssued" | "coverageChecks") {
    const column = counter === "liveTokensIssued" ? "live_tokens_issued" : "coverage_checks";
    const { rows } = await this.pool.query<Row>(
      `update clusterfit.sessions set ${column} = ${column} + 1, updated_at = now() where id = $1 returning ${column} as value`,
      [sessionId],
    );
    return Number(rows[0]?.value ?? 0);
  }

  async upsertResponse(
    sessionId: string,
    row: ClusterfitResponseRow & { idempotencyKey: string | null },
  ) {
    await this.pool.query(
      `insert into clusterfit.responses
         (id, session_id, part, item_key, value, option_key, latency_ms, idempotency_key, answered_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (session_id, item_key) do update set
         value = excluded.value, option_key = excluded.option_key, latency_ms = excluded.latency_ms,
         idempotency_key = excluded.idempotency_key, answered_at = excluded.answered_at, received_at = now()`,
      [
        sessionId,
        row.part,
        row.itemKey,
        row.value,
        row.optionKey,
        row.latencyMs,
        row.idempotencyKey,
        row.answeredAt,
      ],
    );
  }

  async listResponses(sessionId: string) {
    const { rows } = await this.pool.query<Row>(
      "select part, item_key, value, option_key, latency_ms, answered_at from clusterfit.responses where session_id = $1",
      [sessionId],
    );
    return rows.map((row): ClusterfitResponseRow => ({
      part: String(row.part) as ClusterfitResponseRow["part"],
      itemKey: String(row.item_key),
      value: row.value === null ? null : Number(row.value),
      optionKey: (row.option_key as ClusterfitResponseRow["optionKey"]) ?? null,
      latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
      answeredAt: iso(row.answered_at),
    }));
  }

  async insertCapture(row: ClusterfitCaptureRow) {
    const { rows } = await this.pool.query<Row>(
      `insert into clusterfit.situation_captures
         (id, session_id, source, field_schema_version, raw_fields_json, derived_json, transcript_text,
          wellbeing_flag, idempotency_key, captured_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [
        row.id,
        row.sessionId,
        row.source,
        row.fieldSchemaVersion,
        JSON.stringify(row.rawFields),
        JSON.stringify(row.derived),
        row.transcriptText,
        row.wellbeingFlag,
        row.idempotencyKey,
        row.capturedAt,
      ],
    );
    return toCapture(rows[0]!);
  }

  async findCaptureByIdempotencyKey(idempotencyKey: string) {
    const { rows } = await this.pool.query<Row>(
      "select * from clusterfit.situation_captures where idempotency_key = $1",
      [idempotencyKey],
    );
    return rows[0] ? toCapture(rows[0]) : null;
  }

  async getSituation(sessionId: string): Promise<ClusterfitSituationRow | null> {
    const { rows } = await this.pool.query<Row>(
      "select * from clusterfit.situations where session_id = $1",
      [sessionId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      canonical: row.canonical_json as ClusterfitSituationRow["canonical"],
      canonicalVersion: String(row.canonical_version),
      mapperVersion: (row.mapper_version as string | null) ?? null,
      missingFields: (row.missing_fields as string[] | null) ?? [],
      unmappedFields: (row.unmapped_fields as string[] | null) ?? [],
      studentEdited: Boolean(row.student_edited),
      latestCaptureId: (row.latest_capture_id as string | null) ?? null,
    };
  }

  async upsertSituation(sessionId: string, row: ClusterfitSituationRow) {
    await this.pool.query(
      `insert into clusterfit.situations
         (session_id, latest_capture_id, canonical_json, canonical_version, mapper_version, missing_fields,
          unmapped_fields, student_edited)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (session_id) do update set
         latest_capture_id = excluded.latest_capture_id, canonical_json = excluded.canonical_json,
         canonical_version = excluded.canonical_version, mapper_version = excluded.mapper_version,
         missing_fields = excluded.missing_fields, unmapped_fields = excluded.unmapped_fields,
         student_edited = excluded.student_edited, updated_at = now()`,
      [
        sessionId,
        row.latestCaptureId,
        JSON.stringify(row.canonical),
        row.canonicalVersion,
        row.mapperVersion,
        row.missingFields,
        row.unmappedFields,
        row.studentEdited,
      ],
    );
  }

  async upsertValues(sessionId: string, ranking: ClusterfitValuesRanking | null) {
    await this.pool.query(
      `insert into clusterfit.values_rankings (session_id, ranking_json) values ($1, $2)
       on conflict (session_id) do update set ranking_json = excluded.ranking_json, updated_at = now()`,
      [sessionId, ranking === null ? null : JSON.stringify(ranking)],
    );
  }

  async findResultByHash(sessionId: string, inputHash: string) {
    const { rows } = await this.pool.query<Row>(
      "select result_json from clusterfit.results where session_id = $1 and input_hash = $2",
      [sessionId, inputHash],
    );
    return rows[0] ? (rows[0].result_json as ClusterfitResult) : null;
  }

  async getCurrentResult(sessionId: string) {
    const { rows } = await this.pool.query<Row>(
      "select result_json from clusterfit.results where session_id = $1 and is_current",
      [sessionId],
    );
    return rows[0] ? (rows[0].result_json as ClusterfitResult) : null;
  }

  async insertResult(input: {
    id: string;
    sessionId: string;
    userId: string;
    result: ClusterfitResult;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "update clusterfit.results set is_current = false where session_id = $1 and is_current",
        [input.sessionId],
      );
      await client.query(
        `insert into clusterfit.results
           (id, session_id, user_id, content_version, scoring_version, input_hash, result_json)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.id,
          input.sessionId,
          input.userId,
          input.result.contentVersion,
          input.result.scoringVersion,
          input.result.inputHash,
          JSON.stringify(input.result),
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
