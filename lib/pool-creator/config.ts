// =============================================================================
// Pool creator — config assembly
// -----------------------------------------------------------------------------
// Turns a draft into the objects the accountant understands.
//
// Why this exists rather than reusing `buildDayMarketConfig`: that builder is
// SHA-locked and hardcodes `fixedTermDurationSec = observationDays * 86400`
// and static-shaped YDM anchors. Production markets need neither — the live
// snUSD market runs an adaptive curve with `fixedTermDurationSeconds = 0`
// (perpetual, no recovery window) and non-zero protocol fees. So we assemble
// `MarketConfig` through the same public entry point the locked builder uses,
// `defaultConfig()` from `lib/day/engine/runner`, just over a wider surface.
//
// NO ACCOUNTING MATH LIVES HERE. Every number is either a passthrough, a unit
// conversion, or delegated to the engine. Initial balances come from the locked
// `buildDayInitialBalances` so the coverage/liquidity sizing ratios have exactly
// one definition in the repo.
// =============================================================================

import { Sim, defaultConfig, steadyYear } from "@/lib/day/engine/runner";
import type { MarketConfig, YDMConfig } from "@/lib/day/engine/types";
import {
  buildDayInitialBalances,
  DAY_TARGET_UTILIZATION,
} from "@/lib/day-simulator-template/runtime";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

const SECONDS_PER_DAY = 86_400;

/**
 * Production reference values, read from `roycoprotocol/royco-day`
 * `script/config/MarketDeploymentConfig.sol` (the live snUSD market) rather
 * than from this repo's 12 simulator markets, which all run static curves and
 * zero fees. Anything a protocol does not choose defaults to these.
 */
export const PRODUCTION_DEFAULTS = {
  ydmMode: "adaptive" as const,
  /** snUSD: yTarget 0.11 → y100 0.31. The upward spread above the kink. */
  ydmSpread: 0.2,
  stProtocolFee: 0.1,
  jtProtocolFee: 0,
  jtYieldShareProtocolFee: 0.45,
  ltYieldShareProtocolFee: 0,
  selfLiquidationBonus: 0.005,
  /** Off-chain modeling inputs only — not deployed contract terms. */
  stableYield: 0.035,
  swapFeeBps: 10,
  poolTurnoverPerYear: 8,
  eclpBandWidth: 0.1,
  reinvestLiquidityPremium: true,
  maintainCoverage: true,
} as const;

/** Everything about a pool except the five knobs the solver moves. */
export type PoolBase = {
  sourceApy: number;
  exitBufferPct: number;
  initialSeniorSize: number;
  ydmMode: "static" | "adaptive";
  ydmSpread: number;
  selfLiquidationBonus: number;
  maintainCoverage: boolean;
  stProtocolFee: number;
  jtProtocolFee: number;
  jtYieldShareProtocolFee: number;
  ltYieldShareProtocolFee: number;
  stableYield: number;
  swapFeeBps: number;
  poolTurnoverPerYear: number;
  eclpBandWidth: number;
  reinvestLiquidityPremium: boolean;
};

/** The five solved knobs. */
export type PoolTerms = {
  coverage: number;
  minLiquidity: number;
  /** `0` → perpetual market, `fixedTermDurationSec = 0`. */
  recoveryDays: number;
  riskYieldShare: number;
  liquidityYieldShare: number;
};

