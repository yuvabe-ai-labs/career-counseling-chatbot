import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // The whole app's button system lives here: a pill (rounded-full) with 16px bold text, at a
  // consistent 48px height with 24px of horizontal padding. Every screen used to restate that
  // itself — "h-[49px] … rounded-2xl text-xl font-bold shadow-none" was copied onto ~10 call
  // sites, and had already drifted (one pair was text-base font-semibold, heights were 49px
  // against the auth forms' 48px) — so it's centralised here and the call sites now pass only
  // what's genuinely theirs, like a width.
  //
  // No font-family is set at any level: buttons inherit the page's, same as before.
  //
  // transition-[color,background-color,border-color,transform] + active:scale is the one
  // subtle "press" feedback every button in the app gets, centrally — not per-screen, so it's
  // automatically consistent everywhere Button is used. disabled:pointer-events-none already
  // stops :active from engaging on a disabled button, so no extra guard is needed there.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-base font-bold cursor-pointer transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Shadowless by design — every call site was already passing shadow-none over the old
        // `shadow`/`shadow-sm`, so this just makes the default match how it's actually used.
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-12 px-6",
        sm: "h-9 px-4 text-sm",
        lg: "h-12 px-8",
        icon: "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
