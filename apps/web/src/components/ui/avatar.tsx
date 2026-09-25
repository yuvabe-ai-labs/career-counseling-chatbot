import { CircleUserRound } from "lucide-react";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

export type AvatarProps = {
  /** The logged-in student's or counselor's display name — see getInitials() for how this is
   *  turned into 1–2 letters. Pass null/undefined (not yet loaded, or no session) to render the
   *  generic fallback icon instead of a badge. */
  name?: string | null;
  className?: string;
};

/**
 * The one account-avatar visual in the app (today only AppHeader's top-right account button) —
 * pulled out on its own so any future avatar usage (e.g. a profile page) reuses the exact same
 * initials-vs-fallback logic instead of re-deriving it. Same 40px footprint either way, so
 * swapping between the two never shifts layout.
 */
export function Avatar({ name, className }: AvatarProps) {
  const initials = getInitials(name);

  if (!initials) {
    return (
      <CircleUserRound className={cn("size-10 shrink-0", className)} strokeWidth={1.5} aria-hidden="true" />
    );
  }

  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-brand font-display text-sm font-semibold text-brand-foreground",
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
