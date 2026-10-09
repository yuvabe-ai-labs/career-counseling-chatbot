import { GraduationCap, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useAdminSession } from "@/features/admin";
import { useSession } from "@/features/assessment";
import { useCounselorSession } from "@/features/counselor";

/**
 * Temporary, deliberately simple entry point — not a real marketing page. Its only job is to
 * get a visitor to the right next screen. One common card per audience — every user segment
 * (explorer/pathfinder/launcher: school through college/graduate — deriveSegment() sets
 * it automatically from the education-stage question during onboarding, it's never a
 * user-choosable entry point) and counsellor — rather than one card per segment, since all three
 * segment links led to the exact same sign-up flow anyway. "Aspirant" is used as the umbrella
 * label rather than "Student" — the launcher segment includes graduates, who aren't students,
 * and it avoids colliding with the "Explorer" segment name.
 * See docs/architecture/counselor-auth-landing-page-plan.md.
 *
 * Reuses AppHeader (the same header every other screen uses), rather than a bespoke header — this
 * page must not look like a different product. The cards are the only way in (no navbar links).
 *
 * The cards also resume: with a still-valid session (1-hour client-side timeout — see
 * SESSION_TIMEOUT_MS in lib/storage.ts, which clears an expired one on read) the Aspirant card
 * goes straight back to /home and the Counsellor card to /counselor/home, instead of the sign-up /
 * sign-in screens.
 */
export function LandingPage() {
  const session = useSession();
  const counselorSession = useCounselorSession();
  const adminSession = useAdminSession();
  const aspirantTo = session.userId && session.journeySessionId ? "/home" : "/sign-up";
  const counselorTo = counselorSession.userId ? "/counselor/home" : "/counselor/sign-in";
  const adminTo = adminSession.userId ? "/admin/home" : "/admin/sign-in";

  return (
    <main className="flex min-h-screen flex-col bg-[#ece9f7]">
      <AppHeader />

      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-12 text-center">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Find your path with <span className="text-brand">yuvaPath</span>
          </h1>
          <p className="text-base text-muted-foreground">
            Wherever you are in your journey — just starting out, narrowing down, or ready to
            take the next step — sign up to get personalised career guidance.
          </p>
        </div>

        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to={aspirantTo}
            className="flex flex-col items-center gap-3 rounded-2xl border border-input bg-background p-8 shadow-xs transition-colors hover:border-brand"
          >
            <GraduationCap className="size-9 text-brand" aria-hidden="true" />
            <span className="font-display text-lg font-semibold text-foreground">Aspirant</span>
            <span className="text-sm text-muted-foreground">
              Get personalised career guidance, wherever you are in your journey
            </span>
          </Link>
          <Link
            to={counselorTo}
            className="flex flex-col items-center gap-3 rounded-2xl border border-input bg-background p-8 shadow-xs transition-colors hover:border-brand"
          >
            <UserRound className="size-9 text-brand" aria-hidden="true" />
            <span className="font-display text-lg font-semibold text-foreground">Counsellor</span>
            <span className="text-sm text-muted-foreground">
              Sign in to access the counsellor dashboard
            </span>
          </Link>
          <Link
            to={adminTo}
            className="flex flex-col items-center gap-3 rounded-2xl border border-input bg-background p-8 shadow-xs transition-colors hover:border-brand"
          >
            <ShieldCheck className="size-9 text-brand" aria-hidden="true" />
            <span className="font-display text-lg font-semibold text-foreground">Regional Admin</span>
            <span className="text-sm text-muted-foreground">
              Sign in to manage colleges and financial aid for your region
            </span>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/sign-in" className="font-semibold text-brand hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}
