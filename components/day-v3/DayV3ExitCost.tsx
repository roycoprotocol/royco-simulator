"use client";

import { useMemo, useState } from "react";

import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3ExitChart, {
  type DayV3ExitPoint,
} from "@/components/day-v3/DayV3ExitChart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  bps,
  compactAmount,
  isUsdUnit,
  pct,
  type DayV3Unit,
  unitAmount,
} from "@/components/day-v3/format";
import { dayV3RangeStyle } from "@/components/day-v3/range";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DayExplainerMetrics } from "@/lib/day-simulator-template/explainer";

// No accounting here. `buildDayExplainerMetrics` quotes the pool through the
// engine's own `previewSecondarySell`, and two of its identities hold exactly,
// verified against the engine rather than assumed:
//   stableOutNAV = filledNAV * executionPrice
//   slippage     = 1 - executionPrice
// So a curve point's dollar cost is `sellNAV * slippage` by the engine's own
// definition of those fields, not a formula invented in the UI.
export default function DayV3ExitCost({
  assumptions,
  metrics,
  unit,
}: {
  assumptions: {
    bandPct: number;
    concentration: number;
    stableYield: number;
    swapFeeBps: number;
    turnoverPerYear: number;
  };
  metrics: DayExplainerMetrics["liquidity"];
  unit: DayV3Unit;
}) {
  // Two of the thirteen markets are quoted in ETH and one in BTC, and every
  // figure here was printed with a hard "$". The same defect was found and
  // fixed once already in the backtest: the rule is to drop the symbol rather
  // than assert a currency nobody quoted the market in.
  const amount = (value: number) =>
    Math.abs(value) < 1_000
      ? unitAmount(value, unit)
      : compactAmount(value, unit);
  const points = useMemo<DayV3ExitPoint[]>(
    () =>
      metrics.curve.map((point) => ({
        sellNAV: point.sellNAV,
        bps: point.slippage * 10_000,
      })),
    [metrics],
  );

  // The whole position, recovered from the share the accountant already
  // divided by, so the two can never disagree about the denominator.
  const seniorNAV =
    metrics.boundarySellShareOfSenior > 0
      ? metrics.boundarySellNAV / metrics.boundarySellShareOfSenior
      : 0;

  // The pool's depth is the binding constraint whenever it empties at a cost
  // below the arbitrage reference, which is the usual case. Saying "you can
  // sell up to the 1% cost level" would then describe a level the pool never
  // reaches, so the claim has to name whichever limit actually binds.
  const depthBindsFirst =
    metrics.boundaryQuote.slippage <= metrics.arbitrageReference + 1e-12;
  const referenceUnavailable =
    metrics.referenceSellNAV <= 0 && metrics.boundarySellNAV > 0;

  // With no liquidity funded the pool has no depth, and the engine quotes the
  // degenerate case as a 100% cost on a zero-sized fill. That is arithmetically
  // right and completely meaningless to read, so the readouts come off the page
  // rather than reporting "10000 bps" to sell nothing.
  const poolFunded = metrics.boundarySellNAV > 0;

  const [rawIndex, setRawIndex] = useState(metrics.curve.length - 1);
  const index = Math.min(rawIndex, metrics.curve.length - 1);
  const selected = metrics.curve[index];
  const sellNAV = selected.sellNAV;
  const costUSD = sellNAV * selected.slippage;
  const curveCost = Math.max(
    0,
    selected.effectiveInputNAV - sellNAV * selected.executionPrice,
  );
  const proceeds = sellNAV * selected.executionPrice;
  const shareOfSr = seniorNAV > 0 ? sellNAV / seniorNAV : 0;

  const rows = useMemo(() => {
    const targets = Array.from(
      { length: 5 },
      (_, step) => (metrics.boundarySellNAV * (step + 1)) / 5,
    );
    return targets
      .map((target) =>
        metrics.curve.reduce((best, point) =>
          Math.abs(point.sellNAV - target) < Math.abs(best.sellNAV - target)
            ? point
            : best,
        ),
      )
      .filter(
        (row, position, all) =>
          position === 0 || row.sellNAV - all[position - 1].sellNAV > 1e-9,
      );
  }, [metrics]);

  return (
    <Card data-accountant-source="buildDayExplainerMetrics.liquidity">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[17px]">Exit cost and depth</CardTitle>
          <DayV3DocsLink label="SLP mechanics" topic="slpTranche" />
        </div>
        <CardDescription>
          See how the seller&apos;s payout changes as one Senior sale uses more of
          the SLP. Small sales stay near the published value; larger sales
          receive a larger discount. The displayed payout includes the pool&apos;s
          {" "}{assumptions.swapFeeBps} bps swap fee.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="max-w-[64ch] text-[14.5px] leading-relaxed text-[var(--foreground)]">
          {metrics.boundarySellNAV <= 0 ? (
            <>
              No SLP is funded, so there is no secondary pool route. Senior
              still uses the primary in-kind redemption queue at effective NAV,
              subject to its settlement rules.
            </>
          ) : referenceUnavailable ? (
            <>
              The exact-input swap fee already reaches the{" "}
              {pct(metrics.arbitrageReference)} near-NAV reference, so no
              positive one-trade exit meets that threshold. Full SLP depth is{" "}
              {amount(metrics.boundarySellNAV)}.
            </>
          ) : depthBindsFirst ? (
            <>
              One trade can exit{" "}
              <strong className="font-mono text-[16px] font-bold tracking-[-0.01em] tabular-nums">
                {amount(metrics.boundarySellNAV)}
              </strong>{" "}
              ({pct(metrics.boundarySellShareOfSenior)} of Sr). Draining the SLP
              costs {bps(metrics.boundaryQuote.slippage)}; depth runs out before
              the {pct(metrics.arbitrageReference)} near-NAV reference.
            </>
          ) : (
            <>
              One trade can exit{" "}
              <strong className="font-mono text-[16px] font-bold tracking-[-0.01em] tabular-nums">
                {amount(metrics.referenceSellNAV)}
              </strong>{" "}
              ({pct(metrics.referenceSellShareOfSenior)} of Sr) before the{" "}
              {pct(metrics.arbitrageReference)} near-NAV reference. Full SLP depth
              is {amount(metrics.boundarySellNAV)}.
            </>
          )}
        </p>

        {poolFunded ? (
          <>
            {/* Input. Same filled well as every other control on the page. */}
            <label className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                  Sr sells
                </span>
                <span className="font-mono text-[15px] font-bold tabular-nums">
                  {amount(sellNAV)}
                </span>
              </span>
              <input
                aria-label="Senior amount sold into the SLP"
                aria-valuetext={`${amount(sellNAV)}, ${pct(shareOfSr)} of the Senior position`}
                className="day-v3-range"
                max={metrics.curve.length - 1}
                min={0}
                onChange={(event) => setRawIndex(Number(event.target.value))}
                step={1}
                style={dayV3RangeStyle(index, 0, metrics.curve.length - 1)}
                type="range"
                value={index}
              />
              <span className="text-[10px] leading-snug text-[var(--tertiary)]">
                {pct(shareOfSr)} of the Sr position, sold at once
              </span>
            </label>

            {/* Outputs. Unfilled, hairline rule, mono figures. */}
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                  Exit discount
                </span>
                <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                  {bps(selected.slippage)}
                </span>
                <span className="text-[10.5px] text-[var(--tertiary)]">
                  below NAV
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                  Given up
                </span>
                <span
                  className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums"
                  style={{
                    color: costUSD > 0 ? "var(--red-emphasis)" : undefined,
                  }}
                >
                  {amount(costUSD)}
                </span>
                <span className="text-[10.5px] text-[var(--tertiary)]">
                  {amount(selected.swapFeeNAV)} fee + {amount(curveCost)} price impact
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                  Received
                </span>
                <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                  {amount(proceeds)}
                </span>
                <span className="text-[10.5px] text-[var(--tertiary)]">
                  {/* "on the dollar" is the same assertion as the symbol. A market
                  quoted in ETH is paid out at a price per unit, not per dollar. */}
                  stable, at {selected.executionPrice.toFixed(4)}{" "}
                  {isUsdUnit(unit) ? "on the dollar" : "per unit"}
                </span>
              </div>
            </div>

            <DayV3ExitChart
              compactUsd={amount}
              marker={points[index]}
              points={points}
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sr sells</TableHead>
                  <TableHead className="text-right">Of the position</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Given up</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.sellNAV}>
                    <TableCell className="font-mono font-semibold tabular-nums">
                      {amount(row.sellNAV)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-[var(--secondary)]">
                      {pct(seniorNAV > 0 ? row.sellNAV / seniorNAV : 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {bps(row.slippage)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {amount(row.sellNAV * row.slippage)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {amount(row.sellNAV * row.executionPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div
              className="flex flex-col gap-1.5 rounded-lg border px-3.5 py-3"
              style={{
                background:
                  "color-mix(in srgb, var(--theme-green) 7%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--theme-green) 35%, transparent)",
              }}
            >
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--green-emphasis)]">
                Capacity may reset
              </span>
              <p className="text-[11.5px] leading-relaxed text-[var(--foreground)]">
                Each quote is one sale into a pool at rest. At the{" "}
                {pct(metrics.arbitrageReference)} near-NAV reference, arbitrage
                may replenish capacity before another sale; timing and price are
                not guaranteed.
              </p>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
