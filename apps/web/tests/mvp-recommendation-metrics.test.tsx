import { render, screen } from "@testing-library/react";
import type { RecommendationItem } from "@yuvapath/contracts";
import { describe, expect, it } from "vitest";
import { CareerDetailSheet } from "@/features/recommendations/components/CareerDetailSheet";
import { PathwayDetailSheet } from "@/features/recommendations/components/PathwayDetailSheet";
import { RingMap } from "@/features/recommendations/components/RingMap";

// MVP presentation rules: no career percentage anywhere; pathway shows College Availability only.
// The hidden fields stay on the items (fitScore, sub-scores) — they are just not rendered.

const career: RecommendationItem = {
  itemId: "career-1",
  entityType: "career",
  entityId: "00000000-0000-4000-8000-000000000001",
  title: "Neuropsychologists",
  rank: 1,
  fitScore: 0.87,
  ring: "inner",
  explanation: {
    schemaVersion: 1,
    interestFit: 0.91,
    valuesFit: 0.6,
    feasibility: 0.65,
    contextBoost: 0.1,
    weights: { interest: 0.7, values: 0, feasibility: 0.15, context: 0.15 },
    topMatchingScales: ["I", "S"],
    tradeoffKey: null,
  },
  entityDatasetVersion: "test",
} as unknown as RecommendationItem;

const pathway: RecommendationItem = {
  itemId: "pathway-1",
  entityType: "pathway",
  entityId: "00000000-0000-4000-8000-000000000002",
  title: "B.Sc Nursing",
  rank: 1,
  fitScore: 0.74,
  ring: "inner",
  explanation: {
    schemaVersion: 2,
    careerAlignment: 0.5,
    streamAlignment: 0.4,
    collegeAvailability: 0.63,
    segmentFit: 1,
    marksFit: 0.5,
    reachability: 0.65,
    backupRouteFit: 1,
    catalogPriority: 1,
    matchedCareerIds: [],
    matchedStreamOptionIds: [],
  },
  entityDatasetVersion: "test",
} as unknown as RecommendationItem;

describe("CareerDetailSheet — MVP", () => {
  it.each(["pathfinder", "launcher"] as const)(
    "%s: shows the ring tier, an Interest Fit reason and top scales — no percentages at all",
    (segment) => {
      render(<CareerDetailSheet item={career} segment={segment} onClose={() => {}} />);

      expect(screen.getByText("Top Match")).toBeInTheDocument();
      expect(screen.getByText("Interest Fit")).toBeInTheDocument();
      expect(
        screen.getByText(/matches your interests because you enjoy investigating/i),
      ).toBeInTheDocument();
      expect(screen.getByText("Top Matching Scales")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/%/);
      for (const hidden of ["Values Fit", "Feasibility", "Boost"]) {
        expect(screen.queryByText(hidden)).not.toBeInTheDocument();
      }
    },
  );

  it("explorer: unchanged prose reason, no percentages, no scales", () => {
    render(<CareerDetailSheet item={career} segment="explorer" onClose={() => {}} />);

    expect(screen.getByText(/This fits because/)).toBeInTheDocument();
    expect(screen.queryByText("Interest Fit")).not.toBeInTheDocument();
    expect(screen.queryByText("Top Matching Scales")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/%/);
  });
});

describe("RingMap dot metric", () => {
  const rings = { outer: [pathway], middle: [], inner: [] };
  const zoomLabels = { 1: "A", 2: "B", 3: "C" } as const;

  it("shows only the supplied metric (College Availability), not fitScore", () => {
    render(
      <RingMap
        rings={rings}
        zoomLabels={zoomLabels}
        hideMatchPercent={false}
        dotMetric={(item) => (item.explanation as { collegeAvailability?: number }).collegeAvailability}
        selectedItemId={null}
        onSelectItem={() => {}}
        ariaLabel="test"
      />,
    );

    expect(screen.getByText(/63%/)).toBeInTheDocument();
    expect(screen.queryByText(/74%/)).not.toBeInTheDocument();
  });

  it("shows no number when the match percent is hidden (career)", () => {
    render(
      <RingMap
        rings={{ outer: [career], middle: [], inner: [] }}
        zoomLabels={zoomLabels}
        hideMatchPercent
        selectedItemId={null}
        onSelectItem={() => {}}
        ariaLabel="test"
      />,
    );

    expect(document.body.textContent).not.toMatch(/%/);
  });
});

describe("PathwayDetailSheet — MVP", () => {
  it("shows College Availability only, no other pathway scores", () => {
    render(<PathwayDetailSheet item={pathway} onClose={() => {}} />);

    expect(screen.getByText("College Availability")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.queryByText("Career Fit")).not.toBeInTheDocument();
    expect(screen.queryByText("Reachability")).not.toBeInTheDocument();
    expect(screen.queryByText(/74%|50%|65%/)).not.toBeInTheDocument();
  });
});
