import { Navigate, useNavigate } from "react-router-dom";
import { AuthFormCard } from "@/features/assessment/components/AuthFormCard";
import { AuthLayout } from "@/features/assessment/components/AuthLayout";
import { CounselorSignInForm } from "@/features/counselor/components/CounselorSignInForm";
import { useSignInAsCounselor } from "@/features/counselor/hooks/useCounselorAuth";
import { getErrorMessage } from "@/lib/error-messages";
import { useAdminSession } from "../state/admin-session-context";

/**
 * Regional admin sign-in — the counselor sign-in screen and API flow (shared shell, shared form),
 * pointed at /api/v1/admin/auth/* so only an active `regional_admin` account gets through.
 */
export function AdminSignInPage() {
  const navigate = useNavigate();
  const adminSession = useAdminSession();
  const signIn = useSignInAsCounselor("admin");

  if (adminSession.userId) {
    return <Navigate to="/admin/home" replace />;
  }

  const handleSubmit = async ({ email, password }: { email: string; password: string }) => {
    try {
      const result = await signIn.mutateAsync({ email, password });

      // A script-set temporary password: sign-in doesn't complete until they choose their own,
      // exactly as for counselors (same resetToken mechanism, same "Create New Password" screen).
      if (result.requiresPasswordReset) {
        void navigate("/admin/new-password", { state: { resetToken: result.resetToken } });
        return;
      }

      adminSession.signIn(result.userId, result.displayName);
      void navigate("/admin/home");
    } catch (error) {
      throw new Error(getErrorMessage(error, "We couldn't sign you in. Please try again."), {
        cause: error,
      });
    }
  };

  return (
    <AuthLayout>
      <AuthFormCard
        srHeading="Regional admin login"
        title="Regional Admin Login"
        description="Sign in to manage colleges and financial aid for your region."
      >
        <CounselorSignInForm
          onSubmit={handleSubmit}
          submitting={signIn.isPending}
          forgotPasswordPath="/admin/forgot-password"
        />
      </AuthFormCard>
    </AuthLayout>
  );
}
