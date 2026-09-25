import { useMutation, useQuery } from "@tanstack/react-query";
import type { UpsertUserProfileRequest } from "@yuvapath/contracts";
import { getUserProfile, upsertUserProfile } from "../api/profile";

export function useUpsertUserProfile() {
  return useMutation({
    mutationFn: (input: { sessionId: string; profile: UpsertUserProfileRequest }) =>
      upsertUserProfile(input.sessionId, input.profile),
  });
}

/**
 * On-demand profile read — used by AppHeader to recover the student's firstName (for the
 * account-avatar initials) when the in-memory session's `profile` is empty, which is the normal
 * case for a returning user: sign-in only ever sets userId/email/journeySessionId
 * (SignInPage.tsx), never profile — that's only populated in-memory right after onboarding
 * (OnboardingPage.tsx's own session.setProfile call) and isn't persisted to localStorage. Disabled
 * until there's a session to key the request on, same `enabled` pattern every other conditional
 * query in this codebase uses.
 */
export function useUserProfile(sessionId: string | null) {
  return useQuery({
    queryKey: ["user-profile", sessionId],
    queryFn: () => getUserProfile(sessionId!),
    enabled: Boolean(sessionId),
  });
}
