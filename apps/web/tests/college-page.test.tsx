import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";
import {
  setStoredExploreGatingContext,
  setStoredJourneySessionId,
  setStoredProfileSnapshotId,
  setStoredUserId,
} from "@/lib/storage";
import { SessionProvider } from "@/features/assessment";
import { CollegePage } from "@/features/recommendations";
// Type-only — erased at compile time, so it doesn't conflict with vi.mock's runtime replacement
// of this module below. Used only to give the mock a real signature instead of vi.fn()'s
// implicit `any`, which otherwise makes every `.mock.calls` access unsafe-* per the lint config.
import type { CollegeFilters } from "@/features/recommendations/api/college";

const { getCollegeRecommendations } = vi.hoisted(() => ({
  getCollegeRecommendations: vi.fn<(profileSnapshotId: string, filters?: CollegeFilters) => Promise<unknown>>(),
}));

vi.mock("@/features/recommendations/api/college", () => ({ getCollegeRecommendations }));

function collegeItem(title: string, district: string) {
  const locationProximityTier: "same_district" | "rest_of_tamil_nadu" =
    district === "Chennai" ? "same_district" : "rest_of_tamil_nadu";
  return {
    itemId: `college:${title}`,
    entityType: "college" as const,
    entityId: `00000000-0000-4000-8000-${title.length.toString().padStart(12, "0")}`,
    title,
    rank: 1,
    fitScore: district === "Chennai" ? 1 : 0,
    explanation: {
      schemaVersion: 4 as const,
      matchedDisciplineIds: ["00000000-0000-4000-8000-000000000001"],
      instituteKind: "Arts & Science College",
      ownership: "government" as const,
      district,
      matchedProgramTypes: ["B.Sc"],
      matchedAdmissionRoutes: ["Direct application to the college"],
      locationProximity: district === "Chennai" ? 1 : 0,
      locationProximityTier,
    },
    entityDatasetVersion: "test",
  };
}

function makeResponse(items: ReturnType<typeof collegeItem>[]) {
  return {
    collegeRecommendationId: "00000000-0000-4000-8000-000000000099",
    profileSnapshotId: "snapshot-id",
    kind: "college" as const,
    items,
    rings: { inner: items.slice(0, 5), middle: [], outer: [] },
    algorithmVersion: "college-fit-v1",
    weightsVersion: "college-weights-v1",
    sourceDataVersions: { colleges: "test" },
    inputHash: "hash",
    outputHash: "hash",
    createdAt: "2026-09-24T00:00:00.000Z",
  };
}

function renderPage() {
  setStoredUserId("user-id");
  setStoredJourneySessionId("session-id");
  setStoredProfileSnapshotId("snapshot-id");
  setStoredExploreGatingContext({ segment: "pathfinder", seeksAid: false, currentGoal: undefined });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/explore-path/college"]}>
          <Routes>
            <Route path="/explore-path/college" element={<CollegePage />} />
            <Route path="/explore-path" element={<div>Explore Path screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("CollegePage — pick a district first", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    getCollegeRecommendations.mockReset();
    getCollegeRecommendations.mockImplementation((_id: string, filters?: CollegeFilters) =>
      Promise.resolve(
        makeResponse(
          [collegeItem("Chennai College", "Chennai"), collegeItem("Coimbatore College", "Coimbatore")].filter(
            (item) => !filters?.district || item.explanation.district === filters.district,
          ),
        ),
      ),
    );
  });

  it("shows only a prompt and makes no request until a district is picked", () => {
    renderPage();

    expect(screen.getByText("Select your district to see colleges.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your district")).toHaveValue("");
    expect(screen.queryByText(/colleges? in /)).not.toBeInTheDocument();
    expect(getCollegeRecommendations).not.toHaveBeenCalled();
  });

  it("does not seed the district from anything stored on a previous visit", () => {
    localStorage.setItem("yuvapath.collegeHomeDistrict", "Madurai");
    renderPage();

    expect(screen.getByLabelText("Your district")).toHaveValue("");
    expect(getCollegeRecommendations).not.toHaveBeenCalled();
  });

  it("picking a district requests it as a hard filter and lists every returned college with the count", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText("Your district"), "Chennai");

    expect(await screen.findByText("Chennai College")).toBeInTheDocument();
    expect(screen.getByText("1 college in Chennai")).toBeInTheDocument();
    expect(screen.queryByText("Coimbatore College")).not.toBeInTheDocument();
    for (const [, filters] of getCollegeRecommendations.mock.calls) {
      expect(filters).toMatchObject({ district: "Chennai" });
      expect(Object.keys(filters ?? {})).not.toContain("homeDistrict");
    }
    expect(screen.queryByText("Same district")).not.toBeInTheDocument();
  });

  it("switching district refetches for the new district only", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText("Your district"), "Chennai");
    await screen.findByText("Chennai College");
    await user.selectOptions(screen.getByLabelText("Your district"), "Coimbatore");

    expect(await screen.findByText("Coimbatore College")).toBeInTheDocument();
    expect(screen.queryByText("Chennai College")).not.toBeInTheDocument();
    expect(getCollegeRecommendations.mock.calls.at(-1)?.[1]).toMatchObject({ district: "Coimbatore" });
  });

  it("shows a district-specific empty message when nothing in that district offers the pathway", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText("Your district"), "Madurai");

    expect(
      await screen.findByText("No colleges in Madurai offer this pathway yet. Try another district."),
    ).toBeInTheDocument();
  });
});
