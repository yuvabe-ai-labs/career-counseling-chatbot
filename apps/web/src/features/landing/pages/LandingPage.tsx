import { ArrowRight, Blocks, MessageCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import heroIllustration from "@/assets/hero-illustration.png";
import { AppHeader } from "@/components/AppHeader";
import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/features/assessment";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: MessageCircle,
    title: "Chat with your guide",
    text: "Talk or type about yourself, your studies and what matters to you, in your own language.",
  },
  {
    icon: Blocks,
    title: "Try quick activities",
    text: "Say what you'd enjoy, solve a few everyday puzzles and tell us how you like to work.",
  },
  {
    icon: Sparkles,
    title: "See your career fields",
    text: "Get the fields of work that fit you best, with jobs at every level and ways to get in.",
  },
] as const;

/**
 * "/": the front door for students in Classes 9–12. One call to action: start (or, with a live
 * session, continue) the journey; returning students sign in.
 */
export function LandingPage() {
  const session = useSession();
  const signedIn = Boolean(session.userId && session.journeySessionId);

  return (
    <main className="bg-auth-hero-gradient flex min-h-screen flex-col">
      <AppHeader />

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-16">
        <div className="flex animate-in flex-col gap-6 duration-500 fade-in">
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
            For students in Classes 9 to 12
          </span>
          <h1 className="font-display text-4xl leading-tight font-bold text-foreground sm:text-5xl">
            Discover the career fields that <span className="text-brand">fit you</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            A friendly chat and a few quick activities show you which fields of work match your
            interests, strengths and way of working. It's free and there are no wrong answers.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to={signedIn ? "/home" : "/sign-up"}
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              {signedIn ? "Continue where you left off" : "Get started"} <ArrowRight />
            </Link>
            {!signedIn && (
              <Link
                to="/sign-in"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "w-full sm:w-auto",
                )}
              >
                I already have an account
              </Link>
            )}
          </div>
        </div>

        <img
          src={heroIllustration}
          alt=""
          className="mx-auto hidden w-full max-w-md animate-in duration-700 fade-in lg:block"
        />
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-14 sm:px-8">
        <h2 className="mb-6 font-display text-2xl font-semibold text-foreground">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 rounded-[1.2rem] border border-border bg-background p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <step.icon className="size-5" />
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  Step {index + 1}
                </span>
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
