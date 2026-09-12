import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // No query in this app was setting its own staleTime, so every single one defaulted to 0
      // — meaning every remount (e.g. clicking "Report card" back to Results, or back-and-forth
      // to Career Map) re-issued its request even though the underlying data (keyed by runId /
      // profileSnapshotId, which only change when the student actually starts a new run/segment)
      // hadn't changed. This doesn't relax correctness: a genuinely new run or snapshot gets a
      // new query key and therefore a fresh fetch regardless of this value — it only stops
      // re-fetching the *same* key's already-correct result on every revisit within a session.
      staleTime: 5 * 60 * 1000,
    },
  },
});
