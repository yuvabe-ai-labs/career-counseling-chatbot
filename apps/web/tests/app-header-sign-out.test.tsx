import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { queryClient } from "@/lib/query-client";
import { getStoredUserId, setStoredJourneySessionId, setStoredUserId } from "@/lib/storage";
import { HomePage, SessionProvider, SignInPage } from "@/features/assessment";

// AppHeader (used by HomePage and every other post-auth screen) is where the account menu /
// sign-out lives — HomePage is just a convenient, side-effect-free host to render it under.
// /sign-in renders the *real* SignInPage, not a stub: the actual session.reset() call now
// happens in SignInPage's own mount effect (see AppHeader's handleSignOut comment for why), so
// a stub route here would silently not exercise that at all.
function renderHome() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/home"]}>
          <Routes>
            {/* "/" is a real route in the app's own router.tsx (OnboardingPage) — included here
              too since HomePage's own guard targets it if ever reached with no session. */}
            <Route path="/" element={<div>Onboarding screen</div>} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/sign-in" element={<SignInPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

// AuthLayout renders the same AppHeader pre-auth, so SignInPage is the real host for the
// signed-out state — rendered with localStorage cleared, exactly as a visitor arrives at it.
function renderSignIn() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/sign-in"]}>
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("AppHeader — account menu / sign out", () => {
  beforeEach(() => {
    localStorage.clear();
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
  });

  it("shows Help above Sign out for a logged-in user", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Help",
      "Sign out",
    ]);
  });

  it("shows Help only — never Sign out — with no session (sign-in / onboarding)", async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderSignIn();

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Help"]);
    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("closes the menu when Help is clicked, leaving the session untouched", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: /help/i }));

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(getStoredUserId()).toBe("user-id");
    expect(screen.getByRole("heading", { name: /find your path/i })).toBeInTheDocument();
  });

  it("opens the account menu on click and shows Sign out", async () => {
    const user = userEvent.setup();
    renderHome();

    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("clears the stored session and redirects to /sign-in when Sign out is clicked", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));

    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(getStoredUserId()).toBeNull();
  });

  it("closes the menu on outside click without signing out", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /find your path/i })).toBeInTheDocument();
  });

  it("closes the menu on Escape without signing out", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();
    expect(getStoredUserId()).toBe("user-id");
  });
});
