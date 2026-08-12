import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Shared interaction states for v2 controls that are more complex than a button. */
export const DAY_V2_CONTROL_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]";

export const DAY_V2_CONTROL_MOTION =
  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150";

/**
 * The small action vocabulary used throughout /v2.
 *
 * Primary advances the flow, secondary performs a local action, quiet is used
 * inside a grouped control, and link keeps an action grammatically inside a
 * sentence. Different jobs retain hierarchy while sharing geometry and states.
 */
export const dayV2ButtonVariants = cva(
  cn(
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border text-[12px] font-semibold leading-none",
    DAY_V2_CONTROL_MOTION,
    DAY_V2_CONTROL_FOCUS,
    "hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0",
  ),
  {
    variants: {
      variant: {
        primary:
          "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] shadow-[0_2px_7px_-4px_rgba(23,25,31,0.65)] hover:opacity-90",
        secondary:
          "border-[var(--border-subtle)] bg-[var(--card)] text-[var(--foreground)] shadow-[0_2px_7px_-5px_rgba(23,25,31,0.35)] hover:border-[var(--secondary)] hover:bg-[var(--background)]",
        quiet:
          "border-transparent bg-transparent text-[var(--secondary)] hover:bg-[var(--card)] hover:text-[var(--foreground)]",
        link:
          "border-transparent bg-transparent text-[var(--foreground)] underline decoration-dotted underline-offset-2 hover:translate-y-0 hover:text-[var(--secondary)]",
      },
      size: {
        sm: "min-h-9 px-3 py-2",
        md: "min-h-11 px-4 py-2.5",
        lg: "min-h-12 px-5 py-3 text-[13px]",
        icon: "size-10 p-0",
        inline: "min-h-0 p-0 text-[length:inherit] leading-[inherit]",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "secondary",
    },
  },
);

export type DayV2ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof dayV2ButtonVariants>;

export default function DayV2Button({
  className,
  size,
  type = "button",
  variant,
  ...props
}: DayV2ButtonProps) {
  return (
    <button
      className={cn(dayV2ButtonVariants({ size, variant }), className)}
      type={type}
      {...props}
    />
  );
}
