import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import { OnboardingPage, SessionProvider } from "@/features/assessment";

// Same rationale as profile-fields-form.test.tsx — state/city are a live-search Combobox.
vi.mock("@/features/assessment/api/location", () => ({
  searchStates: vi.fn(() => Promise.resolve({ data: [{ code: "33", name: "Tamil Nadu" }] })),
  searchCities: vi.fn(() =>
    Promise.resolve({ data: [{ id: "15376", name: "Chennai", stateCode: "33" }] }),
  ),
}));

const {
  requestAnonymousSession,
  checkEmailAvailability,
  signUpWithPassword,
  requestPendingGuardianConsent,
  resendPendingGuardianConsent,
  verifyPendingGuardianConsent,
  createJourneySession,
  upsertUserProfile,
} = vi.hoisted(() => ({
  requestAnonymousSession: vi.fn(),
  checkEmailAvailability: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPendingGuardianConsent: vi.fn(),
  resendPendingGuardianConsent: vi.fn(),
  verifyPendingGuardianConsent: vi.fn(),
  createJourneySession: vi.fn(),
  upsertUserProfile: vi.fn(),
}));

vi.mock("@/features/assessment/api/identity", () => ({
  requestAnonymousSession,
  checkEmailAvailability,
  signUpWithPassword,
}));

vi.mock("@/features/assessment/api/guardian-consent", () => ({
  getGuardianConsentStatus: vi.fn(),
  requestGuardianConsent: vi.fn(),
  verifyGuardianConsent: vi.fn(),
  requestPendingGuardianConsent,
  resendPendingGuardianConsent,
  verifyPendingGuardianConsent,
}));

vi.mock("@/features/assessment/api/journey-session", () => ({
  createJourneySession,
  getJourneySession: vi.fn(),
  resumeJourneySession: vi.fn(),
}));

vi.mock("@/features/assessment/api/profile", () => ({
  upsertUserProfile,
  getUserProfile: vi.fn(),
}));

function renderOnboarding() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter>
          <OnboardingPage />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

/** A date of birth whose age (as of today) is exactly `age` — matches calculateAge's own math. */
function dobForAge(age: number): string {
  const now = new Date();
  const dob = new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate()));
  return dob.toISOString().slice(0, 10);
}

const otpTiming = (overrides: Partial<Record<string, unknown>> = {}) => ({
  otpExpiresAt: "2099-01-01T00:05:00.000Z",
  resendCount: 0,
  resendsRemaining: 3,
  nextResendAvailableAt: "2099-01-01T00:01:00.000Z",
  canResend: true,
  ...overrides,
});

async function completeStepOneAsMinor(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: dobForAge(15) } });
  await user.click(screen.getByLabelText("State"));
  await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));
  await user.click(screen.getByLabelText("City"));
  await user.click(await screen.findByRole("option", { name: "Chennai" }));
  await user.selectOptions(screen.getByLabelText("Current stage"), "higher_secondary");
  await user.click(screen.getByRole("button", { name: /next/i }));
}

// These hoisted mocks are shared across every test in this file (vi.hoisted), and
// tests/setup.ts only resets the DOM (cleanup()) between tests, not mock call history — clear
// it explicitly so call-count assertions (e.g. "reopening doesn't call the backend again") mean
// what they say, rather than accumulating across every prior test in this file.
beforeEach(() => {
  vi.clearAllMocks();
});

function setupCommonMocks() {
  requestAnonymousSession.mockResolvedValue({
    pendingSessionId: "pending-session-id",
    expiresAt: "2099-01-01T00:30:00.000Z",
  });
  checkEmailAvailability.mockResolvedValue({ available: true });
}

