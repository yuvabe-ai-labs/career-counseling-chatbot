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

/** POST /api/v1/counselor/auth/signin */
export function signInAsCounselor(input: CounselorSignInRequest) {
  CounselorSignInRequestSchema.parse(input);
  return apiRequest("/api/v1/counselor/auth/signin", CounselorSignInResponseSchema, {
    method: "POST",
    body: input,
    auth: false,
  });
}

/** POST /api/v1/counselor/auth/forgot-password/request-otp — also used for "Resend OTP". */
export function requestCounselorPasswordResetOtp(input: RequestCounselorPasswordResetOtpRequest) {
  RequestCounselorPasswordResetOtpRequestSchema.parse(input);
  return apiRequest(
    "/api/v1/counselor/auth/forgot-password/request-otp",
    RequestCounselorPasswordResetOtpResponseSchema,
    { method: "POST", body: input, auth: false },
  );
}

/** POST /api/v1/counselor/auth/forgot-password/verify-otp */
export function verifyCounselorPasswordResetOtp(input: VerifyCounselorPasswordResetOtpRequest) {
  VerifyCounselorPasswordResetOtpRequestSchema.parse(input);
  return apiRequest(
    "/api/v1/counselor/auth/forgot-password/verify-otp",
    VerifyCounselorPasswordResetOtpResponseSchema,
    { method: "POST", body: input, auth: false },
  );
}

/** POST /api/v1/counselor/auth/forgot-password/set-password */
export function setCounselorPassword(input: SetCounselorPasswordRequest) {
  SetCounselorPasswordRequestSchema.parse(input);
  return apiRequest(
    "/api/v1/counselor/auth/forgot-password/set-password",
    SetCounselorPasswordResponseSchema,
    { method: "POST", body: input, auth: false },
  );
}
