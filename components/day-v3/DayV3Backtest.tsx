"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV3BacktestChart, {
  type DayV3BacktestPoint,
} from "@/components/day-v3/DayV3BacktestChart";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import {
  Card,
  CardContent,
  CardNote,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { pct } from "@/components/day-v3/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  runDayHistoricalBacktest,
  type DayBacktestResult,
} from "@/lib/day-simulator-template/backtest";
import type { MarketConfig } from "@/lib/day/engine/types";
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
export const formatDayV3MonthlyReturn = (value: number) =>
  Number.isFinite(value)
    ? `${value < 0 ? "-" : "+"}${Math.abs(value * 100).toFixed(2)}%`
    : "N/A";

function DayV3Backtest({
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
  poolConfigOverrides,
  observationDays: observationInput,
  poolTurnoverPerYear: poolTurnoverInput,
  quoteAssetYieldPct: quoteAssetYieldInput,
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
  poolConfigOverrides: Partial<Pick<MarketConfig, "swapFeeBps" | "eclpParams">>;
  observationDays: number;
  poolTurnoverPerYear: number;
  quoteAssetYieldPct: number;
  riskY0Pct: number;
  riskY100Pct: number;
  riskSharePct: number;
  sourceApyPct: number;
}) {
  // The history has to run on the same pool as the projection above it.
  // Reading `market.defaults` straight through left the backtest paying the
  // market template's own exit-asset yield and its own 8x annual turnover
  // while the forward model used the issuer's answers, so the two disagreed
  // about the same pool.
  const defaults = useMemo(
    () => ({
      ...market.defaults,
      poolTurnoverPerYear: poolTurnoverInput,
      stableYield: quoteAssetYieldInput / 100,
    }),
    [market.defaults, poolTurnoverInput, quoteAssetYieldInput],
  );
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

  // The engine is template code under the byte lock, so a pool assumption it
  // cannot integrate is caught here rather than fixed there. Modeled fee income
  // is `turnover x fee`, compounded every step: JBBB at 100x turnover and a
  // 100% swap fee runs `pool.stable` to Infinity and the run throws
  // `cannot convert non-finite number to WAD`, which took the page down. The
  // fee bound below keeps real inputs well clear of that; this makes it
  // impossible to reach by any route at all.
  const [result, resultError] = useMemo<
    [DayBacktestResult | null, string | null]
  >(() => {
    if (view.length < 3) return [null, null];
    try {
      return [runDayHistoricalBacktest({
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
      configOverrides: poolConfigOverrides,
      }), null];
    } catch (error) {
      return [
        null,
        error instanceof Error ? error.message : "unknown engine error",
      ];
    }
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
    poolConfigOverrides,
    riskSharePct,
    riskY0Pct,
    riskY100Pct,
    series,
    view,
  ]);

  const chartData = useMemo<DayV3BacktestPoint[]>(
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
            <CardTitle className="text-[13.5px]" level={3}>
              Historical backtest
            </CardTitle>
            <Badge tone="caution">
              {resultError ? "cannot be run" : "no history"}
            </Badge>
          </div>
          <CardNote>
            {resultError
              ? `These pool assumptions cannot be carried across this history: the modeled fee income compounds past what the engine can hold (${resultError}). Lower the swap fee or the yearly turnover in Section 3 and the history runs again.`
              : customSource
              ? "Add dated NAV or price history in Section 1. That is the only missing input for this backtest; the current market terms will be applied automatically."
                : "No dated history is available; results above are forward projections at the selected source yield."}
          </CardNote>
        </CardHeader>
        <CardContent>
          {/* The markets without history are the forward-modeled ones, which is
              exactly where this disclosure lives. Dropping it on this branch
              would hide it on every market that declares one. */}
          {tailRisk ? (
            <p
              className="rounded-lg border px-3 py-3 text-[11.5px] leading-relaxed"
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
  const closedRecoveryPeriods = result.observationPeriods.filter(
    (period) => !period.expired && period.bIndex < result.chart.length - 1,
  ).length;
  const expiredRecoveryPeriods = result.observationPeriods.filter(
    (period) => period.expired,
  ).length;
  const openRecoveryPeriods = Math.max(
    0,
    result.observationPeriods.length -
      closedRecoveryPeriods -
      expiredRecoveryPeriods,
  );

  return (
    <Card data-accountant-source="runDayHistoricalBacktest">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[13.5px]" level={3}>
            Historical backtest
          </CardTitle>
          <Badge className="max-w-full whitespace-normal text-right" tone="neutral">
            {result.chart[0].date} to{" "}
            {result.chart[result.chart.length - 1].date}
          </Badge>
        </div>
        <CardNote>
          Runs these terms, including the {observationDays}-day Observation
          Period, against the source&apos;s dated price path.
        </CardNote>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
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

        <div
          aria-label="Historical mechanism evidence"
          className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3 sm:grid-cols-4"
          role="group"
        >
          {[
            {
              label: "Recovery windows",
              value: result.observationEvents.toString(),
              note: `${closedRecoveryPeriods} closed before expiry · ${expiredRecoveryPeriods} expired${openRecoveryPeriods > 0 ? ` · ${openRecoveryPeriods} open` : ""}`,
            },
            {
              label: "Junior claim resets",
              value: result.erasedRecoveryClaims.toString(),
              note: "Junior recovery claims erased by the accountant",
            },
            {
              label: "Senior loss events",
              value: result.seniorLossEvents.toString(),
              note:
                result.seniorLossEvents === 0
                  ? "No dated step impaired Senior"
                  : "Dated steps where Senior lost value",
            },
            {
              label: "Outside Junior capital",
              value: pct(toppedUp),
              note: maintainCoverage
                ? "Added after finalized Junior losses"
                : "Coverage restoration is off",
            },
          ].map((item) => (
            <div className="min-w-0" key={item.label}>
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                {item.label}
              </span>
              <strong className="mt-1 block font-mono text-[20px] leading-none tabular-nums">
                {item.value}
              </strong>
              <span className="mt-1 block text-[9.5px] leading-snug text-[var(--tertiary)]">
                {item.note}
              </span>
            </div>
          ))}
        </div>

        {/* Outputs. Labelled as a group: four figures that only mean anything
            read against each other, and it gives the set a name out of context. */}
        <div
          aria-label="Backtest result by position"
          className="grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-4"
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
            <div className="flex flex-col gap-1" key={label}>
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <DayV3BacktestChart data={chartData} unit={returnUnit} />

            {/* The window controls the chart immediately above it, so it lives
                with that chart rather than interrupting the result summary. */}
            <label className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-3">
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
                        {formatDayV3MonthlyReturn(value)}
                        {!Number.isFinite(value) ? (
                          <span className="sr-only">
                            Not applicable because this position began the
                            month with no remaining capital.
                          </span>
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex max-w-[520px] flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-3">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
            Coverage restoration
          </span>
          <DayV3SegmentedControl
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
            className="rounded-lg border px-3 py-3 text-[11.5px] leading-relaxed"
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
            className="rounded-lg border px-3 py-3 text-[11.5px] leading-relaxed"
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
export default memo(DayV3Backtest);
