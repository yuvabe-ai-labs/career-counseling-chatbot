import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { queryClient } from "@/lib/query-client";
import { setStoredJourneySessionId, setStoredUserId } from "@/lib/storage";
import { HomePage, SessionProvider } from "@/features/assessment";

function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<div>Onboarding screen</div>} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/intake-questions" element={<div>Intake Questions screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects to / (Sign Up) when there is no authenticated session", () => {
    renderAt("/home");

    expect(screen.getByText("Onboarding screen")).toBeInTheDocument();
  });

  it("renders the hero content and navigates to /intake-questions when Explore is clicked", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    const user = userEvent.setup();
    renderAt("/home");

    expect(screen.getByRole("heading", { name: /find your path/i })).toBeInTheDocument();
    expect(
      screen.getByText(/discover your strengths, interests, and career path/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Explore" }));

    expect(await screen.findByText("Intake Questions screen")).toBeInTheDocument();
  });
});
