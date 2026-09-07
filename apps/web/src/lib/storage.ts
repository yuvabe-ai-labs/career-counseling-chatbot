/**
 * Client-side persistence for the identity/journey-session state Module 1's
 * `x-yuvanext-user-id` auth model requires (see docs/poc/Validating-endpoints.md).
 * `userId` and `journeySessionId` are plain UUIDs, not signed credentials, so
 * storing them in localStorage only lets the browser resume where it left off —
 * it grants no elevated access beyond what the backend already allows anyone
 * holding that UUID to do.
 */

const USER_ID_KEY = "yuvanext.userId";
const JOURNEY_SESSION_ID_KEY = "yuvanext.journeySessionId";
const PENDING_SESSION_ID_KEY = "yuvanext.pendingSessionId";
const EMAIL_KEY = "yuvanext.email";
const ASSESSMENT_RUN_ID_KEY = "yuvanext.assessmentRunId";

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

export const getStoredUserId = () => read(USER_ID_KEY);
export const setStoredUserId = (userId: string) => write(USER_ID_KEY, userId);

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

/**
 * The active RIASEC AssessmentRun id (`POST .../assessment-runs`) — kept so reloading or
 * re-visiting the assessment/results screens resumes the same run instead of calling
 * AssessmentService.startRun again. That call always creates a brand-new run (no existing-run
 * lookup in the backend today — see AssessmentService.startRun), so the frontend, not the
 * backend, is what has to avoid calling it more than once per attempt.
 */
export const getStoredAssessmentRunId = () => read(ASSESSMENT_RUN_ID_KEY);
export const setStoredAssessmentRunId = (runId: string) => write(ASSESSMENT_RUN_ID_KEY, runId);
export const clearStoredAssessmentRunId = () => remove(ASSESSMENT_RUN_ID_KEY);

export function clearStoredSession(): void {
  remove(USER_ID_KEY);
  remove(JOURNEY_SESSION_ID_KEY);
  remove(PENDING_SESSION_ID_KEY);
  remove(EMAIL_KEY);
  remove(ASSESSMENT_RUN_ID_KEY);
}
