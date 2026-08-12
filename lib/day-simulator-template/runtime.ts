import { Sim, defaultConfig, steadyYear } from "@/lib/day/engine/runner";
import type { MarketConfig } from "@/lib/day/engine/types";
import { dayCapitalAtUtilization } from "@/lib/day-simulator-template/capital-sizing";
import type {
  DayForwardScenarioId,
  DayForwardTestCustomization,
  DayReverseMarketCustomization,
  DaySeriesPoint,
  DaySimulatorDefaults,
} from "@/lib/day-simulator-template/market";

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

const DAY_MS = 86_400_000;

function dateAfter(anchorTime: number, elapsedDays: number): string {
  return new Date(anchorTime + elapsedDays * DAY_MS).toISOString().slice(0, 10);
}

function appendForwardPoint(
  points: DaySeriesPoint[],
  anchorTime: number,
  elapsedDays: number,
  price: number,
): void {
  const point = { date: dateAfter(anchorTime, elapsedDays), price };
  if (points.at(-1)?.date === point.date) {
    points[points.length - 1] = point;
  } else {
    points.push(point);
  }
}

export function buildDayFiniteForwardSeries(
  sourceApy: number,
  anchorDate: string,
  forwardTest: DayForwardTestCustomization,
  reverseMarket: DayReverseMarketCustomization,
  scenarioId: DayForwardScenarioId,
  observationDays: number,
): DaySeriesPoint[] {
  const anchorTime = Date.parse(`${anchorDate}T00:00:00Z`);
  if (!Number.isFinite(anchorTime)) throw new Error(`Invalid forward-series anchor date: ${anchorDate}`);
  if (!(sourceApy > -1)) throw new Error("Forward-series APY must be greater than -100%");

  const scenario = forwardTest.scenarios.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Missing forward scenario: ${scenarioId}`);

  const points: DaySeriesPoint[] = [{ date: anchorDate, price: 1 }];
  for (let elapsedDays = 30; elapsedDays < forwardTest.termDays; elapsedDays += 30) {
    appendForwardPoint(
      points,
      anchorTime,
      elapsedDays,
      Math.pow(1 + sourceApy, elapsedDays / 365),
    );
  }

  const termPrice = Math.pow(1 + sourceApy, forwardTest.termDays / 365);
  appendForwardPoint(points, anchorTime, forwardTest.termDays, termPrice);

  const settlementDays = forwardTest.termDays + scenario.paymentDelayDays;
  for (let elapsedDays = forwardTest.termDays + 30; elapsedDays < settlementDays; elapsedDays += 30) {
    appendForwardPoint(points, anchorTime, elapsedDays, termPrice);
  }

  const settlementPrice = scenario.terminalRecovery.kind === "full"
    ? termPrice
    : scenario.terminalRecovery.amount / reverseMarket.strategyCap;
  appendForwardPoint(points, anchorTime, settlementDays, settlementPrice);

  if (scenario.terminalRecovery.kind === "amount") {
    appendForwardPoint(
      points,
      anchorTime,
      settlementDays + Math.max(1, observationDays),
      settlementPrice,
    );
  }

  return points;
}

export type DayEditableTerms = {
  coverage: number;
  minLiquidity: number;
  eclpBandWidth: number;
  observationDays: number;
  riskYieldShare: number;
  liquidityYieldShare: number;
};

export function buildDayInitialBalances(
  defaults: DaySimulatorDefaults,
  terms: Pick<DayEditableTerms, "coverage" | "minLiquidity">,
): { st: number; jt: number; lt: number } {
  // Ask the engine-defined utilization functions for the target balances. The
  // former closed-form float expression could land a few wei below the required
  // capital at high-but-valid coverage settings (for example 50.01%), causing
  // `newMarket` to reject an otherwise valid V3 design. The shared inversion is
  // already the canonical capital-sizing path and preserves the same 90% target
  // and unlinked-Junior behavior for every existing simulator.
  return dayCapitalAtUtilization(defaults, terms, DAY_TARGET_UTILIZATION);
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
    fixedTermGracePeriodSec: (defaults.fixedTermGracePeriodDays ?? 0) * 86_400,
    liquidationUtilization: 100 / Math.max(defaults.exitBufferPct, 0.01),
    stSelfLiquidationBonus: defaults.selfLiquidationBonus,
    stProtocolFee: defaults.stProtocolFee,
    jtProtocolFee: defaults.jtProtocolFee,
    yieldShareProtocolFee: defaults.jtYieldShareProtocolFee,
    ltYieldShareProtocolFee: defaults.ltYieldShareProtocolFee,
    stableYield: defaults.stableYield,
    swapFeeBps: defaults.swapFeeBps,
    poolTurnoverPerYear: defaults.poolTurnoverPerYear,
    eclpBandWidth: terms.eclpBandWidth,
    eclpParams:
      defaults.eclpParams && Math.abs(terms.eclpBandWidth - defaults.eclpBandWidth) < 1e-12
        ? defaults.eclpParams
        : undefined,
    maxJTYieldShare: defaults.maxJTYieldShare,
    maxLTYieldShare: defaults.maxLTYieldShare,
    ...(defaults.dustTolerance === undefined
      ? {}
      : { dustTolerance: defaults.dustTolerance }),
    reinvestLiquidityPremium: defaults.reinvestLiquidityPremium,
  });
}

export function runDayTargetScenario(
  defaults: DaySimulatorDefaults,
  overrides: Partial<Pick<DayEditableTerms, "riskYieldShare" | "liquidityYieldShare">> = {},
  configOverrides: Partial<Pick<MarketConfig, "swapFeeBps" | "eclpParams">> = {},
): { seniorApy: number; juniorApy: number; liquidityApy: number } {
  const terms: DayEditableTerms = {
    coverage: defaults.coverage,
    minLiquidity: defaults.minLiquidity,
    eclpBandWidth: defaults.eclpBandWidth,
    observationDays: defaults.observationDays,
    riskYieldShare: overrides.riskYieldShare ?? defaults.riskYDM.yTarget,
    liquidityYieldShare: overrides.liquidityYieldShare ?? defaults.liqYDM.yTarget,
  };
  const cfg = { ...buildDayMarketConfig(defaults, terms), ...configOverrides };
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
