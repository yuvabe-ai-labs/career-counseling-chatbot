import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import {
  setStoredExploreGatingContext,
  setStoredJourneySessionId,
  setStoredProfileSnapshotId,
  setStoredUserId,
} from "@/lib/storage";
import { SessionProvider } from "@/features/assessment";
import { PlanPage } from "@/features/recommendations";

const { getPlanRecommendation } = vi.hoisted(() => ({
  getPlanRecommendation: vi.fn(),
}));

vi.mock("@/features/recommendations/api/plan", () => ({ getPlanRecommendation }));

const TEMPLATE_ID = "00000000-0000-4000-8000-000000000099";

const RESPONSE = {
  profileSnapshotId: "snapshot-id",
  kind: "plan" as const,
  items: [
    {
      itemId: `plan:${TEMPLATE_ID}`,
      entityType: "plan" as const,
      entityId: TEMPLATE_ID,
      title: "Launcher 90-Day Plan",
      rank: 1,
      explanation: {
        schemaVersion: 1 as const,
        templateId: TEMPLATE_ID,
        planType: "career_90_day" as const,
        segment: "launcher" as const,
        catalogPriority: 1,
        generatedSteps: [
          {
            stepOrder: 1,
            timeWindow: "Days 1-30",
            actionText: "Shortlist entry requirements for Sales Operations Analyst.",
            isOptional: false,
          },
          {
            stepOrder: 2,
            timeWindow: "Days 31-60",
            actionText: "Complete one practice task.",
            isOptional: false,
          },
        ],
      },
      entityDatasetVersion: "test",
    },
  ],
  algorithmVersion: "plan-v1",
  weightsVersion: "plan-weights-v1",
  sourceDataVersions: { planTemplates: "test" },
  inputHash: "hash",
  outputHash: "hash",
  createdAt: "2026-09-12T00:00:00.000Z",
  planRecommendationId: "00000000-0000-4000-8000-000000000098",
};

function renderPage() {
  setStoredUserId("user-id");
  setStoredJourneySessionId("session-id");
  setStoredProfileSnapshotId("snapshot-id");
  setStoredExploreGatingContext({ segment: "launcher", wantsAid: false, currentGoal: "job" });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/explore-path/plan"]}>
          <Routes>
            <Route path="/explore-path/plan" element={<PlanPage />} />
            <Route path="/explore-path" element={<div>Explore Path screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("PlanPage", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    getPlanRecommendation.mockReset();
  });

  it("renders one checklist card per generated step, with its own timing and action text", async () => {
    getPlanRecommendation.mockResolvedValue(RESPONSE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Launcher 90-Day Plan")).toBeInTheDocument();
    });
    expect(screen.getByText("Days 1-30")).toBeInTheDocument();
    expect(
      screen.getByText("Shortlist entry requirements for Sales Operations Analyst."),
    ).toBeInTheDocument();
    expect(screen.getByText("Days 31-60")).toBeInTheDocument();
    expect(screen.getByText("Complete one practice task.")).toBeInTheDocument();
  });

  it("toggles a step's done state on click, purely client-side, and remembers it across a remount", async () => {
    getPlanRecommendation.mockResolvedValue(RESPONSE);
    const { unmount } = renderPage();

    await waitFor(() => {
      expect(screen.getByText("Days 1-30")).toBeInTheDocument();
    });
    const firstCard = screen.getByText("Days 1-30").closest("button")!;
    expect(firstCard).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(firstCard);
    expect(firstCard).toHaveAttribute("aria-pressed", "true");

    unmount();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Days 1-30").closest("button")).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("shows an error state with retry when the request fails", async () => {
    getPlanRecommendation.mockRejectedValue(
      new ApiRequestError(500, { code: "internal_error", message: "boom" }),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/couldn't load your plan/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
