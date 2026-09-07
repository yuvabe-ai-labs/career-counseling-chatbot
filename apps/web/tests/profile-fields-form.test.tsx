import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProfileFieldsForm } from "@/features/assessment/components/ProfileFieldsForm";
import { emptyProfileFormValues, type ProfileFormValues } from "@/features/assessment/types";

// State/city are now a live-search Combobox (GET /api/v1/catalog/states|cities) rather
// than a static <select> — stub the network calls these tests would otherwise make.
vi.mock("@/features/assessment/api/location", () => ({
  searchStates: vi.fn(() => Promise.resolve({ data: [{ code: "33", name: "Tamil Nadu" }] })),
  searchCities: vi.fn(() =>
    Promise.resolve({ data: [{ id: "15376", name: "Chennai", stateCode: "33" }] }),
  ),
}));

/** A date of birth whose age (as of today, matching calculateAge's own math) is exactly `age`. */
function dobForAge(age: number): string {
  const now = new Date();
  const dob = new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate()));
  return dob.toISOString().slice(0, 10);
}

function ControlledForm({ onNext }: { onNext: () => void }) {
  const [value, setValue] = useState<ProfileFormValues>(emptyProfileFormValues);
  return (
    // MemoryRouter: ProfileFieldsForm's "Already have an account? Sign in" text is a real
    // react-router Link now, which throws outside a router context.
    <MemoryRouter>
      <ProfileFieldsForm value={value} onChange={setValue} onNext={onNext} />
    </MemoryRouter>
  );
}

describe("ProfileFieldsForm", () => {
  it("blocks submission and shows field errors when required fields are missing", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ControlledForm onNext={onNext} />);

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText(/please tell us your name/i)).toBeInTheDocument();
    expect(screen.getByText(/please enter your date of birth/i)).toBeInTheDocument();
    expect(screen.getByText(/please select your city/i)).toBeInTheDocument();
    expect(screen.getByText(/please select your state/i)).toBeInTheDocument();
    expect(screen.getByText(/please select your current stage/i)).toBeInTheDocument();
  });

  it("rejects an age below the ageBand floor of 12 (Figma node 139:3886 copy)", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ControlledForm onNext={onNext} />);

    await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: dobForAge(9) } });
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText(/you must be 12 or older to continue/i)).toBeInTheDocument();
  });

  it("rejects an age above the 100 ceiling", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ControlledForm onNext={onNext} />);

    await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: dobForAge(101) },
    });
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid date of birth/i)).toBeInTheDocument();
  });

  it("calls onNext once every required field is valid", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ControlledForm onNext={onNext} />);

    await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: dobForAge(16) },
    });

    await user.click(screen.getByLabelText("State"));
    await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));

    await user.click(screen.getByLabelText("City"));
    await user.click(await screen.findByRole("option", { name: "Chennai" }));

    await user.selectOptions(screen.getByLabelText("Current stage"), "higher_secondary");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
