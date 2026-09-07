import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { UserProfile } from "@yuvanext/contracts";
import {
  clearStoredSession,
  getStoredEmail,
  getStoredJourneySessionId,
  getStoredUserId,
  setStoredEmail,
  setStoredJourneySessionId,
  setStoredUserId,
} from "@/lib/storage";

interface SessionState {
  userId: string | null;
  journeySessionId: string | null;
  email: string | null;
  profile: UserProfile | null;
}

interface SessionContextValue extends SessionState {
  setUserId: (userId: string) => void;
  setJourneySessionId: (journeySessionId: string) => void;
  setEmail: (email: string) => void;
  setProfile: (profile: UserProfile) => void;
  /** Clears identity/session state entirely (e.g. "start over"). */
  reset: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/**
 * Holds the identity/journey-session state Module 1's auth model is built
 * on (see docs/poc/Validating-endpoints.md): a plain `userId` and
 * `journeySessionId`, persisted to localStorage so a reload resumes instead
 * of forcing the user through OTP verification again.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage once, synchronously, on first render —
  // no effect needed, so there's no extra render pass or hydration flash.
  const [state, setState] = useState<SessionState>(() => ({
    userId: getStoredUserId(),
    journeySessionId: getStoredJourneySessionId(),
    email: getStoredEmail(),
    profile: null,
  }));

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      setUserId: (userId: string) => {
        setStoredUserId(userId);
        setState((prev) => ({ ...prev, userId }));
      },
      setJourneySessionId: (journeySessionId: string) => {
        setStoredJourneySessionId(journeySessionId);
        setState((prev) => ({ ...prev, journeySessionId }));
      },
      setEmail: (email: string) => {
        setStoredEmail(email);
        setState((prev) => ({ ...prev, email }));
      },
      setProfile: (profile: UserProfile) => setState((prev) => ({ ...prev, profile })),
      reset: () => {
        clearStoredSession();
        setState({ userId: null, journeySessionId: null, email: null, profile: null });
      },
    }),
    [state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within a SessionProvider");
  return context;
}
