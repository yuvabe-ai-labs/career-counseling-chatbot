import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import { setStoredPendingSessionId } from "@/lib/storage";
import { OnboardingPage, SessionProvider } from "@/features/assessment";

/** A date of birth whose age (as of today) is exactly `age` — matches calculateAge's own math. */
function dobForAge(age: number): string {
  const now = new Date();
  const dob = new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate()));
  return dob.toISOString().slice(0, 10);
}

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
  verifyPendingGuardianConsent,
  createJourneySession,
  upsertUserProfile,
} = vi.hoisted(() => ({
  requestAnonymousSession: vi.fn(),
  checkEmailAvailability: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPendingGuardianConsent: vi.fn(),
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

// Mock call histories otherwise leak across tests in this file (no `test.globals`/auto-reset
// configured — see onboarding-email-uniqueness.test.tsx for the same pattern).
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

describe("OnboardingPage — minor path (guardian consent, then password signup)", () => {
  it("skips email-OTP entirely: guardian consent pops up, then a password screen replaces it", async () => {
    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "pending-session-id",
      expiresAt: "2026-01-01T00:30:00.000Z",
    });
    checkEmailAvailability.mockResolvedValue({ available: true });
    requestPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "pending" },
      // Required by the real contract (RequestPendingGuardianConsentResponseSchema) — the OTP
      // section of the (now-combined) guardian consent modal stays disabled until this exists.
      otpTiming: {
        otpExpiresAt: "2026-01-01T00:05:00.000Z",
        resendCount: 0,
        resendsRemaining: 3,
        nextResendAvailableAt: "2026-01-01T00:01:00.000Z",
        canResend: true,
      },
    });
    verifyPendingGuardianConsent.mockResolvedValue({
      consent: { id: "consent-id", status: "granted" },
    });
    signUpWithPassword.mockResolvedValue({ userId: "user-id" });
    createJourneySession.mockResolvedValue({ session: { id: "session-id" } });
    upsertUserProfile.mockResolvedValue({ profile: { userId: "user-id" } });

    const user = userEvent.setup();
    renderOnboarding();

    await completeStepOneAsMinor(user);

    // Guardian consent modal — matches Figma node 275:1784.
    expect(
      await screen.findByRole("heading", { name: /parent\/guardian consent required/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/parent\/guardian email address/i), "parent@example.com");
    await user.click(screen.getByRole("button", { name: "Send OTP" }));

    expect(requestPendingGuardianConsent).toHaveBeenCalledWith({
      pendingSessionId: "pending-session-id",
      guardianEmail: "parent@example.com",
      dateOfBirth: dobForAge(15),
      textVersion: "v1",
    });

    for (let index = 0; index < 6; index += 1) {
      await user.type(screen.getByLabelText(`Parent OTP digit ${index + 1}`), "1");
    }
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(verifyPendingGuardianConsent).toHaveBeenCalledWith({
      pendingSessionId: "pending-session-id",
      consentId: "consent-id",
      verificationCode: "111111",
    });

    // Guardian consent is granted — the password screen (Figma node 264:1097) replaces the
    // email-OTP screen for this minor, and the modal is gone.
    const heading = await screen.findByRole("heading", { name: /create your password/i });
    expect(heading).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /parent\/guardian consent required/i }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/email address/i), "asha@example.com");
    await user.type(screen.getByLabelText("Enter your password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText("Confirm Password"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Start" }));

    // react-query passes mutationFn a second internal context argument — compare only the
    // actual request payload (the mutation variables), same as onboarding-adult-signup-retry.test.tsx.
    await waitFor(() => expect(signUpWithPassword).toHaveBeenCalled());
    expect(signUpWithPassword.mock.calls[0]?.[0]).toEqual({
      pendingSessionId: "pending-session-id",
      dateOfBirth: dobForAge(15),
      email: "asha@example.com",
      password: "Str0ng!Pass",
    });
    expect(createJourneySession.mock.calls[0]?.[0]).toEqual({
      anonymousSessionId: "pending-session-id",
    });
    expect(upsertUserProfile.mock.calls[0]?.[0]).toBe("session-id");
    expect(upsertUserProfile.mock.calls[0]?.[1]).toMatchObject({
      firstName: "Asha",
      dateOfBirth: dobForAge(15),
    });
  });

  it("recovers from a stale/expired pending session when sending the guardian OTP, instead of showing the raw backend error", async () => {
    // Same bug class as onboarding-adult-signup-retry.test.tsx, but against the guardian-consent
    // send-OTP call: a pendingSessionId left over in localStorage that the server no longer
    // recognizes (server restart, or the 30-minute anonymous-session expiry).
    setStoredPendingSessionId("stale-session-id");

    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "fresh-session-id",
      expiresAt: "2026-01-01T00:30:00.000Z",
    });
    requestPendingGuardianConsent
      .mockImplementationOnce(() =>
        Promise.reject(
          new ApiRequestError(404, {
            code: "pending_signup_not_found",
            message: "Anonymous session was not found or has expired.",
          }),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          consent: { id: "consent-id", status: "pending" },
          otpTiming: {
            nextResendAvailableAt: "2026-01-01T00:01:00.000Z",
            expiresAt: "2026-01-01T00:10:00.000Z",
            resendsRemaining: 3,
          },
        }),
      );

    const user = userEvent.setup();
    renderOnboarding();

    await completeStepOneAsMinor(user);

    expect(
      await screen.findByRole("heading", { name: /parent\/guardian consent required/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/parent\/guardian email address/i), "parent@example.com");
    await user.click(screen.getByRole("button", { name: "Send OTP" }));

    // Recovered silently: the modal moves on to the OTP-entry step instead of getting stuck
    // showing "We couldn't start a new verification session."
    expect(await screen.findByText(/enter the 6-digit otp/i)).toBeInTheDocument();

    await waitFor(() => expect(requestPendingGuardianConsent).toHaveBeenCalledTimes(2));
    expect(requestPendingGuardianConsent.mock.calls[0]?.[0]).toMatchObject({
      pendingSessionId: "stale-session-id",
      guardianEmail: "parent@example.com",
    });
    expect(requestPendingGuardianConsent.mock.calls[1]?.[0]).toMatchObject({
      pendingSessionId: "fresh-session-id",
      guardianEmail: "parent@example.com",
    });

    expect(
      screen.queryByText(/we couldn.t start a new verification session/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/was not found or has expired/i)).not.toBeInTheDocument();
  });
});
