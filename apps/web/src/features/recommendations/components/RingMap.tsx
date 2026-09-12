import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { RecommendationItem } from "@yuvanext/contracts";
import { cn } from "@/lib/utils";

export type RingMapTierKey = "outer" | "middle" | "inner";

export type RingMapRings = Record<RingMapTierKey, RecommendationItem[]>;

type RingMapProps = {
  rings: RingMapRings;
  /** Stage-tab labels, one per zoom level (1 = outermost/least-refined, 3 = innermost). */
  zoomLabels: Record<1 | 2 | 3, string>;
  hideMatchPercent: boolean;
  selectedItemId: string | null;
  onSelectItem: (item: RecommendationItem) => void;
  ariaLabel: string;
  /** The center hub's short label under "YOU" — defaults to the active stage's first word. */
  hubLabel?: (zoomLabel: string) => string;
  /**
   * Streams/Pathways aren't ring-partitioned by the backend (only career/college produce
   * inner/middle/outer tiers) — pass the full ranked list as `rings.inner` with the other two
   * tiers empty, and this locks the map on that one ring: no stage tabs, no empty outer/middle
   * circles implying tiers that don't exist.
   */
  singleTier?: boolean;
};

const ZOOM_TO_RING: Record<1 | 2 | 3, RingMapTierKey> = { 1: "outer", 2: "middle", 3: "inner" };

// See CareerRingMap's original derivation comment (this is a direct generalization of it):
// each ring's rendered radius (in cqmin) is that ring's CSS base radius times the scale
// index.css's [data-zoom] rules give it when active — zoom 1 -> 50, zoom 2 -> 43.845, zoom 3 ->
// 37.2. Kept as one constant here so any future CSS change only needs updating in one place.
const ZOOM_RADIUS_CQMIN: Record<1 | 2 | 3, number> = { 1: 50, 2: 43.845, 3: 37.2 };

function angleDeg(index: number, count: number): number {
  if (count <= 1) return -90;
  return -90 + (360 / count) * index;
}

/**
 * Ring labels show at most the first 3 words of a title, so a handful of long O*NET titles
 * ("Shoe and Leather Workers and Repairers") don't force every label on the ring to a different
 * size — the full title is unaffected everywhere else (the detail sheet reads `item.title`
 * directly, never this truncated string). 3-or-fewer-word titles are returned unchanged, with no
 * trailing dots.
 */
export function truncateLabel(title: string, maxWords = 3): string {
  const words = title.trim().split(/\s+/);
  if (words.length <= maxWords) return title;
  return `${words.slice(0, maxWords).join(" ")}...`;
}

/**
 * The radial ring-map visualization, generalized from the career-specific prototype
 * (see CareerRingMap.tsx, now a thin wrapper around this) so College — which also produces
 * real inner/middle/outer tiers (home state / neighboring states / other) — gets the identical
 * treatment, and Stream/Pathway (flat ranked lists, no tiers) get the same visual language via
 * `singleTier` instead of a plain list that would look and feel inconsistent with the rest of
 * Explore Path.
 */
export function RingMap({
  rings,
  zoomLabels,
  hideMatchPercent,
  selectedItemId,
  onSelectItem,
  ariaLabel,
  hubLabel,
  singleTier = false,
}: RingMapProps) {
  const [zoom, setZoom] = useState<1 | 2 | 3>(singleTier ? 3 : 1);
  const pinchDistanceRef = useRef(0);
  const [isRevealing, setIsRevealing] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsRevealing(false), 780);
    return () => clearTimeout(timer);
  }, []);

  const activeItems = rings[ZOOM_TO_RING[zoom]];

  const goToZoom = (next: 1 | 2 | 3) => {
    if (!singleTier) setZoom(next);
  };

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    if (singleTier) return;
    if (Math.abs(event.deltaY) < 20) return;
    if (event.deltaY < 0 && zoom < 3) goToZoom((zoom + 1) as 1 | 2 | 3);
    else if (event.deltaY > 0 && zoom > 1) goToZoom((zoom - 1) as 1 | 2 | 3);
  };

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (singleTier) return;
    const first = event.touches.item(0);
    const second = event.touches.item(1);
    if (event.touches.length === 2 && first && second) {
      pinchDistanceRef.current = Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
    }
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (singleTier) return;
    const first = event.touches.item(0);
    const second = event.touches.item(1);
    if (event.touches.length !== 2 || pinchDistanceRef.current === 0 || !first || !second) return;
    const distance = Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
    const diff = distance - pinchDistanceRef.current;
    if (Math.abs(diff) <= 40) return;
    if (diff > 0 && zoom < 3) goToZoom((zoom + 1) as 1 | 2 | 3);
    else if (diff < 0 && zoom > 1) goToZoom((zoom - 1) as 1 | 2 | 3);
    pinchDistanceRef.current = distance;
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (event.touches.length < 2) pinchDistanceRef.current = 0;
  };

  const activeLabel = zoomLabels[zoom];

  return (
    <div className="flex flex-col items-center gap-10">
      {!singleTier ? (
        <div className="flex items-center gap-2" role="tablist" aria-label={ariaLabel}>
          {([1, 2, 3] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={zoom === stage}
              onClick={() => goToZoom(stage)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 font-display text-xs font-bold transition-colors sm:text-sm",
                zoom === stage
                  ? "bg-brand/10 text-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {zoomLabels[stage]}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={cn("career-ring-map", isRevealing && "is-revealing")}
        data-zoom={zoom}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="ring-glow" />

        {!singleTier ? (
          <>
            <button
              type="button"
              className="ring ring-outer"
              aria-label={`Show ${zoomLabels[1]}`}
              onClick={() => goToZoom(1)}
            />
            <button
              type="button"
              className="ring ring-middle"
              aria-label={`Show ${zoomLabels[2]}`}
              onClick={() => goToZoom(2)}
            />
          </>
        ) : null}
        <button
          type="button"
          className="ring ring-inner"
          aria-label={`Show ${zoomLabels[3]}`}
          onClick={() => goToZoom(3)}
        />

        <div className="center-hub">
          <span className="grid size-7 place-items-center rounded-full bg-page text-brand">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <b className="mt-0.5 font-display text-xs font-bold text-foreground">YOU</b>
          <small className="font-display text-[0.6rem] font-extrabold tracking-wider text-muted-foreground">
            {(hubLabel ?? ((label: string) => label.split(" ")[0]?.toUpperCase() ?? ""))(
              activeLabel,
            )}
          </small>
        </div>

        {activeItems.map((item, index) => {
          const percent = item.fitScore !== undefined ? Math.round(item.fitScore * 100) : null;
          return (
            <button
              key={item.itemId}
              type="button"
              className="dot-node"
              data-selected={selectedItemId === item.itemId}
              title={item.title}
              style={
                {
                  "--a": `${angleDeg(index, activeItems.length)}deg`,
                  "--r": `${ZOOM_RADIUS_CQMIN[zoom]}cqmin`,
                } as React.CSSProperties
              }
              onClick={() => onSelectItem(item)}
            >
              <span className="dot" />
              <span className="dot-label">
                <span className="dot-label-text">
                  {truncateLabel(item.title)}
                  {!hideMatchPercent && percent !== null ? ` ${percent}%` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
