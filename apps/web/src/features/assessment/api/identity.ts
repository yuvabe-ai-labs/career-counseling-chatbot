import {
  CheckEmailAvailabilityRequestSchema,
  CheckEmailAvailabilityResponseSchema,
  RequestAnonymousSessionResponseSchema,
  SignInWithPasswordRequestSchema,
  SignInWithPasswordResponseSchema,
  SignUpWithPasswordRequestSchema,
  SignUpWithPasswordResponseSchema,
  type CheckEmailAvailabilityRequest,
  type SignInWithPasswordRequest,
  type SignUpWithPasswordRequest,
} from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/** POST /api/v1/sessions/anonymous — starts the registration flow, before any userId exists. */
export function requestAnonymousSession() {
  return apiRequest("/api/v1/sessions/anonymous", RequestAnonymousSessionResponseSchema, {
    method: "POST",
    auth: false,
  });
}

/**
 * POST /api/v1/auth/check-email — validates the student's own email right after Step 1, before
 * a minor is sent into the guardian-consent detour. Not the actual source of truth: the final
 * signup call (and, under a race, Supabase Auth's own uniqueness enforcement) still decides for
 * real at account-creation time.
 */
export function checkEmailAvailability(input: CheckEmailAvailabilityRequest) {
  CheckEmailAvailabilityRequestSchema.parse(input);
  return apiRequest("/api/v1/auth/check-email", CheckEmailAvailabilityResponseSchema, {
    method: "POST",
    body: input,
    auth: false,
  });
}

/**
 * POST /api/v1/auth/signup — account setup for both adults and minors (email + password, no
 * OTP). The backend independently recomputes age from dateOfBirth and, for a minor,
 * independently re-checks that a granted guardian consent exists for this pendingSessionId
 * (see api/guardian-consent.ts's requestPendingGuardianConsent/verifyPendingGuardianConsent).
 *
 * Note: the older email-OTP identity endpoints (`/auth/otp/request`, `/auth/otp/verify`) still
 * exist on the backend but are intentionally not called anywhere in this app anymore —
 * registration no longer verifies the student's own email; that's planned as a separate
 * dashboard feature later, on an already-created account.
 */
export function signUpWithPassword(input: SignUpWithPasswordRequest) {
  SignUpWithPasswordRequestSchema.parse(input);
  return apiRequest("/api/v1/auth/signup", SignUpWithPasswordResponseSchema, {
    method: "POST",
    body: input,
    auth: false,
  });
}

/**
 * POST /api/v1/auth/signin — returning-user counterpart to signUpWithPassword. No pendingSessionId:
 * that only exists to gate first-time account creation, which this user has already been through.
 */
export function signInWithPassword(input: SignInWithPasswordRequest) {
  SignInWithPasswordRequestSchema.parse(input);
  return apiRequest("/api/v1/auth/signin", SignInWithPasswordResponseSchema, {
    method: "POST",
    body: input,
    auth: false,
  });
}
