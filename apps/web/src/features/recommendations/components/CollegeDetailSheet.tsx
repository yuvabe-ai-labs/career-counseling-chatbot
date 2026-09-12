import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { CollegeFitExplanation, RecommendationItem } from "@yuvanext/contracts";
import { cn } from "@/lib/utils";

type CollegeDetailSheetProps = {
  item: RecommendationItem | null;
  onClose: () => void;
};

const RING_LABEL: Record<NonNullable<RecommendationItem["ring"]>, string> = {
  inner: "Your state",
  middle: "Neighboring state",
  outer: "Other option",
};

const STATE_BAND_LABEL: Record<CollegeFitExplanation["stateBand"], string> = {
  selected: "In your selected state",
  neighboring: "In a neighboring state",
  other: "Elsewhere in India",
};

const COLLEGE_TYPE_LABEL: Record<CollegeFitExplanation["collegeType"], string> = {
  regular: "Regular college",
  vocational: "Vocational institute",
  polytechnic: "Polytechnic",
  iti: "ITI",
  open_university: "Open university",
};

function isCollegeExplanation(
  explanation: RecommendationItem["explanation"],
): explanation is CollegeFitExplanation {
  return typeof explanation === "object" && explanation !== null && "disciplineAlignment" in explanation;
}

const FIT_ROWS: { key: keyof CollegeFitExplanation; label: string }[] = [
  { key: "disciplineAlignment", label: "Discipline Fit" },
  { key: "stateFit", label: "Location Fit" },
  { key: "accessRouteFit", label: "Access Route" },
];

/**
 * College is the only other recommendation kind besides career that produces real
 * inner/middle/outer rings (home state / neighboring states / other — see
 * college-recommendations.ts's resolveStateBand()), so this mirrors CareerDetailSheet's ring
 * badge, with college-specific fit fields (CollegeFitExplanation) instead.
 */
export function CollegeDetailSheet({ item, onClose }: CollegeDetailSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);

  const isOpen = item !== null;
  const explanation = item && isCollegeExplanation(item.explanation) ? item.explanation : null;

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const touch = event.touches[0];
    if (touch) dragStartY.current = touch.clientY;
  };
  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const touch = event.touches[0];
    if (dragStartY.current === null || !touch) return;
    const delta = touch.clientY - dragStartY.current;
    if (delta > 0) setDragOffset(delta);
  };
  const handleTouchEnd = () => {
    if (dragOffset > 70) onClose();
    setDragOffset(0);
    dragStartY.current = null;
  };

  return (
    <section
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 rounded-t-[28px] border-t border-border bg-white px-6 pb-8 pt-3 shadow-[0_-12px_30px_rgba(52,35,130,0.16)] transition-transform duration-300 ease-out sm:mx-auto sm:max-w-xl sm:rounded-[28px] sm:border",
        isOpen ? "translate-y-0" : "translate-y-full",
      )}
      style={dragOffset ? { transform: `translate3d(0, ${dragOffset}px, 0)`, transition: "none" } : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 cursor-grab rounded-full bg-border" />

      {item ? (
        <>
          <div className="flex items-center gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">{item.title}</h2>
              {item.ring ? (
                <span className="mt-1 inline-block rounded-lg bg-[#DDF6EE] px-2 py-1 font-display text-xs font-bold text-[#148765]">
                  {RING_LABEL[item.ring]}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-page text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {explanation ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-page px-3 py-1 font-display text-xs font-semibold text-foreground">
                  {STATE_BAND_LABEL[explanation.stateBand]}
                </span>
                <span className="rounded-full bg-page px-3 py-1 font-display text-xs font-semibold text-foreground">
                  {COLLEGE_TYPE_LABEL[explanation.collegeType]}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-4">
                {FIT_ROWS.map(({ key, label }) => {
                  const value = explanation[key];
                  if (typeof value !== "number") return null;
                  return (
                    <div key={key}>
                      <p className="font-display text-xs text-muted-foreground">{label}</p>
                      <p className="font-display text-lg font-bold text-foreground">
                        {Math.round(value * 100)}%
                      </p>
                    </div>
                  );
                })}
              </div>

              <p className="mt-5 font-display text-xs text-muted-foreground">
                College and program details here are drafted content pending full institutional
                verification — confirm admission routes and fees directly with the institution.
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
