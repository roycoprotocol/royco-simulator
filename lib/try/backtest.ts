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

/**
 * Why a coverage IL erasure happened, as a LABEL for presentation.
 *
 * NOTE: this is a labelling convention, not accounting math. The engine erases IL
 * (RoycoDayAccountant.sol:668) without telling us which of its resolution conditions
 * fired; we re-derive the most specific one from the same config + sync outputs the
 * engine used. No number downstream depends on this string.
 */
export type ErasureReason = "expired" | "liquidation" | "juniorWiped" | "noTerm";

export interface BacktestStep {
  date: string;
  price: number; // raw strategy price
  priceIndex: number; // price / price[0] * 100  (strategy at $100 base)
  stEff: bigint; // Senior effective NAV (NAV units, WAD-scaled)
  jtEff: bigint; // Junior effective NAV
  il: bigint; // outstanding JT coverage impermanent loss
  /**
   * Coverage IL the accountant ERASED on this sync (r.jtCoverageILErased). Kept in full:
   * `il` is 0 at every erasure step, so the magnitude of what Junior permanently ate is
   * unrecoverable from `il` alone.
   */
  ilErased: bigint;
  /** Why `ilErased` was erased (null when nothing was erased). Presentational label only. */
  erasureReason: ErasureReason | null;
  coverageUtilWad: bigint;
  marketState: MarketState;
  stIndex: number; // Senior share price, indexed to $100 at genesis (per-unit, clean)
  jtIndex: number; // Junior share price, indexed to $100 at genesis (per-unit; replenishment mints at price, so index is undistorted)
  /**
   * Dollars of Junior effective NAV per ONE Junior index point at this step, i.e. jtEff$ / jtIndex.
   *
   * Recorded explicitly because that quotient is 0/0 exactly when Junior is wiped (jtEff and
   * jtIndex both hit 0), which is precisely when an erasure needs to be sized. It is a pure
   * function of the share count and the genesis base (jtShares$ * (jtBase$/jtNav0$) / 100), so
   * it stays well-defined at a wipe and lets buildErasureEvents convert erased dollars into
   * index points there. Captured at the same point as jtIndex, BEFORE any replenishment mints
   * new shares on this step.
   */
  jtNavPerIndexPt: number;
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

/** A contiguous run of steps in FIXED_TERM (an "observation period"), by step index. */
export interface ObservationPeriod {
  aIndex: number; // step index where observation was entered
  bIndex: number; // step index where it closed (last step if still open at series end)
  startDate: string;
  endDate: string;
  days: number; // observed calendar length (series cadence bounds this, not the term)
  targetDays: number; // configured fixedTermDurationSeconds, in days
  expired: boolean; // closed by term expiry (vs. still open / other resolution)
}

/** Calendar-day accounting for one year (or the `total` aggregate). */
export interface ObservationDays {
  obs: number;
  non: number;
  total: number;
}

/** A step where Junior permanently ate covered loss, sized for presentation. */
export interface ErasureEvent {
  index: number;
  date: string;
  reason: ErasureReason;
  forfeitIndexPts: number; // Junior index points given up
  forfeitPctOfJuniorNav: number; // erased / Junior NAV at the time, %
  top: number; // jtIndex + forfeitIndexPts (where Junior would have been)
}

/** A step where Senior's share price actually fell. */
export interface SeniorLossEvent {
  index: number;
  date: string;
  lossIndexPts: number;
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
  /** Contiguous FIXED_TERM runs, in order. */
  observationPeriods: ObservationPeriod[];
  /** Complement of observationPeriods: the PERPETUAL stretches between them. */
  nonObservationPeriods: ObservationPeriod[];
  /** Longest observed observation period, in calendar days (0 if none). */
  maxObservedObservationDays: number;
  /** Per-calendar-year observation/non-observation day split, keyed "YYYY", plus a `total` key. */
  yearlyObservationDays: Record<string, ObservationDays>;
  /** Observation entries bucketed by the year they started in, keyed "YYYY". */
  yearlyObservationTriggers: Record<string, number>;
  /** Share of the horizon's calendar days spent OUTSIDE observation, %. */
  outsideObservationPct: number;
  /** Every step that erased coverage IL, sized in Junior index points. */
  erasureEvents: ErasureEvent[];
  /** Every step where Senior's share price fell, sized in Senior index points. */
  seniorLossEvents: SeniorLossEvent[];
  /** Rising edges of coverageUtilWad crossing the liquidation threshold (edge-gated). */
  exitTriggerHits: number;
}

const YEAR_SECONDS = 365.25 * 24 * 60 * 60;

/** Whole days since epoch for an ISO "YYYY-MM" / "YYYY-MM-DD" date (mirrors secondsBetween's parsing). */
function dayNum(d: string): number {
  return Date.parse(d.length === 7 ? d + "-01" : d) / 86400000;
}

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
    // jtEff$ / jtIndex, but derived from shares + base so it survives a wipe (where both are 0).
    const jtNavPerIndexPt = (toNum(jtShares) * (toNum(jtBase) / toNum(jtNav0))) / 100;

