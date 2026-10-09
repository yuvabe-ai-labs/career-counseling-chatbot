import { useNavigate } from "react-router-dom";
import { AuthFormCard } from "@/features/assessment/components/AuthFormCard";
import { AuthLayout } from "@/features/assessment/components/AuthLayout";
import { CounselorForgotPasswordForm } from "@/features/counselor/components/CounselorForgotPasswordForm";

/** Email + OTP, then on to "Create New Password" with the issued resetToken in router state. */
export function AdminForgotPasswordPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <AuthFormCard
        srHeading="Regional admin forgot password"
        title="Forgot Password?"
        description="Enter your registered email ID and we'll send you an OTP to reset your password."
      >
        <CounselorForgotPasswordForm
          role="admin"
          onVerified={({ resetToken }) => {
            void navigate("/admin/new-password", { state: { resetToken } });
          }}
        />
      </AuthFormCard>
    </AuthLayout>
  );
}
