import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/error-messages";
import { GUARDIAN_CONSENT_TEXT_VERSION } from "../data";
import { AuthFormCard } from "../components/AuthFormCard";
import { AuthLayout } from "../components/AuthLayout";
import { GuardianConsentPanel } from "../components/GuardianConsentPanel";
import { useRequestGuardianConsent, useVerifyGuardianConsent } from "../hooks/useGuardianConsent";
import { useSession } from "../state/session-context";

/**
 * Shown when `GET .../guardian-consents/status` reports `consentRequired: true`
 * (the server's own minor determination — see OnboardingPage). Requires a
 * journey session from a completed onboarding; if that's missing (e.g. a
 * direct visit without completing Step 1/2), send back to Step 1.
 */
export function GuardianConsentPage() {
  const navigate = useNavigate();
  const session = useSession();

  const requestConsent = useRequestGuardianConsent(session.journeySessionId ?? "");
  const verifyConsent = useVerifyGuardianConsent(session.journeySessionId ?? "");

  const [consentId, setConsentId] = useState<string | null>(null);

  if (!session.journeySessionId) {
    return <Navigate to="/" replace />;
  }

  // Both guardian consent and the student's own identity verification (OnboardingPage) are
  // email-based now — GuardianConsentPanel collects the student's email fresh, once, on this
  // screen for the backend's guardian≠student distinctness check
  // (RequestGuardianConsentRequestSchema.studentEmail), independent of session state.
  const handleSendOtp = async (guardianEmail: string, studentEmail: string) => {
    try {
      const { consent } = await requestConsent.mutateAsync({
        guardianEmail,
        studentEmail,
        textVersion: GUARDIAN_CONSENT_TEXT_VERSION,
      });
      setConsentId(consent.id);
    } catch (error) {
      throw new Error(getErrorMessage(error, "We couldn't send the code. Please try again."), {
        cause: error,
      });
    }
  };

  const handleVerify = async (code: string) => {
    if (!consentId) {
      throw new Error("Please request a new code first.");
    }
    try {
      await verifyConsent.mutateAsync({ consentId, verificationCode: code });
      void navigate("/home");
    } catch (error) {
      throw new Error(getErrorMessage(error, "Incorrect code. Please check and try again."), {
        cause: error,
      });
    }
  };

  return (
    <AuthLayout>
      <AuthFormCard
        srHeading="Parent/Guardian consent required"
        title="Guardian consent"
        description="Since you're under 18, we need approval from your parent or guardian to continue."
      >
        <GuardianConsentPanel
          onSendOtp={handleSendOtp}
          onVerify={handleVerify}
          sending={requestConsent.isPending}
          verifying={verifyConsent.isPending}
        />
      </AuthFormCard>
    </AuthLayout>
  );
}
