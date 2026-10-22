import type { ClusterfitGradePath } from "@yuvapath/contracts";
import { APTITUDE_ITEMS, type AptitudeItem } from "../content/v1/index.js";

export const gradePathForGrade = (grade: number | null | undefined): ClusterfitGradePath | null => {
  if (grade === 9 || grade === 10) return "9_10";
  if (grade === 11 || grade === 12) return "11_12";
  return null;
};

/**
 * For now every student takes all 20 puzzles (product decision 2026-10-22, plan §18.1 R11), so a
 * session's grade path is always "11_12". The doc's split (Classes 9–10 take items 1–2 of each
 * domain) comes back by returning gradePathForGrade(grade) here instead.
 */
export const puzzleGradePath = (): ClusterfitGradePath => "11_12";

/** Grades 9–10 take items 1–2 of each domain (10 items); Grades 11–12 take all 20. */
export const aptitudeItemsForGradePath = (
  gradePath: ClusterfitGradePath,
): readonly AptitudeItem[] =>
  gradePath === "11_12"
    ? APTITUDE_ITEMS
    : APTITUDE_ITEMS.filter((item) => !item.gradesElevenTwelveOnly);
