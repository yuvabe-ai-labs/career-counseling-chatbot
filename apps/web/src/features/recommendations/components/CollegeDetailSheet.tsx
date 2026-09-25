import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { CollegeEligibilityExplanation, CollegeOwnership, RecommendationItem } from "@yuvapath/contracts";
import { cn } from "@/lib/utils";

type CollegeDetailSheetProps = {
  item: RecommendationItem | null;
  onClose: () => void;
};

export const OWNERSHIP_LABEL: Record<CollegeOwnership, string> = {
  government: "Government",
  government_aided: "Government Aided",
  private: "Private",
  other: "Other",
};

export function isCollegeExplanation(
  explanation: RecommendationItem["explanation"],
): explanation is CollegeEligibilityExplanation {
  return typeof explanation === "object" && explanation !== null && "instituteKind" in explanation;
}

/**
 * Shows the real catalogue facts for one college in the picked district (institute kind,
 * ownership, district) and which programme type(s)/admission route(s) made it eligible.
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
            <h2 className="font-display text-xl font-bold text-foreground">{item.title}</h2>
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
                  {explanation.instituteKind}
                </span>
                <span className="rounded-full bg-page px-3 py-1 font-display text-xs font-semibold text-foreground">
                  {OWNERSHIP_LABEL[explanation.ownership]}
                </span>
                <span className="rounded-full bg-page px-3 py-1 font-display text-xs font-semibold text-foreground">
                  {explanation.district}
                </span>
              </div>

              <div className="mt-4 space-y-1">
                <p className="font-display text-xs text-muted-foreground">
                  Offers: {explanation.matchedProgramTypes.join(", ")}
                </p>
                <p className="font-display text-xs text-muted-foreground">
                  Admission: {explanation.matchedAdmissionRoutes.join("; ")}
                </p>
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
