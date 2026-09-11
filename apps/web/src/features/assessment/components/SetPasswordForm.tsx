import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  authFormClass,
  fieldIconClass,
  fieldInputClass,
  fieldInputWithTrailingClass,
  formSectionClass,
  primaryButtonClass,
} from "./form-styles";

/** Same policy as the backend's SignUpWithPasswordRequestSchema (packages/contracts/src/auth.ts). */
const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: "one lowercase character", test: (password) => /[a-z]/.test(password) },
  { label: "one uppercase character", test: (password) => /[A-Z]/.test(password) },
  { label: "one number", test: (password) => /[0-9]/.test(password) },
  { label: "one special character", test: (password) => /[^A-Za-z0-9]/.test(password) },
  { label: "8 character minimum", test: (password) => password.length >= 8 },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SetPasswordFormProps {
  email: string;
  onEmailChange: (next: string) => void;
  onSubmit: (input: { email: string; password: string }) => Promise<void>;
  submitting: boolean;
  /** Server-side result of checking email availability (or the same rejection surfacing from the
   * final signup call itself) — distinct from this form's own synchronous format/required-ness
   * validation, but shown in the same place below the email input. */
  emailError?: string | null;
  /** Clears the parent-owned emailError once the user edits the email again. */
  onEmailErrorClear?: () => void;
}

/**
 * Figma "career" file node 264:1097 ("Password standard") — the minor path's Step 2, shown
 * once guardian consent is granted, replacing the email-OTP step adults get. The guardian's own
 * OTP verification substitutes for the student verifying this email, so it's just paired with a
 * password here (see SignUpWithPasswordRequestSchema) instead of another OTP round-trip.
 *
 * The student's own email is collected here (not at Step 1 / ProfileFieldsForm) — its
 * availability (CheckEmailAvailabilityRequestSchema) is validated at this point too, right
 * before the actual signup call, rather than earlier in the flow.
 */
