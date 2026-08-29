"use client";

import { useState } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import { DAY_V3_POOL_PREMIUM_BPS_RANGE } from "@/lib/day-v3/pool-curve";
import { DAY_V3_POOL_SWAP_FEE_BPS_RANGE } from "@/lib/day-v3/pool-design";
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
 *
 * **Two cells, not a card containing two cells.** These were wrapped in their
 * own bordered box with its own heading, which put a third container level
 * inside a section that already has one and made the exit inputs read as four
 * different kinds of object. They are two answers like any other, so they sit
 * on the section's own grid and are built to the same shape as
 * `DayV3NumberField`.
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
  defaultPremiumBps,
  defaultSwapFeeBps,
  onPoolPremiumBps,
  poolPremiumEdited,
  poolPremiumBps,
  restingSeniorWeight,
  onSwapFeeBps,
  onTurnoverPerYear,
  onYieldPct,
  swapFeeBps,
  turnoverPerYear,
  yieldOrigin = "your-answer",
  yieldPct,
}: {
  label: string;
  onLabel: (value: string) => void;
  /** What the pool rests on today, in bps, so an empty field can say so. */
  defaultPremiumBps: number | null;
  /** The selected market's declared fee, used to distinguish a default from an edit. */
  defaultSwapFeeBps?: number;
  onPoolPremiumBps: (value: number | null) => void;
  /** Whether the displayed premium is an issuer edit or a loaded default. */
  poolPremiumEdited: boolean;
  /** The maximum premium the issuer will accept, in bps. Null uses the market's. */
  poolPremiumBps: number | null;
  /** Where the resulting curve rests, 0..1, for the field's own readout. */
  restingSeniorWeight: number | null;
  onSwapFeeBps: (value: number | null) => void;
  onTurnoverPerYear: (value: number | null) => void;
  onYieldPct: (value: number | null) => void;
  swapFeeBps: number | null;
  turnoverPerYear: number | null;
  yieldOrigin?: DayV3VisibleOrigin;
  yieldPct: number | null;
}) {
  const [draft, setDraft] = useState({ text: label, source: label });
  // An empty field is not the reader's answer and it is not the template's
  // either until one resolves, so it is labelled for what it is: the fee the
  // model is assuming. A hand-set fee is always the issuer's own override.
  const feeOrigin: DayV3VisibleOrigin =
    swapFeeBps === null ||
    (defaultSwapFeeBps !== undefined && swapFeeBps === defaultSwapFeeBps)
      ? "model-assumption"
      : "manual-override";
  // A parent reset (switching source, clearing the exit) replaces the label.
  // React's adjusted-state pattern re-seeds the draft without a second render.
  if (!Object.is(draft.source, label)) {
    setDraft({ text: label, source: label });
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-3 transition-[border-color,box-shadow] hover:border-[var(--secondary)] focus-within:border-[var(--foreground)] focus-within:shadow-[0_2px_10px_-4px_rgba(23,25,31,0.24)]">
        <label className="flex min-w-0 flex-col gap-2">
          <span className="flex items-start justify-between gap-3">
            <span className="cursor-pointer text-[12px] font-semibold leading-snug">
              What is Senior sold for?
            </span>
            <DayV3Origin origin={yieldOrigin} />
          </span>
          <span className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-2 py-2 focus-within:border-[var(--foreground)]">
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-[17px] font-bold leading-none outline-none placeholder:font-sans placeholder:text-[12px] placeholder:font-normal placeholder:text-[var(--tertiary)]"
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
          </span>
        </label>
        {/* Outside the label: a button nested in one steals the label's click
            and ends up focusing the text field instead. */}
        <div aria-label="Common quote assets" className="flex flex-wrap gap-2">
          {QUOTE_ASSET_SUGGESTIONS.map((suggestion) => (
            <DayV3Button
              aria-pressed={label === suggestion}
              key={suggestion}
              onClick={() => {
                setDraft({ text: suggestion, source: suggestion });
                onLabel(suggestion);
              }}
              className={
                label === suggestion
                  ? undefined
                  : "border-[var(--border-subtle)] bg-[var(--foundation)]"
              }
              size="chip"
              variant={label === suggestion ? "primary" : "quiet"}
            >
              {suggestion}
            </DayV3Button>
          ))}
        </div>
        <span className="text-[10px] leading-snug text-[var(--tertiary)]">
          The other side of every exit, and most of what the SLP holds.
        </span>
      </div>

      <DayV3NumberField
        label={`What net annual yield does ${label} earn in the pool?`}
        max={30}
        min={0}
        note="Paid to the SLP. 0 if the asset does not accrue."
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

      <DayV3NumberField
        label="How much does the pool trade in a year?"
        max={100}
        min={0}
        note="Annual swap volume ÷ pool value. 0 forecasts none, which is the honest default; above it pays the SLP fee income the pool has not been shown to earn."
        onChange={onTurnoverPerYear}
        origin={yieldOrigin}
        placeholder="Enter a multiple"
        presets={[
          { label: "0x", value: 0 },
          { label: "2x", value: 2 },
          { label: "8x", value: 8 },
        ]}
        step={0.5}
        suffix="x pool value"
        value={turnoverPerYear}
      />

      <DayV3NumberField
        label="What premium will you let Senior trade at, at most?"
        max={DAY_V3_POOL_PREMIUM_BPS_RANGE.max}
        min={0.01}
        note={
          restingSeniorWeight === null
            ? "Sets the pool's balance point: beta is 1 + this premium, and the resting composition follows from the curve. Empty models the pool at the premium shown."
            : `Sets the pool's balance point. The pool currently rests on ${(restingSeniorWeight * 100).toFixed(restingSeniorWeight < 0.1 ? 2 : 1)}% Senior shares and ${((1 - restingSeniorWeight) * 100).toFixed(2)}% ${label}. Wider means more Senior inventory and less depth for a seller. Empty models the pool at the premium shown.`
        }
        onChange={onPoolPremiumBps}
        origin={poolPremiumEdited ? "manual-override" : "model-assumption"}
        // The premium actually in force, whatever set it — the market's own
        // declared curve, a canonical pool, or the modeled default.
        placeholder={
          defaultPremiumBps === null
            ? "Use the modeled premium"
            : `${defaultPremiumBps.toFixed(2)} bps`
        }
        presets={[
          { label: "3 bps", value: 3 },
          { label: "10 bps", value: 10 },
          { label: "30 bps", value: 30 },
          { label: "50 bps", value: DAY_V3_POOL_PREMIUM_BPS_RANGE.max },
        ]}
        step={0.5}
        suffix="bps"
        value={poolPremiumBps}
      />

      <div className="flex min-w-0 flex-col gap-2">
        <DayV3NumberField
          label="What swap fee should the pool charge on a sale?"
          max={DAY_V3_POOL_SWAP_FEE_BPS_RANGE.max}
          min={DAY_V3_POOL_SWAP_FEE_BPS_RANGE.min}
          note="Empty uses the selected market's declared fee. A value here is the per-market Gyro pool fee used in every quote; the contract accepts 0.01–10,000 bps. Higher fees reduce proceeds but do not make every trade impossible."
          onChange={onSwapFeeBps}
          origin={feeOrigin}
          placeholder="Use the market fee"
          presets={[
            { label: "1 bps", value: 1 },
            { label: "5 bps", value: 5 },
            { label: "10 bps", value: 10 },
            { label: "30 bps", value: 30 },
          ]}
          step={1}
          suffix="bps"
          value={swapFeeBps}
        />
      </div>
    </>
  );
}
