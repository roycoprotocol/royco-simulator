import { reservesPerL, type EclpParams } from "@/lib/day/engine/eclp";

/**
 * The pool's balance point, set the way the deployment interface sets it.
 *
 * An E-CLP rests at a composition its own parameters imply, and the parameter
 * that moves it is beta — the top of the price band. Royco's deployment UI
 * treats that as the *maximum premium* the issuer is willing to see Senior
 * trade above NAV, and converts one to the other directly:
 *
 *     betaFromPremiumBp(bp) = 1 + bp / 10_000
 *     royco-rwa-frontend/lib/deploy-market/eclp/premium.ts
 *
 * and reads the resulting composition back off the curve:
 *
 *     stableShareAtPeg(alpha, beta, c, s, lambda) = y / (x + y) at price 1
 *     royco-rwa-frontend/lib/deploy-market/eclp/beta.ts
 *
 * So the balance point is not a separate knob there, and it is not one here: it
 * is what the maximum premium buys. A wider premium band means the pool has to
 * carry more Senior inventory at rest to hold that band open, and that
 * inventory comes out of the stablecoin depth an exiting holder sells into.
 *
 * Measured on the shipped shape (alpha 0.98, 45-degree rotation, lambda 250):
 *
 *        1 bp premium ->  1.33% Senior at rest
 *        3 bp         ->  3.88%   <- what all eleven listed markets declare
 *       10 bp         -> 11.79%
 *       30 bp         -> 27.43%
 *      100 bp         -> 45.62%
 */

/** The rotation every listed market and the deployment UI use: 45 degrees. */
export const DAY_V3_POOL_ROTATION = Math.SQRT1_2;

/**
 * The concentration every listed market declares, and the one the deployment
 * interface builds with. An issuer-set premium models the pool that would
 * actually be deployed, so it is built at the deployed concentration rather
 * than the simulator's own fallback of 1.
 */
export const DAY_V3_POOL_LAMBDA = 250;

export type DayV3PoolCurveInputs = {
  /** The pool's maximum discount, in percent. Sets alpha, the band's floor. */
  bandPct: number;
  /** The maximum premium the issuer will see Senior trade at, in bps. */
  premiumBps: number;
  /** Concentration. Higher is deeper at NAV and thinner at the edges. */
  lambda: number;
};

/**
 * Null rather than a throw for inputs the curve cannot be built from. A band at
 * or past 100% leaves no floor, and a premium at or below zero leaves no band
 * above the peg for the pool to hold any Senior in at all.
 */
export function dayV3PoolCurveFromPremium(
  inputs: DayV3PoolCurveInputs,
): EclpParams | null {
  const { bandPct, premiumBps, lambda } = inputs;
  if (
    !Number.isFinite(bandPct) ||
    !Number.isFinite(premiumBps) ||
    !Number.isFinite(lambda) ||
    bandPct <= 0 ||
    bandPct >= 100 ||
    premiumBps <= 0 ||
    lambda <= 0
  ) {
    return null;
  }
  const alpha = 1 - bandPct / 100;
  const beta = 1 + premiumBps / 10_000;
  if (!(alpha > 0) || !(beta > alpha)) return null;
  return {
    alpha,
    beta,
    c: DAY_V3_POOL_ROTATION,
    s: DAY_V3_POOL_ROTATION,
    lambda,
  };
}

/**
 * The Senior share of the pool's value at rest, 0..1, read off a curve.
 *
 * At the peg both legs are already NAV-denominated, so the share is `x/(x+y)`
 * — the same quantity `stableShareAtPeg` returns the complement of. Null when
 * the curve does not resolve to a composition, which is a real answer and must
 * not be shown as 0%.
 */
export function dayV3RestingSeniorWeight(
  params: EclpParams | null | undefined,
): number | null {
  if (!params) return null;
  const r = reservesPerL(params, 1);
  const total = r.x + r.y;
  if (!Number.isFinite(total) || total <= 0) return null;
  const weight = r.x / total;
  return Number.isFinite(weight) && weight > 0 && weight < 1 ? weight : null;
}

/**
 * The premium a curve encodes, in bps — the inverse of the conversion above.
 *
 * Lets the page report the balance point of a curve it did not build, which is
 * every listed market's declared curve and every canonical service response.
 */
export function dayV3PremiumBpsOf(
  params: EclpParams | null | undefined,
): number | null {
  if (!params || !Number.isFinite(params.beta)) return null;
  const bps = (params.beta - 1) * 10_000;
  return bps > 0 ? bps : null;
}
