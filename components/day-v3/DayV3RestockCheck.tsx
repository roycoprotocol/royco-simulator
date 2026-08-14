"use client";

import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
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
  /** Where the worst case came from, so the panel never overstates it. */
  worstCaseBasis: "modeled" | "floor" | "unresolved";
  worstPayoutPer100: number | null;
  selectedSalePer100: number | null;
  /** The live template is re-pricing, so these figures describe the design as
   *  it was a moment ago rather than the one on screen. */
  stale: boolean;
};

const bps = (value: number | null, digits = 0) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(digits)} bps`;

const dollars = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value) ? "—" : `$${value.toFixed(digits)}`;

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
  emphasis = false,
  leftPct,
  label,
  note,
  valueBps,
  widthPct,
  zeroPct,
}: {
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
      <span
        aria-hidden="true"
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
  totalBps: number;
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

  const marks = [0, totalBps, ...bars.flatMap((bar) => [bar.from, bar.to])];
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
    <div className="flex flex-col gap-2.5">
      {bars.map((bar) => (
        <WaterfallRow
          key={bar.label}
          label={bar.label}
          note={bar.note}
          valueBps={bar.deltaBps}
          zeroPct={zeroPct}
          {...geometry(bar.from, bar.to)}
        />
      ))}
      <div className="border-t border-[var(--border-subtle)] pt-2.5">
        <WaterfallRow
          emphasis
          label={totalLabel}
          note={totalNote}
          valueBps={totalBps}
          zeroPct={zeroPct}
          {...geometry(0, totalBps)}
        />
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
 * discount is worth more than the desk's money over the redemption wait, plus
 * the fee it pays to trade back in.
 *
 * This is a result, not an input: the discounts come from the exit design
 * above. The cost of capital and the wait describe an outside party, so they
 * are stated on screen rather than assumed, and they change nothing about the
 * market being designed.
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
  const { check, hurdle, selectedSalePer100, stale, worstCaseBasis, worstPayoutPer100 } =
    view;
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
  const deeperExists =
    resolved &&
    (check.worstCaseDiscountBps ?? 0) - (check.selectedDiscountBps ?? 0) >= 0.5;

  return (
    <Card
      data-model-source={
        worstCaseBasis === "modeled"
          ? "canonical-rwa-eclp-service"
          : "issuer-payout-floor"
      }
      data-restock-stale={stale || undefined}
      data-restock-status={
        missingInputs ? "missing-inputs" : (check?.status ?? "unavailable")
      }
    >
      <CardHeader>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[13.5px]">
            Test whether this works for arbitrageurs
          </CardTitle>
          {stale ? <Badge tone="neutral">re-pricing</Badge> : null}
        </span>
        <CardNote>
          A sale leaves the pool below NAV, and it stays there until an
          arbitrageur buys that discounted Senior and redeems it at NAV.
          Describe one, and this checks whether the trade is worth their while.
          It changes nothing above.
        </CardNote>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          <DayV3NumberField
            className="bg-[var(--foundation)]"
            label="What does an arbitrageur's capital cost, a year?"
            max={100}
            min={0}
            note="What they need on money tied up in the trade. Higher cost, deeper discount before they bother."
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
            Enter a cost of capital and a redemption wait to check whether the
            discount this design creates is enough to attract a refill.
          </p>
        ) : !resolved ? (
          <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-3 text-[11px] leading-relaxed text-[var(--secondary)]">
            Set the exit amount and payout floor above. The worst-case discount
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
                  ? "No discount this design creates is worth an arbitrageur's time"
                  : `Arbitrage is worth doing${(check.worstCaseMarginBps ?? 0) < 0.5 ? ", but only just" : `, by ${bps(check.worstCaseMarginBps)}`}`}
              </strong>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--secondary)]">
                {!worstCasePays
                  ? `Even fully drawn down this design only lets Senior trade ${bps(check.worstCaseDiscountBps)} below NAV, and an arbitrageur needs ${bps(hurdle.hurdleBps)} to break even. Nothing brings one in at any depth. Shorten the redemption wait, allow a deeper payout floor, or expect the SLP to carry the position rather than see it arbitraged back.`
                  : `At its deepest this design lets Senior trade ${bps(check.worstCaseDiscountBps)} below NAV, against the ${bps(hurdle.hurdleBps)} an arbitrageur needs to break even. They are paid to buy that Senior and redeem it, which is what puts the pool back and restores capacity for the next seller.${
                      worstCaseBasis === "floor"
                        ? " That is the deepest your payout floor permits, not a depth the pool has been shown to reach: a sized pool usually prices nearer to NAV, so treat this as provisional until the live template resolves."
                        : ""
                    }${
                      unpriced
                        ? " The selected sale has not been priced yet, so it is not yet known whether it reaches that depth on its own."
                        : selectedPays
                          ? ` The ${dollars(selectedSalePer100)} exit you promised ${(check.selectedMarginBps ?? 0) < 0.5 ? "only just covers that" : `beats it by ${bps(check.selectedMarginBps)}`}, so the pool resets without waiting for a deeper seller.`
                          : ` The ${dollars(selectedSalePer100)} exit you promised only reaches ${bps(check.selectedDiscountBps)}, short of break-even, so one exit of that size does not attract a refill on its own.`
                    }`}
              </p>
            </div>

            {/* One trade, top to bottom. The two-column split asked a reader
                to subtract a column of costs from a bar in the other column
                before the answer existed anywhere on screen. */}
            {stale ? (
              <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-3 text-[10.5px] leading-snug text-[var(--secondary)]">
                The live template has not sized this exact pool yet, so the
                worst case below is the{" "}
                {dollars(worstPayoutPer100)} payout floor you set — the deepest
                the design is allowed to go. It moves as you change the floor.
                The discount one specific sale reaches needs the sized pool, so
                it is withheld rather than guessed.
              </p>
            ) : null}

            <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-3">
              <h4 className="mb-3 border-b border-[var(--border-subtle)] pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
                One arbitrageur&apos;s trade, per $100 of Senior they buy
              </h4>
              <ArbitrageWaterfall
                steps={[
                  {
                    deltaBps: check.selectedDiscountBps ?? 0,
                    label: "Buys Senior below NAV",
                    note: unpriced
                      ? "priced once the live template sizes the pool"
                      : `the discount left by selling ${dollars(selectedSalePer100)} of every $100 Senior at once`,
                  },
                  {
                    deltaBps: -hurdle.financingBps,
                    label: `Funds the ${redemptionDays}-day wait`,
                    note: `${costOfCapitalPct.toFixed(1)}% a year on the money tied up until NAV comes back`,
                  },
                  {
                    deltaBps: hurdle.seniorCarryBps,
                    label: "Collects Senior's yield while waiting",
                    note: "they hold Senior until it redeems, so the wait pays for part of itself",
                  },
                  {
                    deltaBps: -hurdle.swapFeeBps,
                    label: "Pays the pool fee to buy in",
                    note: "the live swap fee, charged on the way in",
                  },
                ]}
                totalBps={check.selectedMarginBps ?? 0}
                totalLabel={
                  selectedPays ? "They keep" : "They lose"
                }
                totalNote={
                  selectedPays
                    ? "above zero, so the trade happens and the pool refills"
                    : "below zero, so nobody buys and the pool stays where the seller left it"
                }
              />
              <p className="mt-3 border-t border-[var(--border-subtle)] pt-2.5 text-[9.5px] leading-snug text-[var(--tertiary)]">
                {deeperExists ? (
                  <>
                    Drawn down further this design lets Senior fall to{" "}
                    {bps(check.worstCaseDiscountBps)} below NAV, leaving{" "}
                    {bps(check.worstCaseMarginBps)} on the same trade. That is
                    the best it ever gets, so if that is negative no sale
                    attracts an arbitrageur at any depth.{" "}
                  </>
                ) : (
                  <>
                    This is also as deep as the design goes, so it is the best
                    the trade ever looks.{" "}
                  </>
                )}
                The discount comes from{" "}
                {worstCaseBasis === "modeled"
                  ? "the live template's lowest modeled payout"
                  : `the ${dollars(worstPayoutPer100)} payout floor you set`}
                ; the Senior offset assumes the source performs at its modeled
                rate. Royco Deploy revalidates against the real settlement
                schedule.
              </p>
            </section>

          </>
        )}
      </CardContent>
    </Card>
  );
}
