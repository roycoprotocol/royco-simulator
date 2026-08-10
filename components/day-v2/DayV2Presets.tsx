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
      <h2
        className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]"
        id="day-v2-presets-heading"
      >
        Start from a design
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DAY_ISSUER_PRESETS.map((preset) => {
          const active = preset.id === activeId;
          return (
            <button
              aria-pressed={active}
              className={`flex flex-col gap-1 rounded-xl border px-4 py-3 text-left ${
                active
                  ? "border-[var(--foreground)] bg-[var(--card)]"
                  : "border-[var(--border-subtle)] bg-[var(--foundation)]"
              }`}
              key={preset.id}
              onClick={() => onSelect(preset)}
              title={preset.rationale}
              type="button"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold">{preset.label}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-[var(--tertiary)]">
                  {preset.values.coveragePct}/{preset.values.minLiquidityPct}
                </span>
              </span>
              <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">
                {preset.caption}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
