import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A native <select> styled to match the shadcn/Radix select the visual
 * prototype uses, minus the Radix dependency — the option lists here (city,
 * state, country, education stage) are short and flat, so a native control
 * gives the same look with less surface area to maintain.
 */
export type SelectOption = { value: string; label: string };

export interface SelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly string[] | readonly SelectOption[];
  placeholder?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  id?: string;
}

function normalizeOptions(options: SelectFieldProps["options"]): SelectOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ value, onValueChange, options, placeholder, icon, disabled, className, id, ...aria }, ref) => {
    const normalized = normalizeOptions(options);
    return (
      <div className={cn("relative", className)}>
        {icon ? (
          <span
            className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-brand"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <select
          ref={ref}
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            "h-12 w-full cursor-pointer appearance-none rounded-[8px] border border-input bg-transparent py-2 pr-11 text-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            icon ? "pl-[46px]" : "pl-4",
            !value && "text-muted-foreground",
          )}
          {...aria}
        >
          {placeholder ? (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          ) : null}
          {normalized.map((option) => (
            <option key={option.value} value={option.value} className="text-foreground">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 opacity-50"
          aria-hidden="true"
        />
      </div>
    );
  },
);
SelectField.displayName = "SelectField";
