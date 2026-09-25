import { useState, type FormEvent } from "react";
import { ArrowRight, Lock, Mail } from "lucide-react";
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
} from "@/features/assessment/components/form-styles";
import { PasswordVisibilityToggle } from "@/features/assessment/components/PasswordVisibilityToggle";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CounselorSignInFormProps {
  onSubmit: (input: { email: string; password: string }) => Promise<void>;
  submitting: boolean;
}

/**
 * Same visual language as the student SignInForm (Figma "career" file node 264:1097 lineage) —
 * built from the same shared field/button style constants rather than the raw Figma counselor
 * screen's own markup (node 699:1111), per the explicit instruction that the counselor screens
 * must not look visually distinct from the student ones. Only the copy differs ("Work Email
 * ID"), plus a "Forgot password?" link and no "Sign Up" row — counselors don't self-register.
 */
export function CounselorSignInForm({ onSubmit, submitting }: CounselorSignInFormProps) {
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
      setEmailError("Please enter your work email ID.");
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
    <form onSubmit={handleSubmit} noValidate className={authFormClass}>
      <div className={formSectionClass}>
        <div>
          <Label htmlFor="counselor-signin-email" className="text-foreground">
            Work Email ID *
          </Label>
          <div className="relative mt-2">
            <Mail className={fieldIconClass} aria-hidden="true" />
            <Input
              id="counselor-signin-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              placeholder="Enter your work email ID"
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
          <div className="flex items-baseline justify-between">
            <Label htmlFor="counselor-signin-password" className="text-foreground">
              Password *
            </Label>
            <Link
              to="/counselor/forgot-password"
              className="font-display text-xs font-medium text-brand hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-2">
            <Lock className={fieldIconClass} aria-hidden="true" />
            <Input
              id="counselor-signin-password"
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
            <PasswordVisibilityToggle
              visible={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
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

      <div className={formSectionClass}>
        <Button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Please wait…" : "Login"}
          {submitting ? (
            <Spinner className="size-[18px]" />
          ) : (
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          )}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0 text-brand" aria-hidden="true" />
          Secure staff access.
        </p>
      </div>
    </form>
  );
}
