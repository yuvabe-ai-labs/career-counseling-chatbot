import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";
import {
  SESSION_TIMEOUT_MS,
  getStoredCounselorUserId,
  getStoredUserId,
  setStoredCounselorUserId,
  setStoredJourneySessionId,
  setStoredUserId,
} from "@/lib/storage";
import { AdminSessionProvider } from "@/features/admin";
import { SessionProvider } from "@/features/assessment";
import { CounselorSessionProvider } from "@/features/counselor";
import { LandingPage } from "@/features/landing";

const { getUserProfile } = vi.hoisted(() => ({ getUserProfile: vi.fn() }));
vi.mock("@/features/assessment/api/profile", () => ({ getUserProfile, upsertUserProfile: vi.fn() }));

function renderLanding() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <CounselorSessionProvider>
          <AdminSessionProvider>
            <MemoryRouter initialEntries={["/"]}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
              </Routes>
            </MemoryRouter>
          </AdminSessionProvider>
        </CounselorSessionProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("session timeout (1 hour, aspirant and counsellor)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  it("is 1 hour", () => {
    expect(SESSION_TIMEOUT_MS).toBe(60 * 60 * 1000);
  });

  it("keeps an aspirant session just under an hour, drops it after", () => {
    setStoredUserId("user-id");
    vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1000);
    expect(getStoredUserId()).toBe("user-id");
    vi.advanceTimersByTime(2000);
    expect(getStoredUserId()).toBeNull();
    expect(localStorage.getItem("yuvapath.userId")).toBeNull();
  });

  it("keeps a counsellor session just under an hour, drops it (and its name) after", () => {
    setStoredCounselorUserId("counselor-id");
    localStorage.setItem("yuvapath.counselorDisplayName", "Test Counsellor");
    vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1000);
    expect(getStoredCounselorUserId()).toBe("counselor-id");
    vi.advanceTimersByTime(2000);
    expect(getStoredCounselorUserId()).toBeNull();
    expect(localStorage.getItem("yuvapath.counselorDisplayName")).toBeNull();
  });

  it("starts the clock for a session stored before the timeout existed instead of signing it out", () => {
    localStorage.setItem("yuvapath.userId", "old-user");
    expect(getStoredUserId()).toBe("old-user");
    vi.advanceTimersByTime(SESSION_TIMEOUT_MS + 1000);
    expect(getStoredUserId()).toBeNull();
  });
});

describe("LandingPage", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    getUserProfile.mockResolvedValue({ profile: { firstName: "Asha" } });
  });

  it("has no navbar login links, only the hero cards", () => {
    renderLanding();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Aspirant Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Counsellor Login" })).not.toBeInTheDocument();
  });

  it("sends signed-out visitors to sign-up / counsellor sign-in", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: /aspirant/i })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: /^counsellor/i })).toHaveAttribute(
      "href",
      "/counselor/sign-in",
    );
  });

  it("offers a Regional Admin entry that leads to admin sign-in, or the console when signed in", () => {
    const { unmount } = renderLanding();
    expect(screen.getByRole("link", { name: /regional admin/i })).toHaveAttribute("href", "/admin/sign-in");
    unmount();

    localStorage.setItem("yuvapath.adminUserId", "admin-id");
    renderLanding();
    expect(screen.getByRole("link", { name: /regional admin/i })).toHaveAttribute("href", "/admin/home");
  });

  it("resumes both sessions while they are valid", () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    setStoredCounselorUserId("counselor-id");
    renderLanding();
    expect(screen.getByRole("link", { name: /aspirant/i })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: /^counsellor/i })).toHaveAttribute(
      "href",
      "/counselor/home",
    );
  });

  it("the yuvaPath wordmark always links to the landing page", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "yuvaPath home" })).toHaveAttribute("href", "/");
  });
});

describe("AppHeader account menu — hover, pin, red sign out", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    getUserProfile.mockResolvedValue({ profile: { firstName: "Asha Kumar" } });
  });

  it("opens on hover, stays open once clicked, and closes on Escape; Sign out is red", async () => {
    const user = userEvent.setup();
    renderLanding();
    const avatar = screen.getByRole("button", { name: "Account menu" });

    await user.hover(avatar);
    const signOut = await screen.findByRole("menuitem", { name: "Sign out" });
    expect(signOut.className).toContain("text-destructive");
    expect(screen.getByRole("menuitem", { name: "Help" }).className).not.toContain("text-destructive");

    await user.click(avatar);
    await user.unhover(avatar);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("closes shortly after the pointer leaves when it was only hovered, not clicked", async () => {
    const user = userEvent.setup();
    renderLanding();
    const avatar = screen.getByRole("button", { name: "Account menu" });

    await user.hover(avatar);
    expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
    await user.unhover(avatar);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole("menuitem", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
