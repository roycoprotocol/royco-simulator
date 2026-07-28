// =============================================================================
// Pool creator — synthesized strategy paths
// -----------------------------------------------------------------------------
// For the "I don't have a track record yet" path. The user gives an expected
// APY and a risk shape; we build a NAV series with that drift and a plausible
// wobble so the backtest, the cushion diagram and the stress check all have
// something real to chew on.
//
// The series is a *modeling input*, not evidence, and the UI must label it that
// way. Generation is deterministic (seeded PRNG, no Math.random) so the chart
// does not twitch between renders and a shared link reproduces exactly.
// =============================================================================

import type { DaySeriesPoint } from "@/lib/day-simulator-template/market";
import type { RiskProfile } from "@/lib/pool-creator/draft";

/** mulberry32 — small, fast, well-distributed, and reproducible. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, so the wobble is normal rather than uniform. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type ProfileShape = {
  /** Annualized volatility of the daily wobble. */
  vol: number;
  /** Expected number of discrete drawdown events per year. */
  shocksPerYear: number;
  /** Depth of a shock, as a fraction of NAV. */
  shockDepth: number;
  /** Days taken to grind back after a shock. */
  recoveryDays: number;
};

const SHAPES: Record<RiskProfile, ProfileShape> = {
  steady: { vol: 0.002, shocksPerYear: 0, shockDepth: 0, recoveryDays: 0 },
  mild: { vol: 0.012, shocksPerYear: 0, shockDepth: 0, recoveryDays: 0 },
  choppy: { vol: 0.045, shocksPerYear: 2, shockDepth: 0.025, recoveryDays: 45 },
  credit: { vol: 0.01, shocksPerYear: 0.6, shockDepth: 0.09, recoveryDays: 120 },
};

const DAY_MS = 86_400_000;

export type SyntheticOptions = {
  expectedApy: number;
  risk: RiskProfile;
  /** Last day of the synthesized window, `YYYY-MM-DD`. */
  anchorDate: string;
  days?: number;
  seed?: number;
};

/**
 * Build a daily NAV path ending at `anchorDate`.
 *
 * The path is rescaled at the end so its realised annualized return equals
 * `expectedApy` exactly — the wobble changes the shape of the line, never the
 * headline number the user typed. That matters because `sourceApy` is read
 * back off this series, and it would be confusing for it to disagree with the
 * input by a few basis points.
 */
export function buildSyntheticSeries(options: SyntheticOptions): DaySeriesPoint[] {
  const { expectedApy, risk, anchorDate } = options;
  const days = Math.max(60, Math.round(options.days ?? 365));
  const shape = SHAPES[risk];
  const rand = seededRandom(options.seed ?? 0x5eed);

  const anchorTime = Date.parse(`${anchorDate}T00:00:00Z`);
  if (!Number.isFinite(anchorTime)) {
    throw new Error(`Invalid synthetic anchor date: ${anchorDate}`);
  }
  const startTime = anchorTime - days * DAY_MS;

  // Where the discrete shocks land. Kept away from the very ends so the chart
  // opens calm and the drawdown is legible rather than clipped.
  const shockCount = Math.round((shape.shocksPerYear * days) / 365);
  const shockDays = new Set<number>();
  for (let i = 0; i < shockCount; i += 1) {
    shockDays.add(Math.floor(0.15 * days + rand() * 0.7 * days));
  }

  const dailyVol = shape.vol / Math.sqrt(365);
  const points: DaySeriesPoint[] = [];
  let price = 1;
  /** NAV still to be clawed back from shocks, ground off a bit each day. */
  let outstandingShock = 0;

  for (let day = 0; day <= days; day += 1) {
    if (day > 0) {
      price *= 1 + gaussian(rand) * dailyVol;

      if (shockDays.has(day)) {
        const depth = shape.shockDepth * (0.6 + rand() * 0.8);
        price *= 1 - depth;
        outstandingShock += depth;
      } else if (outstandingShock > 1e-9 && shape.recoveryDays > 0) {
        const step = Math.min(outstandingShock, shape.shockDepth / shape.recoveryDays);
        price *= 1 + step;
        outstandingShock -= step;
      }
    }
    points.push({
      date: new Date(startTime + day * DAY_MS).toISOString().slice(0, 10),
      price,
    });
  }

  // Retarget the drift so the realised APY is exactly what was asked for,
  // preserving the shape of the residual.
  const realisedGrowth = points[points.length - 1].price / points[0].price;
  const targetGrowth = Math.pow(1 + expectedApy, days / 365);
  const correction = Math.pow(targetGrowth / realisedGrowth, 1 / days);
  return points.map((point, index) => ({
    date: point.date,
    price: point.price * Math.pow(correction, index),
  }));
}

/** Today in UTC, `YYYY-MM-DD`. The default anchor for a synthesized path. */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);
