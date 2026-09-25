import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  clearStoredCounselorDisplayName,
  clearStoredCounselorUserId,
  getStoredCounselorDisplayName,
  getStoredCounselorUserId,
  setStoredCounselorDisplayName,
  setStoredCounselorUserId,
} from "@/lib/storage";

interface CounselorSessionState {
  userId: string | null;
  /** operations.staff_profiles.display_name, captured at sign-in — see CounselorSignInResponseSchema.
   *  Used for the account-avatar initials (AppHeader). */
  displayName: string | null;
}

interface CounselorSessionContextValue extends CounselorSessionState {
  setUserId: (userId: string) => void;
  setDisplayName: (displayName: string) => void;
  reset: () => void;
}

const CounselorSessionContext = createContext<CounselorSessionContextValue | undefined>(undefined);

/**
 * Deliberately its own provider/context, not a reuse of the student SessionProvider — a
 * counselor's identity must never be readable from (or confusable with) student session state.
 * See lib/storage.ts's COUNSELOR_USER_ID_KEY comment.
 */
export function CounselorSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CounselorSessionState>(() => ({
    userId: getStoredCounselorUserId(),
    displayName: getStoredCounselorDisplayName(),
  }));

  const value = useMemo<CounselorSessionContextValue>(
    () => ({
      ...state,
      setUserId: (userId: string) => {
        setStoredCounselorUserId(userId);
        setState((prev) => ({ ...prev, userId }));
      },
      setDisplayName: (displayName: string) => {
        setStoredCounselorDisplayName(displayName);
        setState((prev) => ({ ...prev, displayName }));
      },
      reset: () => {
        clearStoredCounselorUserId();
        clearStoredCounselorDisplayName();
        setState({ userId: null, displayName: null });
      },
    }),
    [state],
  );

  return (
    <CounselorSessionContext.Provider value={value}>{children}</CounselorSessionContext.Provider>
  );
}

export function useCounselorSession(): CounselorSessionContextValue {
  const context = useContext(CounselorSessionContext);
  if (!context) throw new Error("useCounselorSession must be used within a CounselorSessionProvider");
  return context;
}
