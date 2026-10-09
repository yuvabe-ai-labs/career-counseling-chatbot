import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import type { VerificationStatus } from "@yuvapath/contracts";
import { cn } from "@/lib/utils";
import { AdminButton, StatusFilterMenu } from "./admin-ui";

export type CatalogColumn = { label: string; align?: "right" };

export type CatalogListProps<Item> = {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  search: string;
  onSearch: (value: string) => void;
  status: VerificationStatus | "all";
  onStatus: (value: VerificationStatus | "all") => void;
  counts: Record<VerificationStatus | "all", number> | undefined;
  /** Right-aligned header actions, e.g. Bulk upload / Add college. */
  actions: ReactNode;
  /** Literal Tailwind grid-cols class shared by the header row and every row. */
  gridClass: string;
  columns: CatalogColumn[];
  items: readonly Item[] | undefined;
  itemKey: (item: Item) => string;
  itemHref: (item: Item) => string;
  /** One cell per column, in order. */
  cells: (item: Item) => ReactNode[];
  isLoading: boolean;
  errorMessage: string | null;
  emptyMessage: string;
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The list screen both Colleges and Aid/Scholarships share — Figma "admin clg list" (node
 * 1037:1297): 32px title, 16px subtitle, a 48px toolbar (search + status filter on the left,
 * actions on the right) and a 56px tinted header over 72px rows. Page offsets are the ones the
 * frame measures: 15px title→toolbar, 53px toolbar→table.
 */
export function CatalogList<Item>(props: CatalogListProps<Item>) {
  const { search, onSearch } = props;
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => onSearch(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, search, onSearch]);

  const firstShown = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const lastShown = Math.min(props.page * props.pageSize, props.total);
  const lastPage = Math.max(1, Math.ceil(props.total / props.pageSize));

  return (
    <div className="pt-[29px]">
      <div className="flex flex-col gap-[9px]">
        <h1 className="text-[32px] leading-[normal] font-semibold text-[#1e1b4b]">{props.title}</h1>
        <p className="text-base leading-[normal] font-normal text-[#7c8295]">{props.subtitle}</p>
      </div>

      <div className="mt-[15px] flex flex-wrap items-center gap-4">
        <div className="flex h-12 w-[371px] max-w-full items-center gap-3 rounded-lg border border-[#e5edf5] bg-white px-4">
          <Search className="size-[18px] shrink-0 text-[#1e1b4b]" aria-hidden="true" />
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={props.searchPlaceholder}
            aria-label={props.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-base text-[#1e1b4b] placeholder:text-[#6b7280] focus:outline-none"
          />
        </div>
        <StatusFilterMenu value={props.status} onChange={props.onStatus} counts={props.counts} />
        <div className="flex items-center gap-4 sm:ml-auto">{props.actions}</div>
      </div>

      <div className="mt-[53px] overflow-x-auto rounded-t-xl">
        <div role="table" className="min-w-[860px] rounded-t-xl border-x border-t border-[#e5edf5] bg-white">
          <div
            role="row"
            className={cn(
              "grid h-14 items-center gap-4 border border-[#e5edf5] bg-[#f0eaff] px-4 text-base font-normal text-[#1e1b4b]",
              props.gridClass,
            )}
          >
            {props.columns.map((column) => (
              <span
                key={column.label}
                role="columnheader"
                className={cn(column.align === "right" && "text-right")}
              >
                {column.label}
              </span>
            ))}
          </div>

          {props.errorMessage ? (
            <p role="alert" className="border-b border-[#e5edf5] px-4 py-10 text-center text-base text-[#db3030]">
              {props.errorMessage}
            </p>
          ) : props.isLoading && !props.items ? (
            <p className="border-b border-[#e5edf5] px-4 py-10 text-center text-base text-[#7c8295]">Loading…</p>
          ) : props.items && props.items.length > 0 ? (
            props.items.map((item) => (
              <Link
                key={props.itemKey(item)}
                to={props.itemHref(item)}
                role="row"
                className={cn(
                  "grid h-[72px] items-center gap-4 border-b border-[#e5edf5] px-4 text-base font-normal text-[#1e1b4b] transition-colors hover:bg-[#fbfaff] focus-visible:bg-[#fbfaff] focus-visible:outline-none",
                  props.gridClass,
                )}
              >
                {props.cells(item).map((cell, index) => (
                  <div
                    // Cells are positional (one per column), so the index is a stable key here.
                    key={index}
                    role="cell"
                    className={cn("min-w-0", props.columns[index]?.align === "right" && "text-right")}
                  >
                    {cell}
                  </div>
                ))}
              </Link>
            ))
          ) : (
            <p className="border-b border-[#e5edf5] px-4 py-10 text-center text-base text-[#7c8295]">
              {props.emptyMessage}
            </p>
          )}
        </div>
      </div>

      {props.total > props.pageSize ? (
        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-[#6b7280]">
          <span>
            Showing {firstShown}–{lastShown} of {props.total}
          </span>
          <div className="flex gap-2">
            <AdminButton
              className="h-9 px-3 text-sm"
              disabled={props.page <= 1}
              onClick={() => props.onPage(props.page - 1)}
            >
              Previous
            </AdminButton>
            <AdminButton
              className="h-9 px-3 text-sm"
              disabled={props.page >= lastPage}
              onClick={() => props.onPage(props.page + 1)}
            >
              Next
            </AdminButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Two-line "name over secondary text" cell used for the first column of every list. */
export function NameCell({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 leading-[normal]">
      <p className="truncate text-base font-medium text-[#1e1b4b]">{title}</p>
      {subtitle ? <p className="truncate text-sm font-normal text-[#6b7280]">{subtitle}</p> : null}
    </div>
  );
}
