import { cn } from "@/lib/utils";

export type DayV3VisibleOrigin =
  | "your-answer"
  | "source-fact"
  | "recommended"
  | "derived"
  | "product-policy"
  | "live-template"
  | "manual-override"
  | "illustrative";

const LABELS: Record<DayV3VisibleOrigin, string> = {
  "your-answer": "Your answer",
  "source-fact": "Source fact",
  recommended: "Recommended",
  derived: "Derived",
  "product-policy": "Product policy",
  "live-template": "Live template",
  "manual-override": "Manual override",
  illustrative: "Illustrative",
};

export default function DayV3Origin({
  className,
  origin,
}: {
  className?: string;
  origin: DayV3VisibleOrigin;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--foundation)] px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]",
        origin === "manual-override" &&
          "border-[color-mix(in_srgb,var(--theme-gold)_45%,transparent)] text-[var(--gold-emphasis)]",
        className,
      )}
    >
      {LABELS[origin]}
    </span>
  );
}
