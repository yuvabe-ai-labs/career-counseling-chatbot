import { ApiRequestError } from "./api-client";

/**
 * Maps known backend error codes to plain, user-facing copy. `ApiRequestError.message` is the
 * backend's own internal string (e.g. "Anonymous session was not found or has expired.",
 * "Request failed with status 500.") — accurate for logs, wrong tone for a product surface.
 * Every screen should call `getErrorMessage()` instead of reading `.message` directly, so a
 * backend wording change or an unmapped code never leaks developer-facing text to a user.
 */
const FRIENDLY_MESSAGES: Record<string, string> = {
  // Identity / email OTP. pending_signup_not_found is normally invisible — OnboardingPage
  // retries once with a fresh session before ever surfacing this — so seeing it means that
  // retry itself failed.
  pending_signup_not_found: "We couldn't start a new verification session. Please refresh the page and try again.",
  invalid_identity_otp: "That code isn't right, or it's expired. Please check and try again.",
  identity_directory_unavailable: "We're unable to verify accounts right now. Please try again shortly.",
  email_provider_unavailable: "We're unable to send emails right now. Please try again shortly.",

  // Guardian consent
  invalid_guardian_otp: "That code isn't right. Please check and try again.",
  guardian_otp_expired: "That code has expired. Please request a new one.",
  guardian_otp_resend_not_yet_available: "Please wait before requesting another code.",
  guardian_otp_resend_limit_reached: "You have used all available OTP resend attempts. Please try again later.",
  guardian_email_matches_student: "The guardian and student email addresses must be different.",
  guardian_email_already_registered:
    "This email is already registered as a user and cannot be used as a parent/guardian email.",
  guardian_consent_not_required: "Guardian approval isn't needed for this account.",
  guardian_consent_not_found: "We couldn't find that approval request. Please start again.",
  guardian_consent_not_pending: "This approval request has already been resolved.",
  guardian_consent_decline_link_invalid: "This link isn't valid or has expired.",
  guardian_consent_required_for_signup: "Guardian approval is required before this account can be created.",

  // Account creation / sign-in
  email_already_registered: "This email was already registered.",
  invalid_credentials: "Incorrect email or password. Please try again.",
  under_12_ineligible: "You must be 12 or older to continue.",
  invalid_date_of_birth: "Enter a valid date of birth.",

  // Journey session / profile
  journey_session_not_found: "Your session has expired. Please start again.",
  journey_session_expired: "Your session has expired. Please start again.",
  journey_session_not_resumable: "This session can no longer be resumed. Please start again.",
  user_profile_not_found: "We couldn't find your profile. Please start again.",
  database_unavailable: "We're having trouble saving your information right now. Please try again in a moment.",

  // Intake questions
  intake_question_set_not_found: "We couldn't find your intake questions right now. Please try again shortly.",
  intake_question_not_found: "That question couldn't be found. Please refresh and try again.",
  invalid_intake_answer: "Please choose one of the listed options.",
  guardian_consent_required: "Guardian approval is required before your answers can be saved.",

  // RIASEC assessment
  assessment_version_not_found: "We couldn't find your assessment right now. Please try again shortly.",
  assessment_run_not_found: "Your assessment session has expired. Please start again.",
  assessment_run_not_active: "This assessment has already finished or was cancelled.",
  assessment_item_not_found: "That question couldn't be found. Please refresh and try again.",
  invalid_assessment_response: "Please choose a value on the slider before continuing.",
  assessment_run_incomplete: "Please answer every question before finishing the assessment.",
  assessment_result_not_found: "We couldn't find your results yet. Please finish the assessment first.",

  // Transport / validation
  network_error: "We couldn't connect. Please check your internet connection and try again.",
  invalid_request: "Please check your information and try again.",
};

const DEFAULT_MESSAGE = "Something went wrong on our end. Please try again in a moment.";

/**
 * Resolves a caught error into copy safe to show a user. Always logs the real error to the
 * console first — the technical detail isn't lost, it's just not put in front of the user.
 */
export function getErrorMessage(error: unknown, fallback: string = DEFAULT_MESSAGE): string {
  console.error(error);

  if (error instanceof ApiRequestError) {
    return FRIENDLY_MESSAGES[error.code] ?? fallback;
  }
  return fallback;
}
