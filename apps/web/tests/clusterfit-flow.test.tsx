import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";
import { setStoredJourneySessionId, setStoredUserId } from "@/lib/storage";
import { HomePage, SessionProvider, useSession } from "@/features/assessment";
import {
  getStoredClusterfitSessionId,
  setStoredClusterfitSessionId,
} from "@/features/clusterfit/lib/clusterfit-storage";
import { ConfirmCard } from "@/features/clusterfit/components/SituationStep";
import { ClusterfitResultsPage } from "@/features/clusterfit/pages/ClusterfitResultsPage";

const { getClusterfitStudentResult } = vi.hoisted(() => ({
  getClusterfitStudentResult: vi.fn<(sessionId: string) => Promise<unknown>>(),
}));
vi.mock("@/features/clusterfit/api/clusterfit", () => ({ getClusterfitStudentResult }));

const cluster = (code: string, name: string, signal: string, recommended: boolean) => ({
  code,
  name,
  exampleRoles: `${name} roles`,
  entryRoutes: `${name} routes`,
  signal,
  recommended,
});

describe("clusterfit journey (web)", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
  });

  it("sends a signed-in student from /home straight to the journey", () => {
    setStoredUserId("44444444-4444-4444-8444-444444444444");
    setStoredJourneySessionId("55555555-5555-4555-8555-555555555555");
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={["/home"]}>
          <Routes>
            <Route path="/home" element={<HomePage />} />
            <Route path="/clusterfit" element={<div>Clusterfit journey</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(screen.getByText("Clusterfit journey")).toBeInTheDocument();
  });

  it("keeps the session to the student who started it", () => {
    setStoredUserId("44444444-4444-4444-8444-444444444444");
    setStoredClusterfitSessionId("55555555-5555-4555-8555-555555555555");
    expect(getStoredClusterfitSessionId()).toBe("55555555-5555-4555-8555-555555555555");

    setStoredUserId("66666666-6666-4666-8666-666666666666");
    expect(getStoredClusterfitSessionId()).toBeNull();
  });

  it("shows the cluster recommendation with roles and routes, and no numbers", async () => {
    setStoredUserId("11111111-1111-4111-8111-111111111111");
    setStoredJourneySessionId("22222222-2222-4222-8222-222222222222");
    setStoredClusterfitSessionId("33333333-3333-4333-8333-333333333333");
    getClusterfitStudentResult.mockResolvedValue({
      result: {
        fallbackUsed: false,
        clusters: [
          cluster("HLT", "Health, Wellness and Sports", "strong", true),
          cluster("AGR", "Agriculture", "strong", true),
          cluster("SCI", "Science and Research", "explore", true),
          cluster("ENG", "Engineering", "low", false),
        ],
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <MemoryRouter initialEntries={["/clusterfit/results"]}>
            <Routes>
              <Route path="/clusterfit/results" element={<ClusterfitResultsPage />} />
            </Routes>
          </MemoryRouter>
        </SessionProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Health, Wellness and Sports")).toBeInTheDocument();
    expect(screen.getByText("Your career clusters")).toBeInTheDocument();
    expect(screen.getAllByText("Strong match")).toHaveLength(2);
    expect(screen.getByText("Less of a match for now")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Science and Research routes")).toBeInTheDocument();
    expect(getClusterfitStudentResult).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
    expect(document.body.textContent).not.toMatch(/\d+(\.\d+)?%|index/i);
  });

  it("asks for the class only when the chat missed it, and needs all three values", () => {
    const renderCard = (initialGrade: 11 | null, initialValues: string[]) =>
      render(
        <ConfirmCard
          sessionId="33333333-3333-4333-8333-333333333333"
          capture={null}
          initialGrade={initialGrade}
          initialValues={initialValues as never}
          onConfirmed={() => undefined}
        />,
      );

    const known = renderCard(11, ["learn_grow"]);
    // The chat already gave the class: the card doesn't ask or show it again.
    expect(screen.queryByText("Which class are you in?")).toBeNull();
    expect(screen.queryByText("Class 11")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose 2 more to continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Being my own boss/ }));
    fireEvent.click(screen.getByRole("button", { name: /Freedom to be creative/ }));
    expect(screen.getByRole("button", { name: "Looks right, continue" })).toBeEnabled();
    known.unmount();

    renderCard(null, ["learn_grow", "own_boss", "travel"]);
    expect(screen.getByText("Which class are you in?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose your class to continue" })).toBeDisabled();
  });

  it("never carries one student's journey over to the next student in the same browser", () => {
    // A finished student's session is cached; then a new student signs up in this browser.
    queryClient.setQueryData(["clusterfit", "student-a", "session"], {
      session: { status: "scored" },
    });
    let setUserId: (userId: string) => void = () => undefined;
    function Capture() {
      setUserId = useSession().setUserId;
      return null;
    }
    render(
      <SessionProvider>
        <Capture />
      </SessionProvider>,
    );
    act(() => setUserId("student-b"));
    expect(queryClient.getQueryData(["clusterfit", "student-a", "session"])).toBeUndefined();
  });
});
