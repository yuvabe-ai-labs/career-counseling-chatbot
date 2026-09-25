import { ChevronRight, type LucideIcon } from "lucide-react";
import type { RecommendationItem, StreamFitExplanation } from "@yuvapath/contracts";
import { cn } from "@/lib/utils";

export type StreamOptionCardProps = {
  item: RecommendationItem;
  icon: LucideIcon;
  image: string;
  imageClassName: string;
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
 * The overview card is the title plus a short (clamped) description — no scores. The card sizes
 * to its content, and the grid's own default row-stretch keeps every card in a row the same
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
  onSelect,
}: StreamOptionCardProps) {
  const explanation = isStreamExplanation(item.explanation) ? item.explanation : null;

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

      {/* MVP: no fit %, interest/segment/marks match or matched letters on the card (all still
          in the API for a later scoring phase) — the card is the stream itself plus a short
          description. */}
      {explanation?.description ? (
        <p className="relative line-clamp-3 font-display text-sm text-foreground/80 lg:text-base">
          {explanation.description}
        </p>
      ) : null}
    </button>
  );
}
