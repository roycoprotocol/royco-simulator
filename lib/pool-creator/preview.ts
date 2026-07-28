// =============================================================================
// Pool creator — backtest preview
// -----------------------------------------------------------------------------
// Steps the user's strategy series through the accountant and shapes the result
// for charts and KPI tiles.
//
// The loop here is mechanical — walk the series, feed each period's return to
// `Sim.step`. Every number displayed is read straight off a `Snapshot`. No
// accounting formula is reimplemented; the one piece of arithmetic is
// annualising a price ratio for display, which is the same expression the
// locked simulator uses.
// =============================================================================

import { Sim } from "@/lib/day/engine/runner";
import { MarketState } from "@/lib/day/engine/types";
import type { DaySeriesPoint } from "@/lib/day-simulator-template/market";
import {
  buildPoolBalances,
  buildPoolConfig,
  type PoolBase,
  type PoolTerms,
} from "@/lib/pool-creator/config";

const DAY_MS = 86_400_000;
const SECONDS_PER_DAY = 86_400;

export type PreviewRow = {
  date: string;
  /** All four rebased to 100 at the opening date, so they are comparable. */
  strategy: number;
  senior: number;
  junior: number;
  liquidity: number;
  inRecoveryWindow: boolean;
};

export type RecoveryWindow = { startDate: string; endDate: string };

export type PreviewResult = {
  rows: PreviewRow[];
  seniorApy: number;
  juniorApy: number;
  liquidityApy: number;
  strategyApy: number;
  /** Deepest peak-to-trough fall of each line over the window. */
  strategyMaxDrawdown: number;
  seniorMaxDrawdown: number;
  recoveryWindows: RecoveryWindow[];
  /** Set when the accountant refused a step; the UI shows a warning instead of a chart. */
  error: string | null;
};

const daysBetween = (a: string, b: string): number =>
  Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS));

/** `(end/start)^(365/days) - 1` — the same annualisation the Day simulator uses. */
export function annualize(end: number, start: number, days: number): number {
  if (!(start > 0) || !(end > 0) || !(days > 0)) return NaN;
  return Math.pow(end / start, 365 / days) - 1;
}

function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

/** Deepest peak-to-trough fall in a raw price series, and when it bottomed. */
export function seriesDrawdown(series: DaySeriesPoint[]): { depth: number; date: string | null } {
  let peak = -Infinity;
  let depth = 0;
  let date: string | null = null;
  for (const point of series) {
    if (point.price > peak) peak = point.price;
    if (peak > 0) {
      const fall = point.price / peak - 1;
      if (fall < depth) {
        depth = fall;
        date = point.date;
      }
    }
  }
  return { depth, date };
}

export function seriesApy(series: DaySeriesPoint[]): number {
  if (series.length < 2) return NaN;
  const first = series[0];
  const last = series[series.length - 1];
  return annualize(last.price, first.price, daysBetween(first.date, last.date));
}

/**
 * Run the strategy series through a configured market.
 *
 * Junior is co-invested in the same strategy (`beta = 1` on every Day market),
 * so it takes the same period return as Senior — which is exactly what makes it
 * a first-loss buffer rather than an unrelated pot of money.
 */
export function runPreview(
  base: PoolBase,
  terms: PoolTerms,
  series: DaySeriesPoint[],
): PreviewResult {
  const empty: PreviewResult = {
    rows: [],
    seniorApy: NaN,
    juniorApy: NaN,
    liquidityApy: NaN,
    strategyApy: NaN,
    strategyMaxDrawdown: 0,
    seniorMaxDrawdown: 0,
    recoveryWindows: [],
    error: null,
  };

  if (series.length < 2) {
    return { ...empty, error: "A backtest needs at least two observations." };
  }

  let cfg;
  let initial;
  try {
    cfg = buildPoolConfig(base, terms);
    initial = buildPoolBalances(base, terms);
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }

  const sim = new Sim(cfg, initial);
  const opening = sim.last();
  const rows: PreviewRow[] = [
    {
      date: series[0].date,
      strategy: 100,
      senior: 100,
      junior: 100,
      liquidity: 100,
      inRecoveryWindow: false,
    },
  ];

  const basePrice = series[0].price;
  let error: string | null = null;

  for (let i = 1; i < series.length; i += 1) {
    const previous = series[i - 1];
    const current = series[i];
    const periodReturn = current.price / previous.price - 1;
    const dtSec = daysBetween(previous.date, current.date) * SECONDS_PER_DAY;

    try {
      sim.step({ dtSec, stReturn: periodReturn, jtReturn: periodReturn });
    } catch (e) {
      // Report what we have rather than losing the whole chart.
      error = (e as Error).message;
      break;
    }

    const snapshot = sim.last();
    rows.push({
      date: current.date,
      strategy: (current.price / basePrice) * 100,
      senior: (snapshot.stPrice / opening.stPrice) * 100,
      junior: (snapshot.jtPrice / opening.jtPrice) * 100,
      liquidity: (snapshot.ltPrice / opening.ltPrice) * 100,
      inRecoveryWindow: snapshot.state === MarketState.FIXED_TERM,
    });
  }

  // Collapse the per-row flag into date ranges for chart shading.
  const recoveryWindows: RecoveryWindow[] = [];
  let windowStart: string | null = null;
  for (const row of rows) {
    if (row.inRecoveryWindow && windowStart === null) windowStart = row.date;
    if (!row.inRecoveryWindow && windowStart !== null) {
      recoveryWindows.push({ startDate: windowStart, endDate: row.date });
      windowStart = null;
    }
  }
  if (windowStart !== null) {
    recoveryWindows.push({ startDate: windowStart, endDate: rows[rows.length - 1].date });
  }

  const last = rows[rows.length - 1];
  const spanDays = daysBetween(rows[0].date, last.date);

  return {
    rows,
    seniorApy: annualize(last.senior, 100, spanDays),
    juniorApy: annualize(last.junior, 100, spanDays),
    liquidityApy: annualize(last.liquidity, 100, spanDays),
    strategyApy: annualize(last.strategy, 100, spanDays),
    strategyMaxDrawdown: maxDrawdown(rows.map((r) => r.strategy)),
    seniorMaxDrawdown: maxDrawdown(rows.map((r) => r.senior)),
    recoveryWindows,
    error,
  };
}
