import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import {
  getStoredExploreGatingContext,
  getStoredProfileSnapshotId,
  setStoredAssessmentRunId,
  setStoredExploreGatingContext,
  setStoredJourneySessionId,
  setStoredUserId,
} from "@/lib/storage";
import { RiasecResultsPage, SessionProvider } from "@/features/assessment";

const { toJpeg, pdfSave } = vi.hoisted(() => ({
  toJpeg: vi.fn(),
  pdfSave: vi.fn(),
}));

vi.mock("html-to-image", () => ({ toJpeg }));
vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210 } };
    addImage() {}
    save(name: string) {
      pdfSave(name);
    }
  },
}));

const {
  scoreAssessmentRun,
  createAssessmentSnapshot,
  getUserProfile,
  getIntakeQuestions,
  getCareerRecommendations,
  getStreamRecommendations,
  getPathwayRecommendations,
} = vi.hoisted(() => ({
  scoreAssessmentRun: vi.fn(),
  createAssessmentSnapshot: vi.fn(),
  getUserProfile: vi.fn(),
  getIntakeQuestions: vi.fn(),
  getCareerRecommendations: vi.fn(),
  getStreamRecommendations: vi.fn(),
  getPathwayRecommendations: vi.fn(),
}));

vi.mock("@/features/assessment/api/profile", () => ({ getUserProfile, upsertUserProfile: vi.fn() }));
vi.mock("@/features/assessment/api/intake", () => ({ getIntakeQuestions, upsertIntakeAnswer: vi.fn() }));
vi.mock("@/features/recommendations/api/career", () => ({ getCareerRecommendations }));
vi.mock("@/features/recommendations/api/stream", () => ({ getStreamRecommendations }));
vi.mock("@/features/recommendations/api/pathway", () => ({ getPathwayRecommendations }));

