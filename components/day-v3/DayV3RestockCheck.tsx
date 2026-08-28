"use client";

import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import { stake100, type DayV3Unit } from "@/components/day-v3/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardNote,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DayV3RestockCheck as DayV3RestockResult,
  DayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";

export type DayV3RestockView = {
  check: DayV3RestockResult | null;
  hurdle: DayV3RestockHurdle | null;
  /** The maximum discount the engine actually priced against. */
  maximumDiscountPct: number;
  /** Where that number came from, which is not always the payout floor. */
  maximumDiscountSource: "live-template" | "payout-floor" | "your-answer";
  /** The two operands the discount is actually computed from, so the note can
   *  show its own arithmetic instead of asserting a number. Using the sale size
   *  as the denominator would be the seller's all-in slippage, which includes
   *  the fee and does not match the bar. */
  selectedCurveInputPer100: number | null;
  selectedProceedsPer100: number | null;
  /** Which pool priced these quotes. `issuer-fee` is not a lesser answer than
   *  `unresolved` — it is the reader's own fee, which is exactly what they
   *  asked to model — but it is not the live template's pool either. */
  policyBasis: "live" | "unresolved" | "issuer-fee";
  selectedSalePer100: number | null;
  /** How much of that sale the pool could actually take in one trade. */
  selectedFilledPer100: number | null;
  /** The rest, which was never priced and never traded. */
  selectedUnfilledPer100: number | null;
  unit: DayV3Unit;
};

const bps = (value: number | null, digits = 0) =>
  value === null || !Number.isFinite(value)
    ? "—"
    // A true minus sign, matching the waterfall's own bars. `toFixed` writes a
    // hyphen, so a negative hurdle printed "-83 bps" in a sentence beside a
    // "−49 bps" bar describing the same kind of quantity.
    : `${value.toFixed(digits).replace("-", "\u2212")} bps`;

/** The same rule the exit-cost card follows: a market quoted in ETH never gets
 *  a dollar sign in front of a number of ETH. */
const amount = (value: number | null, unit: DayV3Unit, digits = 2) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : unit === "USD"
      ? `$${value.toFixed(digits)}`
      : value.toFixed(digits);

/**
 * One arbitrageur's trade, top to bottom, ending in what they keep.
 *
 * This was two bars against a threshold line, which is the comparison but not
 * the reasoning: a reader still had to subtract three costs in their head to
 * see why the line sat where it did. The trade is revenue minus costs, so it is
 * drawn as a waterfall — each bar starts where the last one ended, and the
 * final bar is the answer. Above zero, the trade happens and the pool refills.
 */
type WaterfallStep = {
  deltaBps: number;
  label: string;
  note: string;
};

/** Hoisted rather than declared inside the chart: a component defined during
 *  render remounts its subtree on every tick. Geometry arrives as percentages
 *  so this row never needs the scale. */
