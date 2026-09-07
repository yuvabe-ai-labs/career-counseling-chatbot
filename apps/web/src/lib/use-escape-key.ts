import { useEffect } from "react";

/**
 * Calls `onEscape` while Escape is pressed and `active` is true. Attached/detached via effect
 * cleanup so the listener only exists while the modal that owns it is actually open — this app
 * never has two modals open at once, so there's no priority/ordering concern between them.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
