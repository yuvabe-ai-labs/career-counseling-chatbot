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
