/**
 * Slider interaction/visual design ported from the Lovable "Yuva Path Connect" prototype's
 * quiz screen (C:\Users\HP\Desktop\Yuva Path Connect\src\components\quiz\EmojiSlider.tsx) — a
 * native `<input type="range">` (so keyboard arrow-key adjustment and screen-reader semantics
 * come for free) laid transparently over a custom track/fill/thumb so the visible thumb can
 * show an emoji face instead of the browser's default control. The five response levels below
 * are that same file's `RESPONSES` array (a generic Likert legend, not RIASEC question content)
 * — deliberately NOT the prototype's toy/mascot ("Boba") reaction element next to it, which this
 * project has no equivalent of and isn't part of the assessment/slider design being ported.
 *
 * `value` is the 0-4 index into RESPONSES, kept distinct from the backend's 1-5 responseValue
 * scale (SubmitAssessmentResponseRequestSchema, packages/contracts/src/assessment.ts) — the
 * caller (RiasecAssessmentPage) converts index -> responseValue at submit time, so this
 * component doesn't need to know the backend's numbering at all.
 */
import { useRef } from "react";

const RESPONSES: { emoji: string; label: string }[] = [
  { emoji: "😣", label: "Dislike" },
  { emoji: "😕", label: "Not really" },
  { emoji: "😐", label: "Unsure" },
  { emoji: "🙂", label: "Like" },
  { emoji: "😍", label: "Love it" },
];

export interface RiasecSliderProps {
  /** 0-4 index into RESPONSES, or null when the student hasn't chosen a value yet. */
  value: number | null;
  onChange: (value: number) => void;
  label: string;
}

export function RiasecSlider({ value, onChange, label }: RiasecSliderProps) {
  // Unanswered still needs *some* thumb position to render at — centered ("Unsure") is neutral
  // rather than biasing toward either end, and the dimmed opacity below is what actually signals
  // "nothing chosen yet" to the student. `displayed` is only ever where the thumb *sits*; the
  // answer itself stays `value`, which is null until the student actually picks something.
  const displayed = value ?? 2;
  // A range input fires no change event when a click lands on the value it is already showing,
  // so deliberately choosing "Unsure" on a fresh question — where the thumb already rests at
  // Unsure — would otherwise be impossible from the track itself. onClick below commits in that
  // case; this flag stops it committing a second time when a change did fire (click follows
  // change on the same drag/press, and by then the parent may have moved to the next question).
  const changedRef = useRef(false);
  const pct = (displayed / (RESPONSES.length - 1)) * 100;
  const current = RESPONSES[displayed]!;

  return (
    <div className="mt-6 w-full">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        {/* The fill ramps from a soft purple up to full brand at the thumb, so how far the
            answer sits from "Dislike" reads as strength rather than as a flat bar. Same purple
            family as the rest of the product — no new hues, and nothing bright enough to pull
            attention off the question. */}
        <div
          className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-brand/30 via-brand/65 to-brand transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
        <span
          className={`pointer-events-none absolute top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background text-lg shadow-soft ring-1 ring-border transition-all duration-300 ${
            value === null ? "opacity-70" : ""
          }`}
          style={{ left: `${pct}%` }}
          aria-hidden="true"
        >
          {current.emoji}
        </span>
        <input
          type="range"
          min={0}
          max={RESPONSES.length - 1}
          step={1}
          value={displayed}
          onChange={(event) => {
            changedRef.current = true;
            onChange(Number(event.target.value));
          }}
          onClick={(event) => {
            if (changedRef.current) {
              changedRef.current = false;
              return;
            }
            onChange(Number(event.currentTarget.value));
          }}
          aria-label={label}
          aria-valuetext={current.label}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>

      <div className="mt-2 flex justify-between gap-1">
        {RESPONSES.map((response, index) => (
          <button
            key={response.label}
            type="button"
            onClick={() => onChange(index)}
            className={`shrink-0 cursor-pointer whitespace-nowrap font-display text-xs font-medium transition-colors sm:text-sm ${
              value === index ? "text-brand" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {response.label}
          </button>
        ))}
      </div>
    </div>
  );
}
