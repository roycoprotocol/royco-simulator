// ---------------------------------------------------------------------------
// backtest.ts — deterministic backtest runner for the TRY/wiTRY 2-tranche market.
//
// This is the ONLY bridge between a price path and the validated accountant
// engine. It NEVER re-implements accounting math — every NAV/state number comes
// from lib/try/engine.ts (proven wei-exact against RoycoDayAccountant, see
// PARITY-REPORT.md). This module only (a) drives the engine over a price series
// and (b) derives presentational summaries (APY, calendar returns, drawdown)
// from the engine's effective-NAV outputs.
// ---------------------------------------------------------------------------
import {
  createMarket,
  deposit,
  sync,
  mulDiv,
  Rounding,
  WAD,
  type MarketConfig,
  type MarketState,
} from "./engine";

/** A single point on the strategy (wiTRY) price path. */
export interface PricePoint {
  date: string; // ISO "YYYY-MM-DD" or "YYYY-MM"
  price: number; // strategy NAV / wiTRY USD value; any positive scale (normalized internally)
}

export interface BacktestParams {
  config: MarketConfig;
  /** Senior deposit, in whole "dollars" (scaled to WAD NAV units internally). */
  depositST: number;
  /** Junior deposit, in whole "dollars". */
  depositJT: number;
  series: PricePoint[]; // series[0] is the genesis mark (price base)
}

export interface BacktestStep {
  date: string;
  price: number; // raw strategy price
  priceIndex: number; // price / price[0] * 100  (strategy at $100 base)
  stEff: bigint; // Senior effective NAV (NAV units, WAD-scaled)
  jtEff: bigint; // Junior effective NAV
  il: bigint; // outstanding JT coverage impermanent loss
  coverageUtilWad: bigint;
  marketState: MarketState;
  stIndex: number; // Senior effective NAV, indexed to $100 at genesis
  jtIndex: number; // Junior effective NAV, indexed to $100 at genesis
  inObservation: boolean; // marketState === FIXED_TERM
  juniorLossLocked: boolean; // this step: term elapsed / exhaustion → Junior permanently ate a covered loss
}

export interface CalendarRow {
  year: string;
  seniorEnd100: number; // Senior indexed value at year end (or period end)
  juniorEnd100: number;
  seniorReturn: number; // fractional return over the calendar year
  juniorReturn: number;
  strategyReturn: number;
}

export interface BacktestResult {
  steps: BacktestStep[];
  years: number; // total horizon in years
  seniorAvgYr: number; // annualized (CAGR) Senior return
  juniorAvgYr: number;
  strategyAvgYr: number;
  seniorTotalReturn: number;
  juniorTotalReturn: number;
  strategyTotalReturn: number;
  seniorMaxDrawdown: number; // worst peak-to-trough of Senior index (>= 0)
  juniorMaxDrawdown: number;
  observationEvents: number; // count of PERPETUAL→FIXED_TERM entries
  juniorLossEvents: number; // count of permanent Junior loss lock-ins (term elapse / exhaustion)
  calendar: CalendarRow[];
}

const YEAR_SECONDS = 365.25 * 24 * 60 * 60;

/** dollars → NAV units (WAD-scaled), matching the harness's toNAVUnits(x*1e18-style) convention. */
function toNav(dollars: number): bigint {
  // Preserve up to 6 decimals of the dollar input without float-precision loss at 1e18.
  const micros = BigInt(Math.round(dollars * 1e6));
  return (micros * WAD) / 1_000_000n;
}

function toPriceWad(price: number): bigint {
  const micros = BigInt(Math.round(price * 1e6));
  return (micros * WAD) / 1_000_000n;
}

/** seconds between two ISO date strings (supports "YYYY-MM" and "YYYY-MM-DD"). */
function secondsBetween(a: string, b: string): bigint {
  const pa = Date.parse(a.length === 7 ? a + "-01" : a);
  const pb = Date.parse(b.length === 7 ? b + "-01" : b);
  const ms = pb - pa;
  return BigInt(Math.max(0, Math.round(ms / 1000)));
}

const toNum = (x: bigint): number => Number(x) / 1e18;

/**
 * Run the engine over a price series. Both tranches are co-invested (β=true):
 * each tranche's raw NAV scales with the strategy price. The engine then
 * redistributes gains/losses/premiums into effective NAVs per the accountant.
 */
