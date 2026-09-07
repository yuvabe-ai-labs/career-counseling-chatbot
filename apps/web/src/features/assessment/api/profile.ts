import { UserProfileResponseSchema, type UpsertUserProfileRequest } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/** PUT /api/v1/journey-sessions/:sessionId/user-profile — server derives ageBand/segment. */
export function upsertUserProfile(sessionId: string, input: UpsertUserProfileRequest) {
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/user-profile`,
    UserProfileResponseSchema,
    {
      method: "PUT",
      body: input,
    },
  );
}

/** GET /api/v1/journey-sessions/:sessionId/user-profile */
export function getUserProfile(sessionId: string) {
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/user-profile`,
    UserProfileResponseSchema,
  );
}
