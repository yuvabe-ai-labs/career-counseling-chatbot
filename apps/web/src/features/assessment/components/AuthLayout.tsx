import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PromoPanel } from "@/components/PromoPanel";

/**
 * The shell every onboarding screen shares — Figma node 462:3028 ("home"): the wordmark bar,
 * then a floating hero-card (node 462:3034, 27px radius) holding a form column and the
 * illustration column, on the frame's own #ece9f7 canvas.
 *
 * Lives here as one component precisely so the three screens using it can't drift apart again;
 * only `children` (the form column's contents) differs between them.
 *
 * Sizing notes:
 * - The card's height depends only on the viewport, never on which form is inside it: h-full up
 *   to the frame's 751px. This is the whole point of the shell — when it was content-driven, the
 *   shorter sign-in form produced a shorter card (642px vs signup's 772px), so moving between
 *   states resized the container and shifted the illustration, which read as a different page.
 * - The form itself is centred in the column with `my-auto` rather than `justify-center`, so a
 *   short form sits balanced in a tall card while a form that outgrows the card still starts at
 *   the top and scrolls (auto margins collapse to 0 when free space is negative; centring would
 *   clip the top out of reach instead).
 * - The band's padding is Figma's 56px only while there's height to spare — the clamp gives it
 *   back as the viewport shortens (to 16px), so the card keeps fitting whole.
 * - The form column is 600px, not the frame's 536px: at 536 a half-width field left only 172px
 *   for text (pl-46 + pr-44) and "Select your current stage" needs ~175px, so the side-by-side
 *   placeholders truncated. The illustration column absorbs the difference.
 */
export function AuthLayout({
  children,
  contentKey,
}: {
  children: ReactNode;
  /** Remounts the form column to replay its entrance animation — e.g. onboarding's step change. */
  contentKey?: string | number;
}) {
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#ece9f7]">
      <AppHeader />
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-8 lg:py-[clamp(1rem,calc((100vh_-_820px)_/_2),56px)]">
        <div className="grid h-full max-h-[751px] w-full max-w-[1260px] grid-cols-1 overflow-hidden rounded-[27px] border border-[rgba(224,218,234,0.82)] bg-auth-hero-gradient shadow-[0px_14px_34px_-10px_rgba(89,61,140,0.05),0px_4px_18px_-4px_rgba(61,51,92,0.05),inset_0px_1px_1px_0px_rgba(89,74,122,0.05)] lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-x-[53px] lg:pr-[59px] lg:pl-[46px]">
          {/* py-4 rather than py-6: this is the gap between the form-card and the shell's own
              edge, so trimming it symmetrically hands 16px back to the card without unbalancing
              anything. overflow-y-auto stays as the genuine small-viewport fallback — the fix
              for the scrollbar at desktop size is the tighter rhythm, not hiding the overflow. */}
          <div className="flex min-h-0 flex-col overflow-y-auto px-6 py-4 lg:px-0">
            {/* Only this — the form content — transitions between states; the card, the columns
                and the illustration around it never move. */}
            <div
              key={contentKey}
              className="my-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              {children}
            </div>
          </div>
          <div className="hidden min-h-0 lg:block">
            <PromoPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
