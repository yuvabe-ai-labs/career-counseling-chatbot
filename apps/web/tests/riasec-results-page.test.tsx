import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

const { scoreAssessmentRun, createAssessmentSnapshot } = vi.hoisted(() => ({
  scoreAssessmentRun: vi.fn(),
  createAssessmentSnapshot: vi.fn(),
}));

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
  wantsAid: false,
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
    expect(screen.queryByText("Assessment")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();

    resolveScore({ result: RESULT });
    expect(await screen.findByText("Assessment")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
  });

  it("scores the run and renders the real result — trait bars and RIASEC code, nothing hardcoded", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    createAssessmentSnapshot.mockResolvedValue({ snapshot: SNAPSHOT });
    const user = userEvent.setup();
    renderAt("/riasec-results");

    expect(await screen.findByText("Assessment")).toBeInTheDocument();
    expect(scoreAssessmentRun).toHaveBeenCalledWith("run-1");

    expect(screen.getByText("Realistic")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument(); // R: 1 -> 100%
    expect(screen.getByText("Investigative")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument(); // I: 0.8 -> 80%
    expect(screen.getByText("Conventional")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument(); // C: 0.1 -> 10%
    // "RIA" appears twice — once in the hero band, once in the trait recap line underneath the
    // bars — so this can't be a single getByText.
    expect(screen.getAllByText("RIA").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Explore Path" }));

    expect(await screen.findByText("Explore Path screen")).toBeInTheDocument();
    expect(createAssessmentSnapshot).toHaveBeenCalledWith("session-id", "run-1");
    expect(getStoredProfileSnapshotId()).toBe("snapshot-1");
    expect(getStoredExploreGatingContext()).toEqual({
      segment: "launcher",
      wantsAid: false,
      currentGoal: "skill_building",
    });
  });

  it("shows confidence but none of the interest-quiz/English/summary copy, and an empty selections placeholder", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results");

    expect(await screen.findByText("Confidence: Normal")).toBeInTheDocument();
    expect(screen.queryByText(/interest quiz/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mini-iip/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/english/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/summary/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/natural doer/i)).not.toBeInTheDocument();

    expect(screen.getByText("Your Selections & Explorations")).toBeInTheDocument();
    expect(
      screen.getByText("Careers and colleges you explore will show up here."),
    ).toBeInTheDocument();
  });

  it("shows the segment badge once it's known (a repeat visit), and omits it otherwise", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    setStoredExploreGatingContext({ segment: "launcher", wantsAid: false, currentGoal: undefined });
    renderAt("/riasec-results");

    expect(await screen.findByText("launcher")).toBeInTheDocument();
  });

  it("omits the segment badge on a first visit, before any profile snapshot exists", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results");

    expect(await screen.findByText("Assessment")).toBeInTheDocument();
    expect(screen.queryByText(/explorer|pathfinder|launcher/i)).not.toBeInTheDocument();
  });

  it("shows Download and Talk to counsellor as disabled placeholders — no backend behind either yet", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    renderAt("/riasec-results");

    expect(await screen.findByRole("button", { name: /download/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /talk to counsellor/i })).toBeDisabled();
  });

  it("reuses the stored snapshot instead of creating a new one on a repeat visit", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
    localStorage.setItem("yuvanext.profileSnapshotId", "existing-snapshot");
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
