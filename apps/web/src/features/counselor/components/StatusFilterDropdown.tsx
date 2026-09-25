import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusFilterOption = {
  value: string;
  label: string;
  count?: number | undefined;
  /** Tailwind background color class for the status dot — omitted for "All Students", which
   *  Figma node 888:8309 ("student-status-filter", open state) renders with no dot of its own. */
  dotClassName?: string;
};

export type StatusFilterDropdownProps = {
  value: string;
  options: StatusFilterOption[];
  onValueChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * A custom dropdown (not the native-<select>-backed SelectField) specifically so each option can
 * show its own colored status dot — Figma node 888:8309's open-state dropdown does this (a green
 * dot for Completed, orange for In Progress), which a native <select>'s browser-rendered option
 * list can't render. Closes on outside click and Escape, like Combobox's own pattern.
 */
export function StatusFilterDropdown({
  value,
  options,
  onValueChange,
  className,
  ...aria
}: StatusFilterDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex h-12 w-full cursor-pointer items-center gap-2 rounded-[8px] border border-input bg-white px-4 text-sm font-medium text-foreground outline-none transition-[border-color,box-shadow] duration-150 hover:border-brand/40 focus-visible:ring-1 focus-visible:ring-ring"
        {...aria}
      >
        {selected?.dotClassName ? (
          <span
            className={cn("size-2 shrink-0 rounded-full", selected.dotClassName)}
            aria-hidden="true"
          />
        ) : null}
        <span className="flex-1 text-left">{selected?.label}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 opacity-50 transition-transform duration-200", isOpen && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <ul
          role="listbox"
          className="origin-top animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 absolute z-20 mt-1 w-full min-w-[210px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onValueChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors duration-150",
                    isSelected ? "bg-brand-soft" : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {option.dotClassName ? (
                    <span
                      className={cn("size-2 shrink-0 rounded-full", option.dotClassName)}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="size-2 shrink-0" aria-hidden="true" />
                  )}
                  <span className="flex-1">{option.label}</span>
                  {option.count !== undefined ? (
                    <span className="text-xs text-muted-foreground">{option.count}</span>
                  ) : null}
                  {isSelected ? (
                    <Check className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
