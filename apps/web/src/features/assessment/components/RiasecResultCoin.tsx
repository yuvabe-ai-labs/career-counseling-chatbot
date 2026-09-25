import outerRim from "@/assets/riasec-coin-outer-rim.svg";
import mainFace from "@/assets/riasec-coin-main-face.svg";
import innerRing from "@/assets/riasec-coin-inner-ring.svg";
import bottomShadow from "@/assets/riasec-coin-bottom-shadow.svg";
import glossyHighlight from "@/assets/riasec-coin-glossy-highlight.svg";

export type RiasecResultCoinProps = {
  code: string;
};

/**
 * The RIASEC result coin — Figma "career" file node 346:224 ("RIASEC result coin"), five layered
 * SVGs (outer rim, main face, inner ring, bottom shadow, glossy highlight) plus the student's own
 * 3-letter code centered on top. Every inner layer is positioned as a percentage of the coin's
 * own box, derived once from the Figma frame's fixed 328px geometry (e.g. the main face sits
 * (328-304)/2 = 12px in from every edge, i.e. an inset of 12/328 ≈ 3.66%) rather than copied as
 * fixed pixels, so the whole coin scales as one unit at any size instead of only matching Figma
 * at exactly 328px.
 */
export function RiasecResultCoin({ code }: RiasecResultCoinProps) {
  return (
    <div
      // lg is smaller than sm here (220px vs 280px), unlike the rest of the scale — deliberate:
      // this only renders on RiasecResultsPage's Score segment, which is fitted to a no-scroll
      // desktop viewport at lg (see that page's <main> comment), so lg is tightened while
      // smaller breakpoints — which scroll freely — keep the larger, more Figma-faithful size.
      className="relative size-[240px] shrink-0 overflow-hidden rounded-full border border-[#e7e0f5] bg-background shadow-[0px_10px_24px_0px_rgba(89,42,199,0.08)] sm:size-[280px] lg:size-[220px]"
      role="img"
      aria-label={`Your RIASEC code: ${code}`}
    >
      <img src={outerRim} alt="" aria-hidden="true" className="absolute inset-0 size-full" />
      <img
        src={mainFace}
        alt=""
        aria-hidden="true"
        className="absolute inset-[3.66%] size-[92.68%]"
      />
      <img
        src={innerRing}
        alt=""
        aria-hidden="true"
        className="absolute inset-[12.2%] size-[75.6%]"
      />
      {/* Off-center layers: Figma positions each by its own center point, not an edge inset, so
          these keep the left/top-percent + -translate-1/2 pairing instead of `inset`. */}
      <img
        src={bottomShadow}
        alt=""
        aria-hidden="true"
        className="absolute top-[85.98%] left-1/2 size-[21.95%] -translate-x-1/2 -translate-y-1/2"
      />
      <img
        src={glossyHighlight}
        alt=""
        aria-hidden="true"
        className="absolute top-[28.05%] left-[28.05%] size-[36.59%] -translate-x-1/2 -translate-y-1/2"
      />
      <p
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-display text-4xl font-semibold text-brand sm:text-5xl lg:text-4xl"
      >
        {code}
      </p>
    </div>
  );
}
