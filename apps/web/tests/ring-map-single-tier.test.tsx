import { render, screen } from "@testing-library/react";
import type { RecommendationItem } from "@yuvanext/contracts";
import { describe, expect, it, vi } from "vitest";
import { RingMap } from "@/features/recommendations/components/RingMap";

function item(title: string, rank: number): RecommendationItem {
  return {
    itemId: `item-${rank}-${title}`,
    entityType: "stream",
    entityId: "00000000-0000-4000-8000-00000000000" + (rank % 10),
    title,
    rank,
    fitScore: 0.8,
    explanation: {},
    entityDatasetVersion: "test",
  };
}

const zoomLabels = { 1: "Explore More", 2: "Explore More", 3: "Recommended Streams" } as const;

/**
 * Streams/pathways aren't ring-partitioned by the backend (only career/college produce
 * inner/middle/outer tiers) — StreamPage/PathwayPage pass the full ranked list as `rings.inner`
 * with `singleTier`, which this covers: no stage tabs, no empty outer/middle ring circles
 * implying tiers that don't exist, and every item from the flat list actually renders.
 */
describe("RingMap — singleTier", () => {
  it("renders no stage tabs and no outer/middle ring circles", () => {
    render(
      <RingMap
        rings={{ inner: [item("Science with Mathematics", 1)], middle: [], outer: [] }}
        zoomLabels={zoomLabels}
        hideMatchPercent={false}
        selectedItemId={null}
        onSelectItem={() => {}}
        ariaLabel="Recommended streams"
        singleTier
      />,
    );

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show explore more/i })).not.toBeInTheDocument();
    expect(document.querySelector(".ring-outer")).toBeNull();
    expect(document.querySelector(".ring-middle")).toBeNull();
    expect(document.querySelector(".ring-inner")).not.toBeNull();
  });

  it("renders every item from the flat list on the one ring and reports selection on click", async () => {
    const onSelectItem = vi.fn();
    render(
      <RingMap
        rings={{
          inner: [item("Science with Mathematics", 1), item("Commerce", 2)],
          middle: [],
          outer: [],
        }}
        zoomLabels={zoomLabels}
        hideMatchPercent
        selectedItemId={null}
        onSelectItem={onSelectItem}
        ariaLabel="Recommended streams"
        singleTier
      />,
    );

    expect(screen.getByText("Science with Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Commerce")).toBeInTheDocument();

    screen.getByText("Commerce").closest("button")?.click();
    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ title: "Commerce" }));
  });
});
