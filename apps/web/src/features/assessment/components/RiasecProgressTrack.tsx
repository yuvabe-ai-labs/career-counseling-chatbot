/**
 * Progress-track visual ported from the Lovable "Yuva Path Connect" prototype's quiz screen
 * (C:\Users\HP\Desktop\Yuva Path Connect\src\components\quiz\ProgressDots.tsx) — one dot per
 * question, filled once answered, with the current question's dot (and its next couple) shown
 * larger. `total` and `answeredCount` both come from the backend's own progress object
 * (AssessmentNextResponse.progress, packages/contracts/src/assessment.ts) — never hardcoded —
 * so this renders correctly whether the run has 5, 7, 9, 30, or 60 items.
 */
export interface RiasecProgressTrackProps {
  total: number;
  answeredCount: number;
  /** 0-based index of the question currently on screen. */
  current: number;
}

export function RiasecProgressTrack({ total, answeredCount, current }: RiasecProgressTrackProps) {
  return (
    <div
      className="flex w-full min-w-0 items-center justify-center gap-px sm:flex-wrap sm:gap-1"
      role="presentation"
    >
      {Array.from({ length: total }, (_, index) => {
        const isNearCurrent = index >= current && index < current + 3;
        const size = isNearCurrent ? "size-1.5 sm:size-2.5" : "size-1 sm:size-2";
        const color = index < answeredCount ? "bg-brand" : "bg-brand/15";
        return (
          <span key={index} className="flex shrink-0 items-center">
            <span className={`block rounded-full transition-all ${size} ${color}`} />
            {index < total - 1 ? <span className="hidden h-px w-1.5 bg-brand/15 sm:block" /> : null}
          </span>
        );
      })}
    </div>
  );
}
