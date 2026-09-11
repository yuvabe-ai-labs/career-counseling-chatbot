import { Navigate, useNavigate } from "react-router-dom";
import heroIllustration from "@/assets/hero-illustration.png";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useSession } from "../state/session-context";

/**
 * Home/Dashboard — Figma "career" file node 346:24 ("home"). The landing page after a
 * successful Sign Up or Sign In (OnboardingPage.tsx / SignInPage.tsx both `navigate("/home")`).
 *
 * Deliberately static/presentational: the Figma design carries no per-user copy (no "Welcome,
 * {name}" section, no segment badge) — just the hero card and a single Explore CTA — so there's
 * nothing here to invent beyond what's designed. Explore itself doesn't need the student's
 * segment client-side either: it navigates to /intake-questions, and that screen's own
 * GET .../intake/questions call re-derives the segment from the authenticated profile
 * server-side (see IntakeService.getQuestions, packages/assessment) — the existing
 * x-yuvanext-user-id + journeySessionId auth model already establishes who's asking, so this
 * page never re-fetches or re-computes the segment itself.
 */
export function HomePage() {
  const navigate = useNavigate();
  const session = useSession();

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }

  return (
    // bg-auth-hero-gradient is the same fill the sign-in/sign-up hero-card uses (index.css) —
    // shared rather than a second lookalike gradient, so home and the auth screens read as one
    // system. Only the gradient is borrowed: there's no card, border or panel here, the hero
    // sits straight on the background.
    //
    // h-screen + overflow-hidden only from lg up: the hero is sized to fit a desktop viewport
    // (see below), so there's nothing to scroll there. Below lg the two columns stack and
    // genuinely need more room than a short screen has, so it stays a normal scrolling page
    // rather than clipping the illustration off the bottom.
    <main className="bg-auth-hero-gradient flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <AppHeader />
      {/* What used to force the scrollbar was lg:min-h-[751px] on the grid below plus its own
          64px padding — 879px of hero under an 84px header, against a ~744px viewport. The
          minimum is gone and the grid now takes the height that's actually left (lg:h-full),
          so the composition scales to the viewport instead of overrunning it. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8 sm:px-8">
        {/* The text column is minmax(0,max-content) rather than an equal half, so it sizes to
            the copy's own longest line instead of always claiming 560px. Equal columns were the
            last source of dead centre width: the block is capped at 560 but its longest line is
            shorter than that, and the difference sat between the text and the illustration.
            max-content is clamped by the block's own lg:max-w-[560px], so this can never widen
            the column past today's value and no line can re-wrap — worst case it behaves exactly
            as before. minmax(0,…) on both tracks keeps them able to shrink, and justify-center
            keeps the pair centred rather than letting spare width inflate the text track again.

            For contrast, this started at the auth card's 1260 with gap-16: columns of 598 against
            contents of 560 and 565, each pushed to its *outer* edge (items-start left,
            justify-end right), which pooled ~38 + 64 + ~33 ≈ 135px in the centre. */}
        <div className="grid w-full max-w-[1148px] animate-in grid-cols-1 items-center gap-10 fade-in duration-300 lg:h-full lg:grid-cols-[minmax(0,max-content)_minmax(0,565px)] lg:justify-center lg:gap-5">
          <div className="flex flex-col items-start gap-8 lg:max-w-[560px]">
            <div className="flex flex-col items-start gap-4">
              <h1 className="font-display text-3xl leading-[1.15] font-semibold text-foreground sm:text-4xl lg:text-[52px]">
                Find Your <span className="text-brand">Path!</span>
              </h1>
              <p className="font-display text-base font-medium text-foreground sm:text-xl">
                Not sure which career is right for you?
              </p>
              <p className="font-display text-base text-foreground sm:text-xl">
                Discover your strengths, interests, and career path.
              </p>
            </div>
            <Button onClick={() => void navigate("/intake-questions")} className="w-[126px]">
              Explore
            </Button>
          </div>
          {/* justify-start, not justify-end: any slack in this column now falls on the outer
              edge rather than between the illustration and the text, which is what kept the two
              halves apart. min-h-0 + max-h-full lets the illustration scale down on a short
              viewport instead of pushing the hero past the fold; it still holds its 565px
              design width whenever there's room for it. */}
          <div className="flex min-h-0 justify-center lg:justify-start">
            <img
              src={heroIllustration}
              alt="Student sitting cross-legged with a laptop, books, a plant, and a backpack, with a graduation cap floating above her"
              className="max-h-full w-full max-w-[420px] object-contain lg:max-w-[565px]"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
