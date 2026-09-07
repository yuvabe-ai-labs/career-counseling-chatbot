import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "@/components/Brand";
import { PromoPanel } from "@/components/PromoPanel";
import { getErrorMessage } from "@/lib/error-messages";
import { SignInForm } from "../components/SignInForm";
import { useSignInWithPassword } from "../hooks/useIdentity";
import { useCreateJourneySession } from "../hooks/useJourneySession";
import { useSession } from "../state/session-context";

/**
 * Sign-in — same left/right split shell as OnboardingPage (Figma "career" file node
 * 139:3935/139:3994), reused here for a returning user instead of a new one. Single screen, so
 * no StepIndicator (that only makes sense across OnboardingPage's two steps).
 *
 * On success this establishes the same session state OnboardingPage's password step does
 * (userId, email, a fresh journey session) and lands on the same /home Home/Dashboard page —
 * createJourneySession's anonymousSessionId is optional (see contracts/journey-session.ts) and
 * deliberately omitted here: a signed-in user has no pending anonymous session to merge.
 *
 * Also doubles as where an actual sign-out completes: AppHeader's account menu navigates here
 * with `state: { signedOut: true }` rather than calling session.reset() itself — see that
 * handler's own comment for why calling it any earlier races the previous (still-mounted)
 * guarded page's own redirect. By the time this effect runs, that page is already gone, so
 * clearing the session here can't trigger it.
 */
export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const signIn = useSignInWithPassword();
  const createJourneySession = useCreateJourneySession();

  useEffect(() => {
    if ((location.state as { signedOut?: boolean } | null)?.signedOut) {
      session.reset();
    }
    // Only ever act on the state this navigation arrived with, once, on mount — not on every
    // session/location identity change (session.reset() itself produces a new session object).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async ({ email, password }: { email: string; password: string }) => {
    try {
      const { userId } = await signIn.mutateAsync({ email, password });
      session.setUserId(userId);
      session.setEmail(email);

      const { session: journeySession } = await createJourneySession.mutateAsync({});
      session.setJourneySessionId(journeySession.id);

      void navigate("/home");
    } catch (error) {
      throw new Error(getErrorMessage(error, "We couldn't sign you in. Please try again."), {
        cause: error,
      });
    }
  };

  return (
    <main className="h-screen overflow-hidden bg-page">
      {/* Figma node 139:3935 — the left column sits one shade off the white "surface" cards
        inside it (see --card in index.css), same as OnboardingPage. */}
      <div className="h-full w-full bg-card">
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-2">
          <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="px-6 pt-6 sm:px-10 sm:pt-8 lg:px-14 lg:pt-14">
              <Brand />
            </div>

            <div className="min-h-0 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8 lg:px-14 lg:pt-4 lg:pb-4">
              <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl lg:text-[36px] lg:leading-[1.2]">
                Welcome back
              </h1>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Sign in with your email and password to continue.
              </p>

              <div className="mt-6 rounded-2xl border border-input bg-background p-6 sm:p-8">
                <SignInForm
                  onSubmit={handleSubmit}
                  submitting={signIn.isPending || createJourneySession.isPending}
                />
              </div>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link to="/" className="font-semibold text-brand hover:underline">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
          <div className="hidden min-h-0 lg:block">
            <PromoPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