function WaterfallRow({
  carryPct,
  emphasis = false,
  leftPct,
  label,
  note,
  valueBps,
  widthPct,
  zeroPct,
}: {
  /** Where this bar ends, so the next one can be seen starting there. */
  carryPct?: number;
  emphasis?: boolean;
  leftPct: number;
  label: string;
  note: string;
  valueBps: number;
  widthPct: number;
  zeroPct: number;
}) {
  const gain = valueBps >= 0;
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3">
        <span
          className={
            emphasis
              ? "text-[11px] font-semibold"
              : "text-[10.5px] font-medium text-[var(--secondary)]"
          }
        >
          {label}
        </span>
        <span
          className={`font-mono tabular-nums whitespace-nowrap ${emphasis ? "text-[12.5px] font-bold" : "text-[11px] font-semibold"}`}
          style={
            emphasis
              ? {
                  color: gain
                    ? "var(--green-emphasis)"
                    : "var(--gold-emphasis)",
                }
              : undefined
          }
        >
          {gain ? "+" : "−"}
          {Math.abs(valueBps).toFixed(0)} bps
        </span>
      </span>
      <span aria-hidden="true" className="relative block">
        {/* Runs from this bar's end into the row below, so the eye can follow
            the running total instead of taking the arithmetic on trust. */}
        {carryPct === undefined ? null : (
          <span
            className="absolute -bottom-2 top-0 w-px bg-[var(--foreground)] opacity-30"
            style={{ left: `${carryPct}%` }}
          />
        )}
        <span
          className={`relative block overflow-hidden rounded-[3px] bg-[var(--foundation)] ${emphasis ? "h-4" : "h-3"}`}
        >
        {/* Zero is the only reference that matters, so it is drawn on every
            track rather than described once underneath. */}
        <span
          className="absolute inset-y-0 w-px bg-[var(--foreground)] opacity-25"
          style={{ left: `${zeroPct}%` }}
        />
        <span
          className="absolute inset-y-0 rounded-[3px]"
          style={{
            background: gain
              ? emphasis
                ? "var(--theme-green)"
                : "color-mix(in srgb, var(--theme-green) 78%, transparent)"
              : emphasis
                ? "var(--theme-gold)"
                : "color-mix(in srgb, var(--theme-gold) 72%, transparent)",
            left: `${leftPct}%`,
            width: `${widthPct}%`,
          }}
          />
        </span>
      </span>
      <span className="text-[9.5px] leading-snug text-[var(--tertiary)]">
        {note}
      </span>
    </div>
  );
}

/**
 * One arbitrageur's trade, top to bottom, ending in what they keep.
 *
 * This was two bars against a threshold line, which is the comparison but not
 * the reasoning: a reader still had to subtract three costs in their head to
 * see why the line sat where it did. The trade is revenue minus costs, so it is
 * drawn as a waterfall — each bar starts where the last one ended, and the
 * final bar is the answer. Above zero, the trade happens and the pool refills.
 */
