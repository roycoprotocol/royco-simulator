import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { runDayHistoricalBacktest } from "@/lib/day-simulator-template/backtest";

for (const mk of DAY_MARKETS as unknown as Record<string, unknown>[]) {
  const d = mk.defaults as Record<string, unknown>;
  const sr = (mk.series ?? []) as unknown[];
  if (sr.length < 3) continue;
  try {
    const r = runDayHistoricalBacktest({
      defaults: d as never,
      series: sr as never,
      terms: {
        coveragePct: (d.coverage as number) * 100,
        minLiquidityPct: (d.minLiquidity as number) * 100,
        eclpBandWidthPct: (d.eclpBandWidth as number) * 100,
        observationDays: d.observationDays as number,
        riskYieldShare: d.riskYieldShare, liquidityYieldShare: d.liquidityYieldShare,
        riskSharePct: 0, liqSharePct: 0, riskY0Pct: 0, riskY100Pct: 0, liqY0Pct: 0, liqY100Pct: 0,
      } as never,
      maintainCoverage: d.maintainCoverage as boolean,
      omitInitialZeroReturnPeriod: false,
      monthlyBaselineDate: (sr[0] as { date?: string })?.date,
    });
    const ps = r.observationPeriods;
    console.log(
      `${mk.id}: ${r.observationEvents} window(s), target ${d.observationDays}d, longest ${r.maxObservedObservationDays}d, outside ${r.outsideObservationPct.toFixed(1)}%` +
        (ps.length ? " :: " + ps.slice(0, 4).map((p) => `${p.startDate}->${p.endDate} ${p.days}d${p.expired ? " EXPIRED" : ""}`).join(" | ") : ""),
    );
  } catch (e) {
    console.log(`${mk.id}: THROW ${(e as Error).message.slice(0, 50)}`);
  }
}
