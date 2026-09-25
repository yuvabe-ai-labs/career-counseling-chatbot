import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui/avatar";

describe("Avatar", () => {
  it("renders single-name initials", () => {
    render(<Avatar name="Adarsh" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders two-name initials", () => {
    render(<Avatar name="Adarsh Yuva" />);
    expect(screen.getByText("AY")).toBeInTheDocument();
  });

  it("renders only the first two of three or more names", () => {
    render(<Avatar name="Adarsh Kumar Yuva" />);
    expect(screen.getByText("AK")).toBeInTheDocument();
  });

  it("falls back to the generic icon for a missing name", () => {
    const { container } = render(<Avatar name={null} />);
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("falls back to the generic icon for an empty/whitespace-only name", () => {
    const { container } = render(<Avatar name="   " />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
