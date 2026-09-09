import { Link } from "react-router-dom";
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

/** "Step X of Y" pill — Figma node 139:3938, right of the header logo. */
export function StepIndicator({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <span className="shrink-0 rounded-[14px] bg-background px-3 py-2 font-display text-sm text-muted-foreground">
      Step {step} of {totalSteps}
    </span>
  );
}
