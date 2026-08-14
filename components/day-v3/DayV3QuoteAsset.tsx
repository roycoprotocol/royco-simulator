"use client";

import { useState } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import DayV3Origin, {
  type DayV3VisibleOrigin,
} from "@/components/day-v3/DayV3Origin";

/**
 * What Senior is sold for, and what that asset earns while it waits.
 *
 * The pool is two-sided: Senior shares on one side, the quote asset on the
 * other. Until this existed the quote side was modeled at a flat zero, so the
 * position comparison reported the SLP's exit-asset carry as +0.00% with no way
 * to say otherwise — true only for a non-yield-bearing stablecoin, and silently
 * wrong for anything else.
 *
 * The names are labels for the reader, not a claim about any asset's rate. The
 * yield is always the issuer's own number: nothing here pre-fills a rate for a
 * named token, because that would be inventing a source fact.
 */
const QUOTE_ASSET_SUGGESTIONS = [
  "sr-srRoyUSDC",
  "USDC",
  "USDT",
  "sUSDS",
  "sUSDe",
] as const;

export default function DayV3QuoteAsset({
  label,
  onLabel,
  onYieldPct,
  yieldOrigin = "your-answer",
  yieldPct,
}: {
  label: string;
  onLabel: (value: string) => void;
  onYieldPct: (value: number | null) => void;
  yieldOrigin?: DayV3VisibleOrigin;
  yieldPct: number | null;
}) {
  const [draft, setDraft] = useState({ text: label, source: label });
  // A parent reset (switching source, clearing the exit) replaces the label.
  // React's adjusted-state pattern re-seeds the draft without a second render.
  if (!Object.is(draft.source, label)) {
    setDraft({ text: label, source: label });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-[12.5px] font-semibold leading-tight">
          What is Senior sold for?
        </h4>
        <DayV3Origin origin={yieldOrigin} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold leading-snug">
              Quote asset
            </span>
            <input
              className="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2 font-mono text-[20px] font-bold leading-none outline-none placeholder:font-sans placeholder:text-[13px] placeholder:font-normal placeholder:text-[var(--tertiary)] focus:border-[var(--foreground)]"
              maxLength={24}
              onBlur={() => {
                const cleaned = draft.text.trim();
                if (cleaned === "") {
                  setDraft({ text: label, source: label });
                  return;
                }
                setDraft({ text: cleaned, source: cleaned });
                onLabel(cleaned);
              }}
              onChange={(event) => {
                const next = event.target.value;
                setDraft((current) => ({ ...current, text: next }));
                const cleaned = next.trim();
                if (cleaned !== "") onLabel(cleaned);
              }}
              placeholder="Name the asset"
              type="text"
              value={draft.text}
            />
          </label>
          {/* Outside the label: a button nested in one steals the label's
              click and ends up focusing the text field instead. */}
          <div aria-label="Common quote assets" className="flex flex-wrap gap-1.5">
            {QUOTE_ASSET_SUGGESTIONS.map((suggestion) => (
              <DayV3Button
                aria-pressed={label === suggestion}
                key={suggestion}
                onClick={() => {
                  setDraft({ text: suggestion, source: suggestion });
                  onLabel(suggestion);
                }}
                size="sm"
                variant={label === suggestion ? "primary" : "quiet"}
              >
                {suggestion}
              </DayV3Button>
            ))}
          </div>
          <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
            The pool&apos;s quote asset: the other side of every immediate exit,
            most of what the SLP holds at rest, and the exit asset in the
            position comparison.
          </p>
        </div>

        <DayV3NumberField
          className="bg-[var(--foundation)]"
          label={`What net annual yield does ${label} earn in the pool?`}
          max={30}
          min={0}
          note="Enter 0 for a quote asset that does not accrue. Anything above 0 is paid to the SLP, which holds the quote side, and shows as exit-asset carry in the position comparison."
          onChange={onYieldPct}
          origin={yieldOrigin}
          placeholder="Enter yield"
          presets={[
            { label: "0%", value: 0 },
            { label: "4%", value: 4 },
            { label: "5%", value: 5 },
          ]}
          step={0.1}
          suffix="% a year"
          value={yieldPct}
        />
      </div>
    </div>
  );
}
