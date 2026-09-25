import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CounselorSignInForm } from "@/features/counselor/components/CounselorSignInForm";

function renderForm(onSubmit = vi.fn(() => Promise.resolve())) {
  return {
    onSubmit,
    ...render(
      <MemoryRouter>
        <CounselorSignInForm onSubmit={onSubmit} submitting={false} />
      </MemoryRouter>,
    ),
  };
}

describe("CounselorSignInForm — password field", () => {
  it("toggles visibility without affecting the entered value or submitting the form", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Password *"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Password *")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Password *")).toHaveValue("Str0ng!Pass");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not move focus onto itself, leaving the password field free to keep focus", async () => {
    const user = userEvent.setup();
    renderForm();

    const passwordField = screen.getByLabelText("Password *");
    await user.click(passwordField);
    expect(passwordField).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(passwordField).toHaveFocus();
  });
});
