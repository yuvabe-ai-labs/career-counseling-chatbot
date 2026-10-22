import { saveClusterfitAnswer } from "../api/clusterfit";

/**
 * Autosaves one answer. The idempotency key and latency are made here, in an event-handler path,
 * not during render. The server upserts on (session, item), so the last answer wins.
 */
export const saveAnswer = (input: {
  sessionId: string;
  itemKey: string;
  answer: string | number;
  /** performance.now() when the item was shown. */
  shownAt: number;
}) =>
  saveClusterfitAnswer(input.sessionId, {
    itemKey: input.itemKey,
    answer: input.answer,
    ...(input.shownAt ? { latencyMs: Math.round(performance.now() - input.shownAt) } : {}),
    idempotencyKey: crypto.randomUUID(),
  });
