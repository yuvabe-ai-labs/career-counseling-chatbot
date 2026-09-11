import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { GuardianConsentModal } from "@/features/assessment/components/GuardianConsentModal";
import {
  emptyGuardianVerificationState,
  type GuardianVerificationState,
} from "@/features/assessment/types";

/** A code has been sent, so the OTP section is live and Verify is reachable. */
const otpSent: GuardianVerificationState = {
  ...emptyGuardianVerificationState,
  phase: "otp_verification",
  guardianEmail: "parent@example.com",
  consentId: "consent-id",
  otpTiming: {
    otpExpiresAt: "2999-01-01T00:05:00.000Z",
    resendCount: 0,
    resendsRemaining: 3,
    nextResendAvailableAt: "2999-01-01T00:01:00.000Z",
    canResend: true,
  },
};

function Modal({
  initial = otpSent,
  onVerify = vi.fn(),
  onSendOtp = vi.fn(),
  sending = false,
  verifying = false,
}: {
  initial?: GuardianVerificationState;
  onVerify?: () => void;
  onSendOtp?: () => void;
  sending?: boolean;
  verifying?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <GuardianConsentModal
      value={value}
      onChange={setValue}
      onSendOtp={onSendOtp}
      onResendOtp={vi.fn()}
      onVerify={onVerify}
      onClose={vi.fn()}
      sending={sending}
      resending={false}
      verifying={verifying}
    />
  );
}

describe("GuardianConsentModal — OTP focus and button loading states", () => {
  it("focuses the first OTP box on Verify instead of doing nothing when the code is empty", async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn();
    render(<Modal onVerify={onVerify} />);

    const verify = screen.getByRole("button", { name: "Verify" });
    expect(verify).toBeEnabled(); // it used to be disabled here, so the click was swallowed

    await user.click(verify);

    expect(onVerify).not.toHaveBeenCalled();
    expect(screen.getByText("Please enter the 6-digit OTP.")).toBeInTheDocument();
    expect(screen.getByLabelText("Parent OTP digit 1")).toHaveFocus();
  });

  it("focuses the box the guardian still has to fill, not always the first", async () => {
    const user = userEvent.setup();
    render(<Modal initial={{ ...otpSent, otpDigits: ["1", "2", "3", "", "", ""] }} />);

    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(screen.getByLabelText("Parent OTP digit 4")).toHaveFocus();
  });

  it("puts focus on the OTP boxes as soon as the code has been sent", () => {
    render(<Modal />);
    expect(screen.getByLabelText("Parent OTP digit 1")).toHaveFocus();
  });

  it("verifies once the six digits are in", async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn();
    render(<Modal initial={{ ...otpSent, otpDigits: "123456".split("") }} onVerify={onVerify} />);

    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner rather than loading text, and blocks a second submit, while verifying", () => {
    const onVerify = vi.fn();
    render(
      <Modal
        initial={{ ...otpSent, otpDigits: "123456".split("") }}
        onVerify={onVerify}
        verifying
      />,
    );

    const verify = screen.getByRole("button", { name: "Verify" });
    expect(verify).toBeDisabled();
    expect(verify).toHaveAttribute("aria-busy", "true");
    expect(verify.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText(/verifying|confirming|loading/i)).not.toBeInTheDocument();
  });

  it("shows a spinner rather than loading text, and blocks a second submit, while sending", () => {
    render(<Modal initial={emptyGuardianVerificationState} sending />);

    const send = screen.getByRole("button", { name: "Send OTP" });
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute("aria-busy", "true");
    expect(send.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText(/sending|loading/i)).not.toBeInTheDocument();
  });
});
