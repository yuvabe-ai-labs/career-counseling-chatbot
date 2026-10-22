import type { ClusterfitResult, ClusterfitValuesRanking } from "@yuvapath/contracts";
import type {
  ClusterfitCaptureRow,
  ClusterfitRepository,
  ClusterfitResponseRow,
  ClusterfitSessionRow,
  ClusterfitSituationRow,
} from "../application/ports.js";

/** In-memory ClusterfitRepository for tests and the fixture runtime. */
export class InMemoryClusterfitRepository implements ClusterfitRepository {
  readonly sessions = new Map<string, ClusterfitSessionRow>();
  readonly responses = new Map<string, Map<string, ClusterfitResponseRow>>();
  readonly captures: ClusterfitCaptureRow[] = [];
  readonly situations = new Map<string, ClusterfitSituationRow>();
  readonly values = new Map<string, ClusterfitValuesRanking | null>();
  readonly results = new Map<string, { result: ClusterfitResult; isCurrent: boolean }[]>();

  findSessionByIdempotencyKey(key: string) {
    return Promise.resolve(
      [...this.sessions.values()].find((session) => session.idempotencyKey === key) ?? null,
    );
  }

  findLatestSessionForUser(userId: string) {
    const owned = [...this.sessions.values()].filter((session) => session.userId === userId);
    owned.sort(
      (a, b) => b.startedAt.localeCompare(a.startedAt) || b.attemptNumber - a.attemptNumber,
    );
    return Promise.resolve(owned[0] ?? null);
  }

  countSessionsForUser(userId: string) {
    return Promise.resolve(
      [...this.sessions.values()].filter((session) => session.userId === userId).length,
    );
  }

  createSession(row: ClusterfitSessionRow) {
    this.sessions.set(row.id, { ...row });
    return Promise.resolve({ ...row });
  }

  getSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return Promise.resolve(session ? { ...session } : null);
  }

  updateSession(
    sessionId: string,
    patch: Partial<ClusterfitSessionRow> & { lastAnsweredAt?: string },
  ) {
    const { lastAnsweredAt: _ignored, ...fields } = patch;
    void _ignored;
    const session = this.sessions.get(sessionId);
    if (session) this.sessions.set(sessionId, { ...session, ...fields });
    return Promise.resolve();
  }

  incrementCounter(sessionId: string, counter: "liveTokensIssued" | "coverageChecks") {
    const session = this.sessions.get(sessionId)!;
    session[counter] += 1;
    return Promise.resolve(session[counter]);
  }

  upsertResponse(
    sessionId: string,
    row: ClusterfitResponseRow & { idempotencyKey: string | null },
  ) {
    const stored: ClusterfitResponseRow = {
      part: row.part,
      itemKey: row.itemKey,
      value: row.value,
      optionKey: row.optionKey,
      latencyMs: row.latencyMs,
      answeredAt: row.answeredAt,
    };
    const bySession = this.responses.get(sessionId) ?? new Map<string, ClusterfitResponseRow>();
    bySession.set(row.itemKey, stored);
    this.responses.set(sessionId, bySession);
    return Promise.resolve();
  }

  listResponses(sessionId: string) {
    return Promise.resolve([...(this.responses.get(sessionId)?.values() ?? [])]);
  }

  insertCapture(row: ClusterfitCaptureRow) {
    this.captures.push({ ...row });
    return Promise.resolve({ ...row });
  }

  findCaptureByIdempotencyKey(key: string) {
    return Promise.resolve(this.captures.find((capture) => capture.idempotencyKey === key) ?? null);
  }

  getSituation(sessionId: string) {
    return Promise.resolve(this.situations.get(sessionId) ?? null);
  }

  upsertSituation(sessionId: string, row: ClusterfitSituationRow) {
    this.situations.set(sessionId, row);
    return Promise.resolve();
  }

  upsertValues(sessionId: string, ranking: ClusterfitValuesRanking | null) {
    this.values.set(sessionId, ranking);
    return Promise.resolve();
  }

  findResultByHash(sessionId: string, inputHash: string) {
    const found = (this.results.get(sessionId) ?? []).find(
      (entry) => entry.result.inputHash === inputHash,
    );
    return Promise.resolve(found?.result ?? null);
  }

  getCurrentResult(sessionId: string) {
    return Promise.resolve(
      (this.results.get(sessionId) ?? []).find((entry) => entry.isCurrent)?.result ?? null,
    );
  }

  insertResult(input: { id: string; sessionId: string; userId: string; result: ClusterfitResult }) {
    const list = this.results.get(input.sessionId) ?? [];
    for (const entry of list) entry.isCurrent = false;
    list.push({ result: input.result, isCurrent: true });
    this.results.set(input.sessionId, list);
    return Promise.resolve();
  }
}