describe("Enter key — Step 1 and the password step", () => {
  it("Enter on Step 1 submits, same as clicking Next (adult path)", async () => {
    setupCommonMocks();
    const user = userEvent.setup();
    renderOnboarding();

    await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: dobForAge(20) },
    });
    await user.click(screen.getByLabelText("State"));
    await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));
    await user.click(screen.getByLabelText("City"));
    await user.click(await screen.findByRole("option", { name: "Chennai" }));
    await user.selectOptions(screen.getByLabelText("Current stage"), "higher_secondary");

    await user.type(screen.getByLabelText(/what should we call you/i), "{Enter}");

    expect(
      await screen.findByRole("heading", { name: /create your password/i }),
    ).toBeInTheDocument();
  });

  it("Enter on the password step submits, same as clicking Start", async () => {
    setupCommonMocks();
    signUpWithPassword.mockResolvedValue({ userId: "user-id" });
    createJourneySession.mockResolvedValue({ session: { id: "session-id" } });
    upsertUserProfile.mockResolvedValue({ profile: { userId: "user-id" } });

    const user = userEvent.setup();
    renderOnboarding();
    await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: dobForAge(20) },
    });
    await user.click(screen.getByLabelText("State"));
    await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));
    await user.click(screen.getByLabelText("City"));
    await user.click(await screen.findByRole("option", { name: "Chennai" }));
    await user.selectOptions(screen.getByLabelText("Current stage"), "higher_secondary");
    await user.click(screen.getByRole("button", { name: /next/i }));

    await user.type(await screen.findByLabelText(/email address/i), "asha@example.com");
    await user.type(screen.getByLabelText("Enter your password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText("Confirm Password"), "Str0ng!Pass{Enter}");

    await waitFor(() => expect(signUpWithPassword).toHaveBeenCalledTimes(1));
  });
});

describe("Guardian consent modal — outside click / Escape preserve entered data", () => {
  it("preserves the guardian email after closing with an outside click, and shows it again on reopen", async () => {
    setupCommonMocks();
    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOneAsMinor(user);

    const emailField = await screen.findByLabelText(/parent\/guardian email address/i);
    await user.type(emailField, "parent@example.com");

    // Click the backdrop itself (not the modal card) — that's what "outside click" means here.
    fireEvent.click(screen.getByRole("dialog"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requestPendingGuardianConsent).not.toHaveBeenCalled();

    // Reopen — Next again, same profile values already filled in.
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByLabelText(/parent\/guardian email address/i)).toHaveValue(
      "parent@example.com",
    );
    // Reopening doesn't call the backend again just to redisplay the modal.
    expect(requestAnonymousSession).toHaveBeenCalledTimes(1);
  });

  it("preserves the guardian email after closing with Escape", async () => {
    setupCommonMocks();
    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOneAsMinor(user);

    const emailField = await screen.findByLabelText(/parent\/guardian email address/i);
    await user.type(emailField, "parent@example.com");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByLabelText(/parent\/guardian email address/i)).toHaveValue(
      "parent@example.com",
    );
  });
});

describe("Guardian consent modal — Enter key", () => {
  it("Enter in the email field sends the OTP, same as clicking Send OTP", async () => {
    setupCommonMocks();
    requestPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "pending" },
      otpTiming: otpTiming(),
    });
    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOneAsMinor(user);

    const emailField = await screen.findByLabelText(/parent\/guardian email address/i);
    await user.type(emailField, "parent@example.com{Enter}");

    await waitFor(() => expect(requestPendingGuardianConsent).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("Parent OTP digit 1")).toBeInTheDocument();
  });

  it("Enter on an incomplete OTP shows the validation error instead of submitting", async () => {
    setupCommonMocks();
    requestPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "pending" },
      otpTiming: otpTiming(),
    });
    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOneAsMinor(user);

    await user.type(
      await screen.findByLabelText(/parent\/guardian email address/i),
      "parent@example.com{Enter}",
    );
    await screen.findByLabelText("Parent OTP digit 1");

    await user.type(screen.getByLabelText("Parent OTP digit 1"), "1{Enter}");

    expect(screen.getByText(/please enter the 6-digit otp/i)).toBeInTheDocument();
    expect(verifyPendingGuardianConsent).not.toHaveBeenCalled();
  });

  it("Enter with a complete OTP verifies, same as clicking Verify", async () => {
    setupCommonMocks();
    requestPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "pending" },
      otpTiming: otpTiming(),
    });
    verifyPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "granted" },
    });
    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOneAsMinor(user);

    await user.type(
      await screen.findByLabelText(/parent\/guardian email address/i),
      "parent@example.com{Enter}",
    );
    await screen.findByLabelText("Parent OTP digit 1");
    for (let index = 0; index < 5; index += 1) {
      await user.type(screen.getByLabelText(`Parent OTP digit ${index + 1}`), "1");
    }
    await user.type(screen.getByLabelText("Parent OTP digit 6"), "1{Enter}");

    await waitFor(() => expect(verifyPendingGuardianConsent).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("heading", { name: /create your password/i }),
    ).toBeInTheDocument();
  });
});

