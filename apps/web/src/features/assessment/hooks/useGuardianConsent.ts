import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  RequestGuardianConsentRequest,
  RequestPendingGuardianConsentRequest,
  ResendPendingGuardianConsentRequest,
  VerifyGuardianConsentRequest,
  VerifyPendingGuardianConsentRequest,
} from "@yuvanext/contracts";
import {
  getGuardianConsentStatus,
  requestGuardianConsent,
  requestPendingGuardianConsent,
  resendPendingGuardianConsent,
  verifyGuardianConsent,
  verifyPendingGuardianConsent,
} from "../api/guardian-consent";

export function useGuardianConsentStatus(sessionId: string | null) {
  return useQuery({
    queryKey: ["guardian-consent-status", sessionId],
    queryFn: () => getGuardianConsentStatus(sessionId as string),
    enabled: sessionId !== null,
  });
}

export function useRequestGuardianConsent(sessionId: string) {
  return useMutation({
    mutationFn: (input: RequestGuardianConsentRequest) => requestGuardianConsent(sessionId, input),
  });
}

export function useVerifyGuardianConsent(sessionId: string) {
  return useMutation({
    mutationFn: (input: VerifyGuardianConsentRequest) => verifyGuardianConsent(sessionId, input),
  });
}

/** Minor path — guardian consent requested before the student has an identity. */
export function useRequestPendingGuardianConsent() {
  return useMutation({
    mutationFn: (input: RequestPendingGuardianConsentRequest) =>
      requestPendingGuardianConsent(input),
  });
}

export function useVerifyPendingGuardianConsent() {
  return useMutation({
    mutationFn: (input: VerifyPendingGuardianConsentRequest) => verifyPendingGuardianConsent(input),
  });
}

export function useResendPendingGuardianConsent() {
  return useMutation({
    mutationFn: (input: ResendPendingGuardianConsentRequest) => resendPendingGuardianConsent(input),
  });
}
