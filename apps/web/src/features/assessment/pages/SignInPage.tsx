import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/error-messages";
import { AuthFormCard } from "../components/AuthFormCard";
import { AuthLayout } from "../components/AuthLayout";
import { SignInForm } from "../components/SignInForm";
import { useSignInWithPassword } from "../hooks/useIdentity";
import { useCreateJourneySession } from "../hooks/useJourneySession";
import { useSession } from "../state/session-context";

/**
 * Sign-in — same floating hero-card shell as OnboardingPage (Figma "career" file node
 * 462:3028), reused here for a returning user instead of a new one. Single screen, so no
 * StepIndicator (that only makes sense across OnboardingPage's two steps) and no header row
 * of its own — AppHeader already supplies the one logo both pages need.
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
    // No step dots — there's only one sign-in screen, so there's no progression to show.
    <AuthLayout>
      <AuthFormCard srHeading="Welcome back" title="Sign In" description="">
        <SignInForm
          onSubmit={handleSubmit}
          submitting={signIn.isPending || createJourneySession.isPending}
        />
      </AuthFormCard>
    </AuthLayout>
  );
}
