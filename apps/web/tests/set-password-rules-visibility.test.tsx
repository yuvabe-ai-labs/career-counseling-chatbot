import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SetPasswordForm } from "@/features/assessment/components/SetPasswordForm";

function ControlledForm() {
  const [email, setEmail] = useState("");
  return (
    <SetPasswordForm
      email={email}
      onEmailChange={setEmail}
      onSubmit={vi.fn(() => Promise.resolve())}
      submitting={false}
    />
  );
}

/** The checklist is guidance for typing a password, not permanent furniture on the card. */
describe("SetPasswordForm — password rules checklist", () => {
  it("stays hidden until the password field is focused, then hides again on blur", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Enter your password"));
    expect(screen.getByText("8 character minimum")).toBeInTheDocument();

    // Focus something else in the form — the rules are no longer relevant.
    await user.click(screen.getByLabelText("Email address *"));
    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();
  });

  it("stays open while the show/hide-password button is used, since focus never leaves the field", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    await user.click(screen.getByLabelText("Enter your password"));
    // Confirm Password has an identically-labelled toggle — this is the password field's own.
    const [passwordToggle] = screen.getAllByRole("button", { name: "Show password" });
    await user.click(passwordToggle!);

    expect(screen.getByText("8 character minimum")).toBeInTheDocument();
  });

  /**
   * Regression test for a real bug: the checklist's open/closed state used to be tracked by an
   * onFocus/onBlur pair on the wrapper div around both the password input AND this toggle button
   * (not the input alone), specifically so toggling visibility mid-typing didn't close the
   * checklist (see the test above). The side effect was that clicking the toggle button on its
   * own — before the password field had ever been focused — also moved native DOM focus onto the
   * button, which bubbled a focus event up into that same wrapper and opened the checklist even
   * though the user never touched the input. Fixed by having the toggle button cancel its own
   * default focus-on-click behavior (PasswordVisibilityToggle's onMouseDown) instead of changing
   * how the wrapper tracks focus, so this scenario and the one above both now resolve correctly.
   */
  it("does NOT open when only the show/hide-password button is clicked, without ever focusing the password field", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();

    const [passwordToggle] = screen.getAllByRole("button", { name: "Show password" });
    await user.click(passwordToggle!);

    // The click still did its one job...
    expect(screen.getByLabelText("Enter your password")).toHaveAttribute("type", "text");
    // ...but the checklist — and the password field's own focus/validation UI — never opened.
    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Enter your password")).not.toHaveFocus();
  });

  it("reopens on a failed submit, so the error naming the requirements can point at them", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    await user.type(screen.getByLabelText("Enter your password"), "weak");
    await user.click(screen.getByLabelText("Email address *"));
    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByText(/doesn't meet all the requirements below/i)).toBeInTheDocument();
    expect(screen.getByText("8 character minimum")).toBeInTheDocument();
  });
});
