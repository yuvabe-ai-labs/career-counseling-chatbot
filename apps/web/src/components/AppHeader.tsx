import { useEffect, useRef, useState } from "react";
import { CircleUserRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEscapeKey } from "@/lib/use-escape-key";
import { Brand } from "@/components/Brand";

/**
 * Post-auth app header — Figma "career" file nodes 346:25 (Home) and 346:101 (Intake
 * Questions), identical markup on both screens: the same wordmark (reusing Brand, already
 * used pre-auth — same asset) and an account icon on the right. Figma itself specs this as a
 * plain glyph with no target — there's no account/profile screen to link it to yet — so the
 * one thing it does is open a small menu with the one account-level action that does exist:
 * signing out.
 */
export function AppHeader() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEscapeKey(isOpen, () => setIsOpen(false));

  // Close on outside click — same pattern as ui/combobox.tsx's own popover.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  /**
   * Every screen AppHeader appears on (HomePage, IntakeQuestionsPage, RiasecAssessmentPage,
   * RiasecResultsPage) guards itself with `if (!session.userId || !session.journeySessionId)
   * return <Navigate to="/" replace />`. Calling session.reset() here — clearing the *shared*
   * session context while the current guarded page is still mounted — lets that guard win the
   * race against this navigate("/sign-in") call: React re-renders the current page with the
   * now-cleared session before the route transition finishes, its own <Navigate to="/"> fires,
   * and that lands after this handler, silently overriding the intended /sign-in destination
   * with "/" instead (confirmed happening in a real browser — deferring the reset with a
   * setTimeout was not reliable enough to avoid it).
   *
   * So the reset is deferred past the navigation entirely, not just past this tick: SignInPage
   * itself calls session.reset() from its own mount effect, gated on the `signedOut` state this
   * navigate() call passes — by the time SignInPage exists to read it, the previous guarded page
   * is already unmounted and can't re-fire.
   */
  const handleSignOut = () => {
    setIsOpen(false);
    void navigate("/sign-in", { replace: true, state: { signedOut: true } });
  };

  return (
    <header className="flex h-[84px] shrink-0 items-center justify-between border-b border-border bg-gradient-to-b from-[#f8f4ff] via-[#faf8ff] to-[#fdfbff] px-6 py-4 sm:px-8">
      <Brand />
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label="Account menu"
          className="cursor-pointer rounded-full text-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <CircleUserRound className="size-10 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </button>

        {isOpen ? (
          <div
            role="menu"
            aria-label="Account"
            className="absolute top-full right-0 z-20 mt-2 w-40 animate-in rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