export function createPoolBase(over: Partial<PoolBase> = {}): PoolBase {
  return {
    sourceApy: 0.09,
    exitBufferPct: 1,
    initialSeniorSize: 1_000_000,
    ...PRODUCTION_DEFAULTS,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// YDM anchor shaping
// ---------------------------------------------------------------------------

/**
 * The combined premium share is held strictly below 100%, not merely at or
 * under it.
 *
 * `defaultConfig()` rejects `maxJTYieldShare + maxLTYieldShare > 1`, but the
 * accountant applies a second, tighter test at runtime: `reconcile()` throws
 * `PREMIUMS_EXCEED_SENIOR_YIELD` when the *time-weighted* shares sum above
 * WAD (`lib/day/engine/engine.ts:423`). Those are accumulator quotients
 * (`twRiskShareSeconds / elapsedSincePremium`), so their rounding can land a
 * hair above the static anchor caps. A grid scan over the (risk, liquidity)
 * plane throws on the exact `r + l = 1.0` diagonal even though the configured
 * caps sum to precisely 1.000000.
 *
 * 0.95 keeps a comfortable margin and constrains nothing real: production
 * snUSD prices its risk premium at 0.11, and the widest combined share across
 * the 12 markets in this repo is about 0.23.
 */
export const MAX_TOTAL_YIELD_SHARE = 0.95;

/**
 * The solver produces one number per curve — the yield share at the 90% kink.
 * A `YDMConfig` needs three anchors. Production shapes them as
 * `y0 = yTarget` with `y100 = yTarget + spread` (snUSD: 0.11 / 0.11 / 0.31).
 *
 * `y100` is the largest anchor on both curves, so holding the sum there holds
 * it everywhere. When the two spreads would breach the ceiling we shrink them
 * proportionally rather than clipping one curve arbitrarily.
 */
export function shapeYdmAnchors(
  riskShare: number,
  liquidityShare: number,
  mode: "static" | "adaptive",
  spread: number,
): { riskYDM: YDMConfig; liqYDM: YDMConfig } {
  const headroom = Math.max(0, MAX_TOTAL_YIELD_SHARE - riskShare - liquidityShare);
  const wanted = spread * 2;
  const scale = wanted > headroom ? headroom / wanted : 1;
  const riskSpread = spread * scale;
  const liqSpread = spread * scale;

  const curve = (yTarget: number, up: number): YDMConfig => ({
    mode,
    y0: yTarget,
    yTarget,
    y100: Math.min(1, yTarget + up),
  });

  return {
    riskYDM: curve(riskShare, riskSpread),
    liqYDM: curve(liquidityShare, liqSpread),
  };
}

// ---------------------------------------------------------------------------
// Config + balances
// ---------------------------------------------------------------------------

export function buildPoolConfig(base: PoolBase, terms: PoolTerms): MarketConfig {
  const { riskYDM, liqYDM } = shapeYdmAnchors(
    terms.riskYieldShare,
    terms.liquidityYieldShare,
    base.ydmMode,
    base.ydmSpread,
  );

  return defaultConfig({
    coverage: terms.coverage,
    // Junior is co-invested in the same strategy on every Day market.
    beta: 1,
    targetUtilization: DAY_TARGET_UTILIZATION,
    liqTargetUtilization: DAY_TARGET_UTILIZATION,
    minLiquidity: terms.minLiquidity,
    riskYDM,
    liqYDM,
    // 0 days => permanently perpetual, matching production snUSD.
    fixedTermDurationSec: Math.max(0, Math.round(terms.recoveryDays)) * SECONDS_PER_DAY,
    liquidationUtilization: 100 / Math.max(base.exitBufferPct, 0.01),
    stSelfLiquidationBonus: base.selfLiquidationBonus,
    stProtocolFee: base.stProtocolFee,
    jtProtocolFee: base.jtProtocolFee,
    yieldShareProtocolFee: base.jtYieldShareProtocolFee,
    ltYieldShareProtocolFee: base.ltYieldShareProtocolFee,
    stableYield: base.stableYield,
    swapFeeBps: base.swapFeeBps,
    poolTurnoverPerYear: base.poolTurnoverPerYear,
    eclpBandWidth: base.eclpBandWidth,
    reinvestLiquidityPremium: base.reinvestLiquidityPremium,
  });
}

/**
 * Shape a `DaySimulatorDefaults` so we can hand it to the locked helpers.
 * `observationDays` may be 0 here (perpetual); manifest export clamps it into
 * the [7, 194] range the certification path requires and flags the change.
 */
export function toDayDefaults(base: PoolBase, terms: PoolTerms): DaySimulatorDefaults {
  const { riskYDM, liqYDM } = shapeYdmAnchors(
    terms.riskYieldShare,
    terms.liquidityYieldShare,
    base.ydmMode,
    base.ydmSpread,
  );
  return {
    sourceApy: base.sourceApy,
    coverage: terms.coverage,
    minLiquidity: terms.minLiquidity,
    liquidationUtilization: 100 / Math.max(base.exitBufferPct, 0.01),
    observationDays: terms.recoveryDays,
    exitBufferPct: base.exitBufferPct,
    linkJuniorToFirstLoss: true,
    maintainCoverage: base.maintainCoverage,
    riskYDM,
    liqYDM,
    selfLiquidationBonus: base.selfLiquidationBonus,
    stProtocolFee: base.stProtocolFee,
    jtProtocolFee: base.jtProtocolFee,
    jtYieldShareProtocolFee: base.jtYieldShareProtocolFee,
    ltYieldShareProtocolFee: base.ltYieldShareProtocolFee,
    stableYield: base.stableYield,
    swapFeeBps: base.swapFeeBps,
    poolTurnoverPerYear: base.poolTurnoverPerYear,
    eclpBandWidth: base.eclpBandWidth,
    reinvestLiquidityPremium: base.reinvestLiquidityPremium,
    initialST: base.initialSeniorSize,
    // Both are recomputed by `buildDayInitialBalances` from coverage/minLiquidity;
    // they are carried here only so the shape is a valid DaySimulatorDefaults.
    initialJT: 0,
    initialLT: 0,
  };
}

/**
 * Opening balances. Delegates to the locked `buildDayInitialBalances` so the
 * `cov/(0.9-cov)` and `minLiq/0.9` sizing ratios keep exactly one definition —
 * the same one `scripts/day-simulator/verify.mjs` asserts against.
 */
export function buildPoolBalances(
  base: PoolBase,
  terms: PoolTerms,
): { st: number; jt: number; lt: number } {
  return buildDayInitialBalances(toDayDefaults(base, terms), terms);
}

// ---------------------------------------------------------------------------
// Steady-state scenario
// ---------------------------------------------------------------------------

export type ScenarioResult = {
  seniorApy: number;
  juniorApy: number;
  liquidityApy: number;
};

/**
 * One steady year through the accountant, returning realised APY per tranche.
 *
 * This mirrors `runDayTargetScenario` in the locked runtime exactly — same
 * `Sim`, same `steadyYear`, same opening/closing price ratio — and differs only
 * in using `buildPoolConfig`, so adaptive curves and perpetual markets are
 * expressible. It is the objective function every solver bisection minimises.
 */
export function runPoolScenario(base: PoolBase, terms: PoolTerms): ScenarioResult {
  const cfg = buildPoolConfig(base, terms);
  const initial = buildPoolBalances(base, terms);
  const sim = new Sim(cfg, initial);
  const opening = sim.last();
  for (const step of steadyYear(base.sourceApy, 1, cfg.stableYield)) {
    sim.step(step);
  }
  const final = sim.last();
  return {
    seniorApy: final.stPrice / opening.stPrice - 1,
    juniorApy: final.jtPrice / opening.jtPrice - 1,
    liquidityApy: final.ltPrice / opening.ltPrice - 1,
  };
}
