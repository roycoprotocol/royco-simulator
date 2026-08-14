import { Sim } from '@/lib/day/engine/runner';
import { MarketState, type MarketConfig } from '@/lib/day/engine/types';
import { buildDayErasureEvent, type DayErasureEvent } from '@/lib/day-simulator-template/erasure';
import type { DaySeriesPoint, DaySimulatorDefaults } from '@/lib/day-simulator-template/market';
import { shouldRefillJunior } from '@/lib/day-simulator-template/refill';
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
} from '@/lib/day-simulator-template/runtime';

/**
 * The historical backtest: step the engine across a market's real price series
 * and report what each position would have done.
 *
 * This lived inline in `DayMarketSimulator` and is now shared, so `/` and `/v2`
 * run the same accounting rather than two implementations that agree until they
 * quietly stop agreeing. Nothing here is new math. It is the same sequence of
 * `Sim` steps, refills and aggregations, moved behind a signature.
 */

const DAY_SECONDS = 86_400;
const DAY_MS = 86_400_000;

export const dayAnnualizedReturn = (end: number, start: number, days: number) =>
  days > 0 && start > 0 && end >= 0
    ? end === 0 ? -1 : Math.pow(end / start, 365 / days) - 1
    : 0;

export type DayObservationPeriod = {
  aIndex: number;
  bIndex: number;
  startDate: string;
  endDate: string;
  days: number;
  targetDays: number;
  expired: boolean;
};

export type DaySeniorLossEvent = {
  index: number;
  date: string;
  lossIndexPts: number;
};

export type DayBacktestChartPoint = {
  date: string;
  t: number;
  senior: number;
  junior: number;
  liquidity: number;
  strategy: number;
  state: MarketState;
  stIL: number;
  jtIL: number;
  ltRawNAV: number;
  accruedLiquidityPremium: number;
  poolPctST: number;
  utilization: number;
  liquidityUtilization: number;
  seniorEffectiveNAV: number;
  juniorEffectiveNAV: number;
};

export type DayBacktestMonthlyRow = {
  month: string;
  strategyReturn: number;
  juniorReturn: number;
  seniorReturn: number;
  liquidityReturn: number;
};

/** Percent-unit terms, matching the control values the simulators hold. */
export type DayBacktestTerms = {
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  riskSharePct: number;
  riskY0Pct?: number;
  riskY100Pct?: number;
  liqSharePct: number;
  liqY0Pct?: number;
  liqY100Pct?: number;
  observationDays: number;
};

export type DayBacktestInput = {
  defaults: DaySimulatorDefaults;
  series: DaySeriesPoint[];
  terms: DayBacktestTerms;
  maintainCoverage: boolean;
  omitInitialZeroReturnPeriod: boolean;
  /**
   * First date of the full modeled series. The opening month is dropped only
   * when this run actually starts at the series origin, because a window that
   * starts mid-history has a real first month rather than a zero-return stub.
   */
  monthlyBaselineDate?: string;
  /** V3 can inject exact canonical venue fields without deriving pool math in
   * Dawn. Existing callers omit this and retain byte-for-byte defaults. */
  configOverrides?: Partial<Pick<MarketConfig, 'swapFeeBps' | 'eclpParams'>>;
};

/**
 * A premium may only be charged when its counterparty tranche holds capital,
 * or Sr is debited, nobody is credited, and Sr trails its own source.
 */
const effectivePremium = (share: number, funded: boolean) => (funded ? share : 0);

