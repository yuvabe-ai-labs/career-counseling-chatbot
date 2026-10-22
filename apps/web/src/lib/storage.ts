/**
 * Client-side persistence for the student's identity/journey-session state, which the
 * `x-yuvapath-user-id` auth model requires. `userId` and `journeySessionId` are plain UUIDs, not
 * signed credentials, so storing them in localStorage only lets the browser resume where it left
 * off — it grants no elevated access beyond what the backend already allows anyone holding that
 * UUID to do.
 */

const USER_ID_KEY = "yuvapath.userId";
const JOURNEY_SESSION_ID_KEY = "yuvapath.journeySessionId";
const PENDING_SESSION_ID_KEY = "yuvapath.pendingSessionId";
const EMAIL_KEY = "yuvapath.email";
/** Keys from the removed RIASEC flow and staff portals; still cleared on sign-out. */
const LEGACY_KEYS = [
  "yuvapath.assessmentRunId",
  "yuvapath.profileSnapshotId",
  "yuvapath.exploreGatingContext",
  "yuvapath.counselorUserId",
  "yuvapath.counselorDisplayName",
  "yuvapath.counselorSessionExpiresAt",
  "yuvapath.adminUserId",
  "yuvapath.adminDisplayName",
  "yuvapath.adminSessionExpiresAt",
];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable (private mode, disabled storage) — degrade silently */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Client-side session timeout: 1 hour from sign-in (a fixed window, not extended by activity).
 * Enforced on read — an expired session is cleared and reads as signed out, so the route guards,
 * the landing page and API calls all agree. The backend's own journey-session TTL (7 days) is
 * longer, so this is the binding limit.
 */
export const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
const SESSION_EXPIRES_AT_KEY = "yuvapath.sessionExpiresAt";

/** True once the stored deadline has passed. A session stored before this timeout existed has no
 *  deadline yet — its clock starts now, rather than signing everyone out on deploy. */
function isExpired(expiresAtKey: string): boolean {
  const raw = read(expiresAtKey);
  if (raw === null) {
    write(expiresAtKey, String(Date.now() + SESSION_TIMEOUT_MS));
    return false;
  }
  return Date.now() >= Number(raw);
}

export const getStoredUserId = () => {
  const userId = read(USER_ID_KEY);
  if (userId && isExpired(SESSION_EXPIRES_AT_KEY)) {
    clearStoredSession();
    return null;
  }
  return userId;
};
export const setStoredUserId = (userId: string) => {
  write(USER_ID_KEY, userId);
  write(SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_TIMEOUT_MS));
};

export const getStoredJourneySessionId = () => read(JOURNEY_SESSION_ID_KEY);
export const setStoredJourneySessionId = (sessionId: string) =>
  write(JOURNEY_SESSION_ID_KEY, sessionId);

/** The verified student email — kept so a reload doesn't need to ask for it again. */
export const getStoredEmail = () => read(EMAIL_KEY);
export const setStoredEmail = (email: string) => write(EMAIL_KEY, email);

/** The pre-verification pending session id (`POST /sessions/anonymous`) — cleared once OTP verify succeeds. */
export const getStoredPendingSessionId = () => read(PENDING_SESSION_ID_KEY);
export const setStoredPendingSessionId = (pendingSessionId: string) =>
  write(PENDING_SESSION_ID_KEY, pendingSessionId);
export const clearStoredPendingSessionId = () => remove(PENDING_SESSION_ID_KEY);

export function clearStoredSession(): void {
  remove(USER_ID_KEY);
  remove(JOURNEY_SESSION_ID_KEY);
  remove(SESSION_EXPIRES_AT_KEY);
  remove(PENDING_SESSION_ID_KEY);
  remove(EMAIL_KEY);
  for (const key of LEGACY_KEYS) remove(key);
}
