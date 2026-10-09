import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { VerificationStatus } from "@yuvapath/contracts";
import { ApiRequestError } from "@/lib/api-client";
import { useEscapeKey } from "@/lib/use-escape-key";
import { cn } from "@/lib/utils";

/*
 * Visual primitives for the regional-admin screens. Every value here comes straight from the
 * Figma "clg list screen" frames (file 6qBgCDd9UU6glkp5TQ90JA, node 1044:1771): Inter throughout,
 * ink #1e1b4b, muted #6b7280 / #7c8295, brand #5829c7, tint #f0eaff, border #e5edf5, radii 8/9/12.
 * They deliberately don't reuse the app's pill-shaped Button or Poppins form styles, since the
 * admin console is its own surface with its own specs.
 */

export const STATUS_COLOR: Record<VerificationStatus, string> = {
  verified: "#12B76A",
  unverified: "#F79009",
  stale: "#8B5CF6",
  // Not drawn in Figma (the design only shows three states); neutral grey keeps it distinct.
  retired: "#6b7280",
};

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  verified: "Verified",
  unverified: "Unverified",
  stale: "Stale",
  retired: "Retired",
};

export const STATUS_OPTIONS: VerificationStatus[] = ["verified", "unverified", "stale", "retired"];

export function StatusDot({ status, className }: { status: VerificationStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: STATUS_COLOR[status] }}
    />
  );
}

/** Server messages for these codes are already written for the person using the console. */
const SERVER_MESSAGE_CODES = new Set(["out_of_scope", "in_use", "not_found", "no_dataset"]);

export function adminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    if (SERVER_MESSAGE_CODES.has(error.code)) return error.message;
    if (error.code === "invalid_request") return "Some fields are invalid. Check them and try again.";
  }
  return fallback;
}

// ------------------------------------------------------------------ buttons

const buttonBase =
  "inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[9px] border px-4 font-medium text-base whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5829c7]/40 disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants = {
  /** "Bulk upload" / "Delete": border only, brand text. */
  outline: "border-[#e5edf5] bg-white text-[#5829c7] hover:bg-[#f0eaff]",
  /** "Add college" at rest: tint fill, solid brand on hover (Figma frame 1029:1135). */
  tint: "border-[#e5edf5] bg-[#f0eaff] text-[#5829c7] hover:border-[#5829c7] hover:bg-[#5829c7] hover:text-white",
  /** "Save Changes". */
  solid: "border-[#5829c7] bg-[#5829c7] text-white hover:bg-[#4a21a8]",
} as const;

export function AdminButton({
  variant = "outline",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariants }) {
  return <button type="button" className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

// ------------------------------------------------------------------- fields

const controlClass =
  "h-12 w-full rounded-lg border border-[#e5edf5] bg-white px-3 text-sm text-[#1e1b4b] placeholder:text-[#7c8295] focus:border-[#5829c7] focus:outline-none focus:ring-2 focus:ring-[#5829c7]/20 disabled:cursor-not-allowed disabled:text-[#7c8295]";

export function Field({
  label,
  required,
  error,
  hint,
  className,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm leading-[normal] font-medium text-[#1e1b4b]">
        {label}
        {required ? (
          <>
            {" "}
            <span className="text-[#db3030]" aria-hidden="true">
              *
            </span>
          </>
        ) : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[#7c8295]">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-[#db3030]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "h-auto min-h-24 resize-y py-3", className)} {...props} />;
}

/** A native select (keyboard and mobile friendly) restyled to the Figma select, chevron included. */
export function SelectInput({
  className,
  children,
  leading,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { leading?: ReactNode }) {
  return (
    <div className="relative">
      {leading ? (
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">{leading}</span>
      ) : null}
      <select
        className={cn(controlClass, "cursor-pointer appearance-none pr-9", leading && "pl-8", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#1e1b4b]"
        aria-hidden="true"
      />
    </div>
  );
}

/** Verification-status select: the selected status' dot sits inside the field, as in Figma. */
export function StatusSelectInput({
  value,
  onChange,
  id,
}: {
  value: VerificationStatus;
  onChange: (value: VerificationStatus) => void;
  id?: string;
}) {
  return (
    <SelectInput
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as VerificationStatus)}
      leading={<StatusDot status={value} />}
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABEL[status]}
        </option>
      ))}
    </SelectInput>
  );
}

// -------------------------------------------------------- status filter menu

/** The list screens' status filter — Figma "Status dropdown — expanded" (node 1029:1281). */
export function StatusFilterMenu({
  value,
  onChange,
  counts,
}: {
  value: VerificationStatus | "all";
  onChange: (value: VerificationStatus | "all") => void;
  counts: Record<VerificationStatus | "all", number> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useEscapeKey(open, close);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const options: (VerificationStatus | "all")[] = ["all", "verified", "unverified", "stale", "retired"];
  const labelFor = (option: VerificationStatus | "all") => (option === "all" ? "All" : STATUS_LABEL[option]);

  return (
    <div ref={containerRef} className="relative w-56 shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full cursor-pointer items-center justify-between overflow-clip rounded-lg border border-[#e5edf5] bg-white px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5829c7]/30"
      >
        <span className="flex items-center gap-2 overflow-clip text-base leading-[1.2] font-medium whitespace-nowrap text-[#1e1b4b]">
          {value === "all" ? null : <StatusDot status={value} />}
          {labelFor(value)}
        </span>
        <ChevronDown className="size-4 shrink-0 text-[#1e1b4b]" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={menuId}
          role="listbox"
          className="absolute top-14 left-0 z-20 w-56 overflow-clip rounded-lg border border-[#e5edf5] bg-white px-px shadow-[0px_6px_16px_0px_rgba(30,22,70,0.12)]"
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-10 w-full cursor-pointer items-center justify-between overflow-clip rounded-md px-[11px] text-left hover:bg-[#f8f4ff]",
                    selected ? "bg-[#f8f4ff] pl-[27px] text-[#592ac7]" : "bg-white text-[#1e1b4b]",
                  )}
                >
                  <span className="flex items-center gap-2 text-base leading-[1.2] font-normal whitespace-nowrap">
                    {option === "all" ? null : <StatusDot status={option} />}
                    {labelFor(option)}
                  </span>
                  <span className="w-8 text-right text-[11px] font-medium">{counts?.[option] ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------- modal

export function Modal({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  useEscapeKey(true, onClose);
  const titleId = useId();
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e1b4b]/40 p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[86vh] w-full max-w-[460px] overflow-y-auto rounded-xl border border-[#e5edf5] bg-white p-6 shadow-[0px_6px_16px_0px_rgba(30,22,70,0.12)]"
      >
        <h2 id={titleId} className="mb-3 text-xl font-semibold text-[#1e1b4b]">
          {title}
        </h2>
        <div className="text-sm leading-relaxed text-[#6b7280]">{children}</div>
        <div className="mt-6 flex justify-end gap-4">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

// -------------------------------------------------------------------- toast

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<((message: string, tone?: Toast["tone"]) => void) | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = (nextId.current += 1);
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200);
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-5 bottom-5 z-[60] flex max-w-[min(340px,calc(100vw-40px))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-lg bg-[#1e1b4b] px-4 py-3 text-sm text-white shadow-[0px_6px_16px_0px_rgba(30,22,70,0.24)]"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: toast.tone === "success" ? "#12B76A" : "#db3030" }}
            />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useAdminToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useAdminToast must be used within a ToastProvider");
  return context;
}
