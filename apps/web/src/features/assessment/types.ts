import type { EducationStage, GuardianOtpTiming } from "@yuvanext/contracts";

/** Step 1's local form state — converted into UpsertUserProfileRequest once identity is verified. */
export type ProfileFormValues = {
  name: string;
  /** YYYY-MM-DD. The backend independently (re)computes age from this on every call that
   * matters — never trusts a client-computed age number (see domain/age.ts). */
  dateOfBirth: string;
  /** Display name, e.g. "Tamil Nadu" — this is what's submitted as UpsertUserProfileRequest.state. */
  state: string;
  /** reference.states.code for the selected state — not submitted to the backend, only used to scope the city search. */
  stateCode: string;
  city: string;
  country: string;
  selfStage: EducationStage | "";
  wantsAid: boolean;
};

export const emptyProfileFormValues: ProfileFormValues = {
  name: "",
  dateOfBirth: "",
  state: "",
  stateCode: "",
  city: "",
  country: "India",
  selfStage: "",
  wantsAid: false,
};

export type GuardianModalPhase = "email_entry" | "otp_verification";

/**
 * Owned by OnboardingPage, not GuardianConsentModal — this is what makes the popup preserve
 * whatever the user typed across an outside-click/Escape close: only a separate
 * `showConsentModal` boolean (also owned by OnboardingPage) controls visibility, so closing the
 * modal never touches this. Reopening re-renders GuardianConsentModal with this same state.
 */
export type GuardianVerificationState = {
  phase: GuardianModalPhase;
  guardianEmail: string;
  emailError: string | null;
  otpDigits: string[];
  otpError: string | null;
  consentId: string | null;
  /** Authoritative resend/expiry timing from the backend — see domain/otp-timing.ts for how
   * this gets turned into "can I resend right now" for rendering. */
  otpTiming: GuardianOtpTiming | null;
};

export const emptyGuardianVerificationState: GuardianVerificationState = {
  phase: "email_entry",
  guardianEmail: "",
  emailError: null,
  otpDigits: ["", "", "", "", "", ""],
  otpError: null,
  consentId: null,
  otpTiming: null,
};
