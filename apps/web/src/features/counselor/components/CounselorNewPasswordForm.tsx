import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  authFormClass,
  fieldIconClass,
  fieldInputWithTrailingClass,
  formSectionClass,
  primaryButtonClass,
} from "@/features/assessment/components/form-styles";
import { PasswordVisibilityToggle } from "@/features/assessment/components/PasswordVisibilityToggle";

/** Same policy as SetCounselorPasswordRequestSchema (packages/contracts/src/auth.ts), same list
 *  as the student SetPasswordForm's PASSWORD_RULES. */
const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: "one lowercase character", test: (password) => /[a-z]/.test(password) },
  { label: "one uppercase character", test: (password) => /[A-Z]/.test(password) },
  { label: "one number", test: (password) => /[0-9]/.test(password) },
  { label: "one special character", test: (password) => /[^A-Za-z0-9]/.test(password) },
  { label: "8 character minimum", test: (password) => password.length >= 8 },
];

export interface CounselorNewPasswordFormProps {
  onSubmit: (input: { newPassword: string }) => Promise<void>;
  submitting: boolean;
}

/**
 * Figma node 706:520 ("Create New Password") — same field/checklist/button treatment as the
 * student SetPasswordForm, minus its email field (a counselor's email is already fixed by the
 * reset flow that got here) and its "confirm password" trailing icon variant.
 */
export function CounselorNewPasswordForm({ onSubmit, submitting }: CounselorNewPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const unmetRules = PASSWORD_RULES.filter((rule) => !rule.test(password));
  const isPasswordValid = unmetRules.length === 0;
  const showPasswordRules = passwordFocused || Boolean(passwordError);

  const runSubmit = () => {
    if (submitting) return;

    let hasError = false;
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
    void onSubmit({ newPassword: password }).catch((error: unknown) => {
      setSubmitError(error instanceof Error ? error.message : "Could not set your new password.");
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSubmit();
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      runSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      noValidate
      className={authFormClass}
    >
      <div className={formSectionClass}>
        <div>
          <Label htmlFor="counselor-new-password" className="text-foreground">
            New Password
          </Label>
          <div
            className="relative mt-2"
            onFocus={() => setPasswordFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setPasswordFocused(false);
            }}
          >
            <Lock className={fieldIconClass} aria-hidden="true" />
            <Input
              id="counselor-new-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
              placeholder="Enter your new password"
              autoComplete="new-password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={showPasswordRules ? "counselor-new-password-rules" : undefined}
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

          {showPasswordRules ? (
            <div
              id="counselor-new-password-rules"
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
          <Label htmlFor="counselor-confirm-password" className="text-foreground">
            Confirm Password
          </Label>
          <div className="relative mt-2">
            <Lock className={fieldIconClass} aria-hidden="true" />
            <Input
              id="counselor-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setConfirmError(null);
              }}
              placeholder="Confirm your new password"
              autoComplete="new-password"
              aria-invalid={Boolean(confirmError)}
              className={fieldInputWithTrailingClass}
            />
            <PasswordVisibilityToggle
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((value) => !value)}
            />
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
        <Button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Please wait…" : "Set Password"}
          {submitting ? (
            <Spinner className="size-[18px]" />
          ) : (
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          )}
        </Button>
      </div>
    </form>
  );
}
