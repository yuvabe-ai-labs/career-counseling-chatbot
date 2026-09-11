import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { CareerFitExplanation, RecommendationItem, Segment } from "@yuvanext/contracts";
import { cn } from "@/lib/utils";

type CareerDetailSheetProps = {
  item: RecommendationItem | null;
  segment: Segment;
  onClose: () => void;
};

const RING_LABEL: Record<NonNullable<RecommendationItem["ring"]>, string> = {
  inner: "Top Match",
  middle: "Strong Match",
  outer: "Explore option",
};

const REASON_BY_LETTER: Record<string, string> = {
  R: "you enjoy hands-on, practical work",
  I: "you enjoy investigating and figuring things out",
  A: "you enjoy open-ended, creative work",
  S: "you enjoy helping and supporting people",
  E: "you enjoy leading, pitching, and taking initiative",
  C: "you enjoy organized, detail-focused work",
};

function isCareerExplanation(
  explanation: RecommendationItem["explanation"],
): explanation is CareerFitExplanation {
  return typeof explanation === "object" && explanation !== null && "interestFit" in explanation;
}

const FIT_ROWS: { key: keyof CareerFitExplanation; label: string }[] = [
  { key: "interestFit", label: "Interest Fit" },
  { key: "valuesFit", label: "Values Fit" },
  { key: "feasibility", label: "Feasibility" },
  { key: "contextBoost", label: "Boost" },
];

/**
 * The ring map's bottom sheet — content is segment-conditional per Part 2 of
 * docs/poc/launcher-goal-based-recommendations.md. Only renders fields the API actually
 * returns (fitScore, the 4-part CareerFitExplanation, topMatchingScales) — no fabricated
 * salary/skills/next-role data, since CareerCatalogRecord/RecommendationItem don't carry any
 * (that was fictional example data in the design doc, not a real field this endpoint returns).
 */
export function CareerDetailSheet({ item, segment, onClose }: CareerDetailSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);

  const isOpen = item !== null;
  const explanation = item && isCareerExplanation(item.explanation) ? item.explanation : null;
  const percent = item?.fitScore !== undefined ? Math.round((item.fitScore ?? 0) * 100) : null;
  const topLetter = explanation?.topMatchingScales[0];

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
                  {segment !== "explorer" && percent !== null ? ` · ${percent}%` : ""}
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

          {segment === "explorer" ? (
            <p className="mt-4 font-display text-base leading-relaxed text-foreground/80">
              This fits because {topLetter ? REASON_BY_LETTER[topLetter] : "it matches your interests"}.
            </p>
          ) : explanation ? (
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
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
          ) : null}

          {segment !== "explorer" && explanation ? (
            <div className="mt-5">
              <p className="font-display text-xs text-muted-foreground">Top Matching Scales</p>
              <div className="mt-2 flex gap-2">
                {explanation.topMatchingScales.map((letter) => (
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
    </section>
  );
}
