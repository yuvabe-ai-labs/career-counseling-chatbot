import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { queryClient } from "@/lib/query-client";
import {
  setStoredExploreGatingContext,
  setStoredJourneySessionId,
  setStoredProfileSnapshotId,
  setStoredUserId,
  type ExploreGatingContext,
} from "@/lib/storage";
import { SessionProvider } from "@/features/assessment";
import { ExplorePathPage } from "@/features/recommendations";

/**
 * tabsToShow itself is covered exhaustively in tabs-to-show.test.ts. What this file guards is the
 * wiring: that the *page* renders exactly the cards that function allows for a given segment, and
 * no fixed set of three. The card titles below are the only real coupling to the UI.
 */
function renderFor(context: ExploreGatingContext) {
  setStoredUserId("user-id");
  setStoredJourneySessionId("session-id");
  setStoredProfileSnapshotId("snapshot-id");
  setStoredExploreGatingContext(context);
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/explore-path"]}>
          <Routes>
            <Route path="/explore-path" element={<ExplorePathPage />} />
            <Route path="/riasec-results" element={<div>Results screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

const ALL_CARDS = [
  "Career map",
  "Streams",
  "Pathway",
  "Colleges",
  "Scholarships & Aid",
  "Plan",
] as const;

function visibleCards() {
  return ALL_CARDS.filter((title) => screen.queryByText(title) !== null);
}

describe("ExplorePathPage — cards follow the user's segment", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("explorer sees three options, not the full set", () => {
    renderFor({ segment: "explorer", wantsAid: false, currentGoal: undefined });
    expect(visibleCards()).toEqual(["Career map", "Streams", "Plan"]);
  });

  it("pathfinder asking for aid sees all six", () => {
    renderFor({ segment: "pathfinder", wantsAid: true, currentGoal: undefined });
    expect(visibleCards()).toEqual([...ALL_CARDS]);
  });

  it("pathfinder not asking for aid drops only Scholarships", () => {
    renderFor({ segment: "pathfinder", wantsAid: false, currentGoal: undefined });
    expect(visibleCards()).toEqual(["Career map", "Streams", "Pathway", "Colleges", "Plan"]);
  });

  it("launcher building skills gets Colleges but not Streams/Pathway", () => {
    renderFor({ segment: "launcher", wantsAid: false, currentGoal: "skill_building" });
    expect(visibleCards()).toEqual(["Career map", "Colleges", "Plan"]);
  });

  it("launcher heading to higher studies gets Colleges but not Streams/Pathway", () => {
    renderFor({ segment: "launcher", wantsAid: false, currentGoal: "higher_studies" });
    expect(visibleCards()).toEqual(["Career map", "Colleges", "Plan"]);
  });

  it("launcher with an open goal (not_sure) matches higher_studies/skill_building exactly", () => {
    renderFor({ segment: "launcher", wantsAid: false, currentGoal: "not_sure" });
    expect(visibleCards()).toEqual(["Career map", "Colleges", "Plan"]);
  });

  it("launcher not enrolling anywhere (job/career_switch/business) gets only Career and Plan", () => {
    renderFor({ segment: "launcher", wantsAid: false, currentGoal: "job" });
    expect(visibleCards()).toEqual(["Career map", "Plan"]);
  });

  it("keeps Career/Streams/Colleges navigable; Pathway and Plan (temporarily) and Scholarships & Aid (not yet built) are non-navigable", () => {
    renderFor({ segment: "pathfinder", wantsAid: true, currentGoal: undefined });

    expect(screen.getByText("Career map").closest("button")).toBeEnabled();
    expect(screen.getByText("Streams").closest("button")).toBeEnabled();
    expect(screen.getByText("Pathway").closest("button")).toBeDisabled();
    expect(screen.getByText("Colleges").closest("button")).toBeEnabled();
    expect(screen.getByText("Plan").closest("button")).toBeDisabled();
    expect(screen.getByText("Scholarships & Aid").closest("button")).toBeDisabled();
  });

  it("offers a real route back to the results screen it was opened from", () => {
    renderFor({ segment: "explorer", wantsAid: false, currentGoal: undefined });

    expect(screen.getByRole("link", { name: /report card/i })).toHaveAttribute(
      "href",
      "/riasec-results",
    );
  });
});
