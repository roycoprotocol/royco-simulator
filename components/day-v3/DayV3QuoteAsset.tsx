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
    swapFeeBps === null ? "model-assumption" : "manual-override";
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
          The pool&apos;s quote asset: the other side of every immediate exit,
          and most of what the SLP holds at rest.
        </span>
      </div>

      <DayV3NumberField
        label={`What net annual yield does ${label} earn in the pool?`}
        max={30}
        min={0}
        note="0 for a quote asset that does not accrue. Anything above 0 is paid to the SLP and shows as exit-asset carry in the position comparison."
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
        note="Annual swap volume as a multiple of pool value. 0 makes no volume forecast, which is the honest default; anything above it pays the SLP fee income the pool has not been shown to earn."
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

      <div className="flex min-w-0 flex-col gap-2">
        <DayV3NumberField
          label="What swap fee should the pool charge on a sale?"
          // 1000 bps is 10%, an order of magnitude above any pool anyone runs
          // and well clear of the corner where modeled fee income compounds
          // past what the engine can hold.
          max={1000}
          min={0.01}
          note="Empty charges whatever the live template charges, or the market's declared fee until it resolves. A fee set here prices every quote on this page and keeps the live template's curve while replacing what it charges to trade on it, so the canonical pool result — solved at the template's own fee — is withheld. From 100 bps the fee alone exceeds the near-NAV reference, so no positive trade can meet it."
          onChange={onSwapFeeBps}
          origin={feeOrigin}
          placeholder="Use the live fee"
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
        {/* Outside the field: it clears the reader's answer rather than
            choosing another one, so it does not belong among the presets. */}
        <div className="flex flex-wrap gap-2">
          <DayV3Button
            aria-pressed={swapFeeBps === null}
            className={
              swapFeeBps === null
                ? undefined
                : "border-[var(--border-subtle)] bg-[var(--foundation)]"
            }
            onClick={() => onSwapFeeBps(null)}
            size="chip"
            variant={swapFeeBps === null ? "primary" : "quiet"}
          >
            Use the live fee
          </DayV3Button>
        </div>
      </div>
    </>
  );
}
