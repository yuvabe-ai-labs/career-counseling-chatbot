import { useMutation, useQuery } from "@tanstack/react-query";
import type { UpsertIntakeAnswerRequest } from "@yuvanext/contracts";
import { getIntakeQuestions, upsertIntakeAnswer } from "../api/intake";

/** The segment-appropriate question set for this journey session — see api/intake.ts. */
export function useIntakeQuestions(sessionId: string | null) {
  return useQuery({
    queryKey: ["intake-questions", sessionId],
    queryFn: () => getIntakeQuestions(sessionId as string),
    enabled: sessionId !== null,
  });
}

export function useUpsertIntakeAnswer(sessionId: string) {
  return useMutation({
    mutationFn: (input: { questionId: string; answer: UpsertIntakeAnswerRequest }) =>
      upsertIntakeAnswer(sessionId, input.questionId, input.answer),
  });
}
