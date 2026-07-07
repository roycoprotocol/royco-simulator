// =============================================================================
// Yield Distribution Models
// -----------------------------------------------------------------------------
// Both the risk premium (ST->JT) and the Royco Day liquidity premium (ST->LT)
// are produced by a YDM: a piecewise curve in utilization that returns a share
// of senior yield. Static = fixed curve through three anchors. Adaptive =
// V2 semantics: the kink share Y_T translates the curve vertically over time,
// with the discount (Y_T - y0) and premium (y100 - Y_T) spreads fixed at init.
//
// Maps to: src/ydm/StaticCurveYDM.sol and src/ydm/AdaptiveCurveYDM_V2.sol
// =============================================================================

import type { YDMConfig } from "./types";

export const YEAR_SEC = 365 * 24 * 60 * 60;

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

// Evaluate the share of senior yield for a given utilization, given the *live*
// kink value yTarget (which may have drifted for adaptive curves) and the fixed
// discount/premium spreads derived from the config's anchors.
export function ydmShare(
  cfg: YDMConfig,
  yTarget: number,
  utilization: number,
  targetUtil: number,
): number {
  const FD = cfg.yTarget - cfg.y0; // fixed discount below the kink
  const FP = cfg.y100 - cfg.yTarget; // fixed premium above the kink
  // Cap utilization at 100% before evaluating the curve, exactly as the Solidity
  // does (StaticCurveYDM / AdaptiveCurveYDM: `if (utilizationWAD > WAD) = WAD`).
  // Above the kink the curve must terminate at y100; without this cap the
  // above-kink leg extrapolates past the endpoint (e.g. U=1.5 -> y far above y100,
  // saved only by the final clamp), mis-distributing yield in the distress regime.
  const u = utilization > 1 ? 1 : utilization;
  let delta: number;
  if (u >= targetUtil) {
    delta = (u - targetUtil) / (1 - targetUtil); // in [0, 1]
  } else {
    delta = (u - targetUtil) / targetUtil; // in [-1, 0)
  }
  if (delta < -1) delta = -1; // floor at U=0
  const spread = delta < 0 ? FD : FP;
  const y = yTarget + delta * spread;
  return clamp(y, 0, 1);
}

// Drift the kink value Y_T toward wherever utilization is pushing it. Exp-based
// so Y_T stays strictly positive; clamped to the configured bounds. No-op for
// static curves. Mirrors AdaptiveCurveYDM: Y_T *= exp(speed * normDelta * dt).
export function adaptYTarget(
  cfg: YDMConfig,
  yTarget: number,
  utilization: number,
  dtSec: number,
  targetUtil: number,
): number {
  if (cfg.mode !== "adaptive" || dtSec <= 0) return yTarget;
  // Same U<=100% cap as ydmShare so drift and curve output share one effective
  // utilization (the contract derives both from a single WAD-capped value).
  const u = utilization > 1 ? 1 : utilization;
  let delta: number;
  if (u >= targetUtil) delta = (u - targetUtil) / (1 - targetUtil);
  else delta = (u - targetUtil) / targetUtil;
  delta = clamp(delta, -1, 1);
  const speed = (cfg.maxAdaptSpeedPerYear ?? 1.0) / YEAR_SEC;
  const next = yTarget * Math.exp(speed * delta * dtSec);
  return clamp(next, cfg.minYTarget ?? 1e-4, cfg.maxYTarget ?? 1.0);
}
