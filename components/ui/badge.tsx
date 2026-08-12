import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Ported from royco-rwa-frontend components/ui/badge.tsx, trimmed to the
    tones this page uses. Tone carries meaning, never decoration. */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-[var(--border-subtle)] bg-[var(--foundation)] text-[var(--secondary)]",
        senior: "border-[color-mix(in_srgb,var(--theme-navy)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-navy)_10%,transparent)] text-[var(--navy-emphasis)]",
        junior: "border-[color-mix(in_srgb,var(--theme-brown)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-brown)_12%,transparent)] text-[#3e2616]",
        liquidity: "border-[color-mix(in_srgb,var(--theme-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-green)_10%,transparent)] text-[var(--green-emphasis)]",
        caution: "border-[color-mix(in_srgb,var(--theme-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-gold)_15%,transparent)] text-[var(--gold-emphasis)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
