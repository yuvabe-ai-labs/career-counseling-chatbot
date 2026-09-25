import type { ExploreGatingContext } from "@/lib/storage";

/**
 * Which of the 6 Explore Path tabs a segment/goal combination shows.
 *
 * Explorer and Pathfinder are fixed rules (no goal branching). Launcher branches on two
 * independent signals from intake:
 *   - currentGoal: does the student's goal involve enrolling somewhere at all?
 *       higher_studies / not_sure / skill_building -> yes (College on)
 *       job / career_switch / business             -> no  (College off)
 *   - Scholarship is not goal-driven: only Pathfinder shows it, and only when the student
 *     answered Yes to the pathfinder intake question `seeks_aid`. Launcher/Explorer never show
 *     it for now (aid for Launcher is later work).
 *
 * Stream and Pathway are OFF for Launcher unconditionally: both are pre-tertiary
 * "which subject / which route" decisions, and deriveSegment()
 * (packages/assessment/src/domain/user-profile.ts) only puts students already in
 * college/graduate into Launcher — every Launcher user has already passed that
 * decision point in real life, regardless of their stated goal.
 *
 * College, when shown, uses the exact same eligibility-filtered result Pathfinder gets
 * (resolveEligibleColleges() in college-recommendations.ts — a Tamil Nadu + discipline filter,
 * not a ranking). Since Launcher never has a ranked pathway to read a discipline off of (Pathway
 * is always off, above), recommendation-routes.ts's college handler falls back to the
 * discipline(s) reachable from the student's top-ranked career instead, via
 * knowledge.career_pathways -> knowledge.pathway_disciplines — so College still only ever shows
 * colleges relevant to what the student actually matched with, never the unfiltered catalogue.
 *
 * History: this used to be a direct port of Part 5 of
 * docs/poc/launcher-goal-based-recommendations.md, which also opened Stream+Pathway for
 * higher_studies/not_sure. That doc is now marked superseded on that point — see the status
 * note at its top. College's condition is unchanged from that doc's Rule A2.
 */
export type ExploreTabKey = "career" | "stream" | "pathway" | "college" | "scholarship" | "plan";

export type ExploreTabVisibility = Record<ExploreTabKey, boolean>;

export function tabsToShow(context: ExploreGatingContext): ExploreTabVisibility {
  const { segment, seeksAid, currentGoal } = context;

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
      scholarship: seeksAid,
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
    scholarship: false,
  };
}
