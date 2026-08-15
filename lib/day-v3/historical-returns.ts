import { calibrateSeriesApy } from "@/lib/day-simulator-template/series";
import { runDayHistoricalBacktest } from "@/lib/day-simulator-template/backtest";
import type { DayMarket } from "@/lib/day-simulator-template/market";
import type { MarketConfig } from "@/lib/day/engine/types";

/**
 * What each tranche actually did, over this market's own dated history.
 *
 * The scenario cards project forward from a flat source yield. On a market with
 * no history that is the only answer there is. On a market with history it is
 * one of two, and the quieter one is often the important one: jbbb's forward
 * model puts Junior at +10.2% a year, while the same terms run against jbbb's
 * real 2022 path put it at −71.2%. Both are true — the projection describes a
 * source that yields smoothly, the history describes the one that happened —
 * but showing only the first beside a section that says "Junior claim resets:
 * 364" asks the reader to notice the contradiction themselves.
 *
 * The source APY is deliberately NOT reported. `calibrateSeriesApy` rescales
 * the path so its annualized yield matches the source-yield control, so over a
 * full window the realized source return is just that control read back.
 * Printing it as a finding restates the input. What history carries is the
 * shape — the drawdowns, and who absorbed them — which is exactly what the
 * three tranche returns and the loss counts below describe.
 *
 * This is the shared runner, called the way the backtest section calls it. No
 * return is derived here.
 */
export type DayV3RealizedReturns = {
  seniorApy: number;
  juniorApy: number;
  liquidityApy: number;
  /** First and last dated observation actually modeled. */
  fromDate: string;
  toDate: string;
  observations: number;
  /** Dated steps where Senior lost value. */
  seniorLossEvents: number;
  /** Junior recovery claims the accountant erased. */
  erasedRecoveryClaims: number;
};

export type DayV3HistoricalTerms = {
  bandPct: number;
  coveragePct: number;
  liqSharePct: number;
  liqY0Pct: number;
  liqY100Pct: number;
  liquidityPct: number;
  maintainCoverage: boolean;
  observationDays: number;
  poolTurnoverPerYear: number;
  quoteAssetYieldPct: number;
  riskSharePct: number;
  riskY0Pct: number;
  riskY100Pct: number;
  sourceApyPct: number;
};

/**
 * Null rather than a throw or a zero. A market with no history has no realized
 * return, and neither does one whose terms the engine cannot carry across the
 * path — both are "there is no answer here", which is a different statement
 * from "the answer is zero" and must not render as one.
 */
export function dayV3RealizedReturns(
  market: DayMarket,
  terms: DayV3HistoricalTerms,
  configOverrides?: Partial<Pick<MarketConfig, "swapFeeBps" | "eclpParams">>,
): DayV3RealizedReturns | null {
  if (market.series.length < 3) return null;
  const series = calibrateSeriesApy(market.series, terms.sourceApyPct / 100);
  if (series.length < 3) return null;
  try {
    const result = runDayHistoricalBacktest({
      // The same two overrides the backtest section applies, for the same
      // reason: reading `market.defaults` straight through would run the
      // history on the template's own pool while the cards above it use the
      // issuer's answers, and the two would disagree about one market.
      defaults: {
        ...market.defaults,
        poolTurnoverPerYear: terms.poolTurnoverPerYear,
        stableYield: terms.quoteAssetYieldPct / 100,
      },
      series,
      terms: {
        coveragePct: terms.coveragePct,
        minLiquidityPct: terms.liquidityPct,
        eclpBandWidthPct: terms.bandPct,
        liqY0Pct: terms.liqY0Pct,
        liqY100Pct: terms.liqY100Pct,
        riskSharePct: terms.riskSharePct,
        liqSharePct: terms.liqSharePct,
        observationDays: terms.observationDays,
        riskY0Pct: terms.riskY0Pct,
        riskY100Pct: terms.riskY100Pct,
      },
      maintainCoverage: terms.maintainCoverage,
      omitInitialZeroReturnPeriod:
        market.customization.forwardTest?.omitInitialZeroReturnPeriod === true,
      monthlyBaselineDate: series[0]?.date,
      configOverrides,
    });
    return {
      seniorApy: result.seniorApy,
      juniorApy: result.juniorApy,
      liquidityApy: result.liquidityApy,
      fromDate: result.chart[0].date,
      toDate: result.chart[result.chart.length - 1].date,
      observations: series.length,
      seniorLossEvents: result.seniorLossEvents,
      erasedRecoveryClaims: result.erasedRecoveryClaims,
    };
  } catch {
    return null;
  }
}
