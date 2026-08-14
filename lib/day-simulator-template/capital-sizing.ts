import {
  coverageUtilizationWad,
  liquidityUtilizationWad,
  newMarket,
} from '@/lib/day/engine/engine';
import type { MarketConfig } from '@/lib/day/engine/types';
import { WAD, toWad } from '@/lib/day/engine/wad';
import type { DaySimulatorDefaults } from '@/lib/day-simulator-template/market';

/**
 * How much capital each leg needs to hold a given utilization.
 *
 * `buildDayInitialBalances` delegates here at the 0.90 target, and the target
 * is not the whole answer an issuer wants. The requirement is only
 * literally met at 100% utilization: that is the floor, the least capital that
 * satisfies the term at all. The target is where the market is designed to sit,
 * with headroom above the floor. Showing one without the other makes the target
 * look like a minimum, which it is not.
 *
 * **The formula is not restated here.** Utilization is defined by
 * `coverageUtilizationWad` and `liquidityUtilizationWad` in the engine, and this
 * module inverts those functions numerically rather than re-deriving their
 * algebra. Re-deriving is how the two drift apart, and AGENTS.md rule 1 exists
 * for exactly this. `capital-sizing.test.ts` pins the shared target-sizing
 * contract across every market and a range of settings, then exercises the
 * resulting balances through the accountant.
 */

/** Bisect for the capital that drives `utilizationOf` down to `target`.
 *  Utilization falls monotonically as capital rises, which is what makes a
 *  bisection valid here: more capital standing behind the same requirement is
 *  always less utilized. */
function solveCapital(
  utilizationOf: (capital: number) => number,
  target: number,
  upperHint: number,
): number {
  if (!(target > 0) || upperHint <= 0) return 0;
  // Grow the bracket until the upper bound is genuinely under-utilized. A fixed
  // multiple would silently return the bound itself on an extreme setting.
  let high = upperHint;
  for (let i = 0; i < 80 && utilizationOf(high) > target; i += 1) high *= 2;
  let low = 0;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (mid === low || mid === high) break;
    if (utilizationOf(mid) > target) low = mid;
    else high = mid;
  }
  return high;
}

/**
 * How much of a funded exit pool sits in Senior shares rather than in the exit
 * asset, read off the engine instead of restated.
 *
 * The pool is not a pile of stablecoin. `newMarket` derives the Senior/exit-
 * asset mix from the configured E-CLP at the 1.0 mark. That matters the moment
 * anything on the page says "this much is in the strategy": counting the whole
 * pool in overstates it, and counting none of it understates it.
 *
 * This asks the engine to build a market and measures the split it actually
 * produced, so a curve update cannot leave the capital table behind.
 */
export function dayPoolSeniorWeight(cfg: MarketConfig): number {
  // Seed the probe through the same exact utilization inversion used by the
  // real market. A fixed 1/1/1 probe is invalid whenever a legitimate coverage
  // requirement exceeds 50%, so merely asking for the pool's fixed composition
  // could previously take V3 down before its actual target balances were used.
  const probeBalances = dayCapitalAtUtilization(
    {
      initialST: 1,
      initialJT: 1,
      linkJuniorToFirstLoss: true,
    },
    { coverage: cfg.coverage, minLiquidity: cfg.minLiquidity },
    Math.min(cfg.targetUtilization, cfg.liqTargetUtilization),
  );
  const probe = newMarket(cfg, probeBalances);
  const stShares = Number(probe.pool.stShares);
  const stable = Number(probe.pool.stable);
  const total = stShares + stable;
  return total > 0 ? stShares / total : 0;
}

/**
 * The capital actually deployed into the yield source.
 *
 * Senior and Junior are the tranched raise and sit in the asset. The exit pool
 * is venue capital, and only its Senior-share leg is in the source at all: its
 * exit-asset leg earns that asset's own yield plus swap fees
 * (`accruePoolCarry`), not the source's.
 */
export function dayCapitalInYieldSource(
  balances: { st: number; jt: number; lt: number },
  poolSeniorWeight: number,
): number {
  return balances.st + balances.jt + balances.lt * poolSeniorWeight;
}

export type DayCapitalSizing = { st: number; jt: number; lt: number };

/**
 * The stack sized so both utilizations land on `utilization`.
 *
 * At 0.90 this is the path used by `buildDayInitialBalances`. At 1.0 it is the
 * floor: the least Junior and pool capital that satisfies the two requirements.
 */
export function dayCapitalAtUtilization(
  defaults: Pick<
    DaySimulatorDefaults,
    "initialST" | "initialJT" | "linkJuniorToFirstLoss"
  >,
  terms: { coverage: number; minLiquidity: number },
  utilization: number,
): DayCapitalSizing {
  const st = defaults.initialST;
  const coverageWad = toWad(terms.coverage);
  const stRaw = toWad(st);

  // Current Day accounting uses one collateral NAV, so the exposure the engine
  // measures is `st + jt`. The compatibility argument remains 1 for older
  // callers, but the current engine ignores it.
  const jt =
    terms.coverage > 0
      ? solveCapital(
          (capital) => {
            const jtRaw = toWad(capital);
            const util = coverageUtilizationWad(stRaw, jtRaw, 1, coverageWad, jtRaw);
            return Number(util) / Number(WAD);
          },
          utilization,
          st,
        )
      : 0;

  const lt =
    terms.minLiquidity > 0
      ? solveCapital(
          (capital) => {
            const util = liquidityUtilizationWad(
              stRaw,
              toWad(terms.minLiquidity),
              toWad(capital),
            );
            return Number(util) / Number(WAD);
          },
          utilization,
          st,
        )
      : 0;

  // A market that does not link Junior to the first-loss requirement ships its
  // own Junior size, and no utilization target changes that.
  return {
    st,
    jt: defaults.linkJuniorToFirstLoss ? jt : defaults.initialJT,
    lt,
  };
}
