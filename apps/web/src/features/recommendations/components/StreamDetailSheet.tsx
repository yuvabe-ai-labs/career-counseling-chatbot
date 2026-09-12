import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { RecommendationItem, StreamFitExplanation } from "@yuvanext/contracts";
import { cn } from "@/lib/utils";

type StreamDetailSheetProps = {
  item: RecommendationItem | null;
  hideMatchPercent: boolean;
  onClose: () => void;
};

function isStreamExplanation(
  explanation: RecommendationItem["explanation"],
): explanation is StreamFitExplanation {
  return typeof explanation === "object" && explanation !== null && "riasecOverlap" in explanation;
}

const FIT_ROWS: { key: keyof StreamFitExplanation; label: string }[] = [
  { key: "riasecOverlap", label: "Interest Match" },
  { key: "segmentFit", label: "Segment Fit" },
  { key: "marksFit", label: "Marks Fit" },
];

/**
 * Streams have no 4-part CareerFitExplanation-style breakdown — StreamFitExplanation is
 * riasecOverlap/segmentFit/marksFit/matchedLetters (packages/contracts/src/recommendations.ts).
 * Same bottom-sheet shell/interaction as CareerDetailSheet, different content.
 */
export function StreamDetailSheet({ item, hideMatchPercent, onClose }: StreamDetailSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);

  const isOpen = item !== null;
  const explanation = item && isStreamExplanation(item.explanation) ? item.explanation : null;
  const percent = item?.fitScore !== undefined ? Math.round((item.fitScore ?? 0) * 100) : null;

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
              {!hideMatchPercent && percent !== null ? (
                <span className="mt-1 inline-block rounded-lg bg-[#DDF6EE] px-2 py-1 font-display text-xs font-bold text-[#148765]">
                  {percent}% match
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

          {explanation?.description ? (
            <p className="mt-3 font-display text-sm leading-[1.35] text-[#1f2937]">
              {explanation.description}
            </p>
          ) : null}

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

              {explanation.matchedLetters.length > 0 ? (
                <div className="mt-5">
                  <p className="font-display text-xs text-muted-foreground">Matched Interests</p>
                  <div className="mt-2 flex gap-2">
                    {explanation.matchedLetters.map((letter) => (
                      <span
                        key={letter}
                        className="grid size-8 place-items-center rounded-full bg-brand/10 font-display text-sm font-bold text-brand"
                      >
                        {letter}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
