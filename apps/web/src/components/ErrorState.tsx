import { Button } from "./ui/button";

/**
 * The one "this region failed to load, here's a retry" pattern — same centering fix and
 * consolidation rationale as LoadingState (see that file's comment); previously duplicated
 * nearly verbatim across IntakeQuestionsPage, RiasecAssessmentPage, and RiasecResultsPage.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-lg text-destructive">{message}</p>
      <Button variant="outline" onClick={onRetry} className="rounded-2xl shadow-none">
        Try again
      </Button>
    </div>
  );
}