export function SetPasswordForm({
  email,
  onEmailChange,
  onSubmit,
  submitting,
  emailError: serverEmailError,
  onEmailErrorClear,
}: SetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [emailFormatError, setEmailFormatError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const unmetRules = PASSWORD_RULES.filter((rule) => !rule.test(password));
  const isPasswordValid = unmetRules.length === 0;
  /** Guidance while typing a password — plus whenever the error that references it is showing. */
  const showPasswordRules = passwordFocused || Boolean(passwordError);

  const runSubmit = () => {
    if (submitting) return;

    let hasError = false;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailFormatError("Please enter your email address.");
      hasError = true;
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailFormatError("Enter a valid email address.");
      hasError = true;
    } else {
      setEmailFormatError(null);
    }
    if (!isPasswordValid) {
      setPasswordError("Your password doesn't meet all the requirements below.");
      hasError = true;
    } else {
      setPasswordError(null);
    }
    if (confirmPassword !== password) {
      setConfirmError("Passwords don't match.");
      hasError = true;
    } else {
      setConfirmError(null);
    }
    if (hasError) return;

    setSubmitError(null);
    void onSubmit({ email: trimmedEmail, password }).catch((error: unknown) => {
      setSubmitError(error instanceof Error ? error.message : "Could not create your account.");
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSubmit();
  };

  /**
   * A <form>'s implicit Enter-submits-it behavior is unreliable once there's more than one text
   * field and no single one is a natural "default" — true here (password, confirm), same as
   * GuardianConsentModal's OTP digits. Handled explicitly, calling the exact same runSubmit()
   * the button's onSubmit does. Guarded to actual text inputs so Enter on the show/hide-password
   * toggle buttons (type="button") doesn't also trigger a submit.
   */
  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      runSubmit();
    }
  };

  return (
    // noValidate: the email input's native type="email" format constraint would otherwise
    // silently block the browser's own submit event before runSubmit()'s own validation ever
    // runs — same class of issue as ProfileFieldsForm's identical fix.
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      noValidate
      className={authFormClass}
    >
      <div className={formSectionClass}>
        <div>
          <Label htmlFor="signup-email" className="text-foreground">
            Email address *
          </Label>
          <div className="relative mt-2">
            <Mail className={fieldIconClass} aria-hidden="true" />
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(event) => {
                onEmailChange(event.target.value);
                setEmailFormatError(null);
                onEmailErrorClear?.();
              }}
              placeholder="Enter your email"
              autoComplete="email"
              aria-invalid={Boolean(emailFormatError ?? serverEmailError)}
              className={fieldInputClass}
            />
          </div>
          {(emailFormatError ?? serverEmailError) ? (
            <p className="mt-1 font-display text-xs font-normal text-destructive">
              {emailFormatError ?? serverEmailError}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="signup-password" className="text-foreground">
            Enter your password
          </Label>
          {/* Focus is tracked on the wrapper, not the input, so the rules below stay open while
            the user reaches for the show/hide-password button inside it — moving focus between
            two children of this div isn't leaving it. */}
          <div
            className="relative mt-2"
            onFocus={() => setPasswordFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setPasswordFocused(false);
            }}
          >
            <Lock className={fieldIconClass} aria-hidden="true" />
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
              placeholder="Enter your password"
              autoComplete="new-password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={showPasswordRules ? "signup-password-rules" : undefined}
              className={fieldInputWithTrailingClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer text-muted-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-[18px]" aria-hidden="true" />
              ) : (
                <Eye className="size-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>
          {passwordError ? (
            <p className="mt-1 font-display text-xs font-normal text-destructive">
              {passwordError}
            </p>
          ) : null}

          {/* Only shown once the password field is being used — it's guidance for typing a
            password, not something to carry on screen the whole time (it was the tallest block
            in this card). Also kept open whenever passwordError is set, since that message says
            the requirements are "below" and would otherwise point at nothing.

            A two-column CSS grid (rather than the previous per-row flex-wrap) so the second
            column actually lines up: each column is sized to its own widest label, instead of
            starting wherever the first column's item in that particular row happened to end.
            5 rules auto-flow into the same 2/2/1 layout as before — the last one just lands
            alone in column 1. */}
          {showPasswordRules ? (
            <div
              id="signup-password-rules"
              className="mt-2 grid animate-in grid-cols-2 gap-x-4 gap-y-1.5 fade-in duration-200"
            >
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <span
                    key={rule.label}
                    className={cn(
                      "flex items-center gap-1 font-display text-sm",
                      met ? "text-brand" : "text-muted-foreground",
                    )}
                  >
                    <Check className="size-3 shrink-0" aria-hidden="true" />
                    {rule.label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        <div>
          <div className="relative">
            <Lock className={fieldIconClass} aria-hidden="true" />
            <Input
              id="signup-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setConfirmError(null);
              }}
              placeholder="Confirm Password"
              autoComplete="new-password"
              aria-label="Confirm Password"
              aria-invalid={Boolean(confirmError)}
              className={fieldInputWithTrailingClass}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer text-muted-foreground"
            >
              {showConfirmPassword ? (
                <EyeOff className="size-[18px]" aria-hidden="true" />
              ) : (
                <Eye className="size-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>
          {confirmError ? (
            <p className="mt-1 font-display text-xs font-normal text-destructive">{confirmError}</p>
          ) : null}
        </div>

        {submitError ? (
          <p className="font-display text-xs font-normal text-destructive">{submitError}</p>
        ) : null}
      </div>

      <div className={formSectionClass}>
        {/* Full-width, 48px — Figma node 462:3085 ("btn-next"); the earlier right-aligned
            169px button is gone so both onboarding steps present the same primary action. */}
        <Button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Please wait…" : "Start"}
          {submitting ? (
            <Spinner className="size-[18px]" />
          ) : (
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          )}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0 text-brand" aria-hidden="true" />
          We value your privacy. Your details are secure with us.
        </p>
      </div>
    </form>
  );
}
