import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useEscapeKey } from "@/lib/use-escape-key";
import { useNow } from "@/lib/use-now";
import { deriveResendState, formatCountdown, secondsUntil } from "../domain/otp-timing";
import { emptyGuardianVerificationState, type GuardianVerificationState } from "../types";
import { OtpInput } from "./OtpInput";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface GuardianConsentModalProps {
  value: GuardianVerificationState;
  onChange: (next: GuardianVerificationState) => void;
  onSendOtp: () => void;
  onResendOtp: () => void;
  onVerify: () => void;
  /** Outside click or Escape — closes the popup without touching `value` at all. */
  onClose: () => void;
  sending: boolean;
  resending: boolean;
  verifying: boolean;
}

/**
 * Figma "career" file node 277:52 ("parent-consent-modal") — a blocking overlay shown once the
 * backend's own age check (from Step 1's date of birth) confirms the student is a minor.
 *
 * Controlled by OnboardingPage rather than owning its own state: `value`/`onChange` hold
 * everything the user has entered (email, OTP digits, which sub-view is showing, the backend's
 * resend/expiry timing), and `onClose` only ever toggles the *parent's* visibility flag — closing
 * with an outside click or Escape never resets any of this, so reopening picks up exactly where
 * the user left off. See types.ts's GuardianVerificationState.
 *
 * Both the email step and the OTP step are real `<form onSubmit>` elements specifically so Enter
 * triggers the same handler the visible button does, with no separate keydown logic needed.
 *
 * Both forms render together, always — not swapped one-for-the-other by `value.phase` — so this
 * reads as one popup instead of two. The OTP section is simply inert (its input disabled, Verify
 * unreachable via isOtpComplete) until `value.otpTiming` actually exists, i.e. until Send OTP has
 * succeeded at least once; the email field/Send OTP button then lock in turn, so a guardian can't
 * silently retarget a code that was already sent — Resend OTP (rate-limited server-side) is the
 * intended way to get a new one from that point on.
 */
