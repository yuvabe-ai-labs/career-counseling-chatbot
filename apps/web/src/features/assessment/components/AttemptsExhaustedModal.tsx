import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEscapeKey } from "@/lib/use-escape-key";

export interface AttemptsExhaustedModalProps {
  /** Close (button, Escape, or Enter) always does the same thing here — restart registration
   * from Step 1 — there's nothing else this modal offers, so no separate onClose is needed. */
  onRestart: () => void;
}

/**
 * Shown once the guardian has used all 3 OTP resend attempts and still hasn't verified — there's
 * no way forward for this verification attempt, so the only exit is starting registration over.
 * Escape and Enter both do exactly what the Close button does; nothing else on the page should
 * react to either key while this is open (see the effect below, which traps them).
 */
export function AttemptsExhaustedModal({ onRestart }: AttemptsExhaustedModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onRestart);

  // Focus the dialog container itself, not the Close button — a focused native <button> reacts
  // to Enter on its own (triggers a click), which would fire onRestart a second time alongside
  // the keydown listener below. Focusing a plain, non-interactive element sidesteps that so this
  // listener stays the single source of truth for both Enter and Escape while this is open.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Enter has no text field to submit here — a direct, modal-scoped keydown listener (rather
  // than a <form>) is the simplest correct way to make it do the same thing as Close, without
  // also letting it reach a button on the page underneath.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onRestart();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onRestart]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="attempts-exhausted-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,27,75,0.15)] p-6 backdrop-blur-[4px]"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="flex w-full max-w-[420px] animate-in flex-col items-center gap-4 rounded-[28px] border border-input bg-background px-8 py-8 text-center fade-in shadow-card zoom-in-95 outline-none duration-200"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        </span>
        <h2
          id="attempts-exhausted-heading"
          className="font-display text-xl leading-[26px] font-bold tracking-[-0.2px] text-foreground"
        >
          No more resend attempts
        </h2>
        <p className="font-display text-sm leading-5 text-muted-foreground">
          You have used all available OTP resend attempts. Please try again later.
        </p>
        <Button
          type="button"
          onClick={onRestart}
          className="h-[49px] w-full rounded-2xl text-xl font-bold shadow-none"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
