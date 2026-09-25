import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";
import {
  getStoredCounselorDisplayName,
  getStoredCounselorUserId,
  setStoredCounselorDisplayName,
  setStoredCounselorUserId,
} from "@/lib/storage";
import { SessionProvider } from "@/features/assessment";
import { CounselorHomePage, CounselorSessionProvider } from "@/features/counselor";

const { getCounselorDashboardStats } = vi.hoisted(() => ({
  getCounselorDashboardStats: vi.fn(),
}));
vi.mock("@/features/counselor/api/counselor-dashboard", () => ({
  getCounselorDashboardStats,
}));

// AppHeader always calls the student useSession() too (it's the default account-context source
// for every non-counselor screen) — in the real app both providers wrap everything unconditionally
// (see apps/web/src/app/providers.tsx's AppProviders), so this mirrors that composition rather
// than only mounting the one provider this specific page's own guard happens to read from.
function renderCounselorHome() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <CounselorSessionProvider>
          <MemoryRouter initialEntries={["/counselor/home"]}>
            <Routes>
              <Route path="/counselor/home" element={<CounselorHomePage />} />
              <Route path="/counselor/sign-in" element={<div>Counsellor sign-in screen</div>} />
            </Routes>
          </MemoryRouter>
        </CounselorSessionProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("AppHeader on CounselorHomePage — avatar and sign out", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    vi.clearAllMocks();
    getCounselorDashboardStats.mockResolvedValue({
      totalStudents: 10,
      assessmentCompleted: 4,
      assessmentInProgress: 2,
    });
  });

  it("shows the signed-in counselor's initials, derived from their display name — not a generic icon", async () => {
    setStoredCounselorUserId("counselor-1");
    setStoredCounselorDisplayName("Priya Sharma");
    renderCounselorHome();

    expect(await screen.findByText("PS")).toBeInTheDocument();
  });

  it("shows Sign out for a logged-in counselor (previously never rendered — AppHeader used to check the unrelated student session)", async () => {
    setStoredCounselorUserId("counselor-1");
    setStoredCounselorDisplayName("Priya Sharma");
    const user = userEvent.setup();
    renderCounselorHome();

    await screen.findByText("PS");
    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Help",
      "Sign out",
    ]);
  });

  it("clears the counselor session and returns to /counselor/sign-in when Sign out is clicked", async () => {
    setStoredCounselorUserId("counselor-1");
    setStoredCounselorDisplayName("Priya Sharma");
    const user = userEvent.setup();
    renderCounselorHome();

    await screen.findByText("PS");
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));

    expect(await screen.findByText("Counsellor sign-in screen")).toBeInTheDocument();
    expect(getStoredCounselorUserId()).toBeNull();
    expect(getStoredCounselorDisplayName()).toBeNull();
  });
});
