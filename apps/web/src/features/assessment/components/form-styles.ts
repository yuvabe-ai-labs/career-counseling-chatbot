/**
 * The one set of field/button styles every onboarding screen shares (signup steps 1 and 2,
 * sign-in, guardian consent). These used to be re-declared per component, which is how the
 * screens drifted apart — guardian consent ended up on 44px/`rounded-lg` fields with 16px icons
 * while the rest were on Figma's 48px/8px-radius fields with 18px icons.
 */

/** Leading glyph inside a 48px field — Figma node 139:3941: 18px icon, 16px inset. */
export const fieldIconClass =
  "pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-brand";

/** 48px height, 8px radius, 16/12px icon clearance — Figma's input-* frames (e.g. 139:3946). */
export const fieldInputClass = "h-12 rounded-[8px] border-input pr-4 pl-[46px] text-sm shadow-none";

/** Same field, with room on the right for a trailing control (password eye, dropdown chevron). */
export const fieldInputWithTrailingClass =
  "h-12 rounded-[8px] border-input pr-11 pl-[46px] text-sm shadow-none";

/**
 * The auth cards' primary action spans the card — Figma node 462:3085 ("btn-next"). Only the
 * width lives here now: the pill shape, 48px height, 16px bold type and padding all come from
 * the shared Button component, so this can't drift from the buttons on the rest of the app.
 */
export const primaryButtonClass = "w-full";

/**
 * The vertical rhythm every auth form follows, so signup, sign-in and account creation read as
 * one screen with different contents rather than three layouts:
 *
 *   card padding      20px, equal on all four sides (AuthFormCard)
 *   card sections     20px — header → description → form            (AuthFormCard's own gap)
 *   form sections     20px — fields → actions                        (authFormClass)
 *   within a section  12px — field to field, button to footer links  (formSectionClass)
 *   label → input      8px  (`mt-2` at each field, left alone — any tighter reads cramped)
 *
 * One step down from Figma's own 24/16 pairing (node 462:3037 / 462:3046), which is what makes
 * the longest form fit its card without scrolling: signup needs ~574px at 24/16 against ~580px
 * of column on a 1536×744 viewport — inside rounding error, so it intermittently overflowed.
 * At 20/12 it needs ~538px, clearing the same column by ~58px.
 *
 * What every state shares is this rhythm, not a height: each card is as tall as its own
 * content. (A `min-h` floor was tried so all three cards matched exactly, but sign-in's content
 * is ~125px shorter than signup's, so it just left a dead area under the privacy line.) The
 * shell around them is what stays fixed — see AuthLayout — so a shorter card simply centres
 * with more room around it and the illustration never moves.
 */
export const authFormClass = "flex flex-col gap-5";
export const formSectionClass = "flex flex-col gap-3";
