import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlanStepCardProps = {
  title: string;
  description: string;
  image: string;
  imageClassName: string;
  done: boolean;
  onToggle: () => void;
};

/**
 * One plan step on PlanPage — Figma node 611:147 ("plans"), card-arts/card-commerce/
 * card-science. Same card shell, font scale, and artwork treatment as StreamOptionCard, but the
 * "Graphic Ring" holds a checkbox (Figma's "Check Trigger") instead of a category icon: Plan
 * steps aren't categories to browse, they're a checklist, so checked/unchecked is the one piece
 * of per-step state worth showing. There's no backend concept of step completion — see
 * lib/plan-step-progress.ts — so `done`/`onToggle` are purely local UI state.
 */
export function PlanStepCard({
  title,
  description,
  image,
  imageClassName,
  done,
  onToggle,
}: PlanStepCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      className="relative flex min-h-[212px] w-full cursor-pointer flex-col gap-4 overflow-hidden rounded-[16px] border border-[#e9e2f7] bg-background p-5 text-left shadow-[0px_2px_8px_-4px_rgba(89,42,199,0.05),0px_10px_24px_-12px_rgba(15,23,42,0.03)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0px_4px_12px_-4px_rgba(89,42,199,0.1),0px_16px_32px_-12px_rgba(15,23,42,0.06)] active:translate-y-0 active:scale-[0.99]"
    >
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className={cn("pointer-events-none absolute opacity-55", imageClassName)}
      />

      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            "grid size-[56px] shrink-0 place-items-center rounded-[28px] border",
            done ? "border-brand bg-brand" : "border-[#e9e2f7] bg-background",
          )}
        >
          {done ? (
            <Check className="size-4 text-white" aria-hidden="true" strokeWidth={3} />
          ) : (
            <span className="size-4 rounded-[6px] border-2 border-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <p className="relative flex-1 font-display text-lg font-semibold text-foreground lg:text-xl">
          {title}
        </p>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      <p className="relative font-display text-sm leading-[1.35] text-[#1f2937] lg:text-base">
        {description}
      </p>
    </button>
  );
}
