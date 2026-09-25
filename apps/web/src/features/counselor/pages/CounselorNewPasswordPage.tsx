import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/error-messages";
import { AuthFormCard } from "@/features/assessment/components/AuthFormCard";
import { AuthLayout } from "@/features/assessment/components/AuthLayout";
import { CounselorNewPasswordForm } from "../components/CounselorNewPasswordForm";
import { useSetCounselorPassword } from "../hooks/useCounselorAuth";

/**
 * Figma node 706:520 ("Create New Password"). Reachable only by way of
 * CounselorForgotPasswordPage's onVerified navigation, which is the only place a resetToken
 * exists — a direct visit with no token bounces back to the start of that flow rather than
 * rendering a form with nothing to submit against.
 */
export function CounselorNewPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setPassword = useSetCounselorPassword();

  const resetToken = (location.state as { resetToken?: string } | null)?.resetToken;
  if (!resetToken) {
    return <Navigate to="/counselor/forgot-password" replace />;
  }

  const handleSubmit = async ({ newPassword }: { newPassword: string }) => {
    try {
      await setPassword.mutateAsync({ resetToken, newPassword });
      void navigate("/counselor/sign-in", { state: { passwordReset: true } });
    } catch (error) {
      throw new Error(getErrorMessage(error, "Could not set your new password. Please try again."), {
        cause: error,
      });
    }
  };

  return (
    <AuthLayout>
      <AuthFormCard
        srHeading="Create new counsellor password"
        title="Create New Password"
        description="Create a new password for your counsellor account."
      >
        <CounselorNewPasswordForm onSubmit={handleSubmit} submitting={setPassword.isPending} />
      </AuthFormCard>
    </AuthLayout>
  );
}
