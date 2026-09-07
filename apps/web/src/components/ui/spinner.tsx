import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one loading-spinner glyph for the app — a lucide `Loader2` spun via `animate-spin`. Not a
 * new visual language: this is exactly what `Combobox` was already using inline for its own
 * search spinner (see ui/combobox.tsx) before this component existed, just extracted so every
 * other async state (buttons, page-level "loading questions"/"loading assessment"/"scoring"
 * regions) reuses the same one instead of each screen inventing its own.
 */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} aria-hidden="true" />;
}
