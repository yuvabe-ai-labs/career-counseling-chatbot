import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationItem } from "@yuvanext/contracts";
import { CareerDetailSheet } from "@/features/recommendations/components/CareerDetailSheet";

const ITEM: RecommendationItem = {
  itemId: "item-1",
  entityType: "career",
  entityId: "00000000-0000-4000-8000-000000000001",
  title: "Neuropsychologists",
  rank: 1,
  fitScore: 0.8,
  ring: "inner",
  explanation: {},
  entityDatasetVersion: "test",
};

describe("CareerDetailSheet — outside-click-to-close", () => {
  it("closes when clicking outside the sheet", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="page-background">Rest of the page</div>
        <CareerDetailSheet item={ITEM} segment="pathfinder" onClose={onClose} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId("page-background"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the sheet", () => {
    const onClose = vi.fn();
    render(<CareerDetailSheet item={ITEM} segment="pathfinder" onClose={onClose} />);

    fireEvent.mouseDown(screen.getByText("Neuropsychologists"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes via the existing close (X) button", () => {
    const onClose = vi.fn();
    render(<CareerDetailSheet item={ITEM} segment="pathfinder" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking a ring dot elsewhere on the page — that reselects instead", () => {
    const onClose = vi.fn();
    render(
      <div>
        <button type="button" className="dot-node">
          <span className="dot-label">Some Other Career</span>
        </button>
        <CareerDetailSheet item={ITEM} segment="pathfinder" onClose={onClose} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByText("Some Other Career"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing on outside clicks while closed (no item)", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="page-background">Rest of the page</div>
        <CareerDetailSheet item={null} segment="pathfinder" onClose={onClose} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId("page-background"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
