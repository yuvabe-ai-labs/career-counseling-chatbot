import { Spinner } from "./ui/spinner";

/**
 * The one "this region is loading" pattern, reused everywhere a hero-card is waiting on a
 * network call (IntakeQuestionsPage's questions, RiasecAssessmentPage's next batch,
 * RiasecResultsPage's score) — previously each page rendered its own bare, uncentered
 * <p>Loading…</p> as a direct child of the card, which left it pinned to the card's top-left
 * corner instead of centered in the (often much taller, e.g. lg:min-h-[751px]) card around it.
 * min-h here gives the spinner+message something to center within even before the surrounding
 * card's own min-height kicks in.
 */
export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
      <Spinner className="size-7 text-brand" />
      <p className="font-display text-lg text-muted-foreground">{message}</p>
    </div>
  );
}
