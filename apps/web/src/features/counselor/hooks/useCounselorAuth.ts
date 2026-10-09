import { useMutation } from "@tanstack/react-query";
import type {
  CounselorSignInRequest,
  RequestCounselorPasswordResetOtpRequest,
  SetCounselorPasswordRequest,
  VerifyCounselorPasswordResetOtpRequest,
} from "@yuvapath/contracts";
import {
  requestCounselorPasswordResetOtp,
  setCounselorPassword,
  signInAsCounselor,
  verifyCounselorPasswordResetOtp,
  type StaffAuthRole,
} from "../api/counselor-auth";

// `role` defaults to the counselor flow; the regional admin passes "admin" to hit /admin/auth/*.
export function useSignInAsCounselor(role: StaffAuthRole = "counselor") {
  return useMutation({ mutationFn: (input: CounselorSignInRequest) => signInAsCounselor(input, role) });
}

export function useRequestCounselorPasswordResetOtp(role: StaffAuthRole = "counselor") {
  return useMutation({
    mutationFn: (input: RequestCounselorPasswordResetOtpRequest) =>
      requestCounselorPasswordResetOtp(input, role),
  });
}

export function useVerifyCounselorPasswordResetOtp(role: StaffAuthRole = "counselor") {
  return useMutation({
    mutationFn: (input: VerifyCounselorPasswordResetOtpRequest) =>
      verifyCounselorPasswordResetOtp(input, role),
  });
}

export function useSetCounselorPassword(role: StaffAuthRole = "counselor") {
  return useMutation({ mutationFn: (input: SetCounselorPasswordRequest) => setCounselorPassword(input, role) });
}
