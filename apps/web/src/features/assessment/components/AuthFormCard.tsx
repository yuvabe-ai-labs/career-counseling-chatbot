import type { ReactNode } from "react";
import { StepIndicator } from "@/components/Brand";

/**
 * The one card design shared by every onboarding screen — Figma node 462:3037 ("form-card"):
 * 20px radius (--radius-2xl), 1px #e5edf5 border (--input) on white, with a title + optional
 * step dots header row.
 *
 * Only `children` changes between screens; the chrome around them never does. Each screen used
 * to build its own copy of this, which is how they drifted apart (guardian consent had a
 * centered icon header and a smaller type scale, sign-in had no header row at all).
 *
 * `srHeading` stays each screen's real page heading for the document outline and screen readers
 * even though it isn't shown — the visible title is a short label ("Signup"), not the heading.
 */
export function AuthFormCard({
  srHeading,
  title,
  description,
  step,
  totalSteps,
  children,
}: {
  srHeading: string;
  title: string;
  description?: string;
  step?: number;
  totalSteps?: number;
  children: ReactNode;
}) {
  return (
    // p-5 is equal on all four sides, and the height is whatever the contents need — the shell
    // centres the card, so a shorter state (sign-in) just gets more room around it rather than
    // a taller card with dead space inside it. See form-styles.ts for the rhythm.
    <div className="flex flex-col gap-5 rounded-2xl border border-input bg-background p-5">
      <h1 className="sr-only">{srHeading}</h1>

      {/* Figma node 462:3038 ("header-row") — title and step dots share one row. */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-2xl font-medium text-foreground sm:text-[32px] sm:leading-[1.2]">
          {title}
        </p>
        {step !== undefined && totalSteps !== undefined ? (
          <StepIndicator step={step} totalSteps={totalSteps} />
        ) : null}
      </div>

      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}

      {children}
    </div>
  );
}