const PROFILE = {
  userId: "user-id",
  firstName: "Asha",
  ageAtOnboarding: 17,
  ageBand: "minor_16_17",
  city: "Chennai",
  state: "Tamil Nadu",
  countryCode: "IN",
  segment: "pathfinder" as const,
  selfStage: "higher_secondary" as const,
  profileStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

const QUESTION_SET = {
  id: "00000000-0000-4000-8000-000000000001",
  segment: "pathfinder",
  version: "1.0",
  language: "en",
};

function recommendationSet(kind: string, titles: string[]) {
  return {
    kind,
    items: titles.map((title, index) => ({
      itemId: `${kind}:${index}`,
      entityType: kind,
      entityId: `id-${kind}-${index}`,
      title,
      rank: index + 1,
      fitScore: 0.9,
      explanation: {},
      entityDatasetVersion: "test",
    })),
  };
}

vi.mock("@/features/assessment/api/assessment", () => ({
  startAssessmentRun: vi.fn(),
  getNextAssessmentBatch: vi.fn(),
  submitAssessmentResponse: vi.fn(),
  scoreAssessmentRun,
}));

vi.mock("@/features/assessment/api/assessment-snapshot", () => ({
  createAssessmentSnapshot,
}));

// Deliberately uneven, non-mock-looking percentages, distinct per scale, to prove the bars and
// the code both come from the backend's actual result rather than a hardcoded example.
const RESULT = {
  id: "result-1",
  assessmentRunId: "run-1",
  userId: "user-id",
  instrumentCode: "mini_ip_30" as const,
  instrumentVersion: "1.0",
  algorithmVersion: "riasec-deterministic-v1",
  rawScores: { R: 10, I: 8, A: 6, S: 4, E: 2, C: 1 },
  normalizedScores: { R: 1, I: 0.8, A: 0.6, S: 0.4, E: 0.2, C: 0.1 },
  resultCode: "RIA",
  confidence: "normal" as const,
  closeScores: false,
  qcSummary: {},
  inputHash: "hash-in",
  outputHash: "hash-out",
  createdAt: "2026-01-01T00:00:00.000Z",
};

// intake_summary_json entries are stored as { value: "..." } on real ProfileSnapshot rows
// (confirmed against the live database), not plain scalars — this mirrors that real shape so
// the test would catch a regression to the naive typeof-string reading this once had.
const SNAPSHOT = {
  snapshotId: "snapshot-1",
  segment: "launcher" as const,
  seeksAid: false,
  intakeSummary: { current_goal: { value: "skill_building" } },
};

function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<div>Onboarding screen</div>} />
            <Route path="/home" element={<div>Home screen</div>} />
            <Route path="/riasec-results" element={<RiasecResultsPage />} />
            <Route path="/explore-path" element={<div>Explore Path screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("RiasecResultsPage", () => {
  beforeEach(() => {
    toJpeg.mockReset();
    toJpeg.mockResolvedValue("data:image/png;base64,AA==");
    pdfSave.mockReset();
    getUserProfile.mockResolvedValue({ profile: PROFILE });
    getIntakeQuestions.mockResolvedValue({ questionSet: QUESTION_SET, questions: [], answers: [] });
    getCareerRecommendations.mockResolvedValue(recommendationSet("career", ["Data Scientist"]));
    getStreamRecommendations.mockResolvedValue(
      recommendationSet("stream", ["Science with Mathematics"]),
    );
    getPathwayRecommendations.mockResolvedValue(
      recommendationSet("pathway", ["B.E./B.Tech. Computer Science"]),
    );
    localStorage.clear();
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("redirects to / when there is no authenticated session", () => {
    renderAt("/riasec-results");

    expect(screen.getByText("Onboarding screen")).toBeInTheDocument();
  });

  it("redirects to /home when there is no assessment run to show results for", () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");

    renderAt("/riasec-results");

    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });

  it("shows only the shared spinner while scoring — no result card, empty or otherwise, until it's ready", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    let resolveScore!: (value: { result: typeof RESULT }) => void;
    scoreAssessmentRun.mockReturnValue(
      new Promise((resolve) => {
        resolveScore = resolve;
      }),
    );
    renderAt("/riasec-results");

    // The one shared loading indicator, and nothing else — no result heading (a fully/partially
    // populated card) and no visible "Loading" text (the word only exists for screen readers).
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText("Personality Type Trait Strength!")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();

    resolveScore({ result: RESULT });
    expect(await screen.findByText("Personality Type Trait Strength!")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
  });

  it("defaults to the Score segment — trait bars and the RIASEC coin, nothing hardcoded", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    createAssessmentSnapshot.mockResolvedValue({ snapshot: SNAPSHOT });
    const user = userEvent.setup();
    renderAt("/riasec-results");

    expect(await screen.findByText("Personality Type Trait Strength!")).toBeInTheDocument();
    expect(scoreAssessmentRun).toHaveBeenCalledWith("run-1");

    expect(screen.getByText("Realistic")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument(); // R: 1 -> 100%
    expect(screen.getByText("Investigative")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument(); // I: 0.8 -> 80%
    expect(screen.getByText("Conventional")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument(); // C: 0.1 -> 10%
    // The RIASEC coin, centered in its own circle.
    expect(screen.getByText("RIA")).toBeInTheDocument();
    // Report Card-only content isn't rendered until that segment is selected.
    expect(screen.queryByText("Assessment")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Explore Path" }));

    expect(await screen.findByText("Explore Path screen")).toBeInTheDocument();
    expect(createAssessmentSnapshot).toHaveBeenCalledWith("session-id", "run-1");
    expect(getStoredProfileSnapshotId()).toBe("snapshot-1");
    expect(getStoredExploreGatingContext()).toEqual({
      segment: "launcher",
      seeksAid: false,
      currentGoal: "skill_building",
    });
  });

  it("opens on the Report Card segment via ?tab=reportCard — its only entry point, ExplorePathPage's Report card link — and shows the Assessment section but no quiz/confidence line or English/summary copy, plus an empty selections placeholder", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Assessment")).toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/interest quiz/i)).not.toBeInTheDocument();
    // Score-only content isn't rendered on this segment.
    expect(screen.queryByText("Personality Type Trait Strength!")).not.toBeInTheDocument();
    expect(screen.queryByText(/english/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/natural doer/i)).not.toBeInTheDocument();

    expect(screen.getByText("Your selections & explorations")).toBeInTheDocument();
    // No profile snapshot yet on a first visit, so nothing to read matches from.
    expect(screen.getByText("Open Explore Path to see your top matches here.")).toBeInTheDocument();
  });

  it("shows the student's name, segment, stage and location in the report header", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Asha")).toBeInTheDocument();
    expect(screen.getByText("Pathfinder")).toBeInTheDocument();
    expect(screen.getByText("Chennai, Tamil Nadu, India")).toBeInTheDocument();
    // Profile tags: age, city, state.
    expect(screen.getByText("17 years")).toBeInTheDocument();
    expect(screen.getByText("Tamil Nadu, India")).toBeInTheDocument();
  });

  it("lists the top careers, streams and pathways as titles only once a snapshot exists (pathfinder)", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    localStorage.setItem("yuvapath.profileSnapshotId", "snapshot-1");
    setStoredExploreGatingContext({ segment: "pathfinder", seeksAid: true, currentGoal: undefined });
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Data Scientist")).toBeInTheDocument();
    expect(await screen.findByText("Science with Mathematics")).toBeInTheDocument();
    expect(await screen.findByText("B.E./B.Tech. Computer Science")).toBeInTheDocument();
    // Titles only: the recommendations' 90% fitScore must not appear anywhere.
    expect(screen.queryByText(/90%/)).not.toBeInTheDocument();
  });

  it("has no Summary or Suggested next steps sections on the Report Card", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Assessment")).toBeInTheDocument();
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggested next steps")).not.toBeInTheDocument();
  });

  it("shows Explore Path, Download and Talk to counsellor on the Report Card — Talk to counsellor stays disabled, no backend yet", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByRole("button", { name: "Explore Path" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /download/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /talk to counsellor/i })).toBeDisabled();
  });

  it("Explore Path on the Report Card goes to Explore Path, building the snapshot if needed", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    createAssessmentSnapshot.mockResolvedValue({ snapshot: SNAPSHOT });
    const user = userEvent.setup();
    renderAt("/riasec-results?tab=reportCard");

    await user.click(await screen.findByRole("button", { name: "Explore Path" }));

    expect(await screen.findByText("Explore Path screen")).toBeInTheDocument();
  });

  it("Download saves the report as '<first name>-Journey-Report.pdf'", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    const user = userEvent.setup();
    renderAt("/riasec-results?tab=reportCard");

    await user.click(await screen.findByRole("button", { name: /download/i }));

    await waitFor(() => expect(pdfSave).toHaveBeenCalledWith("Asha-Journey-Report.pdf"));
    expect(toJpeg).toHaveBeenCalledTimes(1);
  });

  it("shows an error instead of failing silently if the PDF can't be created", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    toJpeg.mockRejectedValueOnce(new Error("render failed"));
    const user = userEvent.setup();
    renderAt("/riasec-results?tab=reportCard");

    await user.click(await screen.findByRole("button", { name: /download/i }));

    expect(await screen.findByText("We couldn't create the PDF. Please try again.")).toBeInTheDocument();
    expect(pdfSave).not.toHaveBeenCalled();
  });

  it("reuses the stored snapshot instead of creating a new one on a repeat visit", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    localStorage.setItem("yuvapath.profileSnapshotId", "existing-snapshot");
    const user = userEvent.setup();
    renderAt("/riasec-results");

    await user.click(await screen.findByRole("button", { name: "Explore Path" }));

    expect(await screen.findByText("Explore Path screen")).toBeInTheDocument();
    // createAssessmentSnapshot is NOT idempotent server-side (a fresh row every call) — this is
    // the guard that keeps a repeat visit from creating a second one.
    expect(createAssessmentSnapshot).not.toHaveBeenCalled();
  });

  it("shows a friendly message and lets the student retry when scoring fails", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockRejectedValueOnce(
      new ApiRequestError(409, {
        code: "assessment_run_incomplete",
        message: "Assessment run must have all required responses before scoring.",
      }),
    );
    renderAt("/riasec-results");

    expect(await screen.findByText(/answer every question before finishing/i)).toBeInTheDocument();

    scoreAssessmentRun.mockResolvedValueOnce({ result: RESULT });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findAllByText("RIA")).not.toHaveLength(0);
  });
});


