import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/features/assessment";
import { queryClient } from "@/lib/query-client";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
