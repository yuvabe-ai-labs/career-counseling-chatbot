import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import { setStoredPendingSessionId } from "@/lib/storage";
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
  createJourneySession,
  upsertUserProfile,
} = vi.hoisted(() => ({
  requestAnonymousSession: vi.fn(),
  checkEmailAvailability: vi.fn(),
  signUpWithPassword: vi.fn(),
  createJourneySession: vi.fn(),
  upsertUserProfile: vi.fn(),
}));

vi.mock("@/features/assessment/api/identity", () => ({
  requestAnonymousSession,
  checkEmailAvailability,
  signUpWithPassword,
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

async function completeStepOneAsAdult(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/what should we call you/i), "Asha");
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: dobForAge(20) } });
  await user.click(screen.getByLabelText("State"));
  await user.click(await screen.findByRole("option", { name: "Tamil Nadu" }));
  await user.click(screen.getByLabelText("City"));
  await user.click(await screen.findByRole("option", { name: "Chennai" }));
  await user.selectOptions(screen.getByLabelText("Current stage"), "higher_secondary");
  await user.click(screen.getByRole("button", { name: /next/i }));
}

describe("OnboardingPage — adult signup, stale pending session recovery", () => {
  it("recovers from a stale/expired pending session instead of showing the raw backend error", async () => {
    // Simulate the actual reported bug (previously against /auth/otp/request, now against
    // /auth/signup): a pendingSessionId left over in localStorage (e.g. from before a backend
    // restart, or from >30 minutes ago) that the server no longer recognizes.
    setStoredPendingSessionId("stale-session-id");

    requestAnonymousSession.mockResolvedValue({
      pendingSessionId: "fresh-session-id",
      expiresAt: "2026-01-01T00:30:00.000Z",
    });
    checkEmailAvailability.mockResolvedValue({ available: true });
    signUpWithPassword
      .mockImplementationOnce(() =>
        Promise.reject(
          new ApiRequestError(404, {
            code: "pending_signup_not_found",
            message: "Anonymous session was not found or has expired.",
          }),
        ),
      )
      .mockImplementationOnce(() => Promise.resolve({ userId: "user-id" }));
    createJourneySession.mockResolvedValue({ session: { id: "session-id" } });
    upsertUserProfile.mockResolvedValue({ profile: { userId: "user-id" } });

    const user = userEvent.setup();
    renderOnboarding();

    await completeStepOneAsAdult(user);

    // No guardian-consent modal, no email-OTP screen — straight to the password screen.
    expect(
      await screen.findByRole("heading", { name: /create your password/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email address/i), "asha@example.com");
    await user.type(screen.getByLabelText("Enter your password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText("Confirm Password"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Start" }));

    // Recovered silently: the app proceeds to create the journey session / profile instead of
    // getting stuck on the stale id.
    await waitFor(() => expect(signUpWithPassword).toHaveBeenCalledTimes(2));

    // react-query passes mutationFn a second internal context argument, so compare only the
    // actual request payload — the mutation variables — not the full call.
    expect(signUpWithPassword.mock.calls[0]?.[0]).toMatchObject({
      pendingSessionId: "stale-session-id",
      email: "asha@example.com",
    });
    expect(signUpWithPassword.mock.calls[1]?.[0]).toMatchObject({
      pendingSessionId: "fresh-session-id",
      email: "asha@example.com",
    });

    await waitFor(() => expect(createJourneySession).toHaveBeenCalled());
    expect(createJourneySession.mock.calls[0]?.[0]).toEqual({
      anonymousSessionId: "fresh-session-id",
    });

    // ...and the raw backend wording never reached the screen.
    expect(screen.queryByText(/anonymous session/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/was not found or has expired/i)).not.toBeInTheDocument();

    // No OTP anywhere in this flow anymore.
    expect(screen.queryByText(/otp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dev mode/i)).not.toBeInTheDocument();
  });
});
