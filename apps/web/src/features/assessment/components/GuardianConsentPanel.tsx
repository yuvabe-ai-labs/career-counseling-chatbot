import { useEffect, useState } from "react";
import { ArrowRight, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-card sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-soft">
          <UserRound className="size-6 text-brand" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-lg font-bold text-foreground">
          Parent/Guardian consent required
        </h1>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Since you&apos;re under 18, we need approval from your parent or guardian to continue.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <Label htmlFor="student-email" className="text-xs font-semibold text-foreground">
            Your email address
          </Label>
          <div className="relative mt-2">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand"
              aria-hidden="true"
            />
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
              className="h-11 rounded-lg pl-10"
            />
          </div>
          {studentEmailError ? (
            <p className="mt-1 text-xs font-medium text-destructive">{studentEmailError}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="guardian-email" className="text-xs font-semibold text-foreground">
            Parent/Guardian email address
          </Label>
          <div className="relative mt-2">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand"
              aria-hidden="true"
            />
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
              className="h-11 rounded-lg pl-10"
            />
          </div>
          {guardianEmailError ? (
            <p className="mt-1 text-xs font-medium text-destructive">{guardianEmailError}</p>
          ) : null}
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            Your parent will receive a verification code by email.
          </p>

          {!sent ? (
            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending}
              className="mt-4 h-11 w-full gap-2 rounded-lg shadow-soft"
            >
              {sending ? "Sending…" : "Send OTP"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      {sent ? (
        <div className="mt-6 animate-in fade-in duration-200">
          <Label className="text-xs font-semibold text-foreground">Enter the 6-digit OTP</Label>
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
            className="mt-4 h-11 w-full gap-2 rounded-lg shadow-soft"
          >
            {verifying ? "Confirming…" : "Confirm & Continue"}
            <ArrowRight className="size-4" aria-hidden="true" />
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
