import { useEffect, useState } from "react";

/**
 * A `Date` that updates every `intervalMs` — for countdown *display* only. Never used to decide
 * whether an OTP is valid or a resend is allowed; those decisions always come from the backend's
 * own timestamps (GuardianOtpTiming), re-validated server-side on every call that matters.
 */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
