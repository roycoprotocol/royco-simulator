"use client";

import { DAY_ISSUER_PRESETS, type DayIssuerPreset, type DayIssuerPresetId } from "@/lib/day-simulator-template/issuer-presets";

/**
 * The shipped issuer presets, which already carry their own labels, captions
 * and rationales. Nothing here is invented copy: a preset is a named design an
 * issuer would actually ask for, and it sets the whole design rather than the
 * two sliders that happen to be on screen.
 *
 * It renders bare, with no section or card of its own, because it is now one
 * row inside the single input panel. Pressing one of these moves the terms in
 * the same box, so putting it in a separate band was claiming a separation that
 * does not exist. Note a preset sets the split terms and not the source rate,
 * which is why the label says "start from" rather than "set all of them".
 */
export default function DayV3Presets({
  activeId,
  onSelect,
}: {
  activeId: DayIssuerPresetId | null;
  onSelect: (preset: DayIssuerPreset) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]"
        id="day-v3-presets-heading"
      >
        Or start from a named design
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DAY_ISSUER_PRESETS.map((preset) => {
          const active = preset.id === activeId;
          return (
            <button
              aria-pressed={active}
              // They read as cards, so nobody pressed them. A raised surface, a
              // pointer, a hover lift and an explicit affordance on each one.
              className={`group flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-3 text-left transition-[transform,box-shadow,border-color] hover:-translate-y-px ${
                active
                  ? "border-[var(--foreground)] bg-[var(--card)] shadow-[0_2px_10px_-4px_rgba(23,25,31,0.22)]"
                  : "border-[var(--border-subtle)] bg-[var(--card)] hover:border-[var(--secondary)] hover:shadow-[0_2px_10px_-4px_rgba(23,25,31,0.16)]"
              }`}
              key={preset.id}
              onClick={() => onSelect(preset)}
              title={preset.rationale}
              type="button"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold">{preset.label}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--tertiary)]">
                  {preset.values.coveragePct}% cover · {preset.values.minLiquidityPct}% liq
                </span>
              </span>
              {/* The affordance stays on the card. These read as cards and
                  nobody pressed them, which is why the word is here at all;
                  losing it to save a line would buy the same bug back. */}
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-[10.5px] leading-snug text-[var(--tertiary)]">
                  {preset.caption}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-semibold ${
                    active
                      ? "text-[var(--tertiary)]"
                      : "text-[var(--foreground)] underline underline-offset-2"
                  }`}
                >
                  {active ? "Applied" : "Apply"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
