import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { RecommendationItem } from "@yuvanext/contracts";
import { cn } from "@/lib/utils";

export type CareerRingKey = "outer" | "middle" | "inner";

export type CareerRings = Record<CareerRingKey, RecommendationItem[]>;

type CareerRingMapProps = {
  rings: CareerRings;
  hideMatchPercent: boolean;
  selectedItemId: string | null;
  onSelectCareer: (item: RecommendationItem) => void;
};

// Zoom 1 -> outer ring ("Explore More"), 2 -> middle ("Strong Matches"), 3 -> inner ("Top
// Matches") — same 3 tiers career-matching.ts already partitions into, just walked from
// least- to most-refined as the student zooms in, matching the prototype's own progression.
const ZOOM_TO_RING: Record<1 | 2 | 3, CareerRingKey> = { 1: "outer", 2: "middle", 3: "inner" };
const ZOOM_LABEL: Record<1 | 2 | 3, string> = {
  1: "Explore More",
  2: "Strong Matches",
  3: "Top Matches",
};
/**
 * The radius a career sits at, in cqmin -- the *rendered* radius of whichever ring is active at
 * that zoom, so a career is anchored exactly on its own ring's circumference rather than
 * floating somewhere inside it.
 *
 * Each number is that ring's base radius times the scale the [data-zoom] rules give it when it
 * is the active one, read straight off index.css so the two can't disagree:
 *   zoom 1 -> .ring-outer  100cqmin wide => r 50,   scale 1     => 50
 *   zoom 2 -> .ring-middle  74cqmin wide => r 37,   scale 1.185 => 43.845
 *   zoom 3 -> .ring-inner   48cqmin wide => r 24,   scale 1.55  => 37.2
 * The previous values (46/41/35) were none of these, which is exactly why every label used to
 * sit short of its ring with a visible gap.
 */
const ZOOM_RADIUS_CQMIN: Record<1 | 2 | 3, number> = { 1: 50, 2: 43.845, 3: 37.2 };

/**
 * Where a career sits on its ring, in degrees (0 = right, 90 = bottom, matching the cos/sin the
 * stylesheet uses). Purely a function of the item's index and how many share the ring, so every
 * item is placed by the same radial rule and the layout holds at any viewport -- there are no
 * per-item pixel positions anywhere.
 *
 * Spacing is exactly 360/count starting from the top, so the run reads the way the design asks:
 * the first career is top-centre, and with the even counts this actually produces (see below)
 * one lands bottom-centre too, with the rest following the circle symmetrically down both sides.
 * The old half-step rotation existed only to keep careers off the +/- zoom control anchored at
 * bottom-centre; that control is gone, so the rotation goes with it.
 *
 * No collision pass is needed, and that is a property of the data rather than luck:
 * partitionCareerRings() in packages/recommendations caps the rings at 4 / 6 / 6 items, so at
 * worst 6 labels share a circumference, 60deg apart. The tightest case is the middle ring at
 * zoom 2 -- r 43.845cqmin, so on a 560px map a 245px chord between neighbouring label centres
 * against a 200px label, leaving 45px of clearance. Every other case has more.
 */
function angleDeg(index: number, count: number): number {
  if (count <= 1) return -90;
  return -90 + (360 / count) * index;
}

/**
 * The radial career map ported from the prototype the user supplied — three concentric
 * zoomable rings (tap a ring, the stage label, +/- buttons, mouse wheel, or touch-pinch to
 * move between them), a dot per career in the active ring, a center "YOU" hub. See
 * apps/web/src/styles/index.css's ".career-ring-map" block for the responsive (container-
 * query-unit-based) radial positioning this relies on.
 */
export function CareerRingMap({
  rings,
  hideMatchPercent,
  selectedItemId,
  onSelectCareer,
}: CareerRingMapProps) {
  const [zoom, setZoom] = useState<1 | 2 | 3>(1);
  const pinchDistanceRef = useRef(0);
  /**
   * Drives the one-off entrance reveal (see index.css's .is-revealing rules). The animation
   * itself is entirely CSS, so this flips exactly once -- when the reveal is over -- rather than
   * ticking per frame: React does no work at all while the rings are moving. Dropping the flag
   * also restores the labels' backdrop blur and releases the rings' will-change promotion.
   */
  const [isRevealing, setIsRevealing] = useState(true);

  useEffect(() => {
    // 280ms (the last ring's delay) + 460ms (its duration), rounded up.
    const timer = setTimeout(() => setIsRevealing(false), 780);
    return () => clearTimeout(timer);
  }, []);

  const activeItems = rings[ZOOM_TO_RING[zoom]];

  const goToZoom = (next: 1 | 2 | 3) => setZoom(next);

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    if (Math.abs(event.deltaY) < 20) return;
    if (event.deltaY < 0 && zoom < 3) goToZoom((zoom + 1) as 1 | 2 | 3);
    else if (event.deltaY > 0 && zoom > 1) goToZoom((zoom - 1) as 1 | 2 | 3);
  };

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const first = event.touches.item(0);
    const second = event.touches.item(1);
    if (event.touches.length === 2 && first && second) {
      pinchDistanceRef.current = Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
    }
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
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

  return (
    // gap-10 rather than gap-6: a top-centre label now straddles its ring, so it reaches ~29px
    // above the map box (half of dot + gap + label). 40px keeps it clear of the tabs.
    <div className="flex flex-col items-center gap-10">
      <div className="flex items-center gap-2" role="tablist" aria-label="Career match strength">
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
            {ZOOM_LABEL[stage]}
          </button>
        ))}
      </div>

      <div
        className={cn("career-ring-map", isRevealing && "is-revealing")}
        data-zoom={zoom}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="ring-glow" />

        <button
          type="button"
          className="ring ring-outer"
          aria-label={`Show ${ZOOM_LABEL[1]}`}
          onClick={() => goToZoom(1)}
        />
        <button
          type="button"
          className="ring ring-middle"
          aria-label={`Show ${ZOOM_LABEL[2]}`}
          onClick={() => goToZoom(2)}
        />
        <button
          type="button"
          className="ring ring-inner"
          aria-label={`Show ${ZOOM_LABEL[3]}`}
          onClick={() => goToZoom(3)}
        />

        <div className="center-hub">
          <span className="grid size-7 place-items-center rounded-full bg-page text-brand">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <b className="mt-0.5 font-display text-xs font-bold text-foreground">YOU</b>
          <small className="font-display text-[0.6rem] font-extrabold tracking-wider text-muted-foreground">
            {ZOOM_LABEL[zoom].split(" ")[0]?.toUpperCase()}
          </small>
        </div>

        {/* One node per career: dot stacked directly above its label, the pair centred on the
            item's point on the ring circumference. Both --a and --r are pure functions of the
            item's index, the ring's own rendered radius and the container's size, so every
            position is resolved before the entrance animation starts and nothing is measured or
            recalculated while it runs. */}
        {activeItems.map((item, index) => {
          const percent = item.fitScore !== undefined ? Math.round(item.fitScore * 100) : null;
          return (
            <button
              key={item.itemId}
              type="button"
              className="dot-node"
              data-selected={selectedItemId === item.itemId}
              style={
                {
                  "--a": `${angleDeg(index, activeItems.length)}deg`,
                  "--r": `${ZOOM_RADIUS_CQMIN[zoom]}cqmin`,
                } as React.CSSProperties
              }
              onClick={() => onSelectCareer(item)}
            >
              <span className="dot" />
              <span className="dot-label">
                {item.title}
                {!hideMatchPercent && percent !== null ? ` ${percent}%` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
