"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2BacktestChart, {
  type DayV2BacktestPoint,
} from "@/components/day-v2/DayV2BacktestChart";
import DayV2SegmentedControl from "@/components/day-v2/DayV2SegmentedControl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { pct } from "@/components/day-v2/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runDayHistoricalBacktest } from "@/lib/day-simulator-template/backtest";
import type { DayMarket } from "@/lib/day-simulator-template/market";
import { calibrateSeriesApy } from "@/lib/day-simulator-template/series";

// The run is `runDayHistoricalBacktest`, the same shared module the root route
// steps its history through. This file chooses a window and lays the result
// out. It does not step the engine itself.
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const monthLabel = (key: string) => {
  const [year, month] = key.split("-");
  return `${MONTH[Number(month) - 1]} ${year}`;
};
const signed = (value: number) =>
  `${value < 0 ? "-" : "+"}${Math.abs(value * 100).toFixed(2)}%`;

function DayV2Backtest({
  bandPct: bandInput,
  coveragePct: coverageInput,
  customSource,
  liqY0Pct: liqY0Input,
  liqY100Pct: liqY100Input,
  liqSharePct: liqShareInput,
  liquidityPct: liquidityInput,
  maintainCoverage,
  market,
  onMaintainCoverage,
  observationDays: observationInput,
  riskY0Pct: riskY0Input,
  riskY100Pct: riskY100Input,
  riskSharePct: riskShareInput,
  sourceApyPct: sourceInput,
}: {
  bandPct: number;
  coveragePct: number;
  customSource: boolean;
  liqY0Pct: number;
  liqY100Pct: number;
  liqSharePct: number;
  liquidityPct: number;
  maintainCoverage: boolean;
  market: DayMarket;
  onMaintainCoverage: (value: boolean) => void;
  observationDays: number;
  riskY0Pct: number;
  riskY100Pct: number;
  riskSharePct: number;
  sourceApyPct: number;
}) {
  const defaults = market.defaults;
  const [windowId, setWindowId] = useState("full");
  // Declared on the market, the same two fields the root route reads.
  const footnote = market.customization.backtestDisplay?.footnote;
  const returnUnit = customSource
    ? "units"
    : (market.customization.backtestDisplay?.returnUnit ?? "USD");
  const tailRisk = market.customization.forwardTest?.tailRiskDisclosure;

  // This section is the expensive one on the page: a few hundred engine steps,
  // four charted series over the whole history, and a row per month. Deferring
  // its own inputs a second time lets the cheap sections above commit while a
  // slider is still moving, and this catches up a beat later. Measured, not
  // assumed: it is the render rather than the arithmetic that costs here.
  const deferred = useDeferredValue({
    bandPct: bandInput,
    coveragePct: coverageInput,
    liqY0Pct: liqY0Input,
    liqY100Pct: liqY100Input,
    liqSharePct: liqShareInput,
    liquidityPct: liquidityInput,
    observationDays: observationInput,
    riskY0Pct: riskY0Input,
    riskY100Pct: riskY100Input,
    riskSharePct: riskShareInput,
    sourceApyPct: sourceInput,
  });
  const {
    bandPct,
    coveragePct,
    liqSharePct,
    liqY0Pct,
    liqY100Pct,
    liquidityPct,
    observationDays,
    riskSharePct,
    riskY0Pct,
    riskY100Pct,
    sourceApyPct,
  } = deferred;

  // The market's real price path, rescaled so its annualized yield matches the
  // source-yield control. This is what the root route models too: the shape of
  // the history is real, the level is the one being tested.
  const series = useMemo(
    () => calibrateSeriesApy(market.series, sourceApyPct / 100),
    [market.series, sourceApyPct],
  );

  const windows = useMemo(() => {
    if (series.length < 3) return [];
    const last = series[series.length - 1];
    const lastTime = Date.parse(last.date);
    const spans: { id: string; label: string; months: number }[] = [
      { id: "full", label: "Full history", months: 0 },
      { id: "24m", label: "Last 24 months", months: 24 },
      { id: "12m", label: "Last 12 months", months: 12 },
      { id: "6m", label: "Last 6 months", months: 6 },
      { id: "3m", label: "Last 3 months", months: 3 },
    ];
    return (
      spans
        .map((span) => {
          if (span.months === 0) return { ...span, from: 0 };
          const cutoff = lastTime - span.months * 30.44 * 86_400_000;
          const from = series.findIndex(
            (point) => Date.parse(point.date) >= cutoff,
          );
          return { ...span, from: from < 0 ? -1 : from };
        })
        // A window needs enough points to be a run rather than a line between two
        // dots, and one that covers the whole series is just "full history" twice.
        .filter((span) => span.from >= 0 && series.length - span.from >= 3)
        .filter((span, index, all) => index === 0 || span.from !== all[0].from)
    );
  }, [series]);

  const active = windows.find((span) => span.id === windowId) ?? windows[0];
  const view = useMemo(
    () => (active ? series.slice(active.from) : series),
    [active, series],
  );

  const result = useMemo(() => {
    if (view.length < 3) return null;
    return runDayHistoricalBacktest({
      defaults,
      series: view,
      terms: {
        coveragePct,
        minLiquidityPct: liquidityPct,
        // Handed down already resolved, rather than derived a second time here.
        // Two places computing the same terms is two places to disagree, and
        // the history has to run on the same market as the projection above it.
        eclpBandWidthPct: bandPct,
        liqY0Pct,
        liqY100Pct,
        riskSharePct,
        liqSharePct,
        observationDays,
        riskY0Pct,
        riskY100Pct,
      },
      maintainCoverage,
      // Read off the market the way the root route reads it. Only the
      // forward-modeled markets declare it, and there the opening period is
      // zero by construction. Hardcoding it to true instead dropped a real
      // month from every dated history: susdai's opening row is +1.32% source
      // and +2.45% Jr, which is a month of the record, not an artifact.
      omitInitialZeroReturnPeriod:
        market.customization.forwardTest?.omitInitialZeroReturnPeriod === true,
      // Still passed, so a window that starts mid-history is never treated as
      // the opening period even when a market does declare the flag.
      monthlyBaselineDate: series[0]?.date,
    });
  }, [
    bandPct,
    coveragePct,
    defaults,
    liqSharePct,
    liqY0Pct,
    liqY100Pct,
    liquidityPct,
    maintainCoverage,
    market,
    observationDays,
    riskSharePct,
    riskY0Pct,
    riskY100Pct,
    series,
    view,
  ]);

  const chartData = useMemo<DayV2BacktestPoint[]>(
    () =>
      result
        ? result.chart.map((point) => ({
            date: point.date,
            senior: point.senior,
            junior: point.junior,
            liquidity: point.liquidity,
            strategy: point.strategy,
          }))
        : [],
    [result],
  );

  if (market.series.length < 3 || !result || !active) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-[17px]" level={3}>
              Historical backtest
            </CardTitle>
            <Badge tone="caution">no history</Badge>
          </div>
          <CardDescription>
            {customSource
              ? "Add dated NAV or price history in step 3 to run this test."
              : "No dated history is available; results above are forward projections at the selected source yield."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The markets without history are the forward-modeled ones, which is
              exactly where this disclosure lives. Dropping it on this branch
              would hide it on every market that declares one. */}
          {tailRisk ? (
            <p
              className="rounded-lg border px-3.5 py-2.5 text-[11.5px] leading-relaxed"
              style={{
                background:
                  "color-mix(in srgb, var(--theme-red) 8%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--theme-red) 40%, transparent)",
                color: "var(--red-emphasis)",
              }}
            >
              {tailRisk}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  // Careful what counts as a finding here. The series is calibrated so its
  // annual yield matches the source control, so over a full window the source
  // APY is the slider value read back. The information the history actually
  // carries is its shape: how far things fell, and how Sr fared through it.
  const ahead = result.seniorApy - result.strategyApy;
  const protectionPaid = ahead > 0.0001;
  const protectionCost = ahead < -0.0001;
  // Coverage restoration refills Jr from outside the market. Where that ran,
  // Sr's result is not funded by the source alone, and saying Jr "took the
  // falls" without saying who paid to put it back is the misleading half of a
  // true sentence. On the default market this is 99% of Jr's starting capital.
  const toppedUp = result.juniorCapitalInjectedShareOfStart ?? 0;
  const outsideCapitalMatters = toppedUp >= 0.005;

  return (
    <Card data-accountant-source="runDayHistoricalBacktest">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[17px]" level={3}>
            Historical backtest
          </CardTitle>
          <Badge tone="neutral">
            {result.chart[0].date} to{" "}
            {result.chart[result.chart.length - 1].date}
          </Badge>
        </div>
        <CardDescription>
          Runs these terms, including the {observationDays}-day Observation
          Period, against the source&apos;s dated price path.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-[var(--foreground)]">
          Worst drawdown: source{" "}
          <strong className="font-mono text-[16px] font-bold tabular-nums">
            {pct(result.strategyMaxDrawdown)}
          </strong>
          ; Sr {pct(result.seniorMaxDrawdown)}.{" "}
          {protectionPaid ? (
            <>
              Sr&apos;s annualized return was {pct(Math.abs(ahead))} higher than
              the source.
            </>
          ) : protectionCost ? (
            <>
              Sr&apos;s annualized return was {pct(Math.abs(ahead))} lower than
              the source.
            </>
          ) : (
            <>Sr tracked the source&apos;s annualized return.</>
          )}
        </p>

        {/* The window chooses which part of the supplied history to run. Coverage
            restoration is intentionally kept below the chart it changes, so it
            cannot be mistaken for a market term. */}
        <div>
          <label className="flex flex-1 max-w-[420px] flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
              Backtest window
            </span>
            <select
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-[13px] font-medium"
              onChange={(event) => setWindowId(event.target.value)}
              value={active.id}
            >
              {windows.map((span) => (
                <option key={span.id} value={span.id}>
                  {span.label} ({series[span.from].date} to{" "}
                  {series[series.length - 1].date})
                </option>
              ))}
            </select>
            <span className="text-[10px] leading-snug text-[var(--tertiary)]">
              Each window starts a new run from its first date.
            </span>
          </label>
        </div>

        {/* Outputs. Labelled as a group: four figures that only mean anything
            read against each other, and it gives the set a name out of context. */}
        <div
          aria-label="Backtest result by position"
          className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-4"
          role="group"
        >
          {(
            [
              ["Source", result.strategyApy, result.strategyMaxDrawdown],
              ["Sr", result.seniorApy, result.seniorMaxDrawdown],
              ["Jr", result.juniorApy, result.juniorMaxDrawdown],
              ["SLP", result.liquidityApy, result.liquidityMaxDrawdown],
            ] as const
          ).map(([label, apy, drawdown]) => (
            <div className="flex flex-col gap-0.5" key={label}>
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                {label}
              </span>
              <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                {pct(apy)}
              </span>
              <span className="text-[10.5px] text-[var(--tertiary)]">
                a year, worst fall {pct(drawdown)}
              </span>
            </div>
          ))}
        </div>

        {/* The path and the months that make it up, side by side. Stacked, the
            five numeric columns stretched across the whole card and the table
            pushed the chart a screen away from the rows explaining it. */}
        {/* Equal widths, like every other pair on this page. One proportion
            used everywhere is what makes the page read as a system rather than
            a stack of differently sized slabs, and a 1.3fr/1fr here was the
            only place breaking it. */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DayV2BacktestChart data={chartData} unit={returnUnit} />

          {/* Detail, visible by default rather than behind a toggle. */}
          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                  <TableHead className="text-right">Sr</TableHead>
                  <TableHead className="text-right">Jr</TableHead>
                  <TableHead className="text-right">SLP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.monthly.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-semibold whitespace-nowrap">
                      {monthLabel(row.month)}
                    </TableCell>
                    {[
                      row.strategyReturn,
                      row.seniorReturn,
                      row.juniorReturn,
                      row.liquidityReturn,
                    ].map((value, position) => (
                      <TableCell
                        className="text-right font-mono tabular-nums"
                        key={position}
                        style={
                          value < 0
                            ? { color: "var(--red-emphasis)" }
                            : undefined
                        }
                      >
                        {signed(value)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex max-w-[520px] flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
            Coverage restoration
          </span>
          <DayV2SegmentedControl
            ariaLabel="Coverage restoration"
            className="w-fit"
            onValueChange={(value) => onMaintainCoverage(value === "on")}
            options={[
              { label: "On", value: "on" },
              { label: "Off", value: "off" },
            ]}
            size="sm"
            value={maintainCoverage ? "on" : "off"}
          />
          <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">
            Refills Jr with outside capital after a finalized loss; affects this
            backtest only.
          </span>
        </div>

        {/* Not a footnote. Where coverage was restored, this is the difference
            between Sr's headline being a property of the mechanism and being a
            property of someone else's money, so it sits with the figures. */}
        {outsideCapitalMatters ? (
          <p
            className="rounded-lg border px-3.5 py-2.5 text-[11.5px] leading-relaxed"
            style={{
              background:
                "color-mix(in srgb, var(--theme-gold) 12%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--theme-gold) 45%, transparent)",
              color: "var(--gold-emphasis)",
            }}
          >
            Coverage restoration added{" "}
            <strong className="font-mono font-bold tabular-nums">
              {pct(toppedUp)}
            </strong>{" "}
            of Jr&apos;s starting capital from outside the market. Turn it off
            to see the unrefilled result.
          </p>
        ) : null}

        {/* The market's own disclosure about its history. It is declared on the
            market rather than written here, and the root route surfaces it, so
            dropping it would quietly publish the series without the caveat it
            was supplied with. */}
        {footnote ? (
          <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--secondary)]">
            {footnote}
          </p>
        ) : null}

        {tailRisk ? (
          <p
            className="rounded-lg border px-3.5 py-2.5 text-[11.5px] leading-relaxed"
            style={{
              background:
                "color-mix(in srgb, var(--theme-red) 8%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--theme-red) 40%, transparent)",
              color: "var(--red-emphasis)",
            }}
          >
            {tailRisk}
          </p>
        ) : null}

        <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
          The dated path is rescaled to the{" "}
          {customSource ? "custom" : "selected"} source yield; that yield is an
          input, not a historical estimate. Past behavior is not a forecast.
          {returnUnit === "USD" ? null : (
            <>
              {" "}
              Returns on this market are quoted in {returnUnit}, not dollars.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

// Props change on every slider tick, so memo alone cannot skip the work. It is
// here to keep the deferred low-priority pass from also re-rendering this
// subtree when unrelated page state changes.
export default memo(DayV2Backtest);
