import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  authFormClass,
  fieldIconClass,
  fieldInputClass,
  fieldInputWithTrailingClass,
  formSectionClass,
  primaryButtonClass,
} from "./form-styles";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignInFormProps {
  onSubmit: (input: { email: string; password: string }) => Promise<void>;
  submitting: boolean;
}

/**
 * Sign-in screen — same visual language as SetPasswordForm (Figma "career" file node
 * 264:1097, "Password standard"), reused here for the returning-user counterpart to that
 * signup step: email + password only, no confirm-password field or password-policy checklist,
 * since those only make sense while a password is being *chosen*, not re-entered.
 */
export function SignInForm({ onSubmit, submitting }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const runSubmit = () => {
    if (submitting) return;

    let hasError = false;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError("Please enter your email address.");
      hasError = true;
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      hasError = true;
    } else {
      setEmailError(null);
    }
    if (!password) {
      setPasswordError("Please enter your password.");
      hasError = true;
    } else {
      setPasswordError(null);
    }
    if (hasError) return;

    setSubmitError(null);
    void onSubmit({ email: trimmedEmail, password }).catch((error: unknown) => {
      setSubmitError(error instanceof Error ? error.message : "Could not sign you in.");
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSubmit();
  };

  return (
    // noValidate: same reasoning as SetPasswordForm — the native type="email" constraint would
    // otherwise silently block the submit event before runSubmit()'s own validation ever runs.
    <form onSubmit={handleSubmit} noValidate className={authFormClass}>
      <div className={formSectionClass}>
        <div>
          <Label htmlFor="signin-email" className="text-foreground">
            Email address *
          </Label>
          <div className="relative mt-2">
            <Mail className={fieldIconClass} aria-hidden="true" />
            <Input
              id="signin-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              placeholder="Enter your email"
              autoComplete="email"
              aria-invalid={Boolean(emailError)}
              className={fieldInputClass}
            />
          </div>
          {emailError ? (
            <p className="mt-1 font-display text-xs font-normal text-destructive">{emailError}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="signin-password" className="text-foreground">
            Password *
          </Label>
          <div className="relative mt-2">
            <Lock className={fieldIconClass} aria-hidden="true" />
            <Input
              id="signin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
              placeholder="Enter your password"
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
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
        </div>

        {submitError ? (
          <p className="font-display text-xs font-normal text-destructive">{submitError}</p>
        ) : null}
      </div>

      {/* Figma node 462:3084 ("actions"): full-width 48px button, then the account-switch row,
          then the privacy note — the mirror image of ProfileFieldsForm's own actions block. The
          "Sign up" link used to sit outside this card entirely, below it on SignInPage. */}
      <div className={formSectionClass}>
        <Button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Please wait…" : "Sign In"}
          {submitting ? (
            <Spinner className="size-[18px]" />
          ) : (
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          )}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <UserPlus className="size-3.5 shrink-0" aria-hidden="true" />
          Don&apos;t have an account?{" "}
          <Link to="/" className="font-semibold text-brand hover:underline">
            Sign Up
          </Link>
        </p>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0 text-brand" aria-hidden="true" />
          We value your privacy. Your details are secure with us.
        </p>
      </div>
    </form>
  );
}
