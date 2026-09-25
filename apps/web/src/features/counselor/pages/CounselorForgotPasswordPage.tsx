import { useNavigate } from "react-router-dom";
import { AuthFormCard } from "@/features/assessment/components/AuthFormCard";
import { AuthLayout } from "@/features/assessment/components/AuthLayout";
import { CounselorForgotPasswordForm } from "../components/CounselorForgotPasswordForm";

/**
 * Figma node 706:439 ("Forgot Password") — email + 4-digit OTP. On a verified code, the backend
 * has already issued a short-lived resetToken (see api/counselor-auth.ts); it's carried forward
 * as router state (never the URL — it's short-lived and single-use, but still not something to
 * leave sitting in browser history) to the "Create New Password" screen.
 */
export function CounselorForgotPasswordPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <AuthFormCard
        srHeading="Counsellor forgot password"
        title="Forgot Password?"
        description="Enter your registered email ID and we'll send you an OTP to reset your password."
      >
        <CounselorForgotPasswordForm
          onVerified={({ resetToken }) => {
            void navigate("/counselor/new-password", { state: { resetToken } });
          }}
        />
      </AuthFormCard>
    </AuthLayout>
  );
}