    // A junior loss lock-in is exactly when the accountant ERASED outstanding coverage IL
    // (RoycoDayAccountant.sol:668): the term elapsed / coverage liquidated / Junior was wiped
    // while IL was still outstanding, so Junior permanently ate the covered loss. IL merely
    // reaching 0 is NOT a lock-in — that also happens when Senior gains recover it.
    const juniorLossLocked = r.jtCoverageILErased > 0n;
    const seniorMarkedDown = stIndex < prevStIndex - 1e-9;

    // Label WHY the erasure happened (see ErasureReason: convention, not math).
    // juniorWiped is checked BEFORE liquidation on purpose: coverageUtilization returns
    // UINT256_MAX when jtEff === 0 (engine.ts:181), so a wipe also trips the liquidation
    // threshold. The wipe is the more specific cause, so it wins.
    let erasureReason: ErasureReason | null = null;
    if (r.jtCoverageILErased !== 0n) {
      if (config.fixedTermDurationSeconds === 0n) erasureReason = "noTerm";
      else if (r.jtEffectiveNAV === 0n && r.stEffectiveNAV > 0n) erasureReason = "juniorWiped";
      else if (r.coverageUtilWad >= config.coverageLiquidationUtilizationWAD) erasureReason = "liquidation";
      else erasureReason = "expired";
    }

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
      ilErased: r.jtCoverageILErased,
      erasureReason,
      coverageUtilWad: r.coverageUtilWad,
      marketState: r.marketState,
      stIndex,
      jtIndex,
      jtNavPerIndexPt,
      inObservation: r.marketState === "FIXED_TERM",
      juniorLossLocked,
      seniorMarkedDown,
      juniorReplenished,
    });

    prevStIndex = stIndex;
    jtRawCarry = jtRawNext;
    prevPriceWad = priceWad;
  }

  return summarize(steps, series, config);
}

function summarize(steps: BacktestStep[], series: PricePoint[], config: MarketConfig): BacktestResult {
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

  const observationPeriods = buildObservationPeriods(steps, config);
  const nonObservationPeriods = buildNonObservationPeriods(steps, observationPeriods, config);
  const { yearly: yearlyObservationDays, outsidePct: outsideObservationPct } = buildYearlyObservationDays(
    steps,
    observationPeriods,
  );

  const yearlyObservationTriggers: Record<string, number> = {};
  for (const p of observationPeriods) {
    const y = p.startDate.slice(0, 4);
    yearlyObservationTriggers[y] = (yearlyObservationTriggers[y] ?? 0) + 1;
  }

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
    observationPeriods,
    nonObservationPeriods,
    maxObservedObservationDays: observationPeriods.reduce((mx, p) => Math.max(mx, p.days), 0),
    yearlyObservationDays,
    yearlyObservationTriggers,
    outsideObservationPct,
    erasureEvents: buildErasureEvents(steps),
    seniorLossEvents: buildSeniorLossEvents(steps),
    exitTriggerHits: countExitTriggerHits(steps, config),
  };
}

/** Build a period record from a pair of step indices. */
function makePeriod(
  steps: BacktestStep[],
  aIndex: number,
  bIndex: number,
  config: MarketConfig,
  expired: boolean,
): ObservationPeriod {
  const startDate = steps[aIndex].date;
  const endDate = steps[bIndex].date;
  return {
    aIndex,
    bIndex,
    startDate,
    endDate,
    days: Math.round(dayNum(endDate) - dayNum(startDate)),
    targetDays: Number(config.fixedTermDurationSeconds) / 86400,
    expired,
  };
}

/** Contiguous runs of inObservation steps: entry on the rising edge, close on the first step out. */
function buildObservationPeriods(steps: BacktestStep[], config: MarketConfig): ObservationPeriod[] {
  const out: ObservationPeriod[] = [];
  const n = steps.length;
  for (let i = 0; i < n; i++) {
    if (!steps[i].inObservation) continue;
    if (i !== 0 && steps[i - 1].inObservation) continue; // not a rising edge
    let j = i + 1;
    while (j < n && steps[j].inObservation) j++;
    if (j >= n) {
      // Still in observation at series end: close on the last step, unresolved.
      out.push(makePeriod(steps, i, n - 1, config, false));
    } else {
      out.push(makePeriod(steps, i, j, config, steps[j].erasureReason === "expired"));
    }
  }
  return out;
}

/** The complement of the observation bands: every PERPETUAL stretch, in order. */
function buildNonObservationPeriods(
  steps: BacktestStep[],
  bands: ObservationPeriod[],
  config: MarketConfig,
): ObservationPeriod[] {
  const out: ObservationPeriod[] = [];
  const n = steps.length;
  let a = 0;
  for (const band of bands) {
    if (band.aIndex > a) out.push(makePeriod(steps, a, band.aIndex, config, false));
    a = band.bIndex;
  }
  if (n - 1 > a) out.push(makePeriod(steps, a, n - 1, config, false));
  return out;
}

/**
 * Per-calendar-year observation-day accounting (ports tenbin-sims/index.html:405-420).
 * Days are clipped to both the year boundaries and the series' own span, so the totals
 * reconcile to the actual backtest horizon rather than to whole calendar years.
 */
