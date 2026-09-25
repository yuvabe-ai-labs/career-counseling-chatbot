/**
 * The main card the post-assessment flow screens sit in — RIASEC results, then Explore Path,
 * which opens straight off that screen's button. Extracted so the two can't drift: they're
 * consecutive steps and any difference in width, radius, fill or padding reads as a page change
 * rather than a step forward.
 *
 * Width (1260) and the lg padding (46px) match the sign-in/sign-up hero-card (AuthLayout.tsx) —
 * that card is this app's other large gradient-card shell, so the two now share one footprint
 * instead of the sign-in card reading wider/roomier for no reason. 27px radius and the
 * bg-hero-gradient fill still come from the results screen. The border is left to each screen:
 * results only frames itself once there's a result to show, while Explore Path is always framed.
 */
export const flowCardClass =
  "bg-hero-gradient w-full max-w-[1260px] animate-in rounded-[27px] p-6 fade-in duration-300 sm:p-8 lg:p-[46px]";

/** The band the card sits in — centres it under the header with equal breathing room. */
export const flowCardBandClass =
  "flex min-h-0 flex-1 items-center justify-center px-6 py-6 sm:px-8";
