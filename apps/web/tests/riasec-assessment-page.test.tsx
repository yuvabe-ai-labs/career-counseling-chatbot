import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import {
  getStoredAssessmentRunId,
  setStoredAssessmentRunId,
  setStoredJourneySessionId,
  setStoredUserId,
} from "@/lib/storage";
import { RiasecAssessmentPage, SessionProvider } from "@/features/assessment";

const { startAssessmentRun, getNextAssessmentBatch, submitAssessmentResponse } = vi.hoisted(() => ({
  startAssessmentRun: vi.fn(),
  getNextAssessmentBatch: vi.fn(),
  submitAssessmentResponse: vi.fn(),
}));

vi.mock("@/features/assessment/api/assessment", () => ({
  startAssessmentRun,
  getNextAssessmentBatch,
  submitAssessmentResponse,
  scoreAssessmentRun: vi.fn(),
}));

const RUN = {
  id: "run-1",
  userId: "user-id",
  journeySessionId: "session-id",
  assessmentVersionId: "version-1",
  instrumentCode: "mini_ip_30" as const,
  instrumentVersion: "1.0",
  algorithmVersion: "riasec-deterministic-v1",
  segment: "explorer" as const,
  status: "active" as const,
  currentPosition: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  lastAnsweredAt: null,
  completedAt: null,
  scoredAt: null,
  resumeExpiresAt: "2026-01-01T00:30:00.000Z",
  attemptNumber: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const item = (id: string, order: number, prompt: string) => ({
  id,
  itemKey: `key-${id}`,
  displayOrder: order,
  itemType: "likert" as const,
  promptText: prompt,
  promptAssetRef: null,
  scaleCode: "R",
  isQc: false,
  options: [],
});

// A 3-item run — an arbitrary count distinct from any real instrument's, to prove nothing here
// hardcodes a question count.
const ITEM_1 = item("item-1", 1, "I enjoy building things with my hands.");
const ITEM_2 = item("item-2", 2, "I enjoy solving science problems.");
const ITEM_3 = item("item-3", 3, "I enjoy creating original artwork.");

const batch = (
  nextPosition: number,
  items: (typeof ITEM_1)[],
  answered: number,
  answeredItems: (typeof ITEM_1 & { responseValue: number | null })[] = [],
) => ({
  run: RUN,
  progress: { answered, total: 3, nextPosition, isComplete: nextPosition >= 3 },
  items,
  answeredItems,
});

function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<div>Onboarding screen</div>} />
            <Route path="/riasec-assessment" element={<RiasecAssessmentPage />} />
            <Route path="/riasec-results" element={<div>RIASEC results screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("RiasecAssessmentPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // The query client is a module-level singleton (lib/query-client.ts) shared across tests —
    // several tests here reuse the same runId ("run-1"), so a cached ["assessment-next", ...]
    // entry from an earlier test would otherwise leak into a later one's first render.
    queryClient.clear();
  });

  it("redirects to / when there is no authenticated session", () => {
    renderAt("/riasec-assessment");

    expect(screen.getByText("Onboarding screen")).toBeInTheDocument();
  });

  it("starts a new run automatically when none is stored, then renders the first question", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    startAssessmentRun.mockResolvedValue({ run: RUN });
    getNextAssessmentBatch.mockResolvedValue(batch(0, [ITEM_1], 0));

    renderAt("/riasec-assessment");

    await waitFor(() => expect(startAssessmentRun).toHaveBeenCalledWith("session-id"));
    expect(await screen.findByText(ITEM_1.promptText)).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 3")).toBeInTheDocument();
    expect(getStoredAssessmentRunId()).toBe("run-1");
    // Next is disabled until the student actually picks a slider value.
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("resumes an existing stored run instead of starting a new one", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("existing-run");
    getNextAssessmentBatch.mockResolvedValue(batch(1, [ITEM_2], 1));

    renderAt("/riasec-assessment");

    expect(await screen.findByText(ITEM_2.promptText)).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    expect(startAssessmentRun).not.toHaveBeenCalled();
    expect(getNextAssessmentBatch).toHaveBeenCalledWith("existing-run");
  });

  it("submits the selected slider value (converted to the backend's 1-5 scale) and advances to the next item", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    getNextAssessmentBatch.mockResolvedValue(batch(0, [ITEM_1], 0));
    submitAssessmentResponse.mockResolvedValue({
      response: { id: "resp-1" },
      next: batch(1, [ITEM_2], 1),
    });
    const user = userEvent.setup();
    renderAt("/riasec-assessment");

    await screen.findByText(ITEM_1.promptText);
    await user.click(screen.getByRole("button", { name: "Love it" })); // index 4 -> responseValue 5
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(submitAssessmentResponse).toHaveBeenCalledWith("run-1", {
        itemId: "item-1",
        responseValue: 5,
      }),
    );
    expect(await screen.findByText(ITEM_2.promptText)).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
  });

  /**
   * Regression test for a real bug found in manual end-to-end testing: clicking a response
   * label (RiasecSlider's "Dislike"/"Like"/etc. buttons) — the normal way to answer — leaves
   * that <button> holding DOM focus. An earlier version of handleKeyDown ignored Enter whenever
   * event.target was *any* HTMLButtonElement, which silently also blocked the single most common
   * post-answer focus target, not just the Next/Finish button it was meant to guard against.
   */
  it("saves and advances on its own when an answer is picked, with no Next click", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    getNextAssessmentBatch.mockResolvedValue(batch(0, [ITEM_1], 0));
    submitAssessmentResponse.mockResolvedValue({
      response: { id: "resp-1" },
      next: batch(1, [ITEM_2], 1),
    });
    const user = userEvent.setup();
    renderAt("/riasec-assessment");

    await screen.findByText(ITEM_1.promptText);
    await user.click(screen.getByRole("button", { name: "Love it" }));

    await waitFor(() =>
      expect(submitAssessmentResponse).toHaveBeenCalledWith("run-1", {
        itemId: "item-1",
        responseValue: 5,
      }),
    );
    expect(await screen.findByText(ITEM_2.promptText)).toBeInTheDocument();
  });

  it("navigates to /riasec-results once the backend reports the run complete", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    getNextAssessmentBatch.mockResolvedValue(batch(2, [ITEM_3], 2));
    submitAssessmentResponse.mockResolvedValue({
      response: { id: "resp-3" },
      next: {
        run: RUN,
        progress: { answered: 3, total: 3, nextPosition: 3, isComplete: true },
        items: [],
      },
    });
    const user = userEvent.setup();
    renderAt("/riasec-assessment");

    await screen.findByText(ITEM_3.promptText);
    expect(screen.getByRole("button", { name: /finish/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dislike" }));

    expect(await screen.findByText("RIASEC results screen")).toBeInTheDocument();
  });

  /**
   * The slider parks its thumb at "Unsure" on a fresh question because that's the neutral
   * resting position — it is emphatically not an answer of Unsure. These four cover the seam
   * between the two, which is the thing most likely to regress.
   */
  const arriveAtItem1 = async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    getNextAssessmentBatch.mockResolvedValue(batch(0, [ITEM_1], 0));
    submitAssessmentResponse.mockResolvedValue({
      response: { id: "resp-1" },
      next: batch(1, [ITEM_2], 1),
    });
    renderAt("/riasec-assessment");
    await screen.findByText(ITEM_1.promptText);
  };

  it("does not count the slider's initial Unsure position as an answer", async () => {
    await arriveAtItem1();

    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Unsure");
    // Nothing saved, nothing advanced, and Next has nothing to submit.
    expect(submitAssessmentResponse).not.toHaveBeenCalled();
    expect(screen.getByText(ITEM_1.promptText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("saves Unsure and advances when the student deliberately picks it", async () => {
    const user = userEvent.setup();
    await arriveAtItem1();

    await user.click(screen.getByRole("button", { name: "Unsure" }));

    await waitFor(() =>
      expect(submitAssessmentResponse).toHaveBeenCalledWith("run-1", {
        itemId: "item-1",
        responseValue: 3,
      }),
    );
    expect(await screen.findByText(ITEM_2.promptText)).toBeInTheDocument();
  });

  it("commits Unsure when the track is clicked without the value changing", async () => {
    await arriveAtItem1();

    // A range input fires no change event for a click on the value it already shows, so this is
    // the path that would otherwise make a deliberate Unsure unreachable from the track itself.
    fireEvent.click(screen.getByRole("slider"));

    await waitFor(() =>
      expect(submitAssessmentResponse).toHaveBeenCalledWith("run-1", {
        itemId: "item-1",
        responseValue: 3,
      }),
    );
  });

  it("submits once when a drag both changes the value and fires a click", async () => {
    await arriveAtItem1();

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "4" } });
    fireEvent.click(slider);

    await screen.findByText(ITEM_2.promptText);
    expect(submitAssessmentResponse).toHaveBeenCalledTimes(1);
    expect(submitAssessmentResponse).toHaveBeenCalledWith("run-1", {
      itemId: "item-1",
      responseValue: 5,
    });
  });

  it("Previous is disabled on the first question", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    getNextAssessmentBatch.mockResolvedValue(batch(0, [ITEM_1], 0));

    renderAt("/riasec-assessment");

    await screen.findByText(ITEM_1.promptText);
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("Previous shows a previously saved answer, pre-selected and editable, and updates the progress number", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    // Item 1 and 2 already answered (responseValue 5 -> "Love it", 3 -> "Unsure"); item 3 is the
    // current, unanswered frontier — the same shape AssessmentService.getNext now actually
    // returns via its new answeredItems field.
    getNextAssessmentBatch.mockResolvedValue(
      batch(2, [ITEM_3], 2, [
        { ...ITEM_1, responseValue: 5 },
        { ...ITEM_2, responseValue: 3 },
      ]),
    );
    const user = userEvent.setup();
    renderAt("/riasec-assessment");

    await screen.findByText(ITEM_3.promptText);
    expect(screen.getByText("Question 3 of 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /previous/i }));
    expect(await screen.findByText(ITEM_2.promptText)).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Unsure");

    await user.click(screen.getByRole("button", { name: /previous/i }));
    expect(await screen.findByText(ITEM_1.promptText)).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Love it");
    // Back at the first question — Previous is unavailable again.
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("editing a past answer re-submits the new value and continues from the review point, not the true frontier", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("run-1");
    getNextAssessmentBatch.mockResolvedValue(
      batch(2, [ITEM_3], 2, [
        { ...ITEM_1, responseValue: 5 },
        { ...ITEM_2, responseValue: 3 },
      ]),
    );
    submitAssessmentResponse.mockResolvedValue({
      response: { id: "resp-1-edited" },
      // Editing item 1 doesn't move the frontier — still item 3 next, same progress counts.
      next: batch(2, [ITEM_3], 2, [
        { ...ITEM_1, responseValue: 1 },
        { ...ITEM_2, responseValue: 3 },
      ]),
    });
    const user = userEvent.setup();
    renderAt("/riasec-assessment");

    await screen.findByText(ITEM_3.promptText);
    await user.click(screen.getByRole("button", { name: /previous/i }));
    await user.click(screen.getByRole("button", { name: /previous/i }));
    await screen.findByText(ITEM_1.promptText);

    await user.click(screen.getByRole("button", { name: "Dislike" })); // index 0 -> responseValue 1

    await waitFor(() =>
      expect(submitAssessmentResponse).toHaveBeenCalledWith("run-1", {
        itemId: "item-1",
        responseValue: 1,
      }),
    );
    // Stepped forward one from the review (item 1 -> item 2), not jumped to the frontier's own
    // item 3 — item 2's own saved answer is shown again, still reachable/editable.
    expect(await screen.findByText(ITEM_2.promptText)).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Unsure");
  });

  it("recovers from a stale stored run id by starting a fresh run", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredAssessmentRunId("stale-run");
    getNextAssessmentBatch.mockImplementation((runId: string) =>
      runId === "stale-run"
        ? Promise.reject(
            new ApiRequestError(404, {
              code: "assessment_run_not_found",
              message: "Assessment run was not found.",
            }),
          )
        : Promise.resolve(batch(0, [ITEM_1], 0)),
    );
    startAssessmentRun.mockResolvedValue({ run: RUN });

    renderAt("/riasec-assessment");

    await waitFor(() => expect(startAssessmentRun).toHaveBeenCalledWith("session-id"));
    expect(await screen.findByText(ITEM_1.promptText)).toBeInTheDocument();
    expect(getStoredAssessmentRunId()).toBe("run-1");
  });
});
