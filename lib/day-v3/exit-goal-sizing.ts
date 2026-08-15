import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
} from "@/lib/day-simulator-template/runtime";
import type { EclpParams } from "@/lib/day/engine/eclp";
import { Sim } from "@/lib/day/engine/runner";

/**
 * How much Minimum Liquidity the issuer's exit goal actually costs.
 *
 * The exit amount is asked as a goal — "out of every $100 Senior, how much
 * should be sellable right away?" — and the field says outright that it "sets
 * the SLP capital". It did not. `liquidityPct` was the market's own declared
 * `minLiquidity`, a constant, so an issuer could move the goal from $5 to $50
 * and watch the SLP sit at $11.1 while the exit model quietly reported the pool
 * could absorb $10.1 of the $50 they asked for. The goal was stated, priced
 * against a pool that ignored it, and reported as unmet.
 *
 * The canonical pool-design service answers this at deployment and its answer
 * still wins whenever it has resolved. This is the local answer for when it has
 * not, which on this page is most of the time.
 *
 * The inversion is numeric because the forward direction is: a Minimum
 * Liquidity implies pool capital, which implies a curve depth, which implies
 * how much one trade can take before the payout falls through the floor. That
 * composition has no closed form here, but it is monotone — more pool, more
 * sellable — so bisection is exact to whatever resolution it is given.
 * Measured on susdai at a 5% band, it is very nearly linear: 10% Minimum
 * Liquidity sells 10.27 per 100 Senior, 35% sells 35.94, 80% sells 82.16.
 */

export type DayV3ExitGoalSizingStatus =
  | "recommended"
  | "infeasible"
  | "invalid-input";

export interface DayV3ExitGoalSizing {
  status: DayV3ExitGoalSizingStatus;
  /** The Minimum Liquidity the goal needs, in percent. Null when unresolved. */
  minimumLiquidityPct: number | null;
  /** What one trade can actually sell at that liquidity, per 100 Senior. */
  sellablePer100: number | null;
  reason: string;
}

export type DayV3ExitGoalInputs = {
  defaults: DaySimulatorDefaults;
  coveragePct: number;
  bandPct: number;
  /** The goal: how much of every 100 Senior must be sellable in one trade. */
  exitSharePct: number;
  /** The least a seller may receive for 100 Senior sold at once. */
  minimumProceedsPer100: number;
  /** The curve in force, when one is. */
  eclpParams?: EclpParams;
  swapFeeBps?: number;
  /** Ceiling on the search. Above this the pool is larger than the raise. */
  maximumLiquidityPct?: number;
};

const failed = (
  status: Exclude<DayV3ExitGoalSizingStatus, "recommended">,
  reason: string,
): DayV3ExitGoalSizing => ({
  status,
  minimumLiquidityPct: null,
  sellablePer100: null,
  reason,
});

/**
 * The largest single sale, per 100 Senior, that still pays at least the floor.
 *
 * Two ways a sale fails: the pool cannot absorb it at all (`unfilledNAV`), or it
 * absorbs it at a price below the floor. Both are disqualifying, and both are
 * monotone in sale size, so one bisection finds the boundary.
 */
function sellableAtLiquidity(
  inputs: DayV3ExitGoalInputs,
  minLiquidity: number,
): number | null {
  const terms = {
    coverage: inputs.coveragePct / 100,
    minLiquidity,
    eclpBandWidth: inputs.bandPct / 100,
    observationDays: inputs.defaults.observationDays,
    riskYieldShare: inputs.defaults.riskYDM.yTarget,
    liquidityYieldShare: inputs.defaults.liqYDM.yTarget,
  };
  try {
    const cfg = {
      ...buildDayMarketConfig(inputs.defaults, terms),
      ...(inputs.eclpParams ? { eclpParams: inputs.eclpParams } : {}),
      ...(inputs.swapFeeBps === undefined ? {} : { swapFeeBps: inputs.swapFeeBps }),
    };
    const balances = buildDayInitialBalances(inputs.defaults, terms);
    const sim = new Sim(cfg, balances);
    const openingSeniorNAV = sim.last().stEffectiveNAV;
    if (!(openingSeniorNAV > 0)) return null;
    let lo = 0;
    let hi = 100;
    // 34 halvings of a 0-100 interval resolve to 6e-9 per 100 Senior, which is
    // nine orders of magnitude finer than the page displays. 60 was three times
    // the work for no visible difference, and this runs inside another
    // bisection.
    for (let i = 0; i < 34; i += 1) {
      const mid = (lo + hi) / 2;
      const quote = sim.previewSecondarySell((openingSeniorNAV * mid) / 100);
      const paidPer100 =
        quote.filledNAV > 0 ? (quote.stableOutNAV / quote.filledNAV) * 100 : 0;
      if (quote.unfilledNAV > 1e-9 || paidPer100 < inputs.minimumProceedsPer100) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return lo;
  } catch {
    return null;
  }
}

/**
 * The Minimum Liquidity that makes the goal exactly reachable.
 *
 * `infeasible` rather than a clamped number when even the ceiling cannot do it:
 * a goal the pool cannot meet at any size is a real answer about the design, and
 * showing the ceiling as though it met the goal would be the same failure this
 * function exists to correct.
 */
export function dayV3MinimumLiquidityForExitGoal(
  inputs: DayV3ExitGoalInputs,
): DayV3ExitGoalSizing {
  const { exitSharePct, minimumProceedsPer100 } = inputs;
  if (
    !Number.isFinite(exitSharePct) ||
    exitSharePct <= 0 ||
    exitSharePct > 100 ||
    !Number.isFinite(minimumProceedsPer100) ||
    minimumProceedsPer100 <= 0
  ) {
    return failed("invalid-input", "The exit goal and payout floor must be positive.");
  }
  const ceiling = Math.min(95, inputs.maximumLiquidityPct ?? 90);
  const best = sellableAtLiquidity(inputs, ceiling / 100);
  if (best === null) {
    return failed(
      "infeasible",
      "No pool can be built at these terms, so the exit goal cannot be sized.",
    );
  }
  if (best < exitSharePct) {
    return failed(
      "infeasible",
      `Even a ${ceiling.toFixed(0)}% Minimum Liquidity only makes ${best.toFixed(1)} of every 100 Senior sellable at this payout floor.`,
    );
  }

  let lo = 0.0001;
  let hi = ceiling / 100;
  // 28 halvings resolve Minimum Liquidity to 3e-7 percent. The whole search is
  // ~950 quotes; at 48 it was ~2900 and cost 70-100ms, which is a visible stall
  // on a slider drag.
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    const sellable = sellableAtLiquidity(inputs, mid);
    if (sellable === null || sellable < exitSharePct) lo = mid;
    else hi = mid;
  }
  const minimumLiquidityPct = hi * 100;
  const sellablePer100 = sellableAtLiquidity(inputs, hi);
  return {
    status: "recommended",
    minimumLiquidityPct,
    sellablePer100,
    reason: `A ${minimumLiquidityPct.toFixed(2)}% Minimum Liquidity makes ${exitSharePct.toFixed(1)} of every 100 Senior sellable in one trade at a ${minimumProceedsPer100.toFixed(2)} floor.`,
  };
}
