import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "@/components/LoadingState";

/**
 * The one shared loading indicator for the whole app (see LoadingState.tsx's own doc comment) —
 * these lock in the properties every page relies on it for: fixed viewport position (not
 * dependent on whatever wraps it), no visible text, and a single spinner.
 */
describe("LoadingState", () => {
  it("renders exactly one spinner, announced to assistive tech, with no visible text", () => {
    render(<LoadingState />);

    const status = screen.getByRole("status", { name: /loading/i });
    expect(status.querySelectorAll("svg")).toHaveLength(1);
    // The "Loading" text exists only for screen readers (sr-only), never as visible copy.
    expect(status.querySelector(".sr-only")).toHaveTextContent("Loading");
  });

  it("is positioned independent of its parent, so it can't shift between pages", () => {
    render(
      <div style={{ marginTop: 400 }}>
        <LoadingState />
      </div>,
    );

    const status = screen.getByRole("status", { name: /loading/i });
    expect(status.className).toContain("fixed");
    expect(status.className).toContain("inset-0");
  });

  it("never blocks a click meant for whatever is already on screen behind it", () => {
    render(<LoadingState />);

    expect(screen.getByRole("status", { name: /loading/i }).className).toContain(
      "pointer-events-none",
    );
  });
});
