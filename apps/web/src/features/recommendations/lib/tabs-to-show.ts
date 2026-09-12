import type { ExploreGatingContext } from "@/lib/storage";

/**
 * Which of the 6 Explore Path tabs a segment/goal combination shows.
 *
 * Explorer and Pathfinder are fixed rules (no goal branching). Launcher branches on two
 * independent signals from intake:
 *   - currentGoal: does the student's goal involve enrolling somewhere at all?
 *       higher_studies / not_sure / skill_building -> yes (College on)
 *       job / career_switch / business             -> no  (College off)
 *   - wantsAid: independent of the above; only gates Scholarship.
 *
 * Stream and Pathway are OFF for Launcher unconditionally: both are pre-tertiary
 * "which subject / which route" decisions, and deriveSegment()
 * (packages/assessment/src/domain/user-profile.ts) only puts students already in
 * college/graduate/working into Launcher — every Launcher user has already passed that
 * decision point in real life, regardless of their stated goal.
 *
 * College, when shown, uses the exact same unnarrowed, full-catalog, state-ringed scoring
 * Pathfinder gets — no vocational/polytechnic/ITI filter, no discipline-from-career
 * derivation. Both are deferred: no career->discipline mapping exists in the schema today.
 *
 * History: this used to be a direct port of Part 5 of
 * docs/poc/launcher-goal-based-recommendations.md, which also opened Stream+Pathway for
 * higher_studies/not_sure. That doc is now marked superseded on that point — see the status
 * note at its top. College's condition is unchanged from that doc's Rule A2.
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
  const isEnrollingAnywhere =
    currentGoal === "higher_studies" || currentGoal === "not_sure" || currentGoal === "skill_building";

  return {
    career: true,
    plan: true,
    stream: false,
    pathway: false,
    college: isEnrollingAnywhere,
    scholarship: wantsAid,
  };
}
