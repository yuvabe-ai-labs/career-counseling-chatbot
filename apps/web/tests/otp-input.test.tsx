import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { OtpInput } from "@/features/assessment/components/OtpInput";

function ControlledOtpInput({ length }: { length: number }) {
  const [digits, setDigits] = useState<string[]>(Array.from({ length }, () => ""));
  return <OtpInput length={length} digits={digits} onChange={setDigits} />;
}

describe("OtpInput", () => {
  it("advances focus to the next box as digits are typed", async () => {
    const user = userEvent.setup();
    render(<ControlledOtpInput length={4} />);
    const boxes = screen.getAllByLabelText(/OTP digit/);

    await user.type(boxes[0]!, "1");
    expect(boxes[1]).toHaveFocus();

    await user.type(boxes[1]!, "2");
    expect(boxes[2]).toHaveFocus();
  });

  it("moves focus back and clears the previous digit on backspace from an empty box", async () => {
    const user = userEvent.setup();
    render(<ControlledOtpInput length={4} />);
    const boxes = screen.getAllByLabelText(/OTP digit/);

    await user.type(boxes[0]!, "1");
    expect(boxes[1]).toHaveFocus();

    await user.keyboard("{Backspace}");
    expect(boxes[0]).toHaveFocus();
    expect(boxes[0]).toHaveValue("");
  });

  it("distributes a pasted/typed multi-digit sequence across the remaining boxes", async () => {
    const user = userEvent.setup();
    render(<ControlledOtpInput length={4} />);
    const boxes = screen.getAllByLabelText(/OTP digit/);

    boxes[0]!.focus();
    await user.paste("1234");

    expect(boxes[0]).toHaveValue("1");
    expect(boxes[1]).toHaveValue("2");
    expect(boxes[2]).toHaveValue("3");
    expect(boxes[3]).toHaveValue("4");
  });
});
