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
 * Concentration, and the range the deployment interface accepts.
 *
 *     LAMBDA_RANGE   = { min: 100, max: 1000 }
 *     DEFAULT_LAMBDA = 300
 *     royco-rwa-frontend/lib/deploy-market/pool-controls.ts
 *
 * The default is only reached for a market that declares no curve of its own;
 * a listed market's declared lambda is more faithful to that market than any
 * constant, so it wins when present.
 */
export const DAY_V3_POOL_LAMBDA = 300;
export const DAY_V3_POOL_LAMBDA_RANGE = { min: 100, max: 1000 } as const;

/**
 * The premium range the deployment interface accepts, in bps.
 *
 *     PREMIUM_BP = { min: 0, max: 50 }
 *     royco-rwa-frontend/lib/deploy-market/pool-controls.ts
 *
 * A simulator that lets an issuer model a premium the deploy step would reject
 * is not modelling their market. Measured, 50 bps rests at 36.3% Senior at
 * lambda 250 and 38.7% at 300 — already far past the 3.9% every listed market
 * ships.
 */
export const DAY_V3_POOL_PREMIUM_BPS_RANGE = { min: 0, max: 50 } as const;

/**
 * The resting composition deployment derives its default premium for: 90%
 * quote asset, 10% Senior.
 *
 *     tilt: "0.90"
 *     royco-rwa-frontend/app/(main)/deploy-market/_components/steps/step-6-pool.tsx
 *
 * This is where the "90/10" comes from. It is not a hardcoded pool split — it
 * is the split the *default* premium is solved for, and the issuer moves it by
 * moving the premium. The simulator's own fallback curve is solved for the same
 * 10% Senior, so the two agree on the default and differed only in never
 * exposing the control.
 */
export const DAY_V3_POOL_DEFAULT_SENIOR_WEIGHT = 0.1;

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
/**
 * The premium that rests a curve on a given Senior share — the inverse of the
 * construction above, and the simulator's equivalent of deployment's
 * `solveBeta({ alpha, c, s, lambda, tilt })`.
 *
 * Bisection rather than the closed form: the sim already inverts this way in
 * `eclpParamsForWeight`, the search is over a monotone function, and 80 halvings
 * of a 0-to-500 bp interval resolve far finer than the two decimals of a bp the
 * deploy step stores.
 *
 * Null when no premium in range produces the requested weight, which is a real
 * answer — a very tight band cannot rest on much Senior at any premium.
 */
export function dayV3PremiumForRestingWeight(inputs: {
  bandPct: number;
  lambda: number;
  seniorWeight: number;
}): number | null {
  const { bandPct, lambda, seniorWeight } = inputs;
  if (!(seniorWeight > 0) || !(seniorWeight < 1)) return null;
  let lo = 1e-6;
  let hi = 500;
  const weightAt = (bps: number) =>
    dayV3RestingSeniorWeight(dayV3PoolCurveFromPremium({ bandPct, premiumBps: bps, lambda }));
  const loW = weightAt(lo);
  const hiW = weightAt(hi);
  if (loW === null || hiW === null) return null;
  if (seniorWeight < loW || seniorWeight > hiW) return null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const w = weightAt(mid);
    if (w === null) {
      hi = mid;
      continue;
    }
    if (w > seniorWeight) hi = mid;
    else lo = mid;
  }
  const answer = (lo + hi) / 2;
  return Number.isFinite(answer) && answer > 0 ? answer : null;
}

export function dayV3PremiumBpsOf(
  params: EclpParams | null | undefined,
): number | null {
  if (!params || !Number.isFinite(params.beta)) return null;
  const bps = (params.beta - 1) * 10_000;
  return bps > 0 ? bps : null;
}
