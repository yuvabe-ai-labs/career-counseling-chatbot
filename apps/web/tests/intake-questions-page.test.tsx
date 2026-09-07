import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";
import { setStoredJourneySessionId, setStoredUserId } from "@/lib/storage";
import { IntakeQuestionsPage, SessionProvider } from "@/features/assessment";

const { getIntakeQuestions, upsertIntakeAnswer } = vi.hoisted(() => ({
  getIntakeQuestions: vi.fn(),
  upsertIntakeAnswer: vi.fn(),
}));

vi.mock("@/features/assessment/api/intake", () => ({
  getIntakeQuestions,
  upsertIntakeAnswer,
}));

// Three questions — an arbitrary count distinct from any real segment's (5/7/9), to prove the
// screen renders however many questions the backend actually returns rather than a hardcoded
// number, and exercises both response types the seeded data + contract define.
const QUESTION_SET = {
  questionSet: {
    id: "11111111-1111-4111-8111-111111111111",
    segment: "explorer" as const,
    version: "1.0",
    language: "en",
  },
  questions: [
    {
      id: "q1",
      questionSetId: "11111111-1111-4111-8111-111111111111",
      questionSetVersion: "1.0",
      segment: "explorer" as const,
      language: "en",
      questionKey: "school_board",
      displayOrder: 1,
      promptText: "Which school board are you studying in?",
      responseType: "single_choice" as const,
      options: ["cbse", "state_board"],
      placeholderText: null,
      isSensitive: false,
      isRequired: true,
    },
    {
      id: "q2",
      questionSetId: "11111111-1111-4111-8111-111111111111",
      questionSetVersion: "1.0",
      segment: "explorer" as const,
      language: "en",
      questionKey: "class_level",
      displayOrder: 2,
      promptText: "Which class are you currently in?",
      responseType: "single_choice" as const,
      options: ["class_9", "class_10"],
      placeholderText: null,
      isSensitive: false,
      isRequired: true,
    },
    {
      id: "q3",
      questionSetId: "11111111-1111-4111-8111-111111111111",
      questionSetVersion: "1.0",
      segment: "explorer" as const,
      language: "en",
      questionKey: "favorite_subject",
      displayOrder: 3,
      promptText: "Which subject do you enjoy most?",
      responseType: "short_text" as const,
      options: null,
      placeholderText: "Example: Mathematics",
      isSensitive: false,
      isRequired: true,
    },
  ],
  answers: [] as {
    id: string;
    userId: string;
    sessionId: string;
    questionId: string;
    questionSetVersion: string;
    answer: { value: string | string[] };
    answeredAt: string;
  }[],
};

const answerFixture = (questionId: string, value: string) => ({
  id: `answer-${questionId}`,
  userId: "user-id",
  sessionId: "an-earlier-session-id",
  questionId,
  questionSetVersion: "1.0",
  answer: { value },
  answeredAt: "2026-07-01T10:00:00.000Z",
});

