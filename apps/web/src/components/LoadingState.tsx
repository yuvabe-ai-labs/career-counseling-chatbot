import { Spinner } from "./ui/spinner";

/** Every caller's default wording — see the component doc below for why this exists at all. */
const DEFAULT_MESSAGE = "Loading…";

/**
 * The one "this region is loading" pattern, reused everywhere a hero-card is waiting on a
 * network call (IntakeQuestionsPage's questions, RiasecAssessmentPage's next batch,
 * RiasecResultsPage's score) — previously each page rendered its own bare, uncentered
 * <p>Loading…</p> as a direct child of the card, which left it pinned to the card's top-left
 * corner instead of centered in the (often much taller, e.g. lg:min-h-[751px]) card around it.
 * min-h here gives the spinner+message something to center within even before the surrounding
 * card's own min-height kicks in.
 *
 * `message` used to be required, and each of those three call sites passed its own wording
 * ("Loading your questions…", "Loading your assessment…", "Scoring your assessment…") — same
 * component, same styling, but different text depending on which page happened to render it.
 * Optional now, defaulting to the same "Loading…" every caller gets unless it deliberately opts
 * into something else, so this one shared pattern reads identically everywhere by default
 * instead of relying on every call site remembering to pass the same string.
 */
export function LoadingState({ message = DEFAULT_MESSAGE }: { message?: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
      <Spinner className="size-7 text-brand" />
      <p className="font-display text-lg text-muted-foreground">{message}</p>
    </div>
  );
}
