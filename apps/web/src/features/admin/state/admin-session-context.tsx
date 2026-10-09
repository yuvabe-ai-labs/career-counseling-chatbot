import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  clearStoredAdminDisplayName,
  clearStoredAdminUserId,
  getStoredAdminDisplayName,
  getStoredAdminUserId,
  setStoredAdminDisplayName,
  setStoredAdminUserId,
} from "@/lib/storage";

interface AdminSessionState {
  userId: string | null;
  /** operations.staff_profiles.display_name, captured at sign-in. */
  displayName: string | null;
}

interface AdminSessionContextValue extends AdminSessionState {
  signIn: (userId: string, displayName: string) => void;
  reset: () => void;
}

const AdminSessionContext = createContext<AdminSessionContextValue | undefined>(undefined);

/**
 * The regional admin's own session — deliberately separate from the student and counselor
 * contexts (see lib/storage.ts), so an admin identity is never readable from, or confusable
 * with, either of those.
 */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminSessionState>(() => ({
    userId: getStoredAdminUserId(),
    displayName: getStoredAdminDisplayName(),
  }));

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      ...state,
      signIn: (userId, displayName) => {
        setStoredAdminUserId(userId);
        setStoredAdminDisplayName(displayName);
        setState({ userId, displayName });
      },
      reset: () => {
        clearStoredAdminUserId();
        clearStoredAdminDisplayName();
        setState({ userId: null, displayName: null });
      },
    }),
    [state],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionContextValue {
  const context = useContext(AdminSessionContext);
  if (!context) throw new Error("useAdminSession must be used within an AdminSessionProvider");
  return context;
}
