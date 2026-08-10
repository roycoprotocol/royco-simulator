"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2ExitChart, { type DayV2ExitPoint } from "@/components/day-v2/DayV2ExitChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bps, compactUsd, pct } from "@/components/day-v2/format";
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
export default function DayV2ExitCost({
  metrics,
}: {
  metrics: DayExplainerMetrics["liquidity"];
}) {
  const points = useMemo<DayV2ExitPoint[]>(
    () => metrics.curve.map((point) => ({ sellNAV: point.sellNAV, bps: point.slippage * 10_000 })),
    [metrics],
  );

  // The whole position, recovered from the share the accountant already
  // divided by, so the two can never disagree about the denominator.
  const seniorNAV = metrics.boundarySellShareOfSenior > 0
    ? metrics.boundarySellNAV / metrics.boundarySellShareOfSenior
    : 0;

  // The pool's depth is the binding constraint whenever it empties at a cost
  // below the arbitrage reference, which is the usual case. Saying "you can
  // sell up to the 1% cost level" would then describe a level the pool never
  // reaches, so the claim has to name whichever limit actually binds.
  const depthBindsFirst =
    metrics.boundaryQuote.slippage <= metrics.arbitrageReference + 1e-12;

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
  const proceeds = sellNAV * selected.executionPrice;
  const shareOfSr = seniorNAV > 0 ? sellNAV / seniorNAV : 0;

  const rows = useMemo(() => {
    const targets = Array.from({ length: 5 }, (_, step) => (metrics.boundarySellNAV * (step + 1)) / 5);
    return targets.map((target) =>
      metrics.curve.reduce((best, point) =>
        Math.abs(point.sellNAV - target) < Math.abs(best.sellNAV - target) ? point : best,
      ),
    ).filter((row, position, all) => position === 0 || row.sellNAV - all[position - 1].sellNAV > 1e-9);
  }, [metrics]);

  return (
    <Card data-accountant-source="buildDayExplainerMetrics.liquidity">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Exit cost and depth</CardTitle>
          <Badge tone="liquidity">SLP pool</Badge>
        </div>
        <CardDescription>
          How much Sr can sell into the pool, and what leaving early costs.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="max-w-[64ch] text-[14.5px] leading-relaxed text-[var(--foreground)]">
          {metrics.boundarySellNAV <= 0 ? (
            <>
              No liquidity is funded, so there is no pool to sell into. Sr
              can still be held to maturity, but there is no early exit at any
              price. Raise liquidity above zero to open one.
            </>
          ) : depthBindsFirst ? (
            <>
              Sr can sell{" "}
              <strong className="font-mono text-[17px] font-bold tracking-[-0.01em] tabular-nums">
                {compactUsd(metrics.boundarySellNAV)}
              </strong>{" "}
              into the pool, which is {pct(metrics.boundarySellShareOfSenior)} of the
              position. That empties it, and clearing the whole depth costs{" "}
              {bps(metrics.boundaryQuote.slippage)}. The pool runs out before the cost
              reaches {pct(metrics.arbitrageReference)}, so depth binds first, not price.
            </>
          ) : (
            <>
              Sr can sell{" "}
              <strong className="font-mono text-[17px] font-bold tracking-[-0.01em] tabular-nums">
                {compactUsd(metrics.referenceSellNAV)}
              </strong>{" "}
              at a cost under {pct(metrics.arbitrageReference)}, which is{" "}
              {pct(metrics.referenceSellShareOfSenior)} of the position. The pool holds{" "}
              {compactUsd(metrics.boundarySellNAV)} in total, and clearing all of it
              costs {bps(metrics.boundaryQuote.slippage)}.
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
              {compactUsd(sellNAV)}
            </span>
          </span>
          <input
            className="day-v2-range"
            max={metrics.curve.length - 1}
            min={0}
            onChange={(event) => setRawIndex(Number(event.target.value))}
            step={1}
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
              Cost to exit
            </span>
            <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
              {bps(selected.slippage)}
            </span>
            <span className="text-[10.5px] text-[var(--tertiary)]">below marked value</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
              Given up
            </span>
            <span
              className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums"
              style={{ color: costUSD > 0 ? "var(--red-emphasis)" : undefined }}
            >
              {compactUsd(costUSD)}
            </span>
            <span className="text-[10.5px] text-[var(--tertiary)]">the cost of leaving now</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
              Received
            </span>
            <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
              {compactUsd(proceeds)}
            </span>
            <span className="text-[10.5px] text-[var(--tertiary)]">
              stable, at {selected.executionPrice.toFixed(4)} on the dollar
            </span>
          </div>
        </div>

        <DayV2ExitChart compactUsd={compactUsd} marker={points[index]} points={points} />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sr sells</TableHead>
              <TableHead className="text-right">Of the position</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Given up</TableHead>
              <TableHead className="text-right">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.sellNAV}>
                <TableCell className="font-mono font-semibold tabular-nums">
                  {compactUsd(row.sellNAV)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[var(--secondary)]">
                  {pct(seniorNAV > 0 ? row.sellNAV / seniorNAV : 0)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {bps(row.slippage)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {compactUsd(row.sellNAV * row.slippage)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {compactUsd(row.sellNAV * row.executionPrice)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