function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<div>Onboarding screen</div>} />
            <Route path="/intake-questions" element={<IntakeQuestionsPage />} />
            <Route path="/riasec-assessment" element={<div>RIASEC assessment screen</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("IntakeQuestionsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Same reasoning as riasec-assessment-page.test.tsx / riasec-results-page.test.tsx: the
    // QueryClient is a shared singleton across this file's tests, and several tests here now
    // reuse the same "session-id" (hence the same ["intake-questions", "session-id"] query key)
    // with deliberately different mocked answers — without clearing, a later test can render an
    // earlier test's cached result before its own fetch resolves.
    queryClient.clear();
  });

  it("redirects to / when there is no authenticated session", () => {
    renderAt("/intake-questions");

    expect(screen.getByText("Onboarding screen")).toBeInTheDocument();
  });

  it("renders exactly the questions the backend returns, numbered, with the real count (not hardcoded)", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    getIntakeQuestions.mockResolvedValue(QUESTION_SET);

    renderAt("/intake-questions");

    expect(await screen.findByText(/1\.Which school board are you studying in\?/)).toBeInTheDocument();
    expect(screen.getByText(/2\.Which class are you currently in\?/)).toBeInTheDocument();
    expect(screen.getByText(/3\.Which subject do you enjoy most\?/)).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 3")).toBeInTheDocument();
    expect(getIntakeQuestions).toHaveBeenCalledWith("session-id");
  });

  it("blocks submission and shows field errors when required questions are unanswered", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    getIntakeQuestions.mockResolvedValue(QUESTION_SET);
    const user = userEvent.setup();
    renderAt("/intake-questions");

    await screen.findByText(/1\.Which school board are you studying in\?/);
    await user.click(screen.getByRole("button", { name: "Start Quiz" }));

    expect(await screen.findAllByText("This field is required.")).toHaveLength(3);
    expect(upsertIntakeAnswer).not.toHaveBeenCalled();
  });

  it("saves every answer via the existing intake-answer API, then navigates to the RIASEC assessment", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    getIntakeQuestions.mockResolvedValue(QUESTION_SET);
    upsertIntakeAnswer.mockResolvedValue({
      answer: { id: "a1", userId: "user-id", sessionId: "session-id", questionId: "q1" },
    });
    const user = userEvent.setup();
    renderAt("/intake-questions");

    await screen.findByText(/1\.Which school board are you studying in\?/);

    // single_choice questions are now a type-to-search Combobox (same pattern as ProfileFieldsForm's
    // State/City fields) rather than a native <select> — open it, then pick the matching option
    // from its rendered listbox instead of user.selectOptions.
    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]!);
    await user.click(await screen.findByRole("option", { name: "CBSE" }));
    await user.click(comboboxes[1]!);
    await user.click(await screen.findByRole("option", { name: "Class 10" }));
    await user.type(screen.getByPlaceholderText("Example: Mathematics"), "Mathematics");

    await user.click(screen.getByRole("button", { name: "Start Quiz" }));

    // Each answer is also saved-as-you-go (debounced, ~500ms after the edit — see
    // IntakeQuestionsPage's scheduleAnswerSave) independently of this final Start Quiz flush, so
    // a given question may land one or two calls depending on real-clock timing; what matters is
    // that the final, authoritative value for each question reached the API before navigating.
    await waitFor(() => expect(upsertIntakeAnswer.mock.calls.length).toBeGreaterThanOrEqual(3));
    const lastCallFor = (questionId: string) =>
      [...upsertIntakeAnswer.mock.calls].reverse().find((call) => call[1] === questionId);
    expect(lastCallFor("q1")).toEqual(["session-id", "q1", { value: "cbse" }]);
    expect(lastCallFor("q2")).toEqual(["session-id", "q2", { value: "class_10" }]);
    expect(lastCallFor("q3")).toEqual(["session-id", "q3", { value: "Mathematics" }]);

    expect(await screen.findByText("RIASEC assessment screen")).toBeInTheDocument();
  });

  it("short_text questions show their server-provided example placeholder, falling back to a generic one when none is configured", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    getIntakeQuestions.mockResolvedValue({
      ...QUESTION_SET,
      questions: [
        ...QUESTION_SET.questions,
        {
          id: "q4",
          questionSetId: "11111111-1111-4111-8111-111111111111",
          questionSetVersion: "1.0",
          segment: "explorer" as const,
          language: "en",
          questionKey: "flow_activity",
          displayOrder: 4,
          promptText: "What activity makes time pass quickly for you?",
          responseType: "short_text" as const,
          options: null,
          placeholderText: null, // no example configured for this one
          isSensitive: false,
          isRequired: true,
        },
      ],
    });

    renderAt("/intake-questions");

    // q3 (favorite_subject) has a real server-provided example; q4 has none configured and falls
    // back to the component's own generic placeholder — never a hardcoded example on the
    // frontend's side, matching how question content always comes from the backend.
    expect(await screen.findByPlaceholderText("Example: Mathematics")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type your answer")).toBeInTheDocument();
  });

  it("resume: prefills a previously-saved answer from the backend response", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    getIntakeQuestions.mockResolvedValue({
      ...QUESTION_SET,
      answers: [answerFixture("q1", "cbse")],
    });

    renderAt("/intake-questions");

    // The Combobox for q1 (see IntakeQuestionField) displays the selected option's formatted
    // label as its input value once seeded — "cbse" -> "CBSE" (formatOptionLabel's acronym list).
    const comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes[0]).toHaveValue("CBSE");
    // q2 has no saved answer — stays blank.
    expect(comboboxes[1]).toHaveValue("");
  });

  it("resume: redirects straight to the assessment when every required question is already answered", async () => {
    setStoredUserId("user-id");
    setStoredJourneySessionId("session-id");
    getIntakeQuestions.mockResolvedValue({
      ...QUESTION_SET,
      answers: [
        answerFixture("q1", "cbse"),
        answerFixture("q2", "class_10"),
        answerFixture("q3", "Mathematics"),
      ],
    });

    renderAt("/intake-questions");

    expect(await screen.findByText("RIASEC assessment screen")).toBeInTheDocument();
    expect(screen.queryByText(/1\.Which school board are you studying in\?/)).not.toBeInTheDocument();
    expect(upsertIntakeAnswer).not.toHaveBeenCalled();
  });
});
