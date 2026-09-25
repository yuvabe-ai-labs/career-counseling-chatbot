import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { queryClient } from "@/lib/query-client";
import {
  setStoredCounselorUserId,
  setStoredJourneySessionId,
  setStoredUserId,
} from "@/lib/storage";
import { OnboardingPage, SessionProvider, SignInPage } from "@/features/assessment";
import { CounselorSessionProvider } from "@/features/counselor";
import { CounselorSignInPage } from "@/features/counselor/pages/CounselorSignInPage";

// Regression coverage for a real bug: AppHeader's own logic (isLoggedIn, the avatar, "Sign out")
// was always correct — the actual bug was that these pre-auth pages never checked whether a
// visitor already had a valid session before rendering a fresh signup/sign-in form under them, so
// a stale tab / back button / typed URL landed on "/sign-up" or "/sign-in" while still logged in,
// and the header above that form confusingly showed the logged-in account menu and initials. The
// fix is these redirects, not a change to AppHeader itself.

function renderStudentPage(path: "/sign-up" | "/sign-in") {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/sign-up" element={<OnboardingPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/home" element={<div>Home screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

// AppHeader always calls the student useSession() too (it's the default account-context source
// for every non-counselor screen, even here where accountContext is never passed) — in the real
// app both providers wrap everything unconditionally (see apps/web/src/app/providers.tsx's
// AppProviders), so this mirrors that composition.
function renderCounselorSignIn() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <CounselorSessionProvider>
          <MemoryRouter initialEntries={["/counselor/sign-in"]}>
            <Routes>
              <Route path="/counselor/sign-in" element={<CounselorSignInPage />} />
              <Route path="/counselor/home" element={<div>Counsellor home screen</div>} />
            </Routes>
          </MemoryRouter>
        </CounselorSessionProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("Already-authenticated visitors are redirected away from pre-auth screens", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
  });

  it("redirects a signed-in student away from /sign-up to /home", () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");

    renderStudentPage("/sign-up");

    expect(screen.getByText("Home screen")).toBeInTheDocument();
    expect(screen.queryByLabelText(/what should we call you/i)).not.toBeInTheDocument();
  });

  it("redirects a signed-in student away from /sign-in to /home", () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");

    renderStudentPage("/sign-in");

    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });

  it("still shows the sign-up form for a genuinely logged-out visitor", () => {
    renderStudentPage("/sign-up");

    expect(screen.getByLabelText(/what should we call you/i)).toBeInTheDocument();
    expect(screen.queryByText("Home screen")).not.toBeInTheDocument();
  });

  it("still shows the sign-in form for a genuinely logged-out visitor", () => {
    renderStudentPage("/sign-in");

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.queryByText("Home screen")).not.toBeInTheDocument();
  });

  it("redirects a signed-in counselor away from /counselor/sign-in to their dashboard", () => {
    setStoredCounselorUserId("counselor-id");

    renderCounselorSignIn();

    expect(screen.getByText("Counsellor home screen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Work Email ID *")).not.toBeInTheDocument();
  });

  it("still shows the counsellor sign-in form for a genuinely logged-out visitor", () => {
    renderCounselorSignIn();

    expect(screen.getByLabelText("Work Email ID *")).toBeInTheDocument();
  });
});
