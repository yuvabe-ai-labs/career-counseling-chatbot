import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminSessionProvider } from "@/features/admin";
import { SessionProvider } from "@/features/assessment";
import { CounselorSessionProvider } from "@/features/counselor";
import { queryClient } from "@/lib/query-client";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <CounselorSessionProvider>
          <AdminSessionProvider>{children}</AdminSessionProvider>
        </CounselorSessionProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