describe("Guardian consent modal — change email address after OTP sent", () => {
  it("resets to the email step and clears the OTP/timing state, requiring a fresh Send OTP", async () => {
    setupCommonMocks();
    requestPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "pending" },
      otpTiming: otpTiming(),
    });
    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOneAsMinor(user);

    await user.type(
      await screen.findByLabelText(/parent\/guardian email address/i),
      "wrong-parent@example.com{Enter}",
    );
    await screen.findByLabelText("Parent OTP digit 1");
    for (let index = 0; index < 6; index += 1) {
      await user.type(screen.getByLabelText(`Parent OTP digit ${index + 1}`), "1");
    }

    await user.click(screen.getByRole("button", { name: /change email address/i }));

    // Back to the email-entry step: the field is empty and editable again, the OTP section is
    // inert again (no otpTiming — cleared digits, disabled input), and the link itself is gone
    // until a new OTP is sent.
    const emailField = screen.getByLabelText(/parent\/guardian email address/i);
    expect(emailField).toHaveValue("");
    expect(emailField).toBeEnabled();
    expect(screen.getByLabelText("Parent OTP digit 1")).toHaveValue("");
    expect(screen.getByLabelText("Parent OTP digit 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /change email address/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send OTP" })).toBeEnabled();

    // The stale consent/OTP from before the change is never reused — a fresh Send OTP is
    // required, and it's sent for the new email.
    await user.type(emailField, "right-parent@example.com{Enter}");
    await waitFor(() => expect(requestPendingGuardianConsent).toHaveBeenCalledTimes(2));
    expect(requestPendingGuardianConsent.mock.calls[1]?.[0]).toMatchObject({
      guardianEmail: "right-parent@example.com",
    });
  });
});

describe("Resend attempts exhausted", () => {
  /** Reaches the OTP screen with a resend that's currently clickable (so the popup can be
   * reached through the same click a real "one last try" race would take), then rejects that
   * click with the limit-reached error the backend would actually return in that race. */
  async function reachOtpScreenAndRejectResend(user: ReturnType<typeof userEvent.setup>) {
    setupCommonMocks();
    requestPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "pending" },
      otpTiming: otpTiming({
        resendCount: 2,
        resendsRemaining: 1,
        canResend: true,
        nextResendAvailableAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    resendPendingGuardianConsent.mockRejectedValue(
      new ApiRequestError(409, {
        code: "guardian_otp_resend_limit_reached",
        message: "You have used all available OTP resend attempts. Please try again later.",
      }),
    );
    renderOnboarding();
    await completeStepOneAsMinor(user);
    await user.type(
      await screen.findByLabelText(/parent\/guardian email address/i),
      "parent@example.com{Enter}",
    );
    await screen.findByLabelText("Parent OTP digit 1");
    await user.click(screen.getByRole("button", { name: /resend otp/i }));
  }

  it("shows the exhausted-attempts popup, with the project's exact wording, when a resend is rejected past the limit", async () => {
    const user = userEvent.setup();
    await reachOtpScreenAndRejectResend(user);

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText("You have used all available OTP resend attempts. Please try again later."),
    ).toBeInTheDocument();
    // The guardian modal itself is gone — only the exhausted popup remains.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Close returns to Step 1 with the profile fields cleared", async () => {
    const user = userEvent.setup();
    await reachOtpScreenAndRejectResend(user);
    await user.click(await screen.findByRole("button", { name: "Close" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/what should we call you/i)).toHaveValue("");
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue("");
  });

  it("Escape returns to Step 1, same as Close", async () => {
    const user = userEvent.setup();
    await reachOtpScreenAndRejectResend(user);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/what should we call you/i)).toHaveValue("");
  });

  it("Enter returns to Step 1, same as Close", async () => {
    const user = userEvent.setup();
    await reachOtpScreenAndRejectResend(user);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/what should we call you/i)).toHaveValue("");
  });
});
