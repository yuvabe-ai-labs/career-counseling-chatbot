import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import { SessionProvider, SignInPage } from "@/features/assessment";

const { signInWithPassword, createJourneySession } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  createJourneySession: vi.fn(),
}));

vi.mock("@/features/assessment/api/identity", () => ({
  requestAnonymousSession: vi.fn(),
  checkEmailAvailability: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithPassword,
}));

vi.mock("@/features/assessment/api/journey-session", () => ({
  createJourneySession,
  getJourneySession: vi.fn(),
  resumeJourneySession: vi.fn(),
}));

function renderSignIn() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/sign-in"]}>
          <SignInPage />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("SignInPage", () => {
  // Mock call histories otherwise leak across tests in this file (no `test.globals`/auto-reset
  // configured — see onboarding-email-uniqueness.test.tsx for the same pattern).
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs in with email + password and lands on /home via a fresh journey session", async () => {
    signInWithPassword.mockResolvedValue({ userId: "user-id" });
    createJourneySession.mockResolvedValue({ session: { id: "session-id" } });

    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(/email address/i), "asha@example.com");
    await user.type(screen.getByLabelText(/^password/i), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    // react-query passes mutationFn a second internal context argument, so compare only the
    // actual request payload — the mutation variables — not the full call (same pattern as
    // onboarding-adult-signup-retry.test.tsx).
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    expect(signInWithPassword.mock.calls[0]?.[0]).toEqual({
      email: "asha@example.com",
      password: "Str0ng!Pass",
    });

    // No pendingSessionId anywhere in this flow — a returning user has no anonymous session to
    // merge, so createJourneySession is called with no anonymousSessionId at all.
    await waitFor(() => expect(createJourneySession).toHaveBeenCalled());
    expect(createJourneySession.mock.calls[0]?.[0]).toEqual({});
  });

  it("shows a friendly message for wrong credentials instead of the raw backend error", async () => {
    signInWithPassword.mockRejectedValue(
      new ApiRequestError(401, { code: "invalid_credentials", message: "Email or password is incorrect." }),
    );

    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(/email address/i), "asha@example.com");
    await user.type(screen.getByLabelText(/^password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(
      await screen.findByText(/incorrect email or password/i),
    ).toBeInTheDocument();
    expect(createJourneySession).not.toHaveBeenCalled();
  });

  it("requires both fields before submitting", async () => {
    const user = userEvent.setup();
    renderSignIn();

    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText(/please enter your email address/i)).toBeInTheDocument();
    expect(screen.getByText(/please enter your password/i)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