function ArbitrageWaterfall({
  steps,
  totalBps,
  totalLabel,
  totalNote,
}: {
  steps: WaterfallStep[];
  /** Null when the selected sale has no quote. Substituting 0 rendered a green
   *  "+0 bps" under the label "They lose … below zero". */
  totalBps: number | null;
  totalLabel: string;
  totalNote: string;
}) {
  const bars = steps.reduce<(WaterfallStep & { from: number; to: number })[]>(
    (acc, step) => {
      const from = acc.length === 0 ? 0 : acc[acc.length - 1].to;
      return [...acc, { ...step, from, to: from + step.deltaBps }];
    },
    [],
  );

  const marks = [
    0,
    ...(totalBps === null ? [] : [totalBps]),
    ...bars.flatMap((bar) => [bar.from, bar.to]),
  ];
  const low = Math.min(...marks);
  const high = Math.max(...marks);
  // A flat span still needs a domain, and every bar needs room to sit inside
  // the track rather than flush against its edge.
  const pad = Math.max((high - low) * 0.08, 1);
  const lo = low - pad;
  const hi = high + pad;
  const at = (value: number) => ((value - lo) / (hi - lo)) * 100;
  const zeroPct = at(0);
  const geometry = (from: number, to: number) => {
    const leftPct = at(Math.min(from, to));
    return { leftPct, widthPct: Math.max(at(Math.max(from, to)) - leftPct, 0.6) };
  };

  return (
    <div className="flex flex-col gap-2">
      {bars.map((bar) => (
        <WaterfallRow
          carryPct={at(bar.to)}
          key={bar.label}
          label={bar.label}
          note={bar.note}
          valueBps={bar.deltaBps}
          zeroPct={zeroPct}
          {...geometry(bar.from, bar.to)}
        />
      ))}
      <div className="border-t border-[var(--border-subtle)] pt-3">
        {totalBps === null ? (
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold">{totalLabel}</span>
            <span className="font-mono text-[12.5px] font-bold tabular-nums text-[var(--tertiary)]">
              —
            </span>
          </span>
        ) : (
          <WaterfallRow
            emphasis
            label={totalLabel}
            note={totalNote}
            valueBps={totalBps}
            zeroPct={zeroPct}
            {...geometry(0, totalBps)}
          />
        )}
        {totalBps === null ? (
          <span className="mt-1 block text-[9.5px] leading-snug text-[var(--tertiary)]">
            {totalNote}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Does this design work for arbitrageurs?
 *
 * Nothing in the contract refills the exit pool. After a sale it sits below NAV
 * until an outside desk buys the discounted Senior, redeems it for the
 * underlying at NAV, and keeps the difference. That only happens when the
 * discount clears the desk's required return over the redemption wait, plus
 * the fee it pays to trade back in.
 *
 * This is a result, not an input: the discounts come from the exit design
 * above. The annual restock hurdle rate and the wait describe an outside
 * party, so they are stated on screen rather than assumed, and they change
 * nothing about the market being designed.
 */
export default function DayV3RestockCheck({
  costOfCapitalPct,
  onCostOfCapitalPct,
  onRedemptionDays,
  redemptionDays,
  view,
}: {
  costOfCapitalPct: number | null;
  onCostOfCapitalPct: (value: number | null) => void;
  onRedemptionDays: (value: number | null) => void;
  redemptionDays: number | null;
  view: DayV3RestockView;
}) {
  const {
    check,
    hurdle,
    maximumDiscountPct,
    maximumDiscountSource,
    policyBasis,
    selectedFilledPer100,
    selectedUnfilledPer100,
    unit,
    selectedCurveInputPer100,
    selectedProceedsPer100,
    selectedSalePer100,
  } = view;
  const missingInputs = costOfCapitalPct === null || redemptionDays === null;
  const resolved =
    !missingInputs &&
    hurdle !== null &&
    check !== null &&
    check.status !== "unavailable";
  const worstCasePays = resolved && (check.worstCaseMarginBps ?? -1) >= 0;
  const selectedPays = resolved && check.status === "profitable";
  const unpriced = resolved && check.status === "no-selected-sale";
  // The live template sizes the pool to the promised sale, so the deepest point
  // and the selected sale usually coincide.
  // A quote for less than the sale is a quote for a different trade.
  const partialFill =
    resolved &&
    selectedUnfilledPer100 !== null &&
    selectedUnfilledPer100 > 0.005 &&
    selectedFilledPer100 !== null &&
    selectedFilledPer100 > 0;
  const deeperExists =
    resolved &&
    (check.worstCaseDiscountBps ?? 0) - (check.selectedDiscountBps ?? 0) >= 0.5;

  return (
    <Card
      data-model-source={
        policyBasis === "live"
          ? "canonical-rwa-eclp-service"
          : policyBasis === "issuer-fee"
            ? "issuer-swap-fee"
            : "shared-day-engine-illustrative-default"
      }
      data-restock-status={
        missingInputs ? "missing-inputs" : (check?.status ?? "unavailable")
      }
    >
      <CardHeader>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[13.5px]">
            Set the arbitrageur&apos;s restock hurdle rate
          </CardTitle>
          {policyBasis === "live" ? null : (
            <Badge tone="neutral">
              {policyBasis === "issuer-fee" ? "your fee" : "illustrative pool"}
            </Badge>
          )}
        </span>
        <CardNote>
          A sale leaves the pool below NAV until an arbitrageur buys the
          discounted Senior and redeems it at NAV. Set the minimum annual
          return they require, then check whether the restock trade clears it.
          This assumption changes nothing above.
        </CardNote>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          <DayV3NumberField
            className="bg-[var(--foundation)]"
            label="What annual restock hurdle rate do they require?"
            max={100}
            min={0}
            note="The minimum annualized return an arbitrageur needs for the restock trade to be worth doing. A higher hurdle requires a deeper discount."
            onChange={onCostOfCapitalPct}
            placeholder="Enter a rate"
            presets={[
              { label: "8%", value: 8 },
              { label: "12%", value: 12 },
              { label: "20%", value: 20 },
              { label: "30%", value: 30 },
            ]}
            step={0.5}
            suffix="% a year"
            value={costOfCapitalPct}
          />
          <DayV3NumberField
            className="bg-[var(--foundation)]"
            label="How long is their money tied up?"
            max={365}
            min={0}
            note="From buying the discounted Senior to being paid full NAV for it: the redemption queue plus settlement. The longer the wait, the more discount they need."
            onChange={onRedemptionDays}
            placeholder="Enter days"
            presets={[
              { label: "1 day", value: 1 },
              { label: "7 days", value: 7 },
              { label: "30 days", value: 30 },
              { label: "90 days", value: 90 },
            ]}
            suffix="days"
            value={redemptionDays}
            wholeNumber
          />
        </div>

        {missingInputs ? (
          <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-3 text-[11px] leading-relaxed text-[var(--secondary)]">
            Enter an annual restock hurdle rate and redemption wait to check
            whether the discount this design creates is enough to attract a
            restock trade.
          </p>
        ) : !resolved ? (
          <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-3 text-[11px] leading-relaxed text-[var(--secondary)]">
            Set the depth at NAV and maximum discount above. The worst-case discount
            they define is what an arbitrageur would be buying.
          </p>
        ) : (
          <>
            <div
              aria-live="polite"
              className="rounded-lg border px-3 py-3"
              role="status"
              style={
                worstCasePays
                  ? {
                      background:
                        "color-mix(in srgb, var(--theme-green) 10%, transparent)",
                      borderColor:
                        "color-mix(in srgb, var(--theme-green) 45%, transparent)",
                    }
                  : {
                      background:
                        "color-mix(in srgb, var(--theme-gold) 10%, transparent)",
                      borderColor:
                        "color-mix(in srgb, var(--theme-gold) 45%, transparent)",
                    }
              }
            >
              <strong
                className="text-[12.5px] font-semibold"
                style={{
                  color: worstCasePays
                    ? "var(--theme-green)"
                    : "var(--gold-emphasis)",
                }}
              >
                {!worstCasePays
                  ? "This design does not clear the restock hurdle"
                  : `Restock hurdle cleared${(check.worstCaseMarginBps ?? 0) < 0.5 ? ", but only just" : ` by ${bps(check.worstCaseMarginBps)}`}`}
              </strong>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--secondary)]">
                {!worstCasePays
                  ? `Even fully drawn down this design only lets Senior trade ${bps(check.worstCaseDiscountBps)} below NAV, while the restock hurdle for this ${redemptionDays}-day trade is ${bps(hurdle.hurdleBps)}. Nothing brings an arbitrageur in at any depth. Lower the annual restock hurdle rate, shorten the redemption wait, allow a larger maximum discount, or expect the SLP to carry the position.`
                  : `At its deepest this design lets Senior trade ${bps(check.worstCaseDiscountBps)} below NAV, against ${hurdle.hurdleBps < 0 ? `a ${bps(hurdle.hurdleBps)} restock hurdle — Senior's yield over the wait already exceeds the arbitrageur's required return and pool fee, so any discount clears the hurdle` : `a ${bps(hurdle.hurdleBps)} restock hurdle for this ${redemptionDays}-day trade`}. Clearing that hurdle makes buying and redeeming the discounted Senior worthwhile, which puts the pool back and restores capacity for the next seller.${
                      unpriced
                        ? " The selected sale has not been priced yet, so it is not yet known whether it reaches that depth on its own."
                        : selectedPays
                          ? ` The ${partialFill ? `${amount(selectedFilledPer100, unit)} of the ${amount(selectedSalePer100, unit)} exit the pool can actually take` : `${amount(selectedSalePer100, unit)} exit you promised`} ${(check.selectedMarginBps ?? 0) < 0.5 ? "only just covers that" : `beats it by ${bps(check.selectedMarginBps)}`}, so the pool resets without waiting for a deeper seller.${partialFill ? ` The other ${amount(selectedUnfilledPer100, unit)} does not fill at any price, so nothing about it is priced here.` : ""}`
                          : ` The ${partialFill ? `${amount(selectedFilledPer100, unit)} of the ${amount(selectedSalePer100, unit)} exit the pool can actually take` : `${amount(selectedSalePer100, unit)} exit you promised`} only reaches ${bps(check.selectedDiscountBps)}, short of the restock hurdle, so one exit of that size does not attract a refill on its own.${partialFill ? ` The other ${amount(selectedUnfilledPer100, unit)} does not fill at any price.` : ""}`
                    }`}
              </p>
            </div>

            {/* One trade, top to bottom. The two-column split asked a reader
                to subtract a column of costs from a bar in the other column
                before the answer existed anywhere on screen. */}
            <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-3">
              <h4 className="mb-3 border-b border-[var(--border-subtle)] pb-2 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
                One restock trade, per {stake100(unit)} of Senior bought
              </h4>
              <ArbitrageWaterfall
                steps={[
                  {
                    deltaBps: check.selectedDiscountBps ?? 0,
                    label: partialFill
                      ? "Buys Senior below NAV (the part that fills)"
                      : "Buys Senior below NAV",
                    note: unpriced
                      ? "priced once the live template sizes the pool"
                      : `of the ${amount(selectedSalePer100, unit)} sold at once${partialFill ? `, only ${amount(selectedFilledPer100, unit)} fits in the pool;` : ","} ${amount(selectedCurveInputPer100, unit, 4)} reaches the curve after the pool's fee and comes back as ${amount(selectedProceedsPer100, unit, 4)} — a gap of 1 − ${amount(selectedProceedsPer100, unit, 4)}/${amount(selectedCurveInputPer100, unit, 4)}, which is what an arbitrageur buys`,
                  },
                  {
                    deltaBps: -hurdle.financingBps,
                    label: `Required return over the ${redemptionDays}-day wait`,
                    note: `${costOfCapitalPct.toFixed(1)}% annual restock hurdle rate, prorated until NAV comes back`,
                  },
                  {
                    deltaBps: hurdle.seniorCarryBps,
                    label: "Collects Senior's yield while waiting",
                    note: "they hold Senior until it redeems, so the wait pays for part of itself",
                  },
                  {
                    deltaBps: -hurdle.swapFeeBps,
                    label: "Pays the pool fee to buy in",
                    note:
                      policyBasis === "issuer-fee"
                        ? "the swap fee you set, charged on the way in"
                        : policyBasis === "live"
                          ? "the live template's swap fee, charged on the way in"
                          : "the disclosed simulation swap fee, charged on the way in",
                  },
                ]}
                totalBps={check.selectedMarginBps}
                totalLabel={
                  unpriced
                    ? "Margin to restock hurdle"
                    : selectedPays
                      ? "Margin above restock hurdle"
                      : "Shortfall to restock hurdle"
                }
                totalNote={
                  unpriced
                    ? "priced once this exit can be quoted against the pool"
                    : selectedPays
                      ? "positive, so the trade clears the required return and the pool refills"
                      : "negative, so the trade does not earn the required return and the pool stays where the seller left it"
                }
              />
              <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[9.5px] leading-snug text-[var(--tertiary)]">
                {deeperExists ? (
                  <>
                    Drawn down further this design lets Senior fall to{" "}
                    {bps(check.worstCaseDiscountBps)} below NAV, leaving{" "}
                    {bps(check.worstCaseMarginBps)} on the same trade. That is
                    the best it ever gets, so if that is negative no sale
                    clears the restock hurdle at any depth.{" "}
                  </>
                ) : (
                  <>
                    This is also as deep as the design goes, so it is the best
                    the trade ever looks.{" "}
                  </>
                )}
Both discounts are quotes from{" "}
                {policyBasis === "live"
                  ? "the live template's pool"
                  : policyBasis === "issuer-fee"
                    ? "a pool priced at the swap fee you set"
                    : "the disclosed illustrative pool"}
                , whose {(maximumDiscountPct * 100).toFixed(0)} bps maximum discount{" "}
                {maximumDiscountSource === "payout-floor"
                  ? "is set by your maximum discount"
                  : maximumDiscountSource === "your-answer"
                    ? "you set yourself"
                    : "the live template solved for"}
                . The Senior offset assumes the source
                performs at its modeled rate. Royco Deploy revalidates against
                the real settlement schedule.
              </p>
            </section>

          </>
        )}
      </CardContent>
    </Card>
  );
}
