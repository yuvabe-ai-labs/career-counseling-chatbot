import { Building2, ChevronRight } from "lucide-react";
import type { RecommendationItem } from "@yuvapath/contracts";
import { isCollegeExplanation, OWNERSHIP_LABEL } from "./CollegeDetailSheet";

export type CollegeOptionCardProps = {
  item: RecommendationItem;
  onSelect: (item: RecommendationItem) => void;
};

/**
 * One eligible Tamil Nadu college in the district the student picked on CollegePage. Shows the
 * real catalogue facts — institute kind, ownership, district.
 */
export function CollegeOptionCard({ item, onSelect }: CollegeOptionCardProps) {
  const explanation = isCollegeExplanation(item.explanation) ? item.explanation : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="relative flex w-full cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-[#e9e2f7] bg-background p-5 text-left shadow-[0px_2px_8px_-4px_rgba(89,42,199,0.05),0px_10px_24px_-12px_rgba(15,23,42,0.03)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0px_4px_12px_-4px_rgba(89,42,199,0.1),0px_16px_32px_-12px_rgba(15,23,42,0.06)] active:translate-y-0 active:scale-[0.99]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <Building2 className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <p className="line-clamp-2 font-display text-base font-semibold text-foreground lg:text-lg">
          {item.title}
        </p>
        {explanation ? (
          <p className="mt-1 font-display text-sm font-medium text-muted-foreground">
            {explanation.instituteKind} · {OWNERSHIP_LABEL[explanation.ownership]} · {explanation.district}
          </p>
        ) : null}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
