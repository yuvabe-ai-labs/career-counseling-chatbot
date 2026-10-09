import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import type { ZodError } from "zod";
import { cn } from "@/lib/utils";

/**
 * Figma "admin clg list" detail frame (node 996:4503): a 28px "Back to …" link, 32px title and
 * 16px subtitle (9px apart), then — 40px below — the white 12px-radius card holding the form.
 */
export function DetailShell({
  backTo,
  backLabel,
  title,
  subtitle,
  children,
}: {
  backTo: string;
  backLabel: string;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="pt-[41px]">
      <header className="mb-10 flex flex-col gap-[9px]">
        <Link
          to={backTo}
          className="flex h-7 w-fit items-center gap-2.5 pr-2.5 text-base font-normal text-black hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <h1 className="text-[32px] leading-[normal] font-semibold text-[#17151f]">{title}</h1>
        {subtitle ? <p className="text-base leading-[normal] text-[#6b7280]">{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}

/** The white form card: 24px padding, 24px between the fields block and the action row. */
export function FormCard({
  children,
  className,
  onSubmit,
}: {
  children: ReactNode;
  className?: string;
  onSubmit?: () => void;
}) {
  const classes = cn("flex flex-col gap-6 rounded-xl border border-[#e5edf5] bg-white p-6", className);
  if (!onSubmit) return <section className={classes}>{children}</section>;
  return (
    <form
      noValidate
      className={classes}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** Two columns at md+, one on phones — Figma's row-1…row-5 each hold a pair of fields. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

/** Delete on the left of the save button, both right-aligned, 16px apart (Figma `actions`). */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-4 pt-4">{children}</div>;
}

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-lg bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]">
      {message}
    </p>
  ) : null;
}

/** zod issues → the first message per top-level field. */
export function fieldErrors(error: ZodError, messages: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= messages[key] ?? (issue.code === "too_small" ? "This field is required." : "Enter a valid value.");
  }
  return result;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "18 Sep 2026", as Figma shows it (Intl's en-GB spells September "Sept"). */
export function formatVerifiedDate(iso: string | null): string {
  if (!iso) return "Never verified";
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
