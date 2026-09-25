import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";
import {
  setStoredExploreGatingContext,
  setStoredJourneySessionId,
  setStoredProfileSnapshotId,
  setStoredUserId,
  type ExploreGatingContext,
} from "@/lib/storage";
import { SessionProvider } from "@/features/assessment";
import { ScholarshipPage } from "@/features/recommendations";

const { getAidSchemes } = vi.hoisted(() => ({
  getAidSchemes: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/features/recommendations/api/aid", () => ({ getAidSchemes }));

function scheme(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    aidCode: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    providerType: "government",
    provider: "Directorate of Collegiate Education",
    level: "Undergraduate",
    states: ["Tamil Nadu"],
    eligibilitySummary: "Students of government colleges.",
    benefitSummary: "Tuition support.",
    amountText: "Up to Rs 50,000",
    applicationUrl: "https://example.gov.in/apply",
    portalName: "TN Scholarship Portal",
    applyWindowStart: null,
    applyWindowEnd: null,
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-24T00:00:00.000Z",
    datasetVersionId: "00000000-0000-4000-8000-000000000002",
    ...overrides,
  };
}

function renderFor(context: ExploreGatingContext) {
  setStoredUserId("user-id");
  setStoredJourneySessionId("session-id");
  setStoredProfileSnapshotId("snapshot-id");
  setStoredExploreGatingContext(context);
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/explore-path/scholarship"]}>
          <Routes>
            <Route path="/explore-path/scholarship" element={<ScholarshipPage />} />
            <Route path="/explore-path" element={<div>Explore Path screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("ScholarshipPage", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    getAidSchemes.mockReset();
  });

  it("lists every scheme with its real facts and an apply link, plus the catalogue caveat", async () => {
    getAidSchemes.mockResolvedValue({
      data: [scheme("Pudhumai Penn"), scheme("Post-Matric SC Scholarship", { amountText: null })],
      sourceDataVersions: {},
      retrievedAt: "2026-09-25T00:00:00.000Z",
      caveats: ["Confirm eligibility on the official portal."],
    });
    renderFor({ segment: "pathfinder", seeksAid: true, currentGoal: undefined });

    expect(await screen.findByText("Pudhumai Penn")).toBeInTheDocument();
    expect(screen.getByText("Post-Matric SC Scholarship")).toBeInTheDocument();
    expect(screen.getByText("Up to Rs 50,000")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /apply on tn scholarship portal/i })[0]).toHaveAttribute(
      "href",
      "https://example.gov.in/apply",
    );
    expect(screen.getByText("Confirm eligibility on the official portal.")).toBeInTheDocument();
  });

  it("shows an empty state when the catalogue has no verified schemes", async () => {
    getAidSchemes.mockResolvedValue({
      data: [],
      sourceDataVersions: {},
      retrievedAt: "2026-09-25T00:00:00.000Z",
      caveats: [],
    });
    renderFor({ segment: "pathfinder", seeksAid: true, currentGoal: undefined });

    expect(await screen.findByText(/don't have any verified scholarships/i)).toBeInTheDocument();
  });

  it("sends a pathfinder who answered No back to Explore Path", async () => {
    renderFor({ segment: "pathfinder", seeksAid: false, currentGoal: undefined });

    expect(await screen.findByText("Explore Path screen")).toBeInTheDocument();
  });

  it("sends a launcher back to Explore Path even if seeksAid is set (Launcher aid is later work)", async () => {
    renderFor({ segment: "launcher", seeksAid: true, currentGoal: "job" });

    expect(await screen.findByText("Explore Path screen")).toBeInTheDocument();
  });
});
