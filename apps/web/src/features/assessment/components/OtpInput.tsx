import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/** Adapted from the prototype's inline OTP boxes (StepTwo.tsx / ParentConsentModal.tsx), generalized to any length. */
export interface OtpInputProps {
  length: number;
  digits: string[];
  onChange: (digits: string[]) => void;
  disabled?: boolean;
  labelPrefix?: string;
  size?: "sm" | "lg" | "xl";
}

export interface OtpInputHandle {
  /**
   * Moves focus to the box the user actually needs next — the first empty one, or the last box
   * when every digit is filled. Lets a caller (GuardianConsentModal's Verify) put the caret in
   * the right place without reaching for a DOM query or a timeout.
   */
  focus: () => void;
}

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { length, digits, onChange, disabled = false, labelPrefix = "OTP digit", size = "sm" },
  ref,
) {
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const firstEmpty = digits.findIndex((digit) => !digit);
        boxRefs.current[firstEmpty === -1 ? length - 1 : firstEmpty]?.focus();
      },
    }),
    [digits, length],
  );

  const setDigit = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      onChange(digits.map((d, i) => (i === index ? "" : d)));
      return;
    }
    const next = [...digits];
    clean.split("").forEach((digit, offset) => {
      if (index + offset < length) next[index + offset] = digit;
    });
    onChange(next);
    boxRefs.current[Math.min(index + clean.length, length - 1)]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      onChange(digits.map((d, i) => (i === index - 1 ? "" : d)));
      boxRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) boxRefs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) boxRefs.current[index + 1]?.focus();
  };

  return (
    <div className="flex gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            boxRefs.current[index] = el;
          }}
          value={digit}
          onChange={(event) => setDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          disabled={disabled}
          inputMode="numeric"
          maxLength={length}
          aria-label={`${labelPrefix} ${index + 1}`}
          className={cn(
            "min-w-0 border border-muted-foreground/30 text-center font-display font-semibold text-foreground outline-none transition-colors focus:border-brand focus:bg-background focus:ring-2 focus:ring-ring/30 disabled:opacity-40",
            // An empty box has to read as present-but-inactive on a white modal, which
            // border-input (#e5edf5) was too faint to do. The border is the same grey as the
            // modal's own helper text (--muted-foreground) at 30%, so it stays a light rule
            // rather than a heavy outline, and empty boxes carry a wash of --muted that clears
            // the moment the box is focused or filled.
            digit ? "bg-background" : "bg-muted/40",
            // "xl" — Figma node 190:269 ("Enter 4-digit OTP" boxes): 48px, 8px radius, no shadow.
            // Boxes stay 6 here (not Figma's 4) per the PRD/backend OTP length — see the isOtpComplete check above.
            size === "xl" && "size-12 rounded-[8px] text-lg shadow-none",
            size === "lg" && "h-11 w-full rounded-lg text-base shadow-xs",
            size === "sm" && "size-11 rounded-lg text-lg shadow-xs",
          )}
        />
      ))}
    </div>
  );
});
