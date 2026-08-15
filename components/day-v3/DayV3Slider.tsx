"use client";

import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import { dayV3RangeStyle } from "@/components/day-v3/range";
import type { DayDocsKey } from "@/lib/day-simulator-template/docs-links";

/**
 * The one slider on this page.
 *
 * It was three. The three headline terms had a big value and endpoint labels,
 * the observation period and pool band had a cramped variant with the value
 * jammed against the row edge and no endpoints, and the six curve anchors had a
 * third shape again. Three families reading as three unrelated kinds of control
 * is most of why the input panel did not scan: a reader cannot tell that all
 * nine of these do the same thing.
 *
 * `size` changes the value's type scale and nothing else, so a curve anchor is
 * visibly subordinate to a headline term while staying the same object. Endpoint
 * labels are always rendered, because "what is the range of this thing" is the
 * first question a slider has to answer and the cramped variant never did.
 */
export default function DayV3Slider({
  display,
  docs,
  hint,
  label,
  max,
  maxLabel,
  min,
  minLabel,
  note,
  onChange,
  size = "lg",
  step,
  value,
}: {
  display: string;
  /** The docs section that defines this term, if the docs have one. */
  docs?: DayDocsKey;
  /** One line under the track. Long enough to be a sentence, never a paragraph. */
  hint?: string;
  label: string;
  max: number;
  maxLabel: string;
  min: number;
  minLabel: string;
  /** Short qualifier on the label line, dropped where the cell gets narrow. */
  note?: string;
  onChange: (value: number) => void;
  size?: "lg" | "sm";
  step: number;
  value: number;
}) {
  const big = size === "lg";
  return (
    // The card is a div and the label wraps only the control, so the docs link
    // can sit in the footer without nesting an anchor inside a label, where a
    // click would both navigate and focus the range.
    <div
      className={`flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] transition-[border-color,box-shadow] hover:border-[var(--secondary)] focus-within:border-[var(--foreground)] focus-within:shadow-[0_2px_10px_-4px_rgba(23,25,31,0.24)] gap-2 px-3 py-3`}
    >
      <label className={"flex cursor-pointer flex-col gap-2"}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
          {label}
          {note ? (
            // Dropped only in the band where cells sit side by side but stay
            // narrow, roughly 640 to 1024, where the note is what gets clipped.
            <span className="inline font-normal normal-case tracking-normal sm:hidden lg:inline">
              {" · "}
              {note}
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 font-mono font-bold leading-none tracking-[-0.02em] tabular-nums ${
            big ? "text-[22px]" : "text-[15px]"
          }`}
        >
          {display}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="w-7 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-[var(--tertiary)]">
          {minLabel}
        </span>
        <input
          // Named explicitly. The wrapping label would otherwise give the range
          // the whole cell's text as its accessible name, so a screen reader
          // announced the label, the big value and both endpoint numbers as one
          // string. The note is worth keeping in the name: "coverage,
          // first-loss requirement" is the useful reading.
          aria-label={note ? `${label}, ${note}` : label}
          aria-valuetext={display}
          className="day-v3-range"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          style={dayV3RangeStyle(value, min, max)}
          type="range"
          value={value}
        />
        <span className="w-7 shrink-0 font-mono text-[9.5px] tabular-nums text-[var(--tertiary)]">
          {maxLabel}
        </span>
      </span>
      </label>
      {hint || docs ? (
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] leading-snug text-[var(--tertiary)]">{hint}</span>
          {docs ? <DayV3DocsLink label={label.toLowerCase()} topic={docs} /> : null}
        </span>
      ) : null}
    </div>
  );
}
