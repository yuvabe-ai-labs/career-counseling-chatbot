import type {
  AssessmentItem,
  AssessmentResponse,
  AssessmentResult,
  AssessmentRun,
  InstrumentCode,
  ProfileSnapshot,
  Segment,
  UserProfile,
} from "@yuvapath/contracts";
import type { ScoredResponseInput } from "../domain/scoring.js";

export type AssessmentVersionRecord = {
  id: string;
  instrumentCode: InstrumentCode;
  instrumentVersion: string;
  algorithmVersion: string;
  batchSize: number;
  itemCount: number;
};

export type NewAssessmentRun = {
  id: string;
  userId: string;
  journeySessionId: string;
  assessmentVersionId: string;
  segment: Segment;
  status: "active";
  currentPosition: number;
  startedAt: string;
  resumeExpiresAt: string;
  attemptNumber: number;
  createdAt: string;
};

export type NewAssessmentResponse = {
  id: string;
  assessmentRunId: string;
  itemId: string;
  selectedOptionId: string | null;
  responseValue: number | null;
  responseJson: unknown;
  latencyMs: number | null;
  answeredAt: string;
  receivedAt: string;
};

export type NewAssessmentSnapshot = {
  id: string;
  userId: string;
  profileVersion: number;
  profile: UserProfile;
  intakeSummary: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  algorithmVersion: string;
  snapshotSchemaVersion: number;
  payloadHash: string;
  sourceResults: Array<{ resultId: string; role: "interest" | "values"; displayOrder: number }>;
  createdAt: string;
};

export type AssessmentRepository = {
  findActiveVersion(input: {
    instrumentCode: InstrumentCode;
    language: string;
    ageAtOnboarding: number;
    now: string;
  }): Promise<AssessmentVersionRecord | null>;
  createRun(input: NewAssessmentRun): Promise<AssessmentRun>;
  findRunByIdForUser(input: { runId: string; userId: string }): Promise<AssessmentRun | null>;
  /** Resume support: this user's most recent run for this exact assessment version, regardless
   * of status (active or completed) — not scoped to any journey session, since a fresh one is
   * minted every sign-in. Deliberately includes a completed run: returning it (rather than only
   * "active") lets getNext's existing isComplete check redirect straight to results instead of
   * a new attempt being started for an instrument the user already finished. */
  findLatestRunForUser(input: {
    userId: string;
    assessmentVersionId: string;
  }): Promise<AssessmentRun | null>;
  listRunItems(runId: string): Promise<AssessmentItem[]>;
  listAnsweredItemIds(runId: string): Promise<Set<string>>;
  findItemForRun(input: { runId: string; itemId: string }): Promise<AssessmentItem | null>;
  findOptionForItem(input: { itemId: string; optionId: string }): Promise<{ id: string; scoreDelta: number | null } | null>;
  upsertResponse(input: NewAssessmentResponse): Promise<AssessmentResponse>;
  updateRunProgress(input: {
    runId: string;
    currentPosition: number;
    status: "active" | "completed";
    now: string;
  }): Promise<AssessmentRun>;
  listScoringResponses(runId: string): Promise<ScoredResponseInput[]>;
  createResult(input: AssessmentResult): Promise<AssessmentResult>;
  findResultByRunForUser(input: { runId: string; userId: string }): Promise<AssessmentResult | null>;
  findLatestResultByUserForInstrument(input: {
    userId: string;
    instrumentCode: InstrumentCode;
  }): Promise<AssessmentResult | null>;
  /** The student's latest RIASEC-family result (any of ip_60/mini_ip_30/photo_ip — whichever
   *  instrument their segment actually used — never "wip", which is a separate work-values
   *  instrument), regardless of instrument code. Backs the counselor-facing student report
   *  (CounselorStudentService.getStudentReport), which doesn't know in advance which RIASEC
   *  instrument a given student took. */
  findLatestRiasecResultForUser(userId: string): Promise<AssessmentResult | null>;
  getIntakeSummary(input: { userId: string; sessionId: string }): Promise<Record<string, unknown>>;
  getNextProfileVersion(userId: string): Promise<number>;
  createAssessmentSnapshot(input: NewAssessmentSnapshot): Promise<ProfileSnapshot>;
};
