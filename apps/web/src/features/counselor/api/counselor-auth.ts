import {
  CounselorSignInRequestSchema,
  CounselorSignInResponseSchema,
  RequestCounselorPasswordResetOtpRequestSchema,
  RequestCounselorPasswordResetOtpResponseSchema,
  SetCounselorPasswordRequestSchema,
  SetCounselorPasswordResponseSchema,
  VerifyCounselorPasswordResetOtpRequestSchema,
  VerifyCounselorPasswordResetOtpResponseSchema,
  type CounselorSignInRequest,
  type RequestCounselorPasswordResetOtpRequest,
  type SetCounselorPasswordRequest,
  type VerifyCounselorPasswordResetOtpRequest,
} from "@yuvapath/contracts";
import { apiRequest } from "@/lib/api-client";

/** The regional admin signs in through the very same flow, under /api/v1/admin/auth/*. */
export type StaffAuthRole = "counselor" | "admin";
const authPath = (role: StaffAuthRole, suffix: string) => `/api/v1/${role}/auth/${suffix}`;

/** POST /api/v1/counselor/auth/signin */
export function signInAsCounselor(input: CounselorSignInRequest, role: StaffAuthRole = "counselor") {
  CounselorSignInRequestSchema.parse(input);
  return apiRequest(authPath(role, "signin"), CounselorSignInResponseSchema, {
    method: "POST",
    body: input,
    auth: false,
  });
}

/** POST /api/v1/counselor/auth/forgot-password/request-otp — also used for "Resend OTP". */
export function requestCounselorPasswordResetOtp(
  input: RequestCounselorPasswordResetOtpRequest,
  role: StaffAuthRole = "counselor",
) {
  RequestCounselorPasswordResetOtpRequestSchema.parse(input);
  return apiRequest(
    authPath(role, "forgot-password/request-otp"),
    RequestCounselorPasswordResetOtpResponseSchema,
    { method: "POST", body: input, auth: false },
  );
}

/** POST /api/v1/counselor/auth/forgot-password/verify-otp */
export function verifyCounselorPasswordResetOtp(
  input: VerifyCounselorPasswordResetOtpRequest,
  role: StaffAuthRole = "counselor",
) {
  VerifyCounselorPasswordResetOtpRequestSchema.parse(input);
  return apiRequest(
    authPath(role, "forgot-password/verify-otp"),
    VerifyCounselorPasswordResetOtpResponseSchema,
    { method: "POST", body: input, auth: false },
  );
}

/** POST /api/v1/counselor/auth/forgot-password/set-password */
export function setCounselorPassword(input: SetCounselorPasswordRequest, role: StaffAuthRole = "counselor") {
  SetCounselorPasswordRequestSchema.parse(input);
  return apiRequest(
    authPath(role, "forgot-password/set-password"),
    SetCounselorPasswordResponseSchema,
    { method: "POST", body: input, auth: false },
  );
}
