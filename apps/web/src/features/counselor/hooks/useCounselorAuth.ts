import { useMutation } from "@tanstack/react-query";
import {
  requestCounselorPasswordResetOtp,
  setCounselorPassword,
  signInAsCounselor,
  verifyCounselorPasswordResetOtp,
} from "../api/counselor-auth";

export function useSignInAsCounselor() {
  return useMutation({ mutationFn: signInAsCounselor });
}

export function useRequestCounselorPasswordResetOtp() {
  return useMutation({ mutationFn: requestCounselorPasswordResetOtp });
}

export function useVerifyCounselorPasswordResetOtp() {
  return useMutation({ mutationFn: verifyCounselorPasswordResetOtp });
}

export function useSetCounselorPassword() {
  return useMutation({ mutationFn: setCounselorPassword });
}
