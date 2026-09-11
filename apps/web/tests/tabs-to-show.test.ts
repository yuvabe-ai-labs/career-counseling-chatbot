import { describe, expect, it } from "vitest";
import { tabsToShow } from "@/features/recommendations/lib/tabs-to-show";

// Every row of Part 1's tables in docs/poc/launcher-goal-based-recommendations.md — the 9 real
// intake-answer combinations the app can actually produce. Each expected visibility set is
// copied straight from that doc's ✅/❌ columns, not re-derived here.
describe("tabsToShow", () => {
  it("row 1 — Explorer", () => {
    expect(tabsToShow({ segment: "explorer", wantsAid: false, currentGoal: undefined })).toEqual({
      career: true,
      stream: true,
      pathway: false,
      college: false,
      scholarship: false,
      plan: true,
    });
  });

  it("row 2 — Pathfinder, no aid requested", () => {
    expect(tabsToShow({ segment: "pathfinder", wantsAid: false, currentGoal: undefined })).toEqual({
      career: true,
      stream: true,
      pathway: true,
      college: true,
      scholarship: false,
      plan: true,
    });
  });

  it("row 3 — Pathfinder, aid requested", () => {
    expect(tabsToShow({ segment: "pathfinder", wantsAid: true, currentGoal: undefined })).toEqual({
      career: true,
      stream: true,
      pathway: true,
      college: true,
      scholarship: true,
      plan: true,
    });
  });

  it.each(["job", "career_switch", "business"])(
    "row 4 — Launcher, goal=%s, no aid",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", wantsAid: false, currentGoal })).toEqual({
        career: true,
        stream: false,
        pathway: false,
        college: false,
        scholarship: false,
        plan: true,
      });
    },
  );

  it.each(["job", "career_switch", "business"])(
    "row 5 — Launcher, goal=%s, aid requested",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", wantsAid: true, currentGoal })).toEqual({
        career: true,
        stream: false,
        pathway: false,
        college: false,
        scholarship: true,
        plan: true,
      });
    },
  );

  it("row 6 — Launcher, skill_building, no aid", () => {
    expect(
      tabsToShow({ segment: "launcher", wantsAid: false, currentGoal: "skill_building" }),
    ).toEqual({
      career: true,
      stream: false,
      pathway: false,
      college: true,
      scholarship: false,
      plan: true,
    });
  });

  it("row 7 — Launcher, skill_building, aid requested", () => {
    expect(
      tabsToShow({ segment: "launcher", wantsAid: true, currentGoal: "skill_building" }),
    ).toEqual({
      career: true,
      stream: false,
      pathway: false,
      college: true,
      scholarship: true,
      plan: true,
    });
  });

  it.each(["higher_studies", "not_sure"])(
    "row 8 — Launcher, goal=%s, no aid",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", wantsAid: false, currentGoal })).toEqual({
        career: true,
        stream: true,
        pathway: true,
        college: true,
        scholarship: false,
        plan: true,
      });
    },
  );

  it.each(["higher_studies", "not_sure"])(
    "row 9 — Launcher, goal=%s, aid requested",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", wantsAid: true, currentGoal })).toEqual({
        career: true,
        stream: true,
        pathway: true,
        college: true,
        scholarship: true,
        plan: true,
      });
    },
  );
});
