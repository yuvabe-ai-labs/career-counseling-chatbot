import { Fragment } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/assessment";

/**
 * Wordmark — text mark replacing the earlier "yuvabe Studios" logo image (Figma node 139:3937,
 * the "yuvabe", not the app's own name). Reads as one continuous "yuvaNext", split into "yuva"
 * (brand violet, --color-brand) and "Next" (the app's standard near-black heading color,
 * --color-foreground) per the rebrand.
 *
 * Only a home link when there's a logged-in session (AppHeader, post-auth pages) — it then
 * points at "/home", not "/", since "/" is the signed-out onboarding screen and a logged-in
 * user clicking the logo shouldn't be dropped back into signup. Pre-auth (SignInPage,
 * OnboardingPage, GuardianConsentPage all render Brand directly with no session yet), the
 * wordmark is inert — plain text, not a link — so clicking it does nothing.
 */
export function Brand() {
  const session = useSession();
  const isLoggedIn = Boolean(session.userId && session.journeySessionId);

  const wordmark = (
    <>
      <span className="text-brand">yuva</span>
      <span className="text-foreground">Path</span>
    </>
  );

  if (!isLoggedIn) {
    return (
      <span className="inline-flex w-fit shrink-0 items-baseline font-display text-2xl font-bold tracking-tight sm:text-[28px]">
        {wordmark}
      </span>
    );
  }

  return (
    <Link
      to="/home"
      aria-label="yuvaNext home"
      className="inline-flex w-fit shrink-0 items-baseline font-display text-2xl font-bold tracking-tight sm:text-[28px]"
    >
      {wordmark}
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
