import {
  GuardianConsentResponseSchema,
  GuardianConsentStatusResponseSchema,
  PendingGuardianConsentResponseSchema,
  RequestPendingGuardianConsentResponseSchema,
  ResendPendingGuardianConsentResponseSchema,
  type RequestGuardianConsentRequest,
  type RequestPendingGuardianConsentRequest,
  type ResendPendingGuardianConsentRequest,
  type VerifyGuardianConsentRequest,
  type VerifyPendingGuardianConsentRequest,
} from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/** GET /api/v1/journey-sessions/:sessionId/guardian-consents/status — the server's own minor determination. */
export function getGuardianConsentStatus(sessionId: string) {
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/guardian-consents/status`,
    GuardianConsentStatusResponseSchema,
  );
}

/** POST /api/v1/journey-sessions/:sessionId/guardian-consents — sends both the guardian OTP and a decline link. */
export function requestGuardianConsent(sessionId: string, input: RequestGuardianConsentRequest) {
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/guardian-consents`,
    GuardianConsentResponseSchema,
    { method: "POST", body: input },
  );
}

/** POST /api/v1/journey-sessions/:sessionId/guardian-consents/verify */
export function verifyGuardianConsent(sessionId: string, input: VerifyGuardianConsentRequest) {
  return apiRequest(
    `/api/v1/journey-sessions/${sessionId}/guardian-consents/verify`,
    GuardianConsentResponseSchema,
    { method: "POST", body: input },
  );
}

/**
 * POST /api/v1/auth/guardian-consents — the minor path's guardian consent, requested *before*
 * the student has an identity (keyed by pendingSessionId, not a journey session). Sends both the
 * guardian OTP and a decline link, same as requestGuardianConsent above. The response's
 * `otpTiming` is authoritative for the resend countdown — the frontend only ever displays it,
 * never computes its own.
 */
export function requestPendingGuardianConsent(input: RequestPendingGuardianConsentRequest) {
  return apiRequest("/api/v1/auth/guardian-consents", RequestPendingGuardianConsentResponseSchema, {
    method: "POST",
    body: input,
    auth: false,
  });
}

/**
 * POST /api/v1/auth/guardian-consents/resend — the backend enforces the resend schedule (1 min,
 * then 3, then 5, then never again) and the 3-attempt cap; this call either succeeds with a
 * fresh `otpTiming` or fails with `guardian_otp_resend_not_yet_available` (429) or
 * `guardian_otp_resend_limit_reached` (409).
 */
export function resendPendingGuardianConsent(input: ResendPendingGuardianConsentRequest) {
  return apiRequest(
    "/api/v1/auth/guardian-consents/resend",
    ResendPendingGuardianConsentResponseSchema,
    { method: "POST", body: input, auth: false },
  );
}

/** POST /api/v1/auth/guardian-consents/verify */
export function verifyPendingGuardianConsent(input: VerifyPendingGuardianConsentRequest) {
  return apiRequest("/api/v1/auth/guardian-consents/verify", PendingGuardianConsentResponseSchema, {
    method: "POST",
    body: input,
    auth: false,
  });
}
