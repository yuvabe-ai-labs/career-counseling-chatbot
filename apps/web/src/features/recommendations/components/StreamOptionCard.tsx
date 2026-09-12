import { ChevronRight, type LucideIcon } from "lucide-react";
import type { RecommendationItem, StreamFitExplanation } from "@yuvanext/contracts";
import { cn } from "@/lib/utils";

export type StreamOptionCardProps = {
  item: RecommendationItem;
  icon: LucideIcon;
  image: string;
  imageClassName: string;
  hideMatchPercent: boolean;
  onSelect: (item: RecommendationItem) => void;
};

function isStreamExplanation(
  explanation: RecommendationItem["explanation"],
): explanation is StreamFitExplanation {
  return typeof explanation === "object" && explanation !== null && "riasecOverlap" in explanation;
}

/**
 * One stream result on StreamPage — Figma node 611:93 ("streams"), card-commerce/card-arts/
 * card-science. Same visual language and font scale as ExploreOptionCard (56px graphic ring,
 * text-lg/xl title) rather than that frame's own larger 64px ring / 32px title, per the brief:
 * reuse the Explore Path cards' type scale instead of this frame's own.
 *
 * The overview card is title + fit line only — no description. That's a summary/preview by
 * design: the full description still exists (StreamDetailSheet renders it), it's just reserved
 * for after a tap rather than repeated on every card. Dropping it also means there's no longer a
 * min-height to hold — the card sizes to its (now much shorter, and title-length-independent)
 * content, and the grid's own default row-stretch is what keeps every card in a row the same
 * height, not a hardcoded pixel value here.
 *
 * Unlike ExploreOptionCard, every card here is always "enabled" — it opens StreamDetailSheet
 * rather than navigating, so there's no disabled state to render.
 */
export function StreamOptionCard({
  item,
  icon: Icon,
  image,
  imageClassName,
  hideMatchPercent,
  onSelect,
}: StreamOptionCardProps) {
  const explanation = isStreamExplanation(item.explanation) ? item.explanation : null;
  const percent = item.fitScore !== undefined ? Math.round((item.fitScore ?? 0) * 100) : null;
  const matched =
    explanation && explanation.matchedLetters.length > 0
      ? explanation.matchedLetters.join(" + ")
      : null;
  const fitLine = matched
    ? !hideMatchPercent && percent !== null
      ? `Fit: ${percent}% | ${matched} matched`
      : `${matched} matched`
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="relative flex h-full w-full cursor-pointer flex-col gap-3 overflow-hidden rounded-[16px] border border-[#e9e2f7] bg-background p-5 text-left shadow-[0px_2px_8px_-4px_rgba(89,42,199,0.05),0px_10px_24px_-12px_rgba(15,23,42,0.03)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0px_4px_12px_-4px_rgba(89,42,199,0.1),0px_16px_32px_-12px_rgba(15,23,42,0.06)] active:translate-y-0 active:scale-[0.99]"
    >
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className={cn("pointer-events-none absolute opacity-72", imageClassName)}
      />

      <div className="relative flex items-center justify-between gap-3">
        <span className="grid size-[56px] shrink-0 place-items-center rounded-[28px] border border-[#e9e2f7] bg-background">
          <Icon className="size-6 text-brand" aria-hidden="true" strokeWidth={1.75} />
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      {/* line-clamp-2, not a fixed min-height: every card's title sits directly above the fit
          line whether it's one word or wraps to two, so removing the description below didn't
          just shrink the card, it also stopped title length from being the only thing that
          could still make cards in the same row drift apart in how they look internally. */}
      <p className="relative line-clamp-2 font-display text-lg font-semibold text-foreground lg:text-xl">
        {item.title}
      </p>

      {/* Overview card is title + fit line only — the full description is reserved for
          StreamDetailSheet after a tap, not repeated here. See this component's own doc
          comment. */}
      {fitLine ? (
        <p className="relative font-display text-sm font-medium text-foreground lg:text-base">
          {fitLine}
        </p>
      ) : null}
    </button>
  );
}
