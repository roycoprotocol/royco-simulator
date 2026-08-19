import type { DayMarket } from "@/lib/day-simulator-template/market";
import { calibrateSeriesApy } from "@/lib/day-simulator-template/series";

/**
 * A market with a separately published forward APY has two honest inputs:
 * the published yield for projections and the observed series for history.
 * Other Explorer histories retain the existing what-if behavior, where the
 * source-yield control rescales the path being tested.
 */
export function dayV3BacktestSeries(
  market: DayMarket,
  forwardSourceApyPct: number,
) {
  return market.provenance.dataMode ===
    "historical-series-with-published-apy"
    ? market.series
    : calibrateSeriesApy(market.series, forwardSourceApyPct / 100);
}
