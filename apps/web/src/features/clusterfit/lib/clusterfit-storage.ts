import { getStoredUserId } from "@/lib/storage";

/**
 * Clusterfit's own browser state, kept apart from the core keys in src/lib/storage.ts. Only ids
 * live here; every answer itself is saved on the server. Every key is scoped to the signed-in
 * student, so a second student on the same browser never inherits the first one's session or
 * start key.
 */
const SESSION_KEY = "yuvapath.clusterfit.sessionId";
const START_KEY = "yuvapath.clusterfit.startKey";

const scoped = (key: string): string => `${key}.${getStoredUserId() ?? "anonymous"}`;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(scoped(key));
  } catch {
    return null;
  }
};
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(scoped(key), value);
  } catch {
    /* storage unavailable: resume still works from the server */
  }
};

export const getStoredClusterfitSessionId = () => read(SESSION_KEY);
export const setStoredClusterfitSessionId = (id: string) => write(SESSION_KEY, id);

/** One idempotency key per start, so a retried POST /sessions never creates a second session. */
export const getClusterfitStartKey = (): string => {
  const existing = read(START_KEY);
  if (existing) return existing;
  const key = crypto.randomUUID();
  write(START_KEY, key);
  return key;
};
