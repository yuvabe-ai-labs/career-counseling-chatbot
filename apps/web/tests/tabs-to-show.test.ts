import { describe, expect, it } from "vitest";
import { tabsToShow } from "@/features/recommendations/lib/tabs-to-show";

// Explorer and Pathfinder's 3 rows are fixed. Launcher's 12 goal x aid combinations collapse
// into 2 real buckets — see the doc comment on tabsToShow() for why (Stream/Pathway are off
// for Launcher unconditionally; only College depends on whether the student's goal involves
// enrolling anywhere) — enumerated here per goal so a future regression on any one goal value
// is still caught, not just the bucket as a whole.
describe("tabsToShow", () => {
  it("row 1 — Explorer", () => {
    expect(tabsToShow({ segment: "explorer", seeksAid: false, currentGoal: undefined })).toEqual({
      career: true,
      stream: true,
      pathway: false,
      college: false,
      scholarship: false,
      plan: true,
    });
  });

  it("row 2 — Pathfinder, answered No/unanswered to seeks_aid", () => {
    expect(tabsToShow({ segment: "pathfinder", seeksAid: false, currentGoal: undefined })).toEqual({
      career: true,
      stream: true,
      pathway: true,
      college: true,
      scholarship: false,
      plan: true,
    });
  });

  it("row 3 — Pathfinder, answered Yes to seeks_aid", () => {
    expect(tabsToShow({ segment: "pathfinder", seeksAid: true, currentGoal: undefined })).toEqual({
      career: true,
      stream: true,
      pathway: true,
      college: true,
      scholarship: true,
      plan: true,
    });
  });

  it.each(["job", "career_switch", "business"])(
    "row 4 — Launcher not enrolling anywhere, goal=%s, no aid",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", seeksAid: false, currentGoal })).toEqual({
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
    "row 5 — Launcher not enrolling anywhere, goal=%s, seeksAid has no effect yet (Launcher aid is later work)",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", seeksAid: true, currentGoal })).toEqual({
        career: true,
        stream: false,
        pathway: false,
        college: false,
        scholarship: false,
        plan: true,
      });
    },
  );

  it.each(["higher_studies", "not_sure", "skill_building"])(
    "row 6 — Launcher enrolling somewhere, goal=%s, no aid",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", seeksAid: false, currentGoal })).toEqual({
        career: true,
        stream: false,
        pathway: false,
        college: true,
        scholarship: false,
        plan: true,
      });
    },
  );

  it.each(["higher_studies", "not_sure", "skill_building"])(
    "row 7 — Launcher enrolling somewhere, goal=%s, seeksAid has no effect yet (Launcher aid is later work)",
    (currentGoal) => {
      expect(tabsToShow({ segment: "launcher", seeksAid: true, currentGoal })).toEqual({
        career: true,
        stream: false,
        pathway: false,
        college: true,
        scholarship: false,
        plan: true,
      });
    },
  );
});
