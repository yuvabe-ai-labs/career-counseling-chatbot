import heroIllustration from "@/assets/hero-illustration.png";

/**
 * The auth card's illustration column — Figma node 462:3035, a 565×530 image sitting directly
 * on the hero-card's own gradient. Desktop only, shared between OnboardingPage and SignInPage.
 *
 * Deliberately image-only: the frame carries no heading or tagline on this side (the earlier
 * "Your path starts with you." copy and the tinted --panel background it sat on are both gone),
 * so the form column is the only thing competing for attention.
 */
export function PromoPanel() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <img
        src={heroIllustration}
        alt="Student sitting cross-legged with a laptop, books, a plant, and a backpack, with a graduation cap floating above her"
        className="max-h-full w-full max-w-[565px] object-contain"
      />
    </div>
  );
}