export function runDayHistoricalBacktest(input: DayBacktestInput) {
  const { defaults, maintainCoverage, omitInitialZeroReturnPeriod, series } = input;
  // Identifier kept from the original inline runner: this is a code move, and
  // naming it anything else would make the two harder to diff.
  const enginePremiumInputs = input.terms;
  const coverage = enginePremiumInputs.coveragePct / 100;
  const minLiquidity = enginePremiumInputs.minLiquidityPct / 100;
  const eclpBandWidth = enginePremiumInputs.eclpBandWidthPct / 100;
  const riskTarget = effectivePremium(
    enginePremiumInputs.riskSharePct,
    enginePremiumInputs.coveragePct > 0,
  ) / 100;
  const liqTarget = effectivePremium(
    enginePremiumInputs.liqSharePct,
    enginePremiumInputs.minLiquidityPct > 0,
  ) / 100;
  // V2 exposes the full static curves, so the historical run must use the
  // same anchors as the forward run and deployment brief. Older callers omit
  // them and retain the market's declared defaults.
  const configuredDefaults: DaySimulatorDefaults = {
    ...defaults,
    riskYDM: {
      ...defaults.riskYDM,
      y0: enginePremiumInputs.riskY0Pct === undefined
        ? defaults.riskYDM.y0
        : enginePremiumInputs.riskY0Pct / 100,
      y100: enginePremiumInputs.riskY100Pct === undefined
        ? defaults.riskYDM.y100
        : enginePremiumInputs.riskY100Pct / 100,
    },
    liqYDM: {
      ...defaults.liqYDM,
      y0: enginePremiumInputs.liqY0Pct === undefined
        ? defaults.liqYDM.y0
        : enginePremiumInputs.liqY0Pct / 100,
      y100: enginePremiumInputs.liqY100Pct === undefined
        ? defaults.liqYDM.y100
        : enginePremiumInputs.liqY100Pct / 100,
    },
  };
  const initial = buildDayInitialBalances(defaults, { coverage, minLiquidity });
  const cfg = {
    ...buildDayMarketConfig(configuredDefaults, {
      coverage,
      minLiquidity,
      eclpBandWidth,
      observationDays: enginePremiumInputs.observationDays,
      riskYieldShare: riskTarget,
      liquidityYieldShare: liqTarget,
    }),
    ...input.configOverrides,
  };
  const sim = new Sim(cfg, initial);
  const snapshots = [sim.last()];
  const firstSnapshot = snapshots[0];
  const erasureEvents: DayErasureEvent[] = [];
  let juniorCapitalInjected = 0;
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    const elapsedDays = Math.max(
      1,
      Math.round((Date.parse(current.date) - Date.parse(previous.date)) / DAY_MS),
    );
    const sourceReturn = current.price / previous.price - 1;
    const eventStart = sim.events.length;
    const previousSnapshot = snapshots[snapshots.length - 1];
    sim.step({ dtSec: elapsedDays * DAY_SECONDS, stReturn: sourceReturn, jtReturn: sourceReturn });
    const postReturn = sim.last();
    const stepEvents = sim.events.slice(eventStart);
    const erasureEvent = stepEvents.find((event) => event.kind === 'jt-il-erased');
    if (erasureEvent?.amountNAV !== undefined) {
      const exitEvent = stepEvents.find((event) => event.kind === 'exit-fixed-term');
      const reason = exitEvent?.observationExitReason === 'period-ended'
        ? 'Observation Period ended'
        : exitEvent?.observationExitReason === 'protected-exit'
          ? 'Protected Exit opened'
          : exitEvent?.observationExitReason === 'st-impairment'
            ? 'Sr impairment'
            : 'Jr recovery claim reset';
      const currentJuniorIndex = firstSnapshot.jtPrice > 0
        ? (postReturn.jtPrice / firstSnapshot.jtPrice) * 100
        : 0;
      const preRefillJuniorNAV = postReturn.jtEffectiveNAV > 1e-12
        ? postReturn.jtEffectiveNAV
        : previousSnapshot.jtEffectiveNAV;
      const navPerIndexPoint = firstSnapshot.jtPrice > 0
        ? (sim.state.jtShares * firstSnapshot.jtPrice) / 100
        : 0;
      erasureEvents.push(
        buildDayErasureEvent({
          index,
          date: current.date,
          currentJuniorIndex,
          erasedAmount: erasureEvent.amountNAV,
          preRefillJuniorNAV,
          navPerIndexPoint,
          reason,
        }),
      );
    }
    const observationClosed =
      previousSnapshot.state === MarketState.FIXED_TERM &&
      postReturn.state === MarketState.PERPETUAL;
    if (
      observationClosed &&
      shouldRefillJunior(maintainCoverage, previousSnapshot.state, postReturn.state)
    ) {
      const numerator =
        coverage * (sim.state.stRawNAV + sim.state.jtRawNAV) -
        cfg.targetUtilization * sim.state.jtEffectiveNAV;
      const denominator = cfg.targetUtilization - coverage;
      const refill = denominator > 0 ? numerator / denominator : 0;
      if (refill > cfg.dustTolerance) {
        sim.step({
          dtSec: 0,
          stReturn: 0,
          jtReturn: 0,
          op: { type: 'jtDeposit', amount: refill },
        });
        juniorCapitalInjected += refill;
      }
    }
    snapshots.push(sim.last());
  }
  const chart: DayBacktestChartPoint[] = series.map((point, index) => {
    const snapshot = snapshots[index];
    return {
      date: point.date,
      t: snapshot.t,
      senior: (snapshot.stPrice / firstSnapshot.stPrice) * 100,
      junior: (snapshot.jtPrice / firstSnapshot.jtPrice) * 100,
      liquidity: (snapshot.ltPrice / firstSnapshot.ltPrice) * 100,
      strategy: (point.price / series[0].price) * 100,
      state: snapshot.state,
      stIL: snapshot.stIL,
      jtIL: snapshot.jtIL,
      ltRawNAV: snapshot.ltRawNAV,
      accruedLiquidityPremium: snapshot.accruedLiquidityPremium,
      poolPctST: snapshot.poolPctST,
      utilization: snapshot.utilization,
      liquidityUtilization: snapshot.liquidityUtilization,
      seniorEffectiveNAV: snapshot.stEffectiveNAV,
      juniorEffectiveNAV: snapshot.jtEffectiveNAV,
    };
  });
  const first = chart[0];
  const last = chart[chart.length - 1];
  const days = Math.max(
    1,
    (Date.parse(series[series.length - 1].date) - Date.parse(series[0].date)) / DAY_MS,
  );
  const makePeriod = (
    aIndex: number,
    bIndex: number,
    expired: boolean,
  ): DayObservationPeriod => ({
    aIndex,
    bIndex,
    startDate: chart[aIndex].date,
    endDate: chart[bIndex].date,
    days: Math.round((Date.parse(chart[bIndex].date) - Date.parse(chart[aIndex].date)) / DAY_MS),
    targetDays: enginePremiumInputs.observationDays,
    expired,
  });
  const observationPeriods: DayObservationPeriod[] = [];
  for (let index = 0; index < chart.length; index += 1) {
    if (chart[index].state !== MarketState.FIXED_TERM) continue;
    if (index > 0 && chart[index - 1].state === MarketState.FIXED_TERM) continue;
    let closeIndex = index + 1;
    while (closeIndex < chart.length && chart[closeIndex].state === MarketState.FIXED_TERM) {
      closeIndex += 1;
    }
    if (closeIndex >= chart.length) {
      observationPeriods.push(makePeriod(index, chart.length - 1, false));
    } else {
      const exitEvent = sim.events.find(
        (event) => event.t === chart[closeIndex].t && event.kind === 'exit-fixed-term',
      );
      observationPeriods.push(
        makePeriod(index, closeIndex, exitEvent?.observationExitReason === 'period-ended'),
      );
    }
  }
  const nonObservationPeriods: DayObservationPeriod[] = [];
  let nonObservationStart = 0;
  for (const period of observationPeriods) {
    if (period.aIndex > nonObservationStart) {
      nonObservationPeriods.push(makePeriod(nonObservationStart, period.aIndex, false));
    }
    nonObservationStart = period.bIndex;
  }
  if (chart.length - 1 > nonObservationStart) {
    nonObservationPeriods.push(makePeriod(nonObservationStart, chart.length - 1, false));
  }
  const observationBands = observationPeriods.map((period) => ({
    start: period.startDate,
    end: period.endDate,
  }));
  const observationEvents = observationPeriods.length;
  const maxObservedObservationDays = observationPeriods.reduce(
    (maximum, period) => Math.max(maximum, period.days),
    0,
  );
  const totalObservedDays = Math.max(
    0,
    (Date.parse(chart[chart.length - 1].date) - Date.parse(chart[0].date)) / DAY_MS,
  );
  const outsideObservationPct = totalObservedDays > 0
    ? ((totalObservedDays - observationPeriods.reduce((sum, period) => sum + period.days, 0)) /
        totalObservedDays) *
      100
    : 0;
  const maxDrawdown = (key: 'strategy' | 'senior' | 'junior' | 'liquidity') => {
    let peak = chart[0][key];
    let worst = 0;
    for (const point of chart) {
      peak = Math.max(peak, point[key]);
      worst = Math.max(worst, peak > 0 ? 1 - point[key] / peak : 0);
    }
    return worst;
  };
  const seniorLossEventDetails: DaySeniorLossEvent[] = chart.flatMap((point, index) => {
    if (index === 0 || point.stIL <= chart[index - 1].stIL + 1e-9) return [];
    const lossIndexPts = Math.max(0, chart[index - 1].senior - point.senior);
    return lossIndexPts > 1e-9 ? [{ index, date: point.date, lossIndexPts }] : [];
  });
  const monthEnds = new Map<string, DayBacktestChartPoint>();
  for (const point of chart) monthEnds.set(point.date.slice(0, 7), point);
  let previousStrategy = 100;
  let previousJunior = 100;
  let previousSenior = 100;
  let previousLiquidity = 100;
  const monthlyRows: DayBacktestMonthlyRow[] = Array.from(monthEnds.entries()).map(
    ([month, monthEnd]) => {
      const strategyReturn = monthEnd.strategy / previousStrategy - 1;
      const juniorReturn = monthEnd.junior / previousJunior - 1;
      const seniorReturn = monthEnd.senior / previousSenior - 1;
      const liquidityReturn = monthEnd.liquidity / previousLiquidity - 1;
      previousStrategy = monthEnd.strategy;
      previousJunior = monthEnd.junior;
      previousSenior = monthEnd.senior;
      previousLiquidity = monthEnd.liquidity;
      return {
        month,
        strategyReturn,
        juniorReturn,
        seniorReturn,
        liquidityReturn,
      };
    },
  );
  const monthly = omitInitialZeroReturnPeriod
    && chart[0]?.date === input.monthlyBaselineDate
    && monthlyRows.length > 1
    ? monthlyRows.slice(1)
    : monthlyRows;
  const final = sim.last();
  return {
    cfg,
    initial,
    sim,
    chart,
    seniorApy: dayAnnualizedReturn(last.senior, first.senior, days),
    juniorApy: dayAnnualizedReturn(last.junior, first.junior, days),
    liquidityApy: dayAnnualizedReturn(last.liquidity, first.liquidity, days),
    strategyApy: dayAnnualizedReturn(last.strategy, first.strategy, days),
    final,
    observationPeriods,
    nonObservationPeriods,
    observationBands,
    observationEvents,
    outsideObservationPct,
    maxObservedObservationDays,
    erasureEvents,
    seniorLossEventDetails,
    erasedRecoveryClaims: erasureEvents.length,
    seniorLossEvents: seniorLossEventDetails.length,
    juniorCapitalInjected,
    juniorCapitalInjectedShareOfStart: initial.jt > 0
      ? juniorCapitalInjected / initial.jt
      : 0,
    strategyMaxDrawdown: maxDrawdown('strategy'),
    seniorMaxDrawdown: maxDrawdown('senior'),
    juniorMaxDrawdown: maxDrawdown('junior'),
    liquidityMaxDrawdown: maxDrawdown('liquidity'),
    monthly,
  };
}

export type DayBacktestResult = ReturnType<typeof runDayHistoricalBacktest>;
