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
  /**
   * Intended product model (default true): whenever the market is PERPETUAL
   * (deposits allowed) and Junior's buffer has drained below the target, fresh
   * Junior capital is attracted to restore coverage to the target — re-protecting
   * Senior from its (possibly marked-down) new level. Set false to model FIXED
   * Junior capital (Junior can be permanently exhausted, Senior nakedly exposed).
   */
  maintainJuniorCoverage?: boolean;
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
  stIndex: number; // Senior share price, indexed to $100 at genesis (per-unit, clean)
  jtIndex: number; // Junior share price, indexed to $100 at genesis (per-unit; replenishment mints at price, so index is undistorted)
  inObservation: boolean; // marketState === FIXED_TERM
  juniorLossLocked: boolean; // term elapsed / exhaustion → Junior permanently ate a covered loss
  seniorMarkedDown: boolean; // Senior effective share price fell this step (a real Senior loss)
  juniorReplenished: number; // fresh Junior capital attracted this step ($), 0 if none
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
  seniorMarkdownEvents: number; // count of steps where Senior's share price fell
  juniorCapitalInjected: number; // total fresh Junior capital attracted over the run ($)
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
  const maintain = params.maintainJuniorCoverage ?? true;
  if (series.length === 0) {
    return emptyResult();
  }

  const m = createMarket(config);
  const stNav0 = toNav(depositST);
  const jtNav0 = toNav(depositJT);
  const minCovWAD = config.minCoverageWAD;
  const targetUtilWAD = config.jtYDM.targetUtilizationWAD; // healthy refill point (Junior back to its target % of pool)

  // Genesis seeding via deposits (JT then ST), mirroring VectorGen.t.sol / parity.ts.
  deposit(m, "JT", 0n, jtNav0);
  deposit(m, "ST", stNav0, jtNav0);

  const priceWad0 = toPriceWad(series[0].price);
  const steps: BacktestStep[] = [];

  // Share accounting for clean per-unit indices. Senior is fixed capital
  // (shares constant). Junior is share-based: replenishment mints new shares at
  // the current share price, so the Junior index reflects a held unit's return
  // and is NOT distorted by fresh capital coming in.
  const stShares = stNav0; // 1 share ~ 1 nav unit at genesis (price 1.0)
  let jtShares = jtNav0;
  let stBase = 0n; // Senior effective NAV at genesis (per-unit base)
  let jtBase = 0n;

  // Running raw NAV carried across steps (scaled by price each step, bumped by deposits).
  let jtRawCarry = jtNav0; // Junior raw NAV at the previous step's price
  let prevPriceWad = priceWad0;

  let prevStIndex = 100;

  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    const priceWad = toPriceWad(p.price);
    // Senior: fixed capital, raw NAV = deposit * price / price0.
    const stRaw = mulDiv(stNav0, priceWad, priceWad0, Rounding.Floor);
    // Junior: carried raw NAV scaled by this step's price move (deposits are added after the sync).
    const jtRaw = i === 0 ? jtNav0 : mulDiv(jtRawCarry, priceWad, prevPriceWad, Rounding.Floor);
    const dt = i === 0 ? 0n : secondsBetween(series[i - 1].date, p.date);

    const r = sync(m, stRaw, jtRaw, dt);

    if (i === 0) {
      stBase = r.stEffectiveNAV === 0n ? 1n : r.stEffectiveNAV;
      jtBase = r.jtEffectiveNAV === 0n ? 1n : r.jtEffectiveNAV;
    }

    // Per-unit indices (share price / genesis share price * 100).
    const stIndex = (toNum(r.stEffectiveNAV) / toNum(stShares)) / (toNum(stBase) / toNum(stNav0)) * 100;
    const jtSharePrice = toNum(r.jtEffectiveNAV) / toNum(jtShares);
    const jtIndex = jtSharePrice / (toNum(jtBase) / toNum(jtNav0)) * 100;

    // A junior loss lock-in is exactly when the accountant ERASED outstanding coverage IL
    // (RoycoDayAccountant.sol:668): the term elapsed / coverage liquidated / Junior was wiped
    // while IL was still outstanding, so Junior permanently ate the covered loss. IL merely
    // reaching 0 is NOT a lock-in — that also happens when Senior gains recover it.
    const juniorLossLocked = r.jtCoverageILErased > 0n;
    const seniorMarkedDown = stIndex < prevStIndex - 1e-9;

    // --- Junior replenishment (the intended product model) ---
    // When PERPETUAL and Junior has drained below target, attract fresh Junior
    // capital to restore coverage to the target, re-protecting Senior.
    // Never at i === 0: genesis Junior is exactly what the user deposited, and no
    // time has passed for the buffer to have drained.
    let juniorReplenished = 0;
    let jtRawNext = r.jtRawNAV;
    if (maintain && i > 0 && r.marketState === "PERPETUAL") {
      // d solves: (stRaw + jtRaw + d)*minCov / (jtEff + d) = targetUtil.
      const t1 = mulDiv(r.stRawNAV + r.jtRawNAV, minCovWAD, WAD, Rounding.Floor);
      const t2 = mulDiv(r.jtEffectiveNAV, targetUtilWAD, WAD, Rounding.Floor);
      const denom = targetUtilWAD - minCovWAD;
      if (t1 > t2 && denom > 0n) {
        const d = mulDiv(t1 - t2, WAD, denom, Rounding.Floor);
        if (d > 0n) {
          // Mint Junior shares at the current share price (no distortion), then deposit.
          if (r.jtEffectiveNAV > 0n) {
            jtShares += (d * jtShares) / r.jtEffectiveNAV;
          } else {
            jtShares += d; // fresh cohort when Junior was fully wiped
          }
          deposit(m, "JT", r.stRawNAV, r.jtRawNAV + d);
          jtRawNext = r.jtRawNAV + d;
          juniorReplenished = toNum(d);
        }
      }
    }

    steps.push({
      date: p.date,
      price: p.price,
      priceIndex: (p.price / series[0].price) * 100,
      stEff: r.stEffectiveNAV,
      jtEff: r.jtEffectiveNAV,
      il: r.jtCoverageIL,
      coverageUtilWad: r.coverageUtilWad,
      marketState: r.marketState,
      stIndex,
      jtIndex,
      inObservation: r.marketState === "FIXED_TERM",
      juniorLossLocked,
      seniorMarkedDown,
      juniorReplenished,
    });

    prevStIndex = stIndex;
    jtRawCarry = jtRawNext;
    prevPriceWad = priceWad;
  }

  return summarize(steps, series);
}

