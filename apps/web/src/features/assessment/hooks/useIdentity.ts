import { useMutation } from "@tanstack/react-query";
import {
  checkEmailAvailability,
  requestAnonymousSession,
  signInWithPassword,
  signUpWithPassword,
} from "../api/identity";

export function useRequestAnonymousSession() {
  return useMutation({ mutationFn: requestAnonymousSession });
}

export function useCheckEmailAvailability() {
  return useMutation({ mutationFn: checkEmailAvailability });
}

export function useSignUpWithPassword() {
  return useMutation({ mutationFn: signUpWithPassword });
}

export function useSignInWithPassword() {
  return useMutation({ mutationFn: signInWithPassword });
}
