import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Lock, Mail, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNow } from "@/lib/use-now";
import { OtpInput, type OtpInputHandle } from "@/features/assessment/components/OtpInput";
import {
  fieldIconClass,
  fieldInputClass,
} from "@/features/assessment/components/form-styles";
import {
  useRequestCounselorPasswordResetOtp,
  useVerifyCounselorPasswordResetOtp,
} from "../hooks/useCounselorAuth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 4;

export interface CounselorForgotPasswordFormProps {
  onVerified: (input: { email: string; resetToken: string }) => void;
}

/**
 * Figma node 706:439 ("Forgot Password") — email → 4-digit OTP → (parent navigates on success).
 * Built from the same shared field styles as the rest of the auth screens, and reuses the
 * existing OtpInput component + its resend-cooldown pattern (built for guardian consent,
 * apps/web/src/features/assessment/components/GuardianConsentModal.tsx) rather than inventing
 * new OTP UI — the counselor flow is simpler than guardian consent's (a flat 20s cooldown, no
 * hard resend cap, no separate "limit reached" state), so the timing logic is inlined here
 * rather than pulled from otp-timing.ts, which is guardian-consent-specific.
 */
export function CounselorForgotPasswordForm({ onVerified }: CounselorForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<OtpInputHandle>(null);
  const now = useNow();

  const requestOtp = useRequestCounselorPasswordResetOtp();
  const verifyOtp = useVerifyCounselorPasswordResetOtp();

  useEffect(() => {
    if (otpSent) otpInputRef.current?.focus();
  }, [otpSent]);

  const canResend = !resendAvailableAt || now.getTime() >= new Date(resendAvailableAt).getTime();
  const isOtpComplete = new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otpDigits.join(""));

  const sendOtp = (trimmedEmail: string) => {
    void requestOtp
      .mutateAsync({ email: trimmedEmail })
      .then(() => {
        setOtpSent(true);
        setResendAvailableAt(new Date(Date.now() + 20_000).toISOString());
        setOtpError(null);
      })
      .catch((error: unknown) => {
        setEmailError(error instanceof Error ? error.message : "Could not send the code. Please try again.");
      });
  };

  const handleSendSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (requestOtp.isPending) return;
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmail(trimmed);
    setEmailError(null);
    sendOtp(trimmed);
  };

  const handleResendClick = () => {
    if (requestOtp.isPending || !canResend) return;
    sendOtp(email);
  };

  const submitOtp = () => {
    if (verifyOtp.isPending) return;
    if (!isOtpComplete) {
      setOtpError(`Please enter the ${OTP_LENGTH}-digit OTP.`);
      otpInputRef.current?.focus();
      return;
    }
    setOtpError(null);
    void verifyOtp
      .mutateAsync({ email, code: otpDigits.join("") })
      .then((result) => onVerified({ email, resetToken: result.resetToken }))
      .catch((error: unknown) => {
        setOtpError(error instanceof Error ? error.message : "That code didn't work. Please try again.");
      });
  };

  const handleVerifySubmit = (event: FormEvent) => {
    event.preventDefault();
    submitOtp();
  };

  const handleOtpKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitOtp();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSendSubmit} noValidate className="flex flex-col gap-3">
        <div>
          <label htmlFor="counselor-reset-email" className="font-display text-sm font-medium text-foreground">
            Registered Email ID
          </label>
          <div className="relative mt-2">
            <Mail className={fieldIconClass} aria-hidden="true" />
            <Input
              ref={emailInputRef}
              id="counselor-reset-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              placeholder="Enter your registered email ID"
              autoComplete="email"
              disabled={otpSent}
              aria-invalid={Boolean(emailError)}
              className={fieldInputClass}
            />
          </div>
          {emailError ? (
            <p className="mt-1 font-display text-xs font-normal text-destructive">{emailError}</p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={requestOtp.isPending || otpSent}
          aria-busy={requestOtp.isPending}
          className="w-[149px]"
        >
          {requestOtp.isPending ? <Spinner className="size-5" /> : "Send OTP"}
        </Button>
      </form>

      <form onSubmit={handleVerifySubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-display text-sm font-medium text-foreground">
            Enter {OTP_LENGTH}-digit OTP
          </p>
          <div onKeyDown={handleOtpKeyDown}>
            <OtpInput
              ref={otpInputRef}
              length={OTP_LENGTH}
              digits={otpDigits}
              onChange={(digits) => {
                setOtpDigits(digits);
                setOtpError(null);
              }}
              disabled={verifyOtp.isPending || !otpSent}
              labelPrefix="Counselor OTP digit"
              size="xl"
            />
          </div>
          {otpError ? (
            <p className="font-display text-xs font-normal text-destructive">{otpError}</p>
          ) : null}
        </div>

        {otpSent ? (
          <div className="flex flex-col gap-1">
            <p className="font-display text-[13px] text-foreground">
              Didn&apos;t receive OTP?{" "}
              <button
                type="button"
                onClick={handleResendClick}
                disabled={!canResend || requestOtp.isPending}
                className="inline-flex cursor-pointer items-center gap-1 font-bold text-brand disabled:cursor-not-allowed disabled:text-muted-foreground"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                Resend OTP
              </button>
            </p>
            <p className="font-display text-[13px] text-muted-foreground">
              {canResend ? "You can resend the OTP now." : "You can resend in a few seconds."}
            </p>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={verifyOtp.isPending || !otpSent}
          aria-busy={verifyOtp.isPending}
          className="w-[149px]"
        >
          {verifyOtp.isPending ? <Spinner className="size-5" /> : "Verify"}
        </Button>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0 text-brand" aria-hidden="true" />
          We&apos;ll send a one-time code to your registered email.
        </p>
      </form>
    </div>
  );
}
