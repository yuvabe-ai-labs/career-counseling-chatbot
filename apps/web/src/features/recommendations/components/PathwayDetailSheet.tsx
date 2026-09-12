import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { PathwayFitExplanation, RecommendationItem } from "@yuvanext/contracts";
import { cn } from "@/lib/utils";

type PathwayDetailSheetProps = {
  item: RecommendationItem | null;
  onClose: () => void;
};

function isPathwayExplanation(
  explanation: RecommendationItem["explanation"],
): explanation is PathwayFitExplanation {
  return typeof explanation === "object" && explanation !== null && "careerAlignment" in explanation;
}

const FIT_ROWS: { key: keyof PathwayFitExplanation; label: string }[] = [
  { key: "careerAlignment", label: "Career Fit" },
  { key: "streamAlignment", label: "Stream Fit" },
  { key: "reachability", label: "Reachability" },
];

/**
 * PathwayFitExplanation has no ring (pathways aren't ring-partitioned) — this shows the fit
 * breakdown plus the backup-route note the pathway domain already carries
 * (hasBackupRoute/backupRouteFit), which is specific to pathways among all the recommendation
 * kinds and worth surfacing since it's exactly the "what if this route doesn't work out" answer.
 */
export function PathwayDetailSheet({ item, onClose }: PathwayDetailSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);

  const isOpen = item !== null;
  const explanation = item && isPathwayExplanation(item.explanation) ? item.explanation : null;

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

              <p className="mt-5 font-display text-sm leading-relaxed text-foreground/80">
                {explanation.backupRouteFit > 0
                  ? "This pathway has a documented backup route if this exact path doesn't work out."
                  : "No documented backup route for this pathway yet — it's your only route in, so plan entrance requirements early."}
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
