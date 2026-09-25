import { ExternalLink } from "lucide-react";
import type { AidScheme } from "@yuvapath/contracts";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const formatDate = (isoDate: string) => DATE_FORMAT.format(new Date(isoDate));

function applyWindowText(scheme: AidScheme): string | null {
  if (scheme.applyWindowStart && scheme.applyWindowEnd) {
    return `${formatDate(scheme.applyWindowStart)} – ${formatDate(scheme.applyWindowEnd)}`;
  }
  if (scheme.applyWindowEnd) return `Until ${formatDate(scheme.applyWindowEnd)}`;
  if (scheme.applyWindowStart) return `From ${formatDate(scheme.applyWindowStart)}`;
  return null;
}

/**
 * One scholarship/aid scheme on ScholarshipPage — the real catalogue facts only (provider,
 * benefit, amount, eligibility summary, apply window) plus a link to the official application
 * page. Fields the catalogue has no value for are simply not rendered.
 */
export function AidSchemeCard({ scheme }: { scheme: AidScheme }) {
  const window = applyWindowText(scheme);

  return (
    <article className="flex flex-col gap-2 rounded-[16px] border border-[#e9e2f7] bg-background p-5 shadow-[0px_2px_8px_-4px_rgba(89,42,199,0.05),0px_10px_24px_-12px_rgba(15,23,42,0.03)]">
      <div>
        <h2 className="font-display text-base font-semibold text-foreground lg:text-lg">
          {scheme.name}
        </h2>
        <p className="font-display text-sm font-medium text-muted-foreground">{scheme.provider}</p>
      </div>

      {scheme.amountText ? (
        <p className="w-fit rounded-full bg-brand/10 px-2.5 py-0.5 font-display text-xs font-semibold text-brand">
          {scheme.amountText}
        </p>
      ) : null}
      {scheme.benefitSummary ? (
        <p className="font-display text-sm text-foreground">{scheme.benefitSummary}</p>
      ) : null}
      {scheme.eligibilitySummary ? (
        <p className="font-display text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Who can apply: </span>
          {scheme.eligibilitySummary}
        </p>
      ) : null}
      {window ? (
        <p className="font-display text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Apply window: </span>
          {window}
        </p>
      ) : null}

      <a
        href={scheme.applicationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex w-fit items-center gap-1 font-display text-sm font-bold text-brand"
      >
        {scheme.portalName ? `Apply on ${scheme.portalName}` : "Apply"}
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </article>
  );
}
