import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecommendationItem } from "@yuvanext/contracts";
import { describe, expect, it } from "vitest";
import {
  CareerRingMap,
  type CareerRings,
} from "@/features/recommendations/components/CareerRingMap";

function item(title: string, rank: number): RecommendationItem {
  return {
    itemId: `item-${rank}-${title}`,
    entityType: "career",
    entityId: "00000000-0000-4000-8000-00000000000" + (rank % 10),
    title,
    rank,
    fitScore: 0.8,
    explanation: {},
    entityDatasetVersion: "test",
  };
}

// Mirrors the real partition's shape (inner 4 / middle 6 / outer 6 — see
// partitionCareerRings in packages/recommendations), including a deliberately short title and a
// long one so the fixed two-line label box is exercised by both.
const rings: CareerRings = {
  outer: [
    item("Social Work Teachers, Postsecondary", 1),
    item("Geography Teachers, Postsecondary", 2),
    item("Philosophy and Religion Teachers, Postsecondary", 3),
    item("Special Education Teachers, Elementary School", 4),
    item("Sociology Teachers, Postsecondary", 5),
    item("Neuropsychologists", 6),
  ],
  middle: [item("Middle A", 7), item("Middle B", 8)],
  inner: [item("Inner A", 9), item("Inner B", 10), item("Inner C", 11), item("Inner D", 12)],
};

function renderMap() {
  return render(
    <CareerRingMap
      rings={rings}
      hideMatchPercent
      selectedItemId={null}
      onSelectCareer={() => {}}
    />,
  );
}

function nodeFor(title: string): HTMLElement {
  const label = screen.getByText(title);
  const node = label.closest(".dot-node");
  if (!(node instanceof HTMLElement)) throw new Error(`no dot-node for ${title}`);
  return node;
}

describe("CareerRingMap", () => {
  it("renders no zoom control and no instruction text", () => {
    renderMap();

    expect(screen.queryByRole("button", { name: /zoom in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /zoom out/i })).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.queryByText(/pinch, scroll, or tap a ring/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/discover stronger career matches/i)).not.toBeInTheDocument();
  });

  it("keeps the centre hub content", () => {
    renderMap();

    expect(screen.getByText("YOU")).toBeInTheDocument();
    expect(screen.getByText("EXPLORE")).toBeInTheDocument();
  });

  it("puts the dot above the label, with the label holding only the career name", () => {
    renderMap();

    const node = nodeFor("Neuropsychologists");
    const children = Array.from(node.children);

    // Order in a flex column is the visual order: dot first, then label.
    expect(children[0]).toHaveClass("dot");
    expect(children[1]).toHaveClass("dot-label");
    // No icon survives inside the label — only the text node.
    expect(within(children[1] as HTMLElement).queryByRole("img")).not.toBeInTheDocument();
    expect((children[1] as HTMLElement).querySelector("svg")).toBeNull();
    expect(children[1]?.textContent).toBe("Neuropsychologists");
  });

  it("places every career by the same radial rule: even angles, one shared ring radius", () => {
    renderMap();

    const angles = rings.outer.map((career) =>
      nodeFor(career.title).style.getPropertyValue("--a").trim(),
    );
    const radii = rings.outer.map((career) =>
      nodeFor(career.title).style.getPropertyValue("--r").trim(),
    );

    // 6 careers, 60deg apart, first one top-centre (-90deg).
    expect(angles).toEqual(["-90deg", "-30deg", "30deg", "90deg", "150deg", "210deg"]);
    // Every item on the ring shares one radius — the outer ring's own rendered radius, so the
    // label is anchored on that circumference rather than short of it.
    expect(new Set(radii)).toEqual(new Set(["50cqmin"]));
  });

  it("re-anchors items to the newly active ring's radius when the stage changes", async () => {
    const user = userEvent.setup();
    renderMap();

    await user.click(screen.getByRole("tab", { name: "Top Matches" }));

    const inner = rings.inner.map((career) => nodeFor(career.title));
    expect(new Set(inner.map((n) => n.style.getPropertyValue("--r").trim()))).toEqual(
      new Set(["37.2cqmin"]),
    );
    // 4 careers -> top, right, bottom, left.
    expect(inner.map((n) => n.style.getPropertyValue("--a").trim())).toEqual([
      "-90deg",
      "0deg",
      "90deg",
      "180deg",
    ]);
  });

  it("still switches rings via the tabs", async () => {
    const user = userEvent.setup();
    renderMap();

    expect(screen.getByText("Social Work Teachers, Postsecondary")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Strong Matches" }));

    expect(screen.getByText("Middle A")).toBeInTheDocument();
    expect(screen.queryByText("Social Work Teachers, Postsecondary")).not.toBeInTheDocument();
  });
});
