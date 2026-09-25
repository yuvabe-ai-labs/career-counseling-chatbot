import { Button } from "./ui/button";

/**
 * The one "this region failed to load, here's a retry" pattern — same centering fix and
 * consolidation rationale as LoadingState (see that file's comment); previously duplicated
 * nearly verbatim across IntakeQuestionsPage, RiasecAssessmentPage, and RiasecResultsPage.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[280px] animate-in flex-col items-center justify-center gap-4 text-center fade-in duration-200">
      <p className="font-display text-lg text-destructive">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
