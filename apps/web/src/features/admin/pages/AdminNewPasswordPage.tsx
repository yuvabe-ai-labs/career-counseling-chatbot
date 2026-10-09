import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthFormCard } from "@/features/assessment/components/AuthFormCard";
import { AuthLayout } from "@/features/assessment/components/AuthLayout";
import { CounselorNewPasswordForm } from "@/features/counselor/components/CounselorNewPasswordForm";
import { useSetCounselorPassword } from "@/features/counselor/hooks/useCounselorAuth";
import { getErrorMessage } from "@/lib/error-messages";

/** Reachable only with a resetToken (from the OTP flow or a forced first-login reset). */
export function AdminNewPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setPassword = useSetCounselorPassword("admin");

  const resetToken = (location.state as { resetToken?: string } | null)?.resetToken;
  if (!resetToken) {
    return <Navigate to="/admin/forgot-password" replace />;
  }

  const handleSubmit = async ({ newPassword }: { newPassword: string }) => {
    try {
      await setPassword.mutateAsync({ resetToken, newPassword });
      void navigate("/admin/sign-in", { state: { passwordReset: true } });
    } catch (error) {
      throw new Error(getErrorMessage(error, "Could not set your new password. Please try again."), {
        cause: error,
      });
    }
  };

  return (
    <AuthLayout>
      <AuthFormCard
        srHeading="Create new regional admin password"
        title="Create New Password"
        description="Create a new password for your regional admin account."
      >
        <CounselorNewPasswordForm onSubmit={handleSubmit} submitting={setPassword.isPending} />
      </AuthFormCard>
    </AuthLayout>
  );
}
