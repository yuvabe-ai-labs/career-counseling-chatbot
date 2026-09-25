/**
 * Client-side persistence for the identity/journey-session state Module 1's
 * `x-yuvapath-user-id` auth model requires (see docs/poc/Validating-endpoints.md).
 * `userId` and `journeySessionId` are plain UUIDs, not signed credentials, so
 * storing them in localStorage only lets the browser resume where it left off —
 * it grants no elevated access beyond what the backend already allows anyone
 * holding that UUID to do.
 */

const USER_ID_KEY = "yuvapath.userId";
/** Kept structurally separate from USER_ID_KEY (the student session) so a counselor's userId is
 *  never accidentally sent as x-yuvapath-user-id on a student-scoped request, or vice versa —
 *  even though both ultimately resolve to the same auth.users table. See
 *  docs/architecture/counselor-auth-landing-page-plan.md. */
const COUNSELOR_USER_ID_KEY = "yuvapath.counselorUserId";
/** The counselor's display name (operations.staff_profiles.display_name), captured at sign-in so
 *  the account-avatar initials survive a reload without a re-fetch — see CounselorSessionContext. */
const COUNSELOR_DISPLAY_NAME_KEY = "yuvapath.counselorDisplayName";
const JOURNEY_SESSION_ID_KEY = "yuvapath.journeySessionId";
const PENDING_SESSION_ID_KEY = "yuvapath.pendingSessionId";
const EMAIL_KEY = "yuvapath.email";
const ASSESSMENT_RUN_ID_KEY = "yuvapath.assessmentRunId";
const PROFILE_SNAPSHOT_ID_KEY = "yuvapath.profileSnapshotId";
const EXPLORE_GATING_CONTEXT_KEY = "yuvapath.exploreGatingContext";

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
 * Client-side session timeout, for both aspirants and counsellors: 1 hour from sign-in (a fixed
 * window, not extended by activity). Enforced on read — an expired session is cleared and reads as
 * signed out, so the route guards, the landing page and API calls all agree. The backend's own
 * journey-session TTL (7 days) is longer, so this is the binding limit for students; counsellors
 * have no server-side expiry, so this is their only one.
 */
export const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
const SESSION_EXPIRES_AT_KEY = "yuvapath.sessionExpiresAt";
const COUNSELOR_SESSION_EXPIRES_AT_KEY = "yuvapath.counselorSessionExpiresAt";

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

export const getStoredCounselorUserId = () => {
  const userId = read(COUNSELOR_USER_ID_KEY);
  if (userId && isExpired(COUNSELOR_SESSION_EXPIRES_AT_KEY)) {
    clearStoredCounselorUserId();
    remove(COUNSELOR_DISPLAY_NAME_KEY);
    return null;
  }
  return userId;
};
export const setStoredCounselorUserId = (userId: string) => {
  write(COUNSELOR_USER_ID_KEY, userId);
  write(COUNSELOR_SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_TIMEOUT_MS));
};
export const clearStoredCounselorUserId = () => {
  remove(COUNSELOR_USER_ID_KEY);
  remove(COUNSELOR_SESSION_EXPIRES_AT_KEY);
};

export const getStoredCounselorDisplayName = () => read(COUNSELOR_DISPLAY_NAME_KEY);
export const setStoredCounselorDisplayName = (displayName: string) =>
  write(COUNSELOR_DISPLAY_NAME_KEY, displayName);
export const clearStoredCounselorDisplayName = () => remove(COUNSELOR_DISPLAY_NAME_KEY);

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

/**
 * The ProfileSnapshot id every recommendation call (career/stream/pathway/...) is keyed on.
 * `createAssessmentSnapshot` (features/assessment/api/assessment-snapshot.ts) is NOT
 * idempotent on the backend — each call makes a new snapshot row — so callers must check this
 * is unset before calling it, exactly like `getStoredAssessmentRunId` guards `startRun` above.
 */
export const getStoredProfileSnapshotId = () => read(PROFILE_SNAPSHOT_ID_KEY);
export const setStoredProfileSnapshotId = (profileSnapshotId: string) =>
  write(PROFILE_SNAPSHOT_ID_KEY, profileSnapshotId);
export const clearStoredProfileSnapshotId = () => remove(PROFILE_SNAPSHOT_ID_KEY);

/**
 * The tab-gating fields (see `tabsToShow()` in
 * apps/web/src/features/recommendations/lib/tabs-to-show.ts, originally ported from
 * docs/poc/launcher-goal-based-recommendations.md Part 5, since superseded on the Launcher
 * branch) needed by ExplorePathPage/CareerPage — segment, whether the student asked to see aid
 * (pathfinder intake answer `seeks_aid`), and (Launcher only) their goal. Stored as plain JSON here rather than re-fetched via
 * `GET /api/v1/assessment-snapshots`, which requires a Supabase Auth bearer token this app
 * doesn't implement (see api/assessment-snapshot.ts) — the POST that creates the snapshot
 * already returns everything needed, so it's captured there once instead.
 */
export type ExploreGatingContext = {
  segment: "explorer" | "pathfinder" | "launcher";
  seeksAid: boolean;
  currentGoal: string | undefined;
};

export function getStoredExploreGatingContext(): ExploreGatingContext | null {
  const raw = read(EXPLORE_GATING_CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExploreGatingContext;
  } catch {
    return null;
  }
}

export function setStoredExploreGatingContext(context: ExploreGatingContext): void {
  write(EXPLORE_GATING_CONTEXT_KEY, JSON.stringify(context));
}

export function clearStoredSession(): void {
  remove(USER_ID_KEY);
  remove(JOURNEY_SESSION_ID_KEY);
  remove(SESSION_EXPIRES_AT_KEY);
  remove(PENDING_SESSION_ID_KEY);
  remove(EMAIL_KEY);
  remove(ASSESSMENT_RUN_ID_KEY);
  remove(PROFILE_SNAPSHOT_ID_KEY);
  remove(EXPLORE_GATING_CONTEXT_KEY);
}
