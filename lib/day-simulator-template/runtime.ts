import { Sim, defaultConfig, steadyYear } from "@/lib/day/engine/runner";
import type { MarketConfig } from "@/lib/day/engine/types";
import type { DaySeriesPoint, DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

export const DAY_TARGET_UTILIZATION = 0.9;

export function buildDayForwardSeries(
  sourceApy: number,
  stableYield: number,
  anchorDate: string,
): DaySeriesPoint[] {
  const anchorTime = Date.parse(`${anchorDate}T00:00:00Z`);
  if (!Number.isFinite(anchorTime)) throw new Error(`Invalid forward-series anchor date: ${anchorDate}`);

  let price = 1;
  const points: DaySeriesPoint[] = [{ date: anchorDate, price }];
  for (const [index, step] of steadyYear(sourceApy, 1, stableYield).entries()) {
    price *= 1 + step.stReturn;
    points.push({
      date: new Date(anchorTime + step.dtSec * 1000 * (index + 1)).toISOString().slice(0, 10),
      price,
    });
  }
  return points;
}

export type DayEditableTerms = {
  coverage: number;
  minLiquidity: number;
  observationDays: number;
  riskYieldShare: number;
  liquidityYieldShare: number;
};

export function buildDayInitialBalances(
  defaults: DaySimulatorDefaults,
  terms: Pick<DayEditableTerms, "coverage" | "minLiquidity">,
): { st: number; jt: number; lt: number } {
  const juniorRatio = terms.coverage / Math.max(DAY_TARGET_UTILIZATION - terms.coverage, 0.001);
  const liquidityRatio = terms.minLiquidity / DAY_TARGET_UTILIZATION;
  return {
    st: defaults.initialST,
    jt: defaults.linkJuniorToFirstLoss
      ? defaults.initialST * juniorRatio
      : defaults.initialJT,
    lt: defaults.initialST * liquidityRatio,
  };
}

export function buildDayMarketConfig(
  defaults: DaySimulatorDefaults,
  terms: DayEditableTerms,
): MarketConfig {
  return defaultConfig({
    coverage: terms.coverage,
    beta: 1,
    targetUtilization: DAY_TARGET_UTILIZATION,
    minLiquidity: terms.minLiquidity,
    liqTargetUtilization: DAY_TARGET_UTILIZATION,
    riskYDM: {
      ...defaults.riskYDM,
      y0: Math.min(defaults.riskYDM.y0, terms.riskYieldShare),
      yTarget: terms.riskYieldShare,
      y100: Math.max(defaults.riskYDM.y100, terms.riskYieldShare),
    },
    liqYDM: {
      ...defaults.liqYDM,
      y0: Math.min(defaults.liqYDM.y0, terms.liquidityYieldShare),
      yTarget: terms.liquidityYieldShare,
      y100: Math.max(defaults.liqYDM.y100, terms.liquidityYieldShare),
    },
    fixedTermDurationSec: terms.observationDays * 86_400,
    liquidationUtilization: 100 / Math.max(defaults.exitBufferPct, 0.01),
    stSelfLiquidationBonus: defaults.selfLiquidationBonus,
    stProtocolFee: defaults.stProtocolFee,
    jtProtocolFee: defaults.jtProtocolFee,
    yieldShareProtocolFee: defaults.jtYieldShareProtocolFee,
    ltYieldShareProtocolFee: defaults.ltYieldShareProtocolFee,
    stableYield: defaults.stableYield,
    swapFeeBps: defaults.swapFeeBps,
    poolTurnoverPerYear: defaults.poolTurnoverPerYear,
    eclpBandWidth: defaults.eclpBandWidth,
    reinvestLiquidityPremium: defaults.reinvestLiquidityPremium,
  });
}

export function runDayTargetScenario(
  defaults: DaySimulatorDefaults,
  overrides: Partial<Pick<DayEditableTerms, "riskYieldShare" | "liquidityYieldShare">> = {},
): { seniorApy: number; juniorApy: number; liquidityApy: number } {
  const terms: DayEditableTerms = {
    coverage: defaults.coverage,
    minLiquidity: defaults.minLiquidity,
    observationDays: defaults.observationDays,
    riskYieldShare: overrides.riskYieldShare ?? defaults.riskYDM.yTarget,
    liquidityYieldShare: overrides.liquidityYieldShare ?? defaults.liqYDM.yTarget,
  };
  const cfg = buildDayMarketConfig(defaults, terms);
  const initial = buildDayInitialBalances(defaults, terms);
  const sim = new Sim(cfg, initial);
  const opening = sim.last();
  steadyYear(defaults.sourceApy, 1, cfg.stableYield).forEach((step) => sim.step(step));
  const final = sim.last();
  return {
    seniorApy: final.stPrice / opening.stPrice - 1,
    juniorApy: final.jtPrice / opening.jtPrice - 1,
    liquidityApy: final.ltPrice / opening.ltPrice - 1,
  };
}
