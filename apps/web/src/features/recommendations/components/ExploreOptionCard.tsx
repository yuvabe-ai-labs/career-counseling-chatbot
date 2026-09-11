import { ChevronRight, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export type ExploreOptionCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Omit to render the card in a disabled, non-navigable state (no screen built for it yet). */
  href?: string;
  /**
   * The card's decorative artwork, exported from the Figma design. Only the three cards that
   * frame has an asset for pass one; every other tab renders with this slot empty rather than a
   * stand-in image — the layout is identical either way, so an asset can be dropped in later
   * without touching anything else.
   */
  image?: string;
  /** That artwork's own crop/offset within the card, per the Figma frame — differs per card. */
  imageClassName?: string;
};

/**
 * The reusable card from the Figma "Explore Path" landing screen (node 611:63, "card-streams"):
 * 338px tall, 16px radius, #e9e2f7 border, 28px padding, a 72px graphic ring holding a 56px
 * white inner circle with a 24px icon, a 32px semibold title, a 24px chevron and a 20px
 * description, over artwork at 72% opacity.
 *
 * One component covers all 6 possible tabs (career/stream/pathway/college/scholarship/plan), not
 * just the 3 that frame happens to show — icons come from lucide-react, which is what lets the
 * other three exist at all.
 */
export function ExploreOptionCard({
  icon: Icon,
  title,
  description,
  href,
  image,
  imageClassName,
}: ExploreOptionCardProps) {
  const navigate = useNavigate();
  const isDisabled = !href;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={isDisabled ? undefined : () => void navigate(href)}
      aria-disabled={isDisabled}
      className={cn(
        // min-h rather than Figma's fixed h-[338px]: the same height whenever the content allows,
        // but a long description on a narrow card grows instead of being clipped.
        "relative flex min-h-[212px] w-full flex-col gap-3 overflow-hidden rounded-[16px] border border-[#e9e2f7] bg-background p-5 text-left shadow-[0px_2px_8px_-4px_rgba(89,42,199,0.05),0px_10px_24px_-12px_rgba(15,23,42,0.03)] transition-[transform,box-shadow] duration-150",
        isDisabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0px_4px_12px_-4px_rgba(89,42,199,0.1),0px_16px_32px_-12px_rgba(15,23,42,0.06)] active:translate-y-0 active:scale-[0.99]",
      )}
    >
      {image ? (
        <img
          src={image}
          alt=""
          aria-hidden="true"
          className={cn("pointer-events-none absolute opacity-72", imageClassName)}
        />
      ) : null}

      {/* Icon row, then heading, then body — the hierarchy stacked rather than the icon sitting
          inline beside the title. That's what lets the heading and the description share one
          left edge (the card's own padding) instead of the heading being indented past the icon
          while the body starts at the edge. The chevron stays on the icon row, where it reads as
          the card's "open" affordance. */}
      <div className="relative flex items-center justify-between gap-3">
        {/* 56px white circle — Figma node 611:65 ("Graphic Ring"), icon unchanged. */}
        <span className="grid size-[56px] shrink-0 place-items-center rounded-[28px] border border-[#e9e2f7] bg-background">
          <Icon className="size-6 text-brand" aria-hidden="true" strokeWidth={1.75} />
        </span>
        {!isDisabled ? (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
      </div>

      <p className="relative font-display text-lg font-semibold text-foreground lg:text-xl">
        {title}
      </p>

      <p className="relative font-display text-sm leading-[1.35] text-[#1f2937] lg:text-base">
        {description}
      </p>
    </button>
  );
}
