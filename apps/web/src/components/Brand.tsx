import { Fragment } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Wordmark — text mark replacing the earlier "yuvabe Studios" logo image (Figma node 139:3937,
 * the "yuvabe", not the app's own name). Reads as one continuous "yuvaPath", split into "yuva"
 * (brand violet, --color-brand) and "Path" (the app's standard near-black heading color,
 * --color-foreground) per the rebrand.
 *
 * Always a link to the landing page ("/"), for everyone — signed out, signed-in aspirant or
 * counsellor. The landing page is where a signed-in visitor resumes (its Aspirant/Counsellor
 * cards go straight back into the app while the session is still valid), so the wordmark never
 * drops anyone into a signup screen and never needs to know which kind of session there is.
 */
export function Brand() {
  return (
    <Link
      to="/"
      aria-label="yuvaPath home"
      className="inline-flex w-fit shrink-0 items-baseline font-display text-2xl font-bold tracking-tight sm:text-[28px]"
    >
      <span className="text-brand">yuva</span>
      <span className="text-foreground">Path</span>
    </Link>
  );
}

/**
 * Step dots — Figma node 462:3040 ("step-pill"), sitting to the right of the form-card's
 * "Signup" title rather than up in the page header (where the earlier "Step X of Y" text pill
 * lived): a 32px filled brand circle for the current step, a 48×2 connector, then a white
 * circle carrying brand-colored text for every other step.
 *
 * The circles are aria-hidden and the whole run carries one label instead, so a screen reader
 * announces "Step 1 of 2" rather than reading out a bare "1 2".
 */
export function StepIndicator({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <span
      className="flex h-8 shrink-0 items-center gap-2"
      role="img"
      aria-label={`Step ${step} of ${totalSteps}`}
    >
      {Array.from({ length: totalSteps }, (_, index) => index + 1).map((position) => (
        <Fragment key={position}>
          {position > 1 ? (
            <span className="h-0.5 w-12 shrink-0 bg-[#1a1a1a]" aria-hidden="true" />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
              position === step ? "bg-brand text-brand-foreground" : "bg-background text-brand",
            )}
          >
            {position}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
