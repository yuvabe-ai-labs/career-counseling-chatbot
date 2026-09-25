import { Eye, EyeOff } from "lucide-react";

export type PasswordVisibilityToggleProps = {
  visible: boolean;
  onToggle: () => void;
};

/**
 * The show/hide-password eye button every password field in the app renders — pulled out once
 * both password screens (student SetPasswordForm/SignInForm, counselor
 * CounselorSignInForm/CounselorNewPasswordForm) had grown byte-identical copies of it.
 *
 * `onMouseDown` cancels the browser's default "clicking a button moves focus to it" behavior —
 * the fix for a real bug where this button lived inside the same focus-tracking wrapper as the
 * password input it sits next to (see SetPasswordForm/CounselorNewPasswordForm's password-rules
 * checklist): clicking the icon moved DOM focus onto the button, which bubbled a focus event up
 * through that wrapper exactly as if the input itself had been focused, popping the requirements
 * checklist open even when the user never touched the input. Preventing the default here means a
 * click on this button never changes focus at all — if the input already had focus (mid-typing),
 * it keeps it; if nothing was focused, nothing becomes focused — so it can only ever do the one
 * thing it's for. The click event (and this button's own onClick) still fires normally either
 * way; only the incidental focus-shift is suppressed. Keyboard Tab-navigation onto this button is
 * unaffected (Tab never fires mousedown), so existing keyboard behavior is unchanged.
 */
export function PasswordVisibilityToggle({ visible, onToggle }: PasswordVisibilityToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={visible ? "Hide password" : "Show password"}
      className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors duration-150 hover:text-brand"
    >
      {visible ? (
        <EyeOff className="size-[18px]" aria-hidden="true" />
      ) : (
        <Eye className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