function summarize(steps: BacktestStep[], series: PricePoint[]): BacktestResult {
  const last = steps[steps.length - 1];
  const totalSeconds = Number(secondsBetween(series[0].date, series[series.length - 1].date));
  const years = totalSeconds > 0 ? totalSeconds / YEAR_SECONDS : 0;

  const seniorTotalReturn = last.stIndex / 100 - 1;
  const juniorTotalReturn = last.jtIndex / 100 - 1;
  const strategyTotalReturn = last.priceIndex / 100 - 1;

  const cagr = (totalReturn: number) => (years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0);

  // Observation + junior-loss + senior-markdown + injected-capital tallies.
  let observationEvents = 0;
  let juniorLossEvents = 0;
  let seniorMarkdownEvents = 0;
  let juniorCapitalInjected = 0;
  let prevObs = false;
  for (const s of steps) {
    if (s.inObservation && !prevObs) observationEvents++;
    if (s.juniorLossLocked) juniorLossEvents++;
    if (s.seniorMarkedDown) seniorMarkdownEvents++;
    juniorCapitalInjected += s.juniorReplenished;
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
    seniorMarkdownEvents,
    juniorCapitalInjected,
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
    seniorMarkdownEvents: 0,
    juniorCapitalInjected: 0,
    calendar: [],
  };
}
