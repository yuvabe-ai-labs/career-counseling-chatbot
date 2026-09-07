import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EducationStage } from "@yuvanext/contracts";
import { Brand, StepIndicator } from "@/components/Brand";
import { PromoPanel } from "@/components/PromoPanel";
import { ApiRequestError } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-messages";
import {
  clearStoredPendingSessionId,
  getStoredPendingSessionId,
  setStoredPendingSessionId,
} from "@/lib/storage";
import { AttemptsExhaustedModal } from "../components/AttemptsExhaustedModal";
import { GuardianConsentModal } from "../components/GuardianConsentModal";
import { ProfileFieldsForm } from "../components/ProfileFieldsForm";
import { SetPasswordForm } from "../components/SetPasswordForm";
import { GUARDIAN_CONSENT_TEXT_VERSION } from "../data";
import { calculateAge, MINOR_AGE_CEILING } from "../domain/age";
import {
  useRequestPendingGuardianConsent,
  useResendPendingGuardianConsent,
  useVerifyPendingGuardianConsent,
} from "../hooks/useGuardianConsent";
import {
  useCheckEmailAvailability,
  useRequestAnonymousSession,
  useSignUpWithPassword,
} from "../hooks/useIdentity";
import { useCreateJourneySession } from "../hooks/useJourneySession";
import { useUpsertUserProfile } from "../hooks/useProfile";
import { useSession } from "../state/session-context";
import {
  emptyGuardianVerificationState,
  emptyProfileFormValues,
  type GuardianVerificationState,
  type ProfileFormValues,
} from "../types";

