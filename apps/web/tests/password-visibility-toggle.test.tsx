import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PasswordVisibilityToggle } from "@/features/assessment/components/PasswordVisibilityToggle";

function ControlledToggle() {
  const [visible, setVisible] = useState(false);
  return <PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((value) => !value)} />;
}

describe("PasswordVisibilityToggle", () => {
  it("toggles its own label between Show password and Hide password on click", async () => {
    const user = userEvent.setup();
    render(<ControlledToggle />);

    const button = screen.getByRole("button", { name: "Show password" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("is a plain, non-submitting button so it can never submit an enclosing form", () => {
    render(<ControlledToggle />);
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute("type", "button");
  });

  it("never takes DOM focus itself on click, so it can't steal focus away from another field", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <input aria-label="Some other field" />
        <ControlledToggle />
      </div>,
    );

    const otherField = screen.getByLabelText("Some other field");
    await user.click(otherField);
    expect(otherField).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Show password" }));

    // The click toggled visibility (confirms onClick still fires)...
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
    // ...but focus never moved to the toggle button itself.
    expect(otherField).toHaveFocus();
    expect(screen.getByRole("button", { name: "Hide password" })).not.toHaveFocus();
  });
});
