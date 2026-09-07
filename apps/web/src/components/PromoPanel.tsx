import careerIllustration from "@/assets/career-illustration.png";

/**
 * Decorative side panel — Figma "career" file node 139:3994 ("right-column"). Desktop only,
 * shared between OnboardingPage and SignInPage (both use the same fixed-width left column).
 */
export function PromoPanel() {
  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden bg-panel px-6 pt-8 pb-0 sm:px-10 lg:px-14 lg:pt-[110px]">
      <div className="flex flex-col items-start gap-4 lg:max-w-[488px]">
        <h2 className="font-display text-4xl leading-[1.2] font-bold text-panel-foreground lg:text-[64px]">
          Your path
          <br />
          starts with <span className="text-brand">you.</span>
        </h2>
        <span className="h-[9px] w-[103px] shrink-0 bg-highlight" aria-hidden="true" />
        <p className="font-display text-base leading-[1.6] text-muted-foreground lg:max-w-[244px] lg:text-[22px]">
          Explore your interests.
          <br />
          Discover your options.
          <br />
          Build a future you&apos;ll
          <br />
          be proud of.
        </p>
      </div>

      <div className="relative z-0 mt-2 flex min-h-0 flex-1 items-end justify-center">
        <img
          src={careerIllustration}
          alt="Student sitting with a laptop, surrounded by books and career-path signposts"
          className="absolute inset-0 size-full object-contain object-right-bottom"
        />
      </div>
    </aside>
  );
}
