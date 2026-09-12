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
import { StreamPage } from "@/features/recommendations";

const { getStreamRecommendations } = vi.hoisted(() => ({
  getStreamRecommendations: vi.fn(),
}));

vi.mock("@/features/recommendations/api/stream", () => ({ getStreamRecommendations }));

const RESPONSE = {
  profileSnapshotId: "snapshot-id",
  kind: "stream" as const,
  items: [
    {
      itemId: "stream:1",
      entityType: "stream" as const,
      entityId: "00000000-0000-4000-8000-000000000001",
      title: "Science with Mathematics",
      rank: 1,
      fitScore: 0.82,
      explanation: {
        schemaVersion: 1 as const,
        riasecOverlap: 0.9,
        segmentFit: 1,
        marksFit: 0.8,
        catalogPriority: 1,
        topStudentLetters: ["R", "I", "A"] as const,
        matchedLetters: ["R", "I"] as const,
        description: "Physics, Chemistry and Mathematics — the usual engineering foundation.",
      },
      entityDatasetVersion: "test",
    },
  ],
  algorithmVersion: "stream-fit-v1",
  weightsVersion: "stream-weights-v1",
  sourceDataVersions: { streams: "test" },
  inputHash: "hash",
  outputHash: "hash",
  createdAt: "2026-09-11T00:00:00.000Z",
  streamRecommendationId: "00000000-0000-4000-8000-000000000099",
};

function renderPage() {
  setStoredUserId("user-id");
  setStoredJourneySessionId("session-id");
  setStoredProfileSnapshotId("snapshot-id");
  setStoredExploreGatingContext({ segment: "pathfinder", wantsAid: false, currentGoal: undefined });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/explore-path/stream"]}>
          <Routes>
            <Route path="/explore-path/stream" element={<StreamPage />} />
            <Route path="/explore-path" element={<div>Explore Path screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("StreamPage", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    getStreamRecommendations.mockReset();
  });

  it("shows only the shared spinner while loading — no back button/title/subtitle shell yet", async () => {
    let resolveStreams!: (value: typeof RESPONSE) => void;
    getStreamRecommendations.mockReturnValue(
      new Promise((resolve) => {
        resolveStreams = resolve;
      }),
    );
    renderPage();

    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText("Streams")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Back to Explore Path")).not.toBeInTheDocument();
    expect(
      screen.queryByText("These are the streams available to you based on your profile"),
    ).not.toBeInTheDocument();

    resolveStreams(RESPONSE);
    expect(await screen.findByText("Streams")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
  });

  it("renders the recommended streams once the request resolves", async () => {
    getStreamRecommendations.mockResolvedValue(RESPONSE);
    renderPage();

    await waitFor(() => {
      // The dot label renders the title and the match percent as two sibling text nodes (see
      // RingMap.tsx), so this must match on partial/regex text rather than the exact string.
      expect(screen.getByText(/Science with Mathematics/)).toBeInTheDocument();
    });
    expect(getStreamRecommendations).toHaveBeenCalledWith("snapshot-id");
    // No stage tabs — streams render as RingMap's singleTier treatment (see StreamPage's own comment).
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("keeps the description off the card overview — only the title and fit line show there", async () => {
    getStreamRecommendations.mockResolvedValue(RESPONSE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Science with Mathematics/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Fit: 82%/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Physics, Chemistry and Mathematics/),
    ).not.toBeInTheDocument();
  });

  it("still shows the full description once the card is clicked, via the existing detail sheet", async () => {
    getStreamRecommendations.mockResolvedValue(RESPONSE);
    renderPage();

    const card = await screen.findByText(/Science with Mathematics/);
    fireEvent.click(card.closest("button")!);

    expect(
      await screen.findByText(/Physics, Chemistry and Mathematics/),
    ).toBeInTheDocument();
  });

  it("shows an error state with retry when the request fails", async () => {
    getStreamRecommendations.mockRejectedValue(
      new ApiRequestError(500, { code: "internal_error", message: "boom" }),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/couldn't load your recommended streams/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
