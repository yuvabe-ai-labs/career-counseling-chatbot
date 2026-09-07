import * as React from "react";
import { ChevronDown } from "lucide-react";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ComboboxOption = { value: string; label: string };

export interface ComboboxProps {
  /** Currently selected value's display text — shown in the input when closed. */
  label: string;
  onSelect: (option: ComboboxOption) => void;
  /** Called (debounced) as the user types; also called once with "" on focus, for a starter list. */
  search: (query: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  disabledPlaceholder?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Extra classes for the inner <input> itself (the outer `className` only reaches the
   * positioning wrapper) — e.g. to force an opaque background when this sits somewhere that
   * isn't already an opaque white card. */
  inputClassName?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  id?: string;
}

const DEBOUNCE_MS = 250;

/**
 * Search-as-you-type dropdown, used for state/city fields backed by the
 * `reference.states`/`reference.cities` lookup (packages/knowledge). A plain
 * <select> doesn't work here — cities alone are ~4,100 rows, too many to hand
 * to the browser as static <option>s, so the list is fetched per keystroke
 * instead of enumerated up front.
 */
export function Combobox({
  label,
  onSelect,
  search,
  placeholder,
  disabledPlaceholder,
  icon,
  disabled,
  className,
  inputClassName,
  id,
  ...aria
}: ComboboxProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  // null = "hasn't typed since opening" — the input still displays `label`, but a
  // starter list (search("")) is fetched so there's something to browse. Once the
  // user types, this becomes the literal typed text and drives both the display
  // and the search — never clears `label` itself, so a re-open never looks "wiped".
  const [query, setQuery] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const [error, setError] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const requestIdRef = React.useRef(0);

  const runSearch = React.useCallback(
    (text: string) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      search(text)
        .then((results) => {
          if (requestIdRef.current === requestId) {
            setOptions(results);
            setError(null);
            setHighlightedIndex(results.length > 0 ? 0 : -1);
          }
        })
        .catch((caught: unknown) => {
          if (requestIdRef.current !== requestId) return;
          setOptions([]);
          // Surfaced as its own state, not folded into "No matches" — a failed
          // request and a genuinely empty result look identical to the user
          // otherwise, which makes a broken API (wrong port, CORS, backend down)
          // indistinguishable from "that place doesn't exist."
          setError(getErrorMessage(caught, "We couldn't load results. Please try again."));
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setIsLoading(false);
        });
    },
    [search],
  );

  // Debounced search whenever the user actually types (query !== null), while open.
  // Options from a still-in-flight previous search stay on screen until the new
  // ones land — nothing goes blank mid-search, only the spinner indicates work.
  React.useEffect(() => {
    if (!isOpen || query === null) return;
    const timer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, isOpen, runSearch]);

  // Close on outside click.
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const openAndSearch = () => {
    if (disabled) return;
    setIsOpen(true);
    setQuery(null); // keep showing `label`; don't blank the field just because it reopened
    setError(null);
    runSearch(""); // full starter list to browse before typing anything
  };

  const commitSelection = (option: ComboboxOption) => {
    onSelect(option);
    setIsOpen(false);
    setQuery(null);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        openAndSearch();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) commitSelection(option);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showEmptyState = isOpen && !isLoading && !error && options.length === 0;
  const displayValue = isOpen ? (query ?? label) : label;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {icon ? (
        <span
          className="pointer-events-none absolute top-1/2 left-4 z-10 size-[18px] -translate-y-1/2 text-brand"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        value={displayValue}
        placeholder={disabled ? disabledPlaceholder : placeholder}
        disabled={disabled}
        onFocus={openAndSearch}
        onClick={openAndSearch}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          "h-12 w-full cursor-text rounded-[8px] border border-input bg-transparent py-2 pr-11 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          icon ? "pl-[46px]" : "pl-4",
          !label && !isOpen && "text-muted-foreground",
          inputClassName,
        )}
        {...aria}
      />
      {isLoading ? (
        <Spinner className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 opacity-50" />
      ) : (
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 opacity-50"
          aria-hidden="true"
        />
      )}

      {isOpen ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.label === label}
              onPointerDown={(event) => {
                event.preventDefault(); // keep focus on input; avoid a blur before the click registers
                commitSelection(option);
              }}
              onPointerEnter={() => setHighlightedIndex(index)}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                index === highlightedIndex ? "bg-accent text-accent-foreground" : undefined,
              )}
            >
              {option.label}
            </li>
          ))}
          {showEmptyState ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches.</li>
          ) : null}
          {error ? (
            <li className="px-2 py-1.5 text-sm text-destructive">
              {error}{" "}
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  runSearch(query ?? "");
                }}
                className="font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