export function runBacktest(params: BacktestParams): BacktestResult {
  const { config, depositST, depositJT, series } = params;
  if (series.length === 0) {
    return emptyResult();
  }

  const m = createMarket(config);
  const stNav0 = toNav(depositST);
  const jtNav0 = toNav(depositJT);

  // Genesis seeding via deposits (JT then ST), mirroring VectorGen.t.sol / parity.ts.
  deposit(m, "JT", 0n, jtNav0);
  deposit(m, "ST", stNav0, jtNav0);

  const priceWad0 = toPriceWad(series[0].price);
  const steps: BacktestStep[] = [];

  // $100-indexing bases: captured on the first sync's effective NAVs.
  let stBase = 0n;
  let jtBase = 0n;

  let prevState: MarketState = "PERPETUAL";
  let prevIL = 0n;

  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    const priceWad = toPriceWad(p.price);
    // Co-invested: raw NAV = deposit * price / price0.
    const stRaw = mulDiv(stNav0, priceWad, priceWad0, Rounding.Floor);
    const jtRaw = mulDiv(jtNav0, priceWad, priceWad0, Rounding.Floor);
    const dt = i === 0 ? 0n : secondsBetween(series[i - 1].date, p.date);

    const r = sync(m, stRaw, jtRaw, dt);

    if (i === 0) {
      stBase = r.stEffectiveNAV === 0n ? 1n : r.stEffectiveNAV;
      jtBase = r.jtEffectiveNAV === 0n ? 1n : r.jtEffectiveNAV;
    }

    // Detect a permanent Junior loss lock-in: we were in a term, we're now
    // perpetual, IL was outstanding, and the strategy has NOT recovered to the
    // pre-drawdown mark (so this is a term-elapse/exhaustion erasure, not a repay).
    const backToPerpetual = prevState === "FIXED_TERM" && r.marketState === "PERPETUAL";
    const juniorLossLocked = backToPerpetual && prevIL > 0n && p.price < series[0].price;

    steps.push({
      date: p.date,
      price: p.price,
      priceIndex: (p.price / series[0].price) * 100,
      stEff: r.stEffectiveNAV,
      jtEff: r.jtEffectiveNAV,
      il: r.jtCoverageIL,
      coverageUtilWad: r.coverageUtilWad,
      marketState: r.marketState,
      stIndex: (toNum(r.stEffectiveNAV) / toNum(stBase)) * 100,
      jtIndex: (toNum(r.jtEffectiveNAV) / toNum(jtBase)) * 100,
      inObservation: r.marketState === "FIXED_TERM",
      juniorLossLocked,
    });

    prevState = r.marketState;
    prevIL = r.jtCoverageIL;
  }

  return summarize(steps, series);
}

function summarize(steps: BacktestStep[], series: PricePoint[]): BacktestResult {
  const first = steps[0];
  const last = steps[steps.length - 1];
  const totalSeconds = Number(secondsBetween(series[0].date, series[series.length - 1].date));
  const years = totalSeconds > 0 ? totalSeconds / YEAR_SECONDS : 0;

  const seniorTotalReturn = last.stIndex / 100 - 1;
  const juniorTotalReturn = last.jtIndex / 100 - 1;
  const strategyTotalReturn = last.priceIndex / 100 - 1;

  const cagr = (totalReturn: number) => (years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0);

  // Observation + junior-loss event counts.
  let observationEvents = 0;
  let juniorLossEvents = 0;
  let prevObs = false;
  for (const s of steps) {
    if (s.inObservation && !prevObs) observationEvents++;
    if (s.juniorLossLocked) juniorLossEvents++;
    prevObs = s.inObservation;
  }

  // Calendar (per-year) returns, indexed off the first step of each year.
  const calendar = buildCalendar(steps);

  return {
    steps,
    years,
    seniorAvgYr: cagr(seniorTotalReturn),
    juniorAvgYr: cagr(juniorTotalReturn),
    strategyAvgYr: cagr(strategyTotalReturn),
    seniorTotalReturn,
    juniorTotalReturn,
    strategyTotalReturn,
    seniorMaxDrawdown: maxDrawdown(steps.map((s) => s.stIndex)),
    juniorMaxDrawdown: maxDrawdown(steps.map((s) => s.jtIndex)),
    observationEvents,
    juniorLossEvents,
    calendar,
  };
}

function buildCalendar(steps: BacktestStep[]): CalendarRow[] {
  const byYear = new Map<string, BacktestStep[]>();
  for (const s of steps) {
    const y = s.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s);
  }
  const rows: CalendarRow[] = [];
  let prevSt = 100,
    prevJt = 100,
    prevStrat = 100;
  let firstYear = true;
  for (const [year, ys] of [...byYear.entries()].sort()) {
    const end = ys[ys.length - 1];
    // Year-start basis = previous year's end (or 100 at inception).
    const startSt = firstYear ? 100 : prevSt;
    const startJt = firstYear ? 100 : prevJt;
    const startStrat = firstYear ? 100 : prevStrat;
    rows.push({
      year,
      seniorEnd100: end.stIndex,
      juniorEnd100: end.jtIndex,
      seniorReturn: end.stIndex / startSt - 1,
      juniorReturn: end.jtIndex / startJt - 1,
      strategyReturn: end.priceIndex / startStrat - 1,
    });
    prevSt = end.stIndex;
    prevJt = end.jtIndex;
    prevStrat = end.priceIndex;
    firstYear = false;
  }
  return rows;
}

function maxDrawdown(series: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak);
  }
  return mdd;
}

function emptyResult(): BacktestResult {
  return {
    steps: [],
    years: 0,
    seniorAvgYr: 0,
    juniorAvgYr: 0,
    strategyAvgYr: 0,
    seniorTotalReturn: 0,
    juniorTotalReturn: 0,
    strategyTotalReturn: 0,
    seniorMaxDrawdown: 0,
    juniorMaxDrawdown: 0,
    observationEvents: 0,
    juniorLossEvents: 0,
    calendar: [],
  };
}
