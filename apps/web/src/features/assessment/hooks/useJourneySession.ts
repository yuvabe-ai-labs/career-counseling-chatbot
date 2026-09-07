import { useMutation } from "@tanstack/react-query";
import { createJourneySession, getJourneySession } from "../api/journey-session";

export function useCreateJourneySession() {
  return useMutation({ mutationFn: createJourneySession });
}

export function useFetchJourneySession() {
  return useMutation({ mutationFn: getJourneySession });
}
