"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3LossChart, {
  type DayV3LossPoint,
} from "@/components/day-v3/DayV3LossChart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  pct,
  stake100,
  unitAmount,
  type DayV3Unit,
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

// No accounting here. `buildDayExplainerMetrics` already bisects for the point
// where Jr's cover runs out and shocks the engine for Sr's balance at
// each loss, so this file selects and positions its output and derives nothing.

/** The engine point closest to a target loss, so every figure on screen is a
    value the accountant actually returned rather than an interpolation. */
function nearest(
  points: readonly DayV3LossPoint[],
  target: number,
): DayV3LossPoint {
  return points.reduce((best, point) =>
    Math.abs(point.loss - target) < Math.abs(best.loss - target) ? point : best,
  );
}

export default function DayV3LossWaterfall({
  metrics,
  unit,
}: {
  metrics: DayExplainerMetrics["coverage"];
  unit: DayV3Unit;
}) {
  const points = useMemo<DayV3LossPoint[]>(
    () =>
      metrics.points.map((point) => ({
        loss: point.loss,
        senior: point.seniorBalancePer100,
      })),
    [metrics],
  );
  const limit = metrics.coverageLossLimit;
  // Read the funded state off the accountant rather than tracking coverage
  // alongside it, where the two could drift apart. It cannot be a plain
  // `limit > 0` test: the bisection converges against a 100 - 1e-10 balance
  // tolerance, so a market with no Jr capital at all still returns a limit
  // near 1e-12. Anything that does not round to a tenth of a percent is not
  // protection, and claiming it is would be a sentence about a rounding error.
  const coverageFunded = limit >= 0.0005;
  const limitIndex = points.reduce(
    (best, point, index) =>
      Math.abs(point.loss - limit) < Math.abs(points[best].loss - limit)
        ? index
        : best,
    0,
  );

  // The drawdown is its own control, separate from the market terms above: the
  // terms decide where the cover runs out, this decides how hard the source is
  // hit. Held as a grid index so the readout is always an engine point.
  const [rawIndex, setRawIndex] = useState(limitIndex);
  // A protection-goal change replaces the entire accountant curve. Follow its
  // new Senior-loss breakpoint unless the reader subsequently moves this
  // scenario control; otherwise the marker appears stuck on a stress chosen
  // for the previous market and makes the new coverage result look inert.
  useEffect(() => {
    setRawIndex(limitIndex);
  }, [limitIndex]);
  const index = Math.min(rawIndex, points.length - 1);
  const selected = points[index];
  const seniorLoss = 100 - selected.senior;
  const exhausted = !coverageFunded || selected.loss >= limit;

  /** Who the next dollar of the fall lands on, at a given depth. */
  const absorber = (loss: number) => {
    if (!coverageFunded) return "Sr, from the first dollar";
    if (Math.abs(loss - limit) < 1e-9) return "Jr, to its last dollar";
    return loss < limit ? "Jr" : "Jr in full, then Sr";
  };

  // Even fifths of the plotted range, which land on round losses, plus the
  // limit itself so the row where the cover runs out is always in the table.
  const rows = useMemo(() => {
    const targets = Array.from(
      { length: 6 },
      (_, step) => (metrics.displayMaxLoss * step) / 5,
    );
    const picked = targets.map((target) => nearest(points, target));
    picked.push(nearest(points, limit));
    return picked
      .sort((a, b) => a.loss - b.loss)
      .filter(
        (row, position, all) =>
          position === 0 || row.loss - all[position - 1].loss > 1e-9,
      );
  }, [limit, metrics.displayMaxLoss, points]);

  return (
    <Card data-accountant-source="buildDayExplainerMetrics.coverage">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[17px]">Loss waterfall</CardTitle>
          <span className="flex items-baseline gap-2">
            <Badge tone={coverageFunded ? "junior" : "caution"}>
              {coverageFunded ? "Jr first" : "no cover"}
            </Badge>
            <DayV3DocsLink label="Impermanent loss" topic="impermanentLoss" />
          </span>
        </div>
        <CardDescription>How losses move from Jr to Sr.</CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The claim, stated once and large, so the section answers its own
              question before any detail is read. */}
          <p className="max-w-[64ch] text-[14.5px] leading-relaxed text-[var(--foreground)]">
            {coverageFunded ? (
              <>
                Jr absorbs a{" "}
                <strong className="font-mono text-[16px] font-bold tracking-[-0.01em] tabular-nums text-[var(--foreground)]">
                  {pct(limit)}
                </strong>{" "}
                fall before Sr loses value.
              </>
            ) : (
              <>
                No Jr capital is funded, so Sr absorbs losses from the first
                dollar.
              </>
            )}
          </p>

          {/* The order of absorption, at a glance: the split moves with coverage,
              the marker moves with the drawdown control below. */}
          <div className="relative">
            <div className="flex h-9 w-full overflow-hidden rounded-lg border border-[var(--border-subtle)]">
              <div
                className="flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-brown)_16%,transparent)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3e2616]"
                style={{
                  width: coverageFunded
                    ? `${(limit / metrics.displayMaxLoss) * 100}%`
                    : 0,
                }}
              >
                <span className="truncate px-1">
                  {coverageFunded && limit / metrics.displayMaxLoss > 0.16
                    ? "Jr absorbs"
                    : ""}
                </span>
              </div>
              <div
                className={`relative flex flex-1 items-center justify-center bg-[color-mix(in_srgb,var(--theme-navy)_12%,transparent)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--navy-emphasis)] ${
                  coverageFunded
                    ? "border-l border-[var(--theme-brown)]"
                    : ""
                }`}
              >
                <span className="truncate px-1">Sr absorbs</span>
              </div>
            </div>
            {/* Where the selected fall lands on that order. Unlabelled on
                purpose: the depth is already stated in the control below, and
                printing it twice within an inch of itself is noise. */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 h-9 w-0.5 -translate-x-1/2 rounded-full bg-[var(--foreground)]"
              style={{
                left: `${(selected.loss / metrics.displayMaxLoss) * 100}%`,
              }}
            />
          </div>

          {/* Input. The filled well marks it as something to move, matching the
              terms panel, and keeps it visually apart from the readouts below. */}
          <label className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                Source drawdown
              </span>
              <span className="font-mono text-[15px] font-bold tabular-nums">
                {pct(selected.loss)}
              </span>
            </span>
            <input
              aria-label="Source drawdown"
              aria-valuetext={`${pct(selected.loss)} source drawdown; Senior loses ${unitAmount(seniorLoss, unit)}`}
              className="day-v3-range"
              max={points.length - 1}
              min={0}
              onChange={(event) => setRawIndex(Number(event.target.value))}
              step={1}
              style={dayV3RangeStyle(index, 0, points.length - 1)}
              type="range"
              value={index}
            />
            <span className="text-[10px] leading-snug text-[var(--tertiary)]">
              A one-off fall in the source, applied at these terms
            </span>
          </label>

          {/* Outputs. No fill, hairline rule, mono figures: read, not moved. */}
          <div className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                Sr keeps
              </span>
              <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                {unitAmount(selected.senior, unit)}
              </span>
              <span className="text-[10.5px] text-[var(--tertiary)]">
                of every {stake100(unit)} held
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                Sr loses
              </span>
              <span
                className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums"
                style={{
                  color: seniorLoss > 0 ? "var(--red-emphasis)" : undefined,
                }}
              >
                {unitAmount(seniorLoss, unit)}
              </span>
              <span className="text-[10.5px] text-[var(--tertiary)]">
                {seniorLoss > 0
                  ? `written down, per ${stake100(unit)}`
                  : coverageFunded
                    ? "Jr is covering all of it"
                    : "the source has not fallen"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                Cover left
              </span>
              <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                {exhausted ? "None" : pct(limit - selected.loss)}
              </span>
              <span className="text-[10.5px] text-[var(--tertiary)]">
                {!coverageFunded
                  ? "No Jr capital is funded"
                  : exhausted
                    ? `Jr ran out at ${pct(limit)}`
                    : "of further fall still absorbed"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <DayV3LossChart
            limit={limit}
            marker={selected}
            maxLoss={metrics.displayMaxLoss}
            minSr={metrics.endingSeniorBalancePer100}
            points={points}
            showLimit={coverageFunded}
            unit={unit}
          />

          <div className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source falls</TableHead>
                  <TableHead>Who absorbs it</TableHead>
                  <TableHead className="text-right">
                    Sr per {stake100(unit)}
                  </TableHead>
                  <TableHead className="text-right">Sr loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const atLimit =
                    coverageFunded && Math.abs(row.loss - limit) < 1e-9;
                  return (
                    <TableRow
                      className={
                        atLimit
                          ? "bg-[color-mix(in_srgb,var(--theme-brown)_9%,transparent)]"
                          : undefined
                      }
                      key={row.loss}
                    >
                      <TableCell className="font-mono font-semibold tabular-nums">
                        {pct(row.loss)}
                      </TableCell>
                      <TableCell className="text-[var(--secondary)]">
                        {absorber(row.loss)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {unitAmount(row.senior, unit)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {unitAmount(100 - row.senior, unit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
