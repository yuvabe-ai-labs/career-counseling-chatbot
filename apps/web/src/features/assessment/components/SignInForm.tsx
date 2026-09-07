import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldIconClass =
  "pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-brand";
const fieldInputClass = "h-12 rounded-[8px] border-input pr-11 pl-[46px] text-sm shadow-none";
const emailFieldInputClass = "h-12 rounded-[8px] border-input pr-4 pl-[46px] text-sm shadow-none";

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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
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
            className={emailFieldInputClass}
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
            className={fieldInputClass}
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
          <p className="mt-1 font-display text-xs font-normal text-destructive">{passwordError}</p>
        ) : null}
      </div>

      {submitError ? (
        <p className="font-display text-xs font-normal text-destructive">{submitError}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={submitting}
            className="h-[49px] w-[169px] gap-2 rounded-2xl text-xl font-bold shadow-none"
          >
            {submitting ? "Please wait…" : "Sign In"}
            {submitting ? (
              <Spinner className="size-[18px]" />
            ) : (
              <ArrowRight className="size-[18px]" aria-hidden="true" />
            )}
          </Button>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0 text-brand" aria-hidden="true" />
          We value your privacy. Your details are secure with us.
        </p>
      </div>
    </form>
  );
}
