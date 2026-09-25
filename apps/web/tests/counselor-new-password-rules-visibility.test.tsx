import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CounselorNewPasswordForm } from "@/features/counselor/components/CounselorNewPasswordForm";

function renderForm() {
  return render(
    <CounselorNewPasswordForm onSubmit={vi.fn(() => Promise.resolve())} submitting={false} />,
  );
}

/** Same checklist behavior as the student SetPasswordForm (see
 *  set-password-rules-visibility.test.tsx) — CounselorNewPasswordForm reuses the identical
 *  wrapper-focus-tracking pattern, so it shared the identical bug and fix. */
describe("CounselorNewPasswordForm — password rules checklist", () => {
  it("stays hidden until the password field is focused, then hides again on blur", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("New Password"));
    expect(screen.getByText("8 character minimum")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Confirm Password"));
    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();
  });

  it("stays open while the show/hide-password button is used, since focus never leaves the field", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByLabelText("New Password"));
    const [passwordToggle] = screen.getAllByRole("button", { name: "Show password" });
    await user.click(passwordToggle!);

    expect(screen.getByText("8 character minimum")).toBeInTheDocument();
  });

  it("does NOT open when only the show/hide-password button is clicked, without ever focusing the password field", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();

    const [passwordToggle] = screen.getAllByRole("button", { name: "Show password" });
    await user.click(passwordToggle!);

    expect(screen.getByLabelText("New Password")).toHaveAttribute("type", "text");
    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();
    expect(screen.getByLabelText("New Password")).not.toHaveFocus();
  });

  it("reopens on a failed submit, so the error naming the requirements can point at them", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("New Password"), "weak");
    await user.click(screen.getByLabelText("Confirm Password"));
    expect(screen.queryByText("8 character minimum")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set Password" }));

    expect(screen.getByText(/doesn't meet all the requirements below/i)).toBeInTheDocument();
    expect(screen.getByText("8 character minimum")).toBeInTheDocument();
  });

  it("toggles the confirm-password field's own visibility independently of the new-password field", async () => {
    const user = userEvent.setup();
    renderForm();

    const [, confirmToggle] = screen.getAllByRole("button", { name: "Show password" });
    await user.click(confirmToggle!);

    expect(screen.getByLabelText("Confirm Password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("New Password")).toHaveAttribute("type", "password");
  });
});