/**
 * Onboarding: Step 1 (profile fields, local only, including date of birth), then Step 2 —
 * account setup, which branches on age computed from that date of birth:
 *
 * - Adult (18+): Step 2 is directly the password screen (Figma node 264:1097). No guardian
 *   consent, no email-OTP step for the student either — this registration flow only ever
 *   creates the account by email + password now. (A separate email-verification feature is
 *   planned for later, on the dashboard, after the account already exists — not part of this
 *   flow, and this page deliberately doesn't reuse `/auth/otp/*` for it.)
 * - Minor (<18): a blocking guardian-consent modal (Figma node 275:1784) pops up right after
 *   Step 1, keyed to the anonymous pendingSessionId since there's no identity yet. Once the
 *   guardian verifies their own OTP, Step 2 becomes the same password screen — the guardian's
 *   verification substitutes for the student verifying their own email.
 *
 * Either way, age is never trusted as a number from the client: IdentityService.signUpWithPassword
 * and GuardianConsentService.requestForPendingSession (packages/assessment) both independently
 * recompute it from dateOfBirth on the backend, and the guardian-consent gate for minors can't be
 * skipped by calling /auth/signup directly out of order — see identity-service.ts.
 *
 * Guardian modal visibility (`showConsentModal`) is deliberately a separate piece of state from
 * the modal's form data (`guardianState`) — closing the modal (outside click or Escape) only
 * flips the former, so reopening it restores exactly what the guardian had already entered. Only
 * `handleRestartRegistration` (reached from the resend-attempts-exhausted popup) resets
 * `guardianState`, since at that point the whole verification attempt is genuinely dead.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const session = useSession();

  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<ProfileFormValues>(emptyProfileFormValues);
  /** The student's own email — collected on the password-setup screen (SetPasswordForm), not
   * Step 1. Owned here (not local to SetPasswordForm) so it survives a race-condition retry that
   * needs to redisplay it, same pattern as `profile`. */
  const [email, setEmail] = useState("");
  const [isMinorFlow, setIsMinorFlow] = useState(false);
  const [stepOneError, setStepOneError] = useState<string | null>(null);
  /** Server-side result of checking the student's own email — shown inline below the email field
   * on the password screen (SetPasswordForm's emailError prop), not as a page-level banner.
   * Cleared whenever the email itself changes, below. */
  const [emailAvailabilityError, setEmailAvailabilityError] = useState<string | null>(null);

  const [pendingSessionId, setPendingSessionId] = useState<string | null>(() =>
    getStoredPendingSessionId(),
  );

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [guardianState, setGuardianState] = useState<GuardianVerificationState>(
    emptyGuardianVerificationState,
  );
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);

  const requestAnonymousSession = useRequestAnonymousSession();
  const checkEmailAvailability = useCheckEmailAvailability();
  const createJourneySession = useCreateJourneySession();
  const upsertProfile = useUpsertUserProfile();
  const requestPendingConsent = useRequestPendingGuardianConsent();
  const resendPendingConsent = useResendPendingGuardianConsent();
  const verifyPendingConsent = useVerifyPendingGuardianConsent();
  const signUp = useSignUpWithPassword();

  const isSigningUp =
    checkEmailAvailability.isPending ||
    signUp.isPending ||
    createJourneySession.isPending ||
    upsertProfile.isPending;

  async function ensurePendingSessionId(): Promise<string> {
    if (pendingSessionId) return pendingSessionId;
    return startFreshPendingSession();
  }

  /**
   * Unlike ensurePendingSessionId, always requests a brand-new session regardless of the
   * `pendingSessionId` React state — that state variable is a stale closure value inside a retry
   * path (setPendingSessionId(null) doesn't change what this function sees until the next
   * render), so the retry path below calls this directly rather than ensurePendingSessionId
   * again, which would just return the same stale id it was trying to replace.
   */
  async function startFreshPendingSession(): Promise<string> {
    const result = await requestAnonymousSession.mutateAsync();
    setPendingSessionId(result.pendingSessionId);
    setStoredPendingSessionId(result.pendingSessionId);
    return result.pendingSessionId;
  }

  /**
   * `pendingSessionId` can be a leftover from localStorage that the backend no longer
   * recognizes — its in-memory store is wiped on every server restart and naturally expires
   * after 30 minutes. Rather than surface that as a raw backend error, start a fresh session
   * transparently and retry once.
   *
   * Only safe to use for a call that's the *first* thing to reference a pendingSessionId in its
   * sequence — nothing yet depends on that id. It is NOT used for the minor path's signup call,
   * since by then a granted guardian consent is tied to the specific pendingSessionId that
   * requested it; silently swapping to a fresh one there would orphan that consent and wrongly
   * reject a student who did everything right (see handleSetPassword below).
   */
  async function withFreshPendingSessionRetry<T>(call: (id: string) => Promise<T>): Promise<T> {
    const id = await ensurePendingSessionId();
    try {
      return await call(id);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "pending_signup_not_found") {
        throw error;
      }
    }
    clearStoredPendingSessionId();
    setPendingSessionId(null);
    const freshId = await startFreshPendingSession();
    return call(freshId);
  }

  /**
   * Reached only from the resend-attempts-exhausted popup's Close/Escape/Enter — the whole
   * verification attempt is dead at that point (no more resends, current code likely stale), so
   * this clears every piece of registration state and sends the user back to Step 1, same as a
   * fresh visit.
   */
  const handleRestartRegistration = () => {
    setShowExhaustedModal(false);
    setShowConsentModal(false);
    setGuardianState(emptyGuardianVerificationState);
    setIsMinorFlow(false);
    setProfile(emptyProfileFormValues);
    setEmail("");
    setStepOneError(null);
    setEmailAvailabilityError(null);
    clearStoredPendingSessionId();
    setPendingSessionId(null);
    setStep(1);
  };

  /**
   * Step 1's "Next" — branches on age computed from the entered date of birth (same floor, 18,
   * the backend independently enforces). This client-side check only decides which screen to
   * show next; it grants nothing by itself. The student's own email isn't collected until the
   * password screen, so there's nothing to validate here beyond the profile fields themselves
   * (ProfileFieldsForm's own runSubmit) and having a pendingSessionId to hang the rest of the
   * flow off of.
   */
  const handleProfileNext = async () => {
    const age = calculateAge(profile.dateOfBirth) ?? 0;
    setStepOneError(null);
    try {
      await ensurePendingSessionId();
    } catch (error) {
      setStepOneError(getErrorMessage(error));
      return;
    }

    if (age < MINOR_AGE_CEILING) {
      setIsMinorFlow(true);
      setShowConsentModal(true);
      return;
    }
    setIsMinorFlow(false);
    setStep(2);
  };

  /**
   * Minor path — guardian consent, pre-identity (Figma node 275:1784). This is the first call in
   * the guardian-consent sequence to reference pendingSessionId (nothing yet depends on it — no
   * consent has been created), so like the adult signup path it goes through
   * withFreshPendingSessionRetry: a stale id left over in localStorage (server restarted, or the
   * 30-minute anonymous-session expiry) transparently gets a fresh session and one retry instead
   * of surfacing pending_signup_not_found straight to the guardian.
   */
  const handlePendingGuardianSendOtp = async () => {
    try {
      const { consent, otpTiming } = await withFreshPendingSessionRetry((id) =>
        requestPendingConsent.mutateAsync({
          pendingSessionId: id,
          guardianEmail: guardianState.guardianEmail,
          dateOfBirth: profile.dateOfBirth,
          textVersion: GUARDIAN_CONSENT_TEXT_VERSION,
        }),
      );
      setGuardianState((prev) => ({
        ...prev,
        phase: "otp_verification",
        consentId: consent.id,
        otpTiming,
        otpDigits: ["", "", "", "", "", ""],
        otpError: null,
      }));
    } catch (error) {
      setGuardianState((prev) => ({
        ...prev,
        emailError: getErrorMessage(error, "We couldn't send the code. Please try again."),
      }));
    }
  };

  const handleResendGuardianOtp = async () => {
    if (!guardianState.consentId || !pendingSessionId) return;
    try {
      const { otpTiming } = await resendPendingConsent.mutateAsync({
        pendingSessionId,
        consentId: guardianState.consentId,
      });
      setGuardianState((prev) => ({
        ...prev,
        otpTiming,
        otpDigits: ["", "", "", "", "", ""],
        otpError: null,
      }));
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "guardian_otp_resend_limit_reached") {
        setShowConsentModal(false);
        setShowExhaustedModal(true);
        return;
      }
      setGuardianState((prev) => ({
        ...prev,
        otpError: getErrorMessage(error, "We couldn't resend the code. Please try again."),
      }));
    }
  };

  const handlePendingGuardianVerify = async () => {
    if (!guardianState.consentId || !pendingSessionId) {
      setGuardianState((prev) => ({ ...prev, otpError: "Please request a new code first." }));
      return;
    }
    try {
      await verifyPendingConsent.mutateAsync({
        pendingSessionId,
        consentId: guardianState.consentId,
        verificationCode: guardianState.otpDigits.join(""),
      });
      setShowConsentModal(false);
      setStep(2);
    } catch (error) {
      setGuardianState((prev) => ({
        ...prev,
        otpError: getErrorMessage(error, "Incorrect code. Please check and try again."),
      }));
    }
  };

  /**
   * Step 2 for both adults and (post-consent) minors — account setup by email + password, no
   * OTP (Figma node 264:1097). The backend independently recomputes age from dateOfBirth and,
   * for a minor, independently re-checks that a granted guardian consent exists for this exact
   * pendingSessionId — see IdentityService.signUpWithPassword.
   *
   * The email is collected on this same screen, so its availability is checked right here, right
   * before the actual signup call — not earlier in the flow. `signUpWithPassword`'s own rejection
   * (a concurrent registration for the same email winning the race in between) is the real
   * source-of-truth guard; the explicit check below is just the earliest, cleanest place this can
   * usually fail fast, both surfacing in the same place: emailAvailabilityError, below the email
   * field on this screen.
   */
  const handleSetPassword = async ({ email: signupEmail, password }: { email: string; password: string }) => {
    if (!pendingSessionId) {
      throw new Error("Your session expired. Please start again.");
    }
    setEmail(signupEmail);
    setEmailAvailabilityError(null);

    const { available } = await checkEmailAvailability.mutateAsync({ email: signupEmail });
    if (!available) {
      setEmailAvailabilityError("This email was already registered.");
      return;
    }

    // Tracks whichever pendingSessionId the successful signup call actually used — plain local
    // reassignment, not React state, so (unlike the `pendingSessionId` state variable) it's
    // never stale by the time we read it below: withFreshPendingSessionRetry may swap in a
    // fresh id partway through, and createJourneySession must reference that same id, not the
    // possibly-abandoned one this function closed over at call time.
    let usedPendingSessionId = pendingSessionId;
    try {
      const { userId } = isMinorFlow
        ? await signUp.mutateAsync({
            pendingSessionId,
            dateOfBirth: profile.dateOfBirth,
            email: signupEmail,
            password,
          })
        : await withFreshPendingSessionRetry((id) => {
            usedPendingSessionId = id;
            return signUp.mutateAsync({
              pendingSessionId: id,
              dateOfBirth: profile.dateOfBirth,
              email: signupEmail,
              password,
            });
          });
      session.setUserId(userId);
      session.setEmail(signupEmail);
      clearStoredPendingSessionId();

      const { session: journeySession } = await createJourneySession.mutateAsync({
        anonymousSessionId: usedPendingSessionId,
      });
      session.setJourneySessionId(journeySession.id);

      const { profile: savedProfile } = await upsertProfile.mutateAsync({
        sessionId: journeySession.id,
        profile: {
          firstName: profile.name.trim(),
          dateOfBirth: profile.dateOfBirth,
          city: profile.city,
          state: profile.state,
          countryCode: "IN",
          selfStage: profile.selfStage as EducationStage,
          wantsAid: profile.wantsAid,
        },
      });
      session.setProfile(savedProfile);
      void navigate("/home");
    } catch (error) {
      // Only reachable if two registrations for this email raced past the check just above —
      // Supabase Auth's own uniqueness enforcement is what actually caught it here. Stay on this
      // password screen and show the error in the same place the check above would have, rather
      // than navigating away.
      if (error instanceof ApiRequestError && error.code === "email_already_registered") {
        setEmailAvailabilityError("This email was already registered.");
        return;
      }
      if (
        isMinorFlow &&
        error instanceof ApiRequestError &&
        error.code === "pending_signup_not_found"
      ) {
        throw new Error(
          "Your session expired before this could finish. Please start over from the beginning so your parent/guardian can verify again.",
          { cause: error },
        );
      }
      throw new Error(getErrorMessage(error), { cause: error });
    }
  };

  return (
    <>
      <main className="h-screen overflow-hidden bg-page">
        {/* Figma node 139:3935 — the left column sits one shade off the white
          "surface" cards inside it (see --card in index.css). */}
        <div className="h-full w-full bg-card">
          {/* Even 50/50 split, by request — Figma's own 648/792 columns are intentionally not replicated here. */}
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-2">
            <div
              key={step}
              className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 px-6 pt-6 sm:px-10 sm:pt-8 lg:px-14 lg:pt-14">
                <Brand />
                <StepIndicator step={step} totalSteps={2} />
              </div>

              <div className="min-h-0">
                {step === 1 ? (
                  <>
                    <ProfileFieldsForm
                      value={profile}
                      onChange={setProfile}
                      onNext={() => void handleProfileNext()}
                    />
                    {stepOneError ? (
                      <p className="px-6 pb-6 font-display text-xs font-normal text-destructive sm:px-10 lg:px-14">
                        {stepOneError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  // Figma node 264:1097 ("Password standard") reuses step 1's "Tell us about
                  // yourself" / "Signup" heading verbatim — same apparent copy-leftover as the
                  // rest of this design, so this keeps step-appropriate copy instead.
                  <div className="flex h-full flex-col overflow-y-auto px-6 py-6 sm:px-10 sm:py-8 lg:px-14 lg:pt-4 lg:pb-4">
                    <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl lg:text-[36px] lg:leading-[1.2]">
                      Create your password
                    </h1>
                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                      {isMinorFlow
                        ? "Your parent or guardian has verified this signup. Set a password to finish creating your account."
                        : "Set a password to finish creating your account."}
                    </p>

                    <div className="mt-6 rounded-2xl border border-input bg-background p-6 sm:p-8">
                      <SetPasswordForm
                        email={email}
                        onEmailChange={setEmail}
                        onSubmit={handleSetPassword}
                        submitting={isSigningUp}
                        emailError={emailAvailabilityError}
                        onEmailErrorClear={() => setEmailAvailabilityError(null)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="hidden min-h-0 lg:block">
              <PromoPanel />
            </div>
          </div>
        </div>
      </main>
      {showConsentModal ? (
        <GuardianConsentModal
          value={guardianState}
          onChange={setGuardianState}
          onSendOtp={() => void handlePendingGuardianSendOtp()}
          onResendOtp={() => void handleResendGuardianOtp()}
          onVerify={() => void handlePendingGuardianVerify()}
          onClose={() => setShowConsentModal(false)}
          sending={requestPendingConsent.isPending}
          resending={resendPendingConsent.isPending}
          verifying={verifyPendingConsent.isPending}
        />
      ) : null}
      {showExhaustedModal ? <AttemptsExhaustedModal onRestart={handleRestartRegistration} /> : null}
    </>
  );
}
