import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import {
  setStoredAssessmentRunId,
  setStoredJourneySessionId,
  setStoredUserId,
} from "@/lib/storage";
import { RiasecResultsPage, SessionProvider } from "@/features/assessment";

const { scoreAssessmentRun } = vi.hoisted(() => ({ scoreAssessmentRun: vi.fn() }));

vi.mock("@/features/assessment/api/assessment", () => ({
  startAssessmentRun: vi.fn(),
  getNextAssessmentBatch: vi.fn(),
  submitAssessmentResponse: vi.fn(),
  scoreAssessmentRun,
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

function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<div>Onboarding screen</div>} />
            <Route path="/home" element={<div>Home screen</div>} />
            <Route path="/riasec-results" element={<RiasecResultsPage />} />
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

  it("scores the run and renders the real result — trait bars and RIASEC code, nothing hardcoded", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    scoreAssessmentRun.mockResolvedValue({ result: RESULT });
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
    expect(screen.getByText("RIA")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Explore Path" }));
    expect(await screen.findByText("Home screen")).toBeInTheDocument();
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

    expect(
      await screen.findByText(/answer every question before finishing/i),
    ).toBeInTheDocument();

    scoreAssessmentRun.mockResolvedValueOnce({ result: RESULT });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("RIA")).toBeInTheDocument();
  });
});
