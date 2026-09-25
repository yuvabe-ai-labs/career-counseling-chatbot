import { Navigate, useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/error-messages";
import { AuthFormCard } from "@/features/assessment/components/AuthFormCard";
import { AuthLayout } from "@/features/assessment/components/AuthLayout";
import { CounselorSignInForm } from "../components/CounselorSignInForm";
import { useSignInAsCounselor } from "../hooks/useCounselorAuth";
import { useCounselorSession } from "../state/counselor-session-context";

/**
 * Figma node 699:1111 ("Counsellor Login") — same AuthLayout/AuthFormCard shell every student
 * auth screen uses (wordmark header, hero card, illustration panel), so this reads as one more
 * screen in the same app rather than a visually distinct "counselor product."
 */
export function CounselorSignInPage() {
  const navigate = useNavigate();
  const counselorSession = useCounselorSession();
  const signIn = useSignInAsCounselor();

  // A genuinely signed-in counselor landing back on this screen (stale tab, back button, typing
  // the URL) shouldn't see a fresh sign-in form with a header that confusingly shows their
  // account/Sign out — send them to their dashboard instead. No signedOut-style race to guard
  // against here, unlike the student SignInPage: CounselorHomePage's own sign-out resets the
  // session synchronously before navigating, not on this page's mount.
  if (counselorSession.userId) {
    return <Navigate to="/counselor/home" replace />;
  }

  const handleSubmit = async ({ email, password }: { email: string; password: string }) => {
    try {
      const result = await signIn.mutateAsync({ email, password });

      // The password just verified was a temporary one (scripts/create-counselor.ts) — sign-in
      // doesn't complete. Same "Create New Password" screen the OTP forgot-password flow uses,
      // reusing its resetToken; that screen already redirects back here on success, so signing
      // in again afterward (with the password they just chose) is what actually completes it.
      if (result.requiresPasswordReset) {
        void navigate("/counselor/new-password", { state: { resetToken: result.resetToken } });
        return;
      }

      counselorSession.setUserId(result.userId);
      counselorSession.setDisplayName(result.displayName);
      void navigate("/counselor/home");
    } catch (error) {
      throw new Error(getErrorMessage(error, "We couldn't sign you in. Please try again."), {
        cause: error,
      });
    }
  };

  return (
    <AuthLayout>
      <AuthFormCard
        srHeading="Counsellor login"
        title="Counsellor Login"
        description="Sign in to access the counsellor dashboard."
      >
        <CounselorSignInForm onSubmit={handleSubmit} submitting={signIn.isPending} />
      </AuthFormCard>
    </AuthLayout>
  );
}
