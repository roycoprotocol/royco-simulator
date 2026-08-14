"use client";

import DayV3Button from "@/components/day-v3/DayV3Button";
import { cn } from "@/lib/utils";

// One 44px pressable item at every size, so `size` changes type and nothing
// else. The container used to declare 44/56/64 and render 54/58/58.
const ITEM_SIZES = {
  sm: "min-h-11 px-3 py-2 text-[12px]",
  md: "min-h-11 px-3 py-2 text-[12px]",
  lg: "min-h-11 px-3 py-2 text-[15px]",
} as const;

/** One visual and keyboard pattern for every short, mutually exclusive choice. */
export default function DayV3SegmentedControl<Value extends string>({
  ariaLabel,
  className,
  onValueChange,
  options,
  size = "md",
  toggleOnSelected = false,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onValueChange: (value: Value) => void;
  options: readonly { label: string; value: Value }[];
  size?: keyof typeof ITEM_SIZES;
  /** A two-way switch changes sides even when its selected half is clicked. */
  toggleOnSelected?: boolean;
  value: Value;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "grid gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-1 shadow-inner",
        className,
      )}
      role="group"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <DayV3Button
            aria-pressed={selected}
            className={cn(
              "w-full border-transparent shadow-none hover:translate-y-0 active:translate-y-0",
              ITEM_SIZES[size],
              selected
                ? "hover:opacity-100"
                : "hover:bg-[var(--background)]",
            )}
            key={option.value}
            onClick={() => {
              if (selected && toggleOnSelected && options.length === 2) {
                onValueChange(options[index === 0 ? 1 : 0].value);
                return;
              }
              onValueChange(option.value);
            }}
            size="inline"
            variant={selected ? "primary" : "quiet"}
          >
            {option.label}
          </DayV3Button>
        );
      })}
    </div>
  );
}