describe("RiasecResultsPage — Report Card works for every segment", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    getUserProfile.mockReset();
    getIntakeQuestions.mockReset();
    getCareerRecommendations.mockReset();
    getStreamRecommendations.mockReset();
    getPathwayRecommendations.mockReset();
    getCareerRecommendations.mockResolvedValue(recommendationSet("career", ["Data Scientist", "Nurse"]));
    getStreamRecommendations.mockResolvedValue(recommendationSet("stream", ["Science with Mathematics"]));
    getPathwayRecommendations.mockResolvedValue(recommendationSet("pathway", ["B.Sc Nursing"]));
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    localStorage.setItem("yuvapath.profileSnapshotId", "snapshot-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
  });

  function intakeFor(segment: string, answers: Record<string, string>) {
    const questions = Object.keys(answers).map((key, index) => ({
      id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
      questionSetId: QUESTION_SET.id,
      questionSetVersion: "1.0",
      segment,
      language: "en",
      questionKey: key,
      displayOrder: index + 1,
      promptText: key,
      responseType: "single_choice",
      options: null,
      placeholderText: null,
      isSensitive: false,
      isRequired: true,
    }));
    return {
      questionSet: { ...QUESTION_SET, segment },
      questions,
      answers: questions.map((question) => ({
        questionId: question.id,
        answer: { value: answers[question.questionKey] },
      })),
    };
  }

  it("explorer: age/city/state and their own intake answers as tags; careers + stream cards, no pathway", async () => {
    getUserProfile.mockResolvedValue({
      profile: { ...PROFILE, firstName: "Ravi", segment: "explorer", selfStage: "school", ageAtOnboarding: 13 },
    });
    getIntakeQuestions.mockResolvedValue(
      intakeFor("explorer", {
        school_board: "state_board",
        favorite_subject: "Mathematics",
        flow_activity: "Drawing",
      }),
    );
    setStoredExploreGatingContext({ segment: "explorer", seeksAid: false, currentGoal: undefined });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Ravi")).toBeInTheDocument();
    expect(screen.getByText("Explorer")).toBeInTheDocument();
    expect(screen.getByText("13 years")).toBeInTheDocument();
    expect(await screen.findByText("State Board")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Drawing")).toBeInTheDocument();
    expect(await screen.findByText("Data Scientist")).toBeInTheDocument();
    expect(await screen.findByText("Science with Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("B.Sc Nursing")).not.toBeInTheDocument();
    expect(getPathwayRecommendations).not.toHaveBeenCalled();
  });

  it("pathfinder: intake tags plus career, stream and pathway cards", async () => {
    getUserProfile.mockResolvedValue({ profile: PROFILE });
    getIntakeQuestions.mockResolvedValue(
      intakeFor("pathfinder", { education_stage: "class_12", current_stream: "commerce" }),
    );
    setStoredExploreGatingContext({ segment: "pathfinder", seeksAid: false, currentGoal: undefined });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Class 12")).toBeInTheDocument();
    expect(screen.getByText("Commerce")).toBeInTheDocument();
    expect(await screen.findByText("Data Scientist")).toBeInTheDocument();
    expect(await screen.findByText("Science with Mathematics")).toBeInTheDocument();
    expect(await screen.findByText("B.Sc Nursing")).toBeInTheDocument();
  });

  it("launcher: education level, field of study and goal tags; careers only, no stream or pathway requests", async () => {
    getUserProfile.mockResolvedValue({
      profile: { ...PROFILE, firstName: "Meera", segment: "launcher", selfStage: "graduate", ageAtOnboarding: 24 },
    });
    getIntakeQuestions.mockResolvedValue(
      intakeFor("launcher", {
        education_level: "bachelors",
        field_of_study: "Computer Science",
        current_goal: "higher_studies",
      }),
    );
    setStoredExploreGatingContext({ segment: "launcher", seeksAid: false, currentGoal: "higher_studies" });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Meera")).toBeInTheDocument();
    expect(screen.getByText("Launcher")).toBeInTheDocument();
    expect(await screen.findByText("Bachelors")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
    expect(screen.getByText("Higher Studies")).toBeInTheDocument();
    expect(await screen.findByText("Data Scientist")).toBeInTheDocument();
    expect(getStreamRecommendations).not.toHaveBeenCalled();
    expect(getPathwayRecommendations).not.toHaveBeenCalled();
  });

  it("never shows sensitive intake answers (marks band, constraints) as tags", async () => {
    getUserProfile.mockResolvedValue({ profile: PROFILE });
    getIntakeQuestions.mockResolvedValue(
      intakeFor("pathfinder", { marks_band: "90_plus", constraints: "fees", education_stage: "class_12" }),
    );
    setStoredExploreGatingContext({ segment: "pathfinder", seeksAid: false, currentGoal: undefined });
    renderAt("/riasec-results?tab=reportCard");

    expect(await screen.findByText("Class 12")).toBeInTheDocument();
    expect(screen.queryByText("90 Plus")).not.toBeInTheDocument();
    expect(screen.queryByText("Fees")).not.toBeInTheDocument();
  });
});
