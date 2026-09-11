import type { ExploreGatingContext } from "@/lib/storage";

/**
 * Direct port of `tabsToShow()` from docs/poc/launcher-goal-based-recommendations.md Part 5 —
 * the single source of truth for which of the 6 Explore Path tabs a segment/goal combination
 * shows. See that doc's Part 1 tables for all 9 real-world rows this produces, and Part 3 for
 * the reasoning behind each rule (Rule A: Stream+Pathway, Rule A2: College, Rule B: Scholarship).
 */
export type ExploreTabKey = "career" | "stream" | "pathway" | "college" | "scholarship" | "plan";

export type ExploreTabVisibility = Record<ExploreTabKey, boolean>;

export function tabsToShow(context: ExploreGatingContext): ExploreTabVisibility {
  const { segment, wantsAid, currentGoal } = context;

  if (segment === "explorer") {
    return {
      career: true,
      stream: true,
      pathway: false,
      college: false,
      scholarship: false,
      plan: true,
    };
  }

  if (segment === "pathfinder") {
    return {
      career: true,
      stream: true,
      pathway: true,
      college: true,
      scholarship: wantsAid,
      plan: true,
    };
  }

  // launcher
  const fullDegree = currentGoal === "higher_studies" || currentGoal === "not_sure";
  const shortEnrollment = currentGoal === "skill_building";

  return {
    career: true,
    plan: true,
    stream: fullDegree,
    pathway: fullDegree,
    // College and Stream/Pathway are NOT the same condition — see Part 3, Rule A2.
    college: fullDegree || shortEnrollment,
    scholarship: wantsAid,
  };
}
