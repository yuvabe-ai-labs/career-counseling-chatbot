import { useEffect, useState } from "react";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  authFormClass,
  fieldIconClass,
  fieldInputClass,
  formSectionClass,
  primaryButtonClass,
} from "./form-styles";
import { OtpInput } from "./OtpInput";

const RESEND_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface GuardianConsentPanelProps {
  onSendOtp: (guardianEmail: string, studentEmail: string) => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  sending: boolean;
  verifying: boolean;
}

/**
 * Adapted from the prototype's ParentConsentModal.tsx — rendered as a normal
 * page section here rather than a floating dialog, since guardian consent is
 * its own step/route in the real flow instead of an in-place popup.
 *
 * Both guardian consent and the student's own identity verification are
 * email/SMTP-based (no SMS/phone delivery exists anywhere in the app). The
 * backend still requires a `studentEmail` distinct from the guardian's, to
 * enforce guardian ≠ student (RequestGuardianConsentRequestSchema) — reusing
 * the student's already-verified identity email here would work too, but
 * collecting it fresh keeps this panel self-contained and independent of
 * session state.
 */
export function GuardianConsentPanel({
  onSendOtp,
  onVerify,
  sending,
  verifying,
}: GuardianConsentPanelProps) {
  const [studentEmail, setStudentEmail] = useState("");
  const [studentEmailError, setStudentEmailError] = useState<string | null>(null);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianEmailError, setGuardianEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const isOtpComplete = /^\d{6}$/.test(otpDigits.join(""));

  const handleSend = async () => {
    const trimmedStudent = studentEmail.trim();
    const trimmedGuardian = guardianEmail.trim();
    const validStudent = EMAIL_PATTERN.test(trimmedStudent);
    const validGuardian = EMAIL_PATTERN.test(trimmedGuardian);
    setStudentEmailError(validStudent ? null : "Enter a valid email address.");
    setGuardianEmailError(validGuardian ? null : "Enter a valid email address.");
    if (!validStudent || !validGuardian) return;
    if (trimmedStudent.toLowerCase() === trimmedGuardian.toLowerCase()) {
      setGuardianEmailError("Guardian and student emails must be different.");
      return;
    }
    try {
      await onSendOtp(trimmedGuardian, trimmedStudent);
      setOtpDigits(["", "", "", "", "", ""]);
      setSent(true);
      setSeconds(RESEND_SECONDS);
    } catch (error) {
      setGuardianEmailError(
        error instanceof Error ? error.message : "Could not send the OTP. Please try again.",
      );
    }
  };

  const handleVerify = async () => {
    if (!isOtpComplete) {
      setOtpError("Please enter the 6-digit OTP.");
      return;
    }
    setOtpError(null);
    try {
      await onVerify(otpDigits.join(""));
    } catch (error) {
      setOtpError(
        error instanceof Error ? error.message : "Incorrect code. Please check and try again.",
      );
    }
  };

  return (
    // Just the fields and actions — the card, title and description around them are AuthFormCard,
    // shared with every other onboarding screen. This used to be its own card with a centered
    // icon header and a smaller type scale (44px `rounded-lg` fields, 16px icons, text-xs
    // labels), which is what made this screen look unlike the rest of the flow.
    <div className={authFormClass}>
      <div className={formSectionClass}>
        <div>
          <Label htmlFor="student-email" className="text-foreground">
            Your email address
          </Label>
          <div className="relative mt-2">
            <Mail className={fieldIconClass} aria-hidden="true" />
            <Input
              id="student-email"
              type="email"
              value={studentEmail}
              onChange={(event) => {
                setStudentEmail(event.target.value);
                setStudentEmailError(null);
              }}
              placeholder="Enter your email address"
              autoComplete="email"
              disabled={sent}
              aria-invalid={Boolean(studentEmailError)}
              className={fieldInputClass}
            />
          </div>
          {studentEmailError ? (
            <p className="mt-1 font-display text-xs font-normal text-destructive">
              {studentEmailError}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="guardian-email" className="text-foreground">
            Parent/Guardian email address
          </Label>
          <div className="relative mt-2">
            <Mail className={fieldIconClass} aria-hidden="true" />
            <Input
              id="guardian-email"
              type="email"
              value={guardianEmail}
              onChange={(event) => {
                setGuardianEmail(event.target.value);
                setGuardianEmailError(null);
              }}
              placeholder="Enter guardian's email address"
              autoComplete="email"
              disabled={sent}
              aria-invalid={Boolean(guardianEmailError)}
              className={fieldInputClass}
            />
          </div>
          {guardianEmailError ? (
            <p className="mt-1 font-display text-xs font-normal text-destructive">
              {guardianEmailError}
            </p>
          ) : null}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            Your parent will receive a verification code by email.
          </p>
        </div>
      </div>

      {!sent ? (
        <Button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending}
          className={primaryButtonClass}
        >
          {sending ? "Sending…" : "Send OTP"}
          <ArrowRight className="size-[18px]" aria-hidden="true" />
        </Button>
      ) : null}

      {sent ? (
        <div className="animate-in fade-in duration-200">
          <Label className="text-foreground">Enter the 6-digit OTP</Label>
          <div className="mt-3">
            <OtpInput
              length={6}
              digits={otpDigits}
              onChange={setOtpDigits}
              labelPrefix="Parent OTP digit"
              size="lg"
            />
          </div>
          {otpError ? (
            <p className="mt-2 text-xs font-medium text-destructive">{otpError}</p>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            Didn&apos;t receive OTP?{" "}
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={seconds > 0}
              className="cursor-pointer font-semibold text-brand disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              Resend OTP
            </button>
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            {seconds > 0
              ? `You can resend after ${seconds} seconds.`
              : "You can resend the OTP now."}
          </p>
          <Button
            type="button"
            disabled={!isOtpComplete || verifying}
            onClick={() => void handleVerify()}
            className={cn(primaryButtonClass, "mt-4")}
          >
            {verifying ? "Confirming…" : "Confirm & Continue"}
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
        This helps us keep your journey safe and personalized.
      </p>
    </div>
  );
}
