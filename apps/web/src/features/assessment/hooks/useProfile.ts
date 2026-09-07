import { useMutation } from "@tanstack/react-query";
import type { UpsertUserProfileRequest } from "@yuvanext/contracts";
import { upsertUserProfile } from "../api/profile";

export function useUpsertUserProfile() {
  return useMutation({
    mutationFn: (input: { sessionId: string; profile: UpsertUserProfileRequest }) =>
      upsertUserProfile(input.sessionId, input.profile),
  });
}
