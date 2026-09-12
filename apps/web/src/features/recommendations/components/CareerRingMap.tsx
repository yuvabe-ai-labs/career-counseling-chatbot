import type { RecommendationItem } from "@yuvanext/contracts";
import { RingMap, type RingMapRings } from "./RingMap";

export type CareerRingKey = "outer" | "middle" | "inner";

export type CareerRings = RingMapRings;

type CareerRingMapProps = {
  rings: CareerRings;
  hideMatchPercent: boolean;
  selectedItemId: string | null;
  onSelectCareer: (item: RecommendationItem) => void;
};

const ZOOM_LABEL = { 1: "Explore More", 2: "Strong Matches", 3: "Top Matches" } as const;

/**
 * The radial career map ported from the prototype the user supplied — now a thin,
 * career-specific wrapper around the generalized `RingMap` (see that file), which College also
 * uses. Kept as its own file/export so CareerPage.tsx needs no changes.
 */
export function CareerRingMap({
  rings,
  hideMatchPercent,
  selectedItemId,
  onSelectCareer,
}: CareerRingMapProps) {
  return (
    <RingMap
      rings={rings}
      zoomLabels={ZOOM_LABEL}
      hideMatchPercent={hideMatchPercent}
      selectedItemId={selectedItemId}
      onSelectItem={onSelectCareer}
      ariaLabel="Career match strength"
    />
  );
}
