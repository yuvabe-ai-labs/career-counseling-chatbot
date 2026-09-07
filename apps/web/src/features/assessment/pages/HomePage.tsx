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
    <main className="bg-hero-gradient flex min-h-screen flex-col">
      <AppHeader />
      {/* Equal padding on every side (was px-6 py-10 sm:px-8 sm:py-14 lg:py-[56px] — vertical
          padding grew past horizontal at each breakpoint, e.g. 56px top/bottom vs 32px sides at
          lg), which also reads as excess space above the card once centered in the remaining
          viewport height. p-6/sm:p-8 keeps horizontal spacing unchanged and brings vertical
          down to match it, so the section sits closer to center with uniform space all around. */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-0">
        {/* No border/background here (previously `rounded-[27px] border border-border`) — with
            no fill of its own, that border still read as a boxed white card sitting on top of
            main's own diagonal gradient. Removed so the hero content sits directly on the
            gradient instead. */}
        <div className="grid w-full max-w-[1260px] animate-in grid-cols-1 items-center gap-10 p-8 fade-in duration-300 sm:p-12 lg:min-h-[751px] lg:grid-cols-2 lg:gap-16 lg:p-[64px]">
          <div className="flex flex-col items-start gap-8 sm:gap-10 lg:max-w-[560px]">
            <div className="flex flex-col items-start gap-4 sm:gap-6">
              <h1 className="font-display text-4xl leading-[1.15] font-semibold text-foreground sm:text-5xl lg:text-[64px]">
                Find Your <span className="text-brand">Path!</span>
              </h1>
              <p className="font-display text-lg font-medium text-foreground sm:text-2xl">
                Not sure which career is right for you?
              </p>
              <p className="font-display text-lg text-foreground sm:text-2xl">
                Discover your strengths, interests, and career path.
              </p>
            </div>
            <Button
              onClick={() => void navigate("/intake-questions")}
              className="h-[49px] w-[126px] rounded-2xl text-xl font-bold shadow-none"
            >
              Explore
            </Button>
          </div>
          <div className="flex justify-center lg:justify-end">
            <img
              src={heroIllustration}
              alt="Student sitting cross-legged with a laptop, books, a plant, and a backpack, with a graduation cap floating above her"
              className="w-full max-w-[420px] object-contain lg:max-w-[565px]"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
