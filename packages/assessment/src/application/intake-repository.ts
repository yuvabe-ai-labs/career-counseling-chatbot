import type { IntakeAnswer, IntakeQuestion, Segment } from "@yuvanext/contracts";

export type IntakeQuestionSet = {
  id: string;
  segment: Segment;
  version: string;
  language: string;
};

export type IntakeQuestionSetWithQuestions = {
  questionSet: IntakeQuestionSet;
  questions: IntakeQuestion[];
};

export type NewIntakeAnswer = {
  id: string;
  userId: string;
  sessionId: string;
  questionId: string;
  questionSetVersion: string;
  answer: { value: string | string[] };
  answeredAt: string;
};

export type IntakeRepository = {
  findApprovedQuestionSet(input: {
    segment: Segment;
    language: string;
    now: string;
  }): Promise<IntakeQuestionSetWithQuestions | null>;
  findQuestionForProfileSegment(input: {
    questionId: string;
    segment: Segment;
    language: string;
    now: string;
  }): Promise<IntakeQuestion | null>;
  upsertAnswer(input: NewIntakeAnswer): Promise<IntakeAnswer>;
  /** This user's own previously-saved answers among the given question ids — the resume path's
   * read side. Never scoped by sessionId: a returning user's answers must be found regardless of
   * which journey session (a fresh one every sign-in) is currently active. */
  findAnswersForUser(input: { userId: string; questionIds: string[] }): Promise<IntakeAnswer[]>;
};
