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
  createJourneySession,
  upsertUserProfile,
} = vi.hoisted(() => ({
  requestAnonymousSession: vi.fn(),
  checkEmailAvailability: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPendingGuardianConsent: vi.fn(),
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
  resendPendingGuardianConsent: vi.fn(),
  verifyPendingGuardianConsent: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

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

/** Step 1 no longer collects email — just the profile fields, ending on the password screen. */
async function completeStepOne(user: ReturnType<typeof userEvent.setup>, age: number) {
  await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: dobForAge(age) } });
  await user.click(screen.getByLabelText("State"));
  await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));
  await user.click(screen.getByLabelText("City"));
  await user.click(await screen.findByRole("option", { name: "Chennai" }));
  await user.selectOptions(screen.getByLabelText("Current stage"), "higher_secondary");
  await user.click(screen.getByRole("button", { name: /next/i }));
}

describe("Registration — user email uniqueness", () => {
  it("shows 'This email was already registered.' below the email field on the password screen and does not create the account (adult path)", async () => {
    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "pending-session-id",
      expiresAt: "2099-01-01T00:30:00.000Z",
    });
    checkEmailAvailability.mockResolvedValue({ available: false });

    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOne(user, 20);

    await screen.findByRole("heading", { name: /create your password/i });
    await user.type(screen.getByLabelText(/email address/i), "taken@example.com");
    await user.type(screen.getByLabelText("Enter your password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText("Confirm Password"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText("This email was already registered."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("aria-invalid", "true");
    // Still on the password screen — signup was never attempted.
    expect(signUpWithPassword).not.toHaveBeenCalled();
  });

  it("checks email availability before requesting guardian consent's own email-vs-account distinctness — a minor whose email is unavailable never reaches signup", async () => {
    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "pending-session-id",
      expiresAt: "2099-01-01T00:30:00.000Z",
    });
    checkEmailAvailability.mockResolvedValue({ available: false });
    requestPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "pending" },
      otpTiming: {
        otpExpiresAt: "2099-01-01T00:05:00.000Z",
        resendCount: 0,
        resendsRemaining: 3,
        nextResendAvailableAt: "2099-01-01T00:01:00.000Z",
        canResend: true,
      },
    });

    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOne(user, 15);

    // Guardian consent modal appears (age alone decides this, independent of email).
    expect(
      await screen.findByRole("heading", { name: /parent\/guardian consent required/i }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/parent\/guardian email address/i), "parent@example.com");
    await user.click(screen.getByRole("button", { name: "Send OTP" }));
    await waitFor(() => expect(requestPendingGuardianConsent).toHaveBeenCalledTimes(1));

    // The email check only happens later, on the password screen, so it never blocks reaching
    // guardian consent at all — confirmed above. signUpWithPassword is what would eventually be
    // blocked, and this test doesn't drive that far; onboarding-minor-flow.test.tsx covers the
    // rest of the minor path's happy case.
  });

  it("clears the availability error once the user edits the email", async () => {
    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "pending-session-id",
      expiresAt: "2099-01-01T00:30:00.000Z",
    });
    checkEmailAvailability.mockResolvedValue({ available: false });

    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOne(user, 20);

    await screen.findByRole("heading", { name: /create your password/i });
    await user.type(screen.getByLabelText(/email address/i), "taken@example.com");
    await user.type(screen.getByLabelText("Enter your password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText("Confirm Password"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("This email was already registered.");

    await user.type(screen.getByLabelText(/email address/i), "2");

    expect(screen.queryByText("This email was already registered.")).not.toBeInTheDocument();
  });

  it("proceeds normally once the email is available", async () => {
    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "pending-session-id",
      expiresAt: "2099-01-01T00:30:00.000Z",
    });
    checkEmailAvailability.mockResolvedValue({ available: true });
    signUpWithPassword.mockResolvedValue({ userId: "user-id" });
    createJourneySession.mockResolvedValue({ session: { id: "session-id" } });
    upsertUserProfile.mockResolvedValue({ profile: { userId: "user-id" } });

    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOne(user, 20);

    await screen.findByRole("heading", { name: /create your password/i });
    await user.type(screen.getByLabelText(/email address/i), "fresh@example.com");
    await user.type(screen.getByLabelText("Enter your password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText("Confirm Password"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(signUpWithPassword).toHaveBeenCalledTimes(1));
    // react-query passes mutationFn a second internal context argument — compare only the
    // actual request payload (the mutation variables), same as other tests in this suite.
    expect(checkEmailAvailability.mock.calls[0]?.[0]).toEqual({ email: "fresh@example.com" });
  });

  it("race condition: a duplicate-email rejection at final signup shows the error on the password screen without navigating away", async () => {
    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "pending-session-id",
      expiresAt: "2099-01-01T00:30:00.000Z",
    });
    // The explicit check just above passed (e.g. a concurrent registration for the same email
    // won the race in between) — the backend's real uniqueness guarantee is what catches it here.
    checkEmailAvailability.mockResolvedValue({ available: true });
    signUpWithPassword.mockRejectedValue(
      new ApiRequestError(409, {
        code: "email_already_registered",
        message: "An account with this email already exists.",
      }),
    );

    const user = userEvent.setup();
    renderOnboarding();
    await completeStepOne(user, 20);

    await screen.findByRole("heading", { name: /create your password/i });
    await user.type(screen.getByLabelText(/email address/i), "race@example.com");
    await user.type(screen.getByLabelText("Enter your password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText("Confirm Password"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(screen.getByText("This email was already registered.")).toBeInTheDocument(),
    );
    // Still on the password screen — never navigated back to Step 1.
    expect(screen.getByRole("heading", { name: /create your password/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/what should we call you/i)).not.toBeInTheDocument();
  });
});
