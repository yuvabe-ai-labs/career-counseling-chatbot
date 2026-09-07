import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

const ALL_STATES: ComboboxOption[] = [
  { value: "29", label: "Karnataka" },
  { value: "33", label: "Tamil Nadu" },
  { value: "27", label: "Maharashtra" },
];

function createSearch() {
  return vi.fn((query: string) =>
    Promise.resolve(
      query
        ? ALL_STATES.filter((state) => state.label.toLowerCase().includes(query.toLowerCase()))
        : ALL_STATES,
    ),
  );
}

function ControlledCombobox({ search }: { search: ReturnType<typeof createSearch> }) {
  const [selected, setSelected] = useState<ComboboxOption | null>(null);
  return (
    <Combobox
      label={selected?.label ?? ""}
      onSelect={setSelected}
      search={search}
      placeholder="Type to search your state"
      aria-label="State"
    />
  );
}

describe("Combobox", () => {
  it("shows the full list on open, then narrows it as the user types", async () => {
    const user = userEvent.setup();
    const search = createSearch();
    render(<ControlledCombobox search={search} />);

    // Opening (no typing yet) shows every option — the "browse all" starter list.
    await user.click(screen.getByLabelText("State"));
    await waitFor(() => expect(search).toHaveBeenCalledWith(""));
    expect(await screen.findByRole("option", { name: "Karnataka" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tamil Nadu" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Maharashtra" })).toBeInTheDocument();

    // Typing narrows the visible options to the match.
    await user.type(screen.getByLabelText("State"), "tamil");
    await waitFor(() => expect(search).toHaveBeenCalledWith("tamil"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Tamil Nadu" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Karnataka" })).not.toBeInTheDocument();
    });
  });

  it("selects an option, closes, and shows the selected label", async () => {
    const user = userEvent.setup();
    render(<ControlledCombobox search={createSearch()} />);

    await user.click(screen.getByLabelText("State"));
    await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("State")).toHaveValue("Tamil Nadu");
  });

  it("re-opening a field that already has a value shows the full list again, not blank", async () => {
    const user = userEvent.setup();
    const search = createSearch();
    render(<ControlledCombobox search={search} />);

    await user.click(screen.getByLabelText("State"));
    await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));

    // Re-open the same field.
    await user.click(screen.getByLabelText("State"));

    // The box still shows the previously selected value...
    expect(screen.getByLabelText("State")).toHaveValue("Tamil Nadu");
    // ...but the dropdown offers every option to pick from, not just a self-match.
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(""));
    expect(await screen.findByRole("option", { name: "Karnataka" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Maharashtra" })).toBeInTheDocument();
  });
});