export function GuardianConsentModal({
  value,
  onChange,
  onSendOtp,
  onResendOtp,
  onVerify,
  onClose,
  sending,
  resending,
  verifying,
}: GuardianConsentModalProps) {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  useEscapeKey(true, onClose);

  // Autofocus the first field of whichever sub-view is current, including when the OTP step
  // first appears (guardian just verified their email) — keeps keyboard focus inside the modal
  // rather than on whatever the background page last focused.
  useEffect(() => {
    if (value.phase === "email_entry") {
      emailInputRef.current?.focus();
    }
  }, [value.phase]);

  const isOtpComplete = /^\d{6}$/.test(value.otpDigits.join(""));
  const resendState = value.otpTiming ? deriveResendState(value.otpTiming, now) : null;

  const handleSendSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const trimmed = value.guardianEmail.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      onChange({ ...value, emailError: "Enter a valid email address." });
      return;
    }
    onChange({ ...value, guardianEmail: trimmed, emailError: null });
    onSendOtp();
  };

  const submitOtp = () => {
    if (verifying) return;
    if (!isOtpComplete) {
      onChange({ ...value, otpError: "Please enter the 6-digit OTP." });
      return;
    }
    onChange({ ...value, otpError: null });
    onVerify();
  };

  const handleVerifySubmit = (event: FormEvent) => {
    event.preventDefault();
    submitOtp();
  };

  /**
   * A <form>'s implicit Enter-submits-it behavior is unreliable once there's more than one text
   * field and no single one is a natural "default" (the 6 separate OTP digit inputs are exactly
   * that case, in both jsdom and real browsers) — so Enter is handled explicitly here, calling
   * the exact same submitOtp() the Verify button's onSubmit does, rather than depending on that.
   */
  const handleOtpKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitOtp();
    }
  };

  const handleResendClick = () => {
    if (resending || resendState !== "resend_available") return;
    onResendOtp();
  };

  /**
   * Lets the guardian back out of a wrongly-typed email after Send OTP has already locked the
   * email field (see the form's own comment above). Resetting straight to
   * emptyGuardianVerificationState — same object OnboardingPage's own
   * handleRestartRegistration uses for a full do-over — clears the email, phase, OTP digits,
   * otpError, consentId, and otpTiming together, so the previous code's resend cooldown and
   * consentId can't be reused: the Verify/Resend buttons above are already gated on
   * value.otpTiming existing, and OnboardingPage's handlePendingGuardianVerify separately
   * requires a consentId, both now cleared. The autofocus effect above then refocuses the email
   * input the moment `phase` flips back to "email_entry".
   */
  const handleChangeEmail = () => {
    onChange(emptyGuardianVerificationState);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guardian-consent-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,27,75,0.15)] p-6 backdrop-blur-[4px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-[516px] animate-in flex-col gap-4 rounded-[28px] border border-input bg-background px-8 py-8 fade-in shadow-card zoom-in-95 duration-200">
        <div className="flex items-center justify-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft">
            <UserRound className="size-6 text-brand" aria-hidden="true" />
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h2
            id="guardian-consent-heading"
            className="font-display text-xl leading-[26px] font-bold tracking-[-0.2px] text-foreground"
          >
            Parent/Guardian consent required
          </h2>
          <p className="font-display text-sm leading-5 text-muted-foreground">
            Since you&apos;re under 18, we need approval from your parent or guardian to continue.
          </p>
        </div>

        {/* noValidate on this form: the email input's native type="email" format constraint
            would otherwise silently block the browser's own submit event (an
            invalid-but-non-empty email) before handleSendSubmit's own validation ever runs —
            same class of issue as ProfileFieldsForm's identical fix. Locks once an OTP has
            actually been sent (value.otpTiming exists) — from that point on, Resend OTP below is
            the way to get a new code, not a second Send OTP against a possibly-changed email. */}
        <form onSubmit={handleSendSubmit} noValidate className="flex flex-col gap-6">
          <div>
            <Input
              ref={emailInputRef}
              type="email"
              value={value.guardianEmail}
              onChange={(event) =>
                onChange({ ...value, guardianEmail: event.target.value, emailError: null })
              }
              placeholder="Enter parent/guardian's email"
              autoComplete="email"
              disabled={Boolean(value.otpTiming)}
              aria-label="Parent/Guardian email address"
              aria-invalid={Boolean(value.emailError)}
              className="h-12 rounded-[12px] border-input px-4 text-sm shadow-none"
            />
            {value.emailError ? (
              <p className="mt-1 font-display text-xs font-normal text-destructive">
                {value.emailError}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            disabled={sending || Boolean(value.otpTiming)}
            className="h-[49px] w-[149px] gap-2 rounded-2xl text-xl font-bold shadow-none"
          >
            {sending ? <Spinner className="size-[18px]" /> : null}
            {sending ? "Sending…" : "Send OTP"}
          </Button>
        </form>

        {/* Always rendered alongside the email form above (not swapped in after Send OTP) — this
            reads as one popup instead of two. Inert until value.otpTiming exists: the OTP input
            is disabled, and Verify can't submit (isOtpComplete requires 6 digits nothing has
            populated yet), so there's nothing to interact with here before a code actually exists. */}
        <form onSubmit={handleVerifySubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="font-display text-sm font-medium text-foreground">
                Enter the 6-digit OTP
              </p>
              <div onKeyDown={handleOtpKeyDown}>
                <OtpInput
                  length={6}
                  digits={value.otpDigits}
                  onChange={(digits) => onChange({ ...value, otpDigits: digits, otpError: null })}
                  disabled={verifying || !value.otpTiming}
                  labelPrefix="Parent OTP digit"
                  size="xl"
                />
              </div>
              {value.otpError ? (
                <p className="font-display text-xs font-normal text-destructive">
                  {value.otpError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              {resendState === "resend_limit_reached" ? null : (
                <p className="font-display text-[13px] text-foreground">
                  Didn&apos;t receive OTP?{" "}
                  <button
                    type="button"
                    onClick={handleResendClick}
                    disabled={resendState !== "resend_available" || resending}
                    className="cursor-pointer font-bold text-brand disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    {resending ? "Resending…" : "Resend OTP"}
                  </button>
                </p>
              )}
              <p className="font-display text-[13px] text-muted-foreground">
                {resendState === "resend_waiting" && value.otpTiming?.nextResendAvailableAt
                  ? `You can resend in ${formatCountdown(secondsUntil(value.otpTiming.nextResendAvailableAt, now))}.`
                  : resendState === "resend_available"
                    ? "You can resend the OTP now."
                    : resendState === "resend_limit_reached"
                      ? "No more resends are available for this code."
                      : null}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="font-display text-xs text-muted-foreground">
                Your parent will receive a verification code.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="submit"
                disabled={!isOtpComplete || verifying || !value.otpTiming}
                className="h-[49px] w-[149px] gap-2 rounded-2xl text-xl font-bold shadow-none"
              >
                {verifying ? <Spinner className="size-[18px]" /> : null}
                {verifying ? "Confirming…" : "Verify"}
              </Button>

              {value.otpTiming ? (
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  disabled={verifying}
                  className="cursor-pointer font-display text-[13px] font-bold text-brand disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  Change email address
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
