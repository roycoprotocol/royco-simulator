"use client";

import { DAY_ISSUER_PRESETS, type DayIssuerPreset, type DayIssuerPresetId } from "@/lib/day-simulator-template/issuer-presets";

/**
 * The shipped issuer presets, which already carry their own labels, captions
 * and rationales. Nothing here is invented copy: a preset is a named design an
 * issuer would actually ask for, and it sets the whole design rather than the
 * two sliders that happen to be on screen.
 */
export default function DayV2Presets({
  activeId,
  onSelect,
}: {
  activeId: DayIssuerPresetId | null;
  onSelect: (preset: DayIssuerPreset) => void;
}) {
  return (
    <section aria-labelledby="day-v2-presets-heading" className="flex flex-col gap-2">
      {/* The last of the input zone, and still an input: pressing one of these
          moves the terms above. Its heading matches the two consoles' scale so
          the reader sees one band of things they set, not three unrelated
          strips. */}
      <h2
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]"
        id="day-v2-presets-heading"
      >
        Or start from a named design, then adjust
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DAY_ISSUER_PRESETS.map((preset) => {
          const active = preset.id === activeId;
          return (
            <button
              aria-pressed={active}
              // They read as cards, so nobody pressed them. A raised surface, a
              // pointer, a hover lift and an explicit affordance on each one.
              className={`group flex cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-[transform,box-shadow,border-color] hover:-translate-y-px ${
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
                <span className="font-mono text-[10.5px] tabular-nums text-[var(--tertiary)]">
                  {preset.values.coveragePct}% cover · {preset.values.minLiquidityPct}% liq
                </span>
              </span>
              <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">
                {preset.caption}
              </span>
              <span
                className={`text-[10px] font-semibold ${
                  active ? "text-[var(--tertiary)]" : "text-[var(--foreground)] underline underline-offset-2"
                }`}
              >
                {active ? "Applied" : "Apply this design"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
