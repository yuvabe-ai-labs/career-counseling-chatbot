import { Spinner } from "./ui/spinner";

/**
 * The one loading UI for the whole app — a single centered spinner, always in the exact same
 * viewport position no matter which page renders it or what that page's own header/card/layout
 * looks like. `fixed` positioning (not inline flow) is what makes that true: the previous
 * version was `min-h-[280px]` centered in whatever wrapped it, which put it at a different
 * screen position on every page depending on how tall that page's own chrome happened to be —
 * exactly the "spinner jumps around" problem this replaces. Being removed from flow also means
 * the content area it stands in for contributes no placeholder height of its own while loading,
 * so nothing partially-sized or empty is visible underneath it — just this, over the page's own
 * background — until the real content is ready to swap in all at once.
 *
 * No text: every one of this component's 8 call sites rendered the same bare "Loading…" beneath
 * it, which said nothing a spinner alone doesn't. `aria-label`/`sr-only` keep it announced to
 * assistive tech without putting the word back on screen.
 *
 * `pointer-events-none` so it never traps a click meant for something already on screen behind
 * it (the header, a back button) purely because the content area happens to be loading.
 * Transparent background so the app's own gradient stays visible underneath — no dark overlay,
 * no blank screen.
 */
export function LoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
    >
      <Spinner className="size-9 text-brand" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
