import type { RecommendationItem, RiasecScale, Segment } from "@yuvapath/contracts";
import { useCareerRecommendations } from "@/features/recommendations/hooks/useCareerRecommendations";
import { usePathwayRecommendations } from "@/features/recommendations/hooks/usePathwayRecommendations";
import { useStreamRecommendations } from "@/features/recommendations/hooks/useStreamRecommendations";
import { tabsToShow } from "@/features/recommendations/lib/tabs-to-show";
import type { ExploreGatingContext } from "@/lib/storage";

export const SEGMENT_LABEL: Record<Segment, string> = {
  explorer: "Explorer",
  pathfinder: "Pathfinder",
  launcher: "Launcher",
};

export const TRAIT_MEANING: Record<RiasecScale, { label: string; meaning: string }> = {
  R: {
    label: "Realistic",
    meaning: "you like hands-on, practical work with tools, machines or the outdoors",
  },
  I: {
    label: "Investigative",
    meaning: "you like investigating, analysing and figuring things out",
  },
  A: { label: "Artistic", meaning: "you like creative, open-ended work and expressing ideas" },
  S: { label: "Social", meaning: "you like helping, teaching and supporting people" },
  E: { label: "Enterprising", meaning: "you like leading, persuading and taking initiative" },
  C: { label: "Conventional", meaning: "you like organised, detail-focused and structured work" },
};

export type ReportMatchCard = { key: string; title: string; tag: string; detail: string };

const RING_TAG: Record<NonNullable<RecommendationItem["ring"]>, string> = {
  inner: "Top match",
  middle: "Strong match",
  outer: "Explore option",
};

export type ReportMatchSource = Pick<
  RecommendationItem,
  "itemId" | "title" | "rank" | "ring" | "explanation"
>;

/**
 * Turns stored matches into the cards under "Your selections & explorations": up to 4, careers
 * first, then the top stream and pathway where the segment has those screens. Shared by the
 * student's own report (live queries) and the counselor's copy (server-provided rows).
 */
export function buildReportMatchCards(
  matches: {
    career: readonly ReportMatchSource[];
    stream: readonly ReportMatchSource[];
    pathway: readonly ReportMatchSource[];
  },
  visibility: { stream: boolean; pathway: boolean },
): ReportMatchCard[] {
  const byRank = (items: readonly ReportMatchSource[]) =>
    [...items].sort((a, b) => a.rank - b.rank);
  const ringTag = (item: ReportMatchSource) => (item.ring ? RING_TAG[item.ring] : "Recommended");

  const careerCards: ReportMatchCard[] = byRank(matches.career)
    .slice(0, 2)
    .map((item) => {
      const scales =
        typeof item.explanation === "object" &&
        item.explanation !== null &&
        "topMatchingScales" in item.explanation &&
        Array.isArray(item.explanation.topMatchingScales)
          ? (item.explanation.topMatchingScales as RiasecScale[])
          : [];
      const labels = scales.map((scale) => TRAIT_MEANING[scale]?.label).filter(Boolean);
      return {
        key: item.itemId,
        title: item.title,
        tag: ringTag(item),
        detail: labels.length > 0 ? `Matches: ${labels.join(", ")}` : "Career",
      };
    });
  const streamCards: ReportMatchCard[] = visibility.stream
    ? matches.stream.slice(0, 1).map((item) => ({
        key: item.itemId,
        title: item.title,
        tag: "Top stream",
        detail:
          typeof item.explanation === "object" &&
          item.explanation !== null &&
          "description" in item.explanation &&
          typeof item.explanation.description === "string"
            ? item.explanation.description
            : "Stream",
      }))
    : [];
  const pathwayCards: ReportMatchCard[] = visibility.pathway
    ? byRank(matches.pathway)
        .slice(0, 1)
        .map((item) => ({
          key: item.itemId,
          title: item.title,
          tag: ringTag(item),
          detail: "Pathway",
        }))
    : [];

  return [...careerCards, ...streamCards, ...pathwayCards].slice(0, 4);
}

/**
 * The cards under "Your selections & explorations": up to 4 of the student's top matches (careers
 * first, then their top stream and pathway where their segment has those screens), as plain titles
 * with a ring label and one factual detail line — no percentages (hidden for the MVP). Reads the
 * same stored recommendation runs the Explore Path screens use; requests are chained career ->
 * stream -> pathway, matching the order Explore Path visits them in, since stream and pathway
 * scoring read the student's stored earlier runs.
 */
export function useReportMatchCards(
  profileSnapshotId: string | null,
  gatingContext: ExploreGatingContext | null,
): { cards: ReportMatchCard[]; isLoading: boolean; hasSnapshot: boolean } {
  const visibility = gatingContext ? tabsToShow(gatingContext) : null;
  const careerQuery = useCareerRecommendations(profileSnapshotId);
  const streamQuery = useStreamRecommendations(
    visibility?.stream && careerQuery.isSuccess ? profileSnapshotId : null,
  );
  const pathwayQuery = usePathwayRecommendations(
    visibility?.pathway && streamQuery.isSuccess ? profileSnapshotId : null,
  );

  if (!profileSnapshotId || !visibility) {
    return { cards: [], isLoading: false, hasSnapshot: false };
  }

  const cards = buildReportMatchCards(
    {
      career: careerQuery.data?.items ?? [],
      stream: streamQuery.data?.items ?? [],
      pathway: pathwayQuery.data?.items ?? [],
    },
    visibility,
  );

  const isLoading =
    careerQuery.isPending ||
    (visibility.stream && careerQuery.isSuccess && streamQuery.isPending) ||
    (visibility.pathway && streamQuery.isSuccess && pathwayQuery.isPending);

  return {
    cards,
    isLoading,
    hasSnapshot: true,
  };
}
