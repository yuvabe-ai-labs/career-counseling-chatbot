import { useEffect, useRef, useState } from "react";
import { CircleQuestionMark, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEscapeKey } from "@/lib/use-escape-key";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Brand } from "@/components/Brand";
import { useSession } from "@/features/assessment";
import { useUserProfile } from "@/features/assessment/hooks/useProfile";

export type AppHeaderAccountContext = {
  /** Display name to derive the avatar's initials from (see Avatar/getInitials) — null while
   *  unknown/not yet loaded, same as the default student-session-derived name. */
  name: string | null;
  isLoggedIn: boolean;
  onSignOut: () => void;
};

export type AppHeaderProps = {
  /**
   * Overrides the default student-`useSession()`-derived account name/login-state/sign-out
   * behavior — for counselor pages, whose identity lives in a separate CounselorSessionContext
   * that AppHeader itself deliberately never reads (a counselor's identity must never be
   * confusable with student session state — see counselor-session-context.tsx). Passed explicitly
   * by the one page that needs it (CounselorHomePage) instead of AppHeader reaching for a second
   * session context on every render, so every other screen (including AuthLayout's pre-auth
   * counselor screens, which have no logged-in identity yet either way) is unaffected.
   */
  accountContext?: AppHeaderAccountContext;
};

/**
 * One shape for every row in the account menu, so Help and Sign out can't drift apart in
 * typography, padding, icon size, alignment or hover/active feedback — they render from this
 * single string rather than from two copies that happen to match today.
 */
const menuItemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/**
 * Post-auth app header — Figma "career" file nodes 346:25 (Home) and 346:101 (Intake
 * Questions), identical markup on both screens: the same wordmark (reusing Brand, already
 * used pre-auth — same asset) and an account icon on the right. Figma itself specs this as a
 * plain glyph with no target — there's no account/profile screen to link it to yet — so the
 * one thing it does is open a small menu of the account-level actions that do exist.
 *
 * AuthLayout renders this same header pre-auth (Sign In / Sign Up / Account Creation), which is
 * why the menu's contents are session-dependent: Sign out is meaningless with nothing to sign
 * out of, so it only renders for a logged-in session. Help always renders, and always first.
 */
export function AppHeader({ accountContext }: AppHeaderProps = {}) {
  const navigate = useNavigate();
  const session = useSession();
  // Two independent reasons the menu can be open: hovering the avatar/menu (transient) and having
  // clicked the avatar (pinned — stays open after the mouse leaves, until an outside click,
  // Escape, another click on the avatar, or picking an item).
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = isHovered || isPinned;
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * The project's existing logged-in test, not a new one invented for this menu: the identical
   * `userId && journeySessionId` predicate Brand uses to decide whether the wordmark links home,
   * and that every post-auth page's own route guard uses to decide whether to bounce to "/".
   * Pre-auth screens (sign-in, sign-up, account creation, onboarding) have no session yet, so
   * this is false for all of them without any route- or flow-specific condition here.
   *
   * A passed-in accountContext (counselor pages) overrides this entirely — see its own type doc.
   */
  const isLoggedIn = accountContext
    ? accountContext.isLoggedIn
    : Boolean(session.userId && session.journeySessionId);

  /**
   * The account avatar's initials source. A returning student's sign-in
   * (SignInPage.handleSubmit) only ever sets userId/email/journeySessionId — never `profile`,
   * which is otherwise only populated in-memory right after onboarding
   * (OnboardingPage's own session.setProfile call) and isn't persisted to localStorage. So for
   * the common "signed in on a previous visit" case, profile starts out null here and is fetched
   * on demand instead of always requiring a fresh onboarding in this same tab.
   */
  const needsProfileFetch = !accountContext && isLoggedIn && !session.profile;
  const profileQuery = useUserProfile(needsProfileFetch ? session.journeySessionId : null);

  useEffect(() => {
    if (profileQuery.data) {
      session.setProfile(profileQuery.data.profile);
    }
    // Deliberately depends only on the fetched data, not on `session` — session.setProfile()
    // changes SessionProvider's own state, which recreates `session` on every render; including
    // it here would re-run this effect (and re-call setProfile) in a loop. Same reasoning as
    // SignInPage's own mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data]);

  const avatarName = accountContext ? accountContext.name : (session.profile?.firstName ?? null);

  const closeMenu = () => {
    setIsHovered(false);
    setIsPinned(false);
  };

  useEscapeKey(isOpen, closeMenu);

  // Small grace period on hover-out so moving the pointer from the avatar down into the menu
  // (across the 8px gap between them) doesn't close it.
  const handlePointerEnter = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    setIsHovered(true);
  };
  const handlePointerLeave = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => setIsHovered(false), 150);
  };
  useEffect(
    () => () => {
      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    },
    [],
  );

  // Close on outside click — same pattern as ui/combobox.tsx's own popover.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeMenu();
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
    closeMenu();
    if (accountContext) {
      accountContext.onSignOut();
      return;
    }
    void navigate("/sign-in", { replace: true, state: { signedOut: true } });
  };

  /**
   * There is no help route, page, modal or handler anywhere in the app yet (no /help route in
   * router.tsx, no support contact in the codebase), so there is nothing here to reuse and
   * nothing is duplicated. This is the single place the destination gets wired when one exists —
   * a `void navigate("/help")`, an `openHelpDialog()`, whatever it turns out to be — and it sits
   * outside the auth flow entirely: closing the menu is all it does today.
   */
  const handleHelp = () => {
    closeMenu();
  };

  return (
    <header className="flex h-[84px] shrink-0 items-center justify-between border-b border-border bg-gradient-to-b from-[#f8f4ff] via-[#faf8ff] to-[#fdfbff] px-6 py-4 sm:px-8">
      <Brand />
      <div
        ref={containerRef}
        className="relative"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <button
          type="button"
          onClick={() => setIsPinned((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label="Account menu"
          className="cursor-pointer rounded-full text-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Avatar name={isLoggedIn ? avatarName : null} />
        </button>

        {isOpen ? (
          <div
            role="menu"
            aria-label="Account"
            className="absolute top-full right-0 z-20 mt-2 flex w-40 animate-in flex-col gap-0.5 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md fade-in zoom-in-95 duration-150"
          >
            {/* Help is first and unconditional; Sign out follows only when there's a session, so
                the order is always Help -> Sign out and never Sign out alone. The column's
                gap-0.5 is what keeps the two-row menu from reading as one cramped block — with a
                single row it collapses to nothing, so the Help-only menu stays as compact as the
                Sign-out-only menu is today. Width, position, radius, shadow, background, padding
                and row styling are all unchanged. */}
            <button type="button" role="menuitem" onClick={handleHelp} className={menuItemClass}>
              <CircleQuestionMark className="size-4 shrink-0" aria-hidden="true" />
              Help
            </button>
            {isLoggedIn ? (
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className={cn(
                  menuItemClass,
                  "text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                Sign out
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