function buildYearlyObservationDays(
  steps: BacktestStep[],
  periods: ObservationPeriod[],
): { yearly: Record<string, ObservationDays>; outsidePct: number } {
  const yearly: Record<string, ObservationDays> = {};
  const start = dayNum(steps[0].date);
  const end = dayNum(steps[steps.length - 1].date);
  const firstYear = Number(steps[0].date.slice(0, 4));
  const lastYear = Number(steps[steps.length - 1].date.slice(0, 4));

  const totals: ObservationDays = { obs: 0, non: 0, total: 0 };
  for (let y = firstYear; y <= lastYear; y++) {
    const ya = Math.max(dayNum(`${y}-01-01`), start);
    const yb = Math.min(dayNum(`${y + 1}-01-01`), end);
    const total = Math.max(0, yb - ya);
    let obs = 0;
    for (const p of periods) {
      obs += Math.max(0, Math.min(dayNum(p.endDate), yb) - Math.max(dayNum(p.startDate), ya));
    }
    const row = { obs: Math.round(obs), non: Math.round(Math.max(0, total - obs)), total: Math.round(total) };
    yearly[String(y)] = row;
    totals.obs += row.obs;
    totals.non += row.non;
    totals.total += row.total;
  }
  yearly.total = totals;
  return { yearly, outsidePct: totals.total > 0 ? (totals.non / totals.total) * 100 : 0 };
}

/**
 * Size each IL erasure in Junior index points.
 *
 * The denominator is Junior's PRE-LOSS effective NAV (not the original Junior deposit,
 * which is what tenbin-sims uses). Two reasons: it stays correct when Junior has been
 * replenished (the deposit is no longer the outstanding base), and it is dimensionally
 * consistent with jtIndex, which is a per-share index off the CURRENT share count.
 *
 * "Pre-loss" matters on a `juniorWiped` erasure: there jtEff is 0 BY CONSTRUCTION (the wipe
 * is what the label means), so the step's own jtEff cannot size anything. Sizing against it
 * — or guarding the divide-by-zero with a 0, as this did — reported real erased capital as
 * "0% / 0 index points", silently hiding the single largest losses in a run. The previous
 * step's effective NAV is Junior's last valuation before the loss landed, so it is the
 * denominator the forfeit is actually a fraction OF.
 *
 * Index points are converted through the step's own jtNavPerIndexPt, which is well-defined
 * at a wipe (it depends on shares + genesis base, not on jtEff). For non-wipe steps the
 * original `jtIndex * frac` expression is kept verbatim, so their output is byte-identical.
 */
function buildErasureEvents(steps: BacktestStep[]): ErasureEvent[] {
  const out: ErasureEvent[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.ilErased <= 0n) continue;
    const erased$ = toNum(s.ilErased);
    const jtEff$ = toNum(s.jtEff);
    const wiped = jtEff$ <= 0;

    // Junior's valuation immediately before this step's loss: its own effective NAV when it
    // survived, else the previous step's (its last non-zero mark).
    const preLoss$ = wiped ? (i > 0 ? toNum(steps[i - 1].jtEff) : 0) : jtEff$;
    const frac = preLoss$ > 0 ? erased$ / preLoss$ : 0;
    const forfeitIndexPts = wiped
      ? s.jtNavPerIndexPt > 0
        ? erased$ / s.jtNavPerIndexPt
        : 0
      : s.jtIndex * frac;

    // Nothing non-finite may reach the UI: it drives the chart's I-beam geometry, where a
    // NaN/Infinity silently corrupts the SVG path rather than erroring.
    const pts = Number.isFinite(forfeitIndexPts) ? forfeitIndexPts : 0;
    const pct = Number.isFinite(frac) ? frac * 100 : 0;
    out.push({
      index: i,
      date: s.date,
      reason: s.erasureReason!,
      forfeitIndexPts: pts,
      forfeitPctOfJuniorNav: pct,
      top: s.jtIndex + pts,
    });
  }
  return out;
}

function buildSeniorLossEvents(steps: BacktestStep[]): SeniorLossEvent[] {
  const out: SeniorLossEvent[] = [];
  let prevStIndex = 100;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.seniorMarkedDown) out.push({ index: i, date: s.date, lossIndexPts: prevStIndex - s.stIndex });
    prevStIndex = s.stIndex;
  }
  return out;
}

/** Rising edges only: a sustained breach across consecutive steps is ONE hit, not many. */
function countExitTriggerHits(steps: BacktestStep[], config: MarketConfig): number {
  let hits = 0;
  let prevBreached = false;
  for (const s of steps) {
    const breached = s.coverageUtilWad >= config.coverageLiquidationUtilizationWAD;
    if (breached && !prevBreached) hits++;
    prevBreached = breached;
  }
  return hits;
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
    observationPeriods: [],
    nonObservationPeriods: [],
    maxObservedObservationDays: 0,
    yearlyObservationDays: {},
    yearlyObservationTriggers: {},
    outsideObservationPct: 0,
    erasureEvents: [],
    seniorLossEvents: [],
    exitTriggerHits: 0,
  };
}
