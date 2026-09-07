import { Link } from "react-router-dom";

/**
 * Wordmark — text mark replacing the earlier "yuvabe Studios" logo image (Figma node 139:3937,
 * the "yuvabe", not the app's own name). Reads as one continuous "yuvaNext", split into "yuva"
 * (brand violet, --color-brand) and "Next" (the app's standard near-black heading color,
 * --color-foreground) per the rebrand.
 *
 * Wrapped in a Link to "/" (the app's root/onboarding screen) so the wordmark also serves as a
 * home link everywhere it appears — AppHeader (post-auth pages) and every pre-auth screen that
 * renders Brand directly.
 */
export function Brand() {
  return (
    <Link
      to="/"
      aria-label="yuvaNext home"
      className="inline-flex w-fit shrink-0 items-baseline font-display text-2xl font-bold tracking-tight sm:text-[28px]"
    >
      <span className="text-brand">yuva</span>
      <span className="text-foreground">Next</span>
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
