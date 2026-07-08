/**
 * engine.ts — Standalone BigInt/WAD-precise port of the Royco Day 2-tranche accountant.
 *
 * Pure TypeScript, ZERO external dependencies. All values are BigInt in WAD precision
 * (1 unit == 10n**18n). This reproduces the arithmetic of:
 *   - src/accountant/RoycoDayAccountant.sol (_previewSyncTrancheAccounting, postOp deposit path)
 *   - src/libraries/UtilsLib.sol (computeCoverageUtilization, computeSTandJTClaimsOnNAV)
 *   - src/ydm/StaticCurveYDM.sol (_yieldShare piecewise curve)
 *   - src/libraries/Units.sol (typed math helpers)
 *
 * Rounding is matched per-operation to Solidity: Floor == trunc toward zero for the
 * non-negative operands used here; Ceil is implemented explicitly. mulDiv replicates
 * OpenZeppelin's full-precision Math.mulDiv (exact, no intermediate overflow concerns
 * since BigInt is arbitrary precision).
 */

export const WAD = 10n ** 18n;
export const ZERO = 0n;
export const UINT256_MAX = 2n ** 256n - 1n;

// ============================================================================
// Rounding-aware mulDiv (OpenZeppelin Math.mulDiv equivalent)
// ============================================================================

export enum Rounding {
  Floor = 0, // toward zero (== negative infinity for non-negatives)
  Ceil = 1, // toward positive infinity
}

/** (a * b) / c with explicit rounding. Operands are non-negative. */
export function mulDiv(a: bigint, b: bigint, c: bigint, rounding: Rounding = Rounding.Floor): bigint {
  if (c === 0n) throw new Error("mulDiv: division by zero");
  const prod = a * b;
  const q = prod / c; // BigInt division truncates toward zero; operands >= 0
  if (rounding === Rounding.Ceil && prod % c !== 0n) return q + 1n;
  return q;
}

// ============================================================================
// Typed-unit helper analogs (Units.sol / UnitsMathLib)
// ============================================================================

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Math.saturatingSub: max(a - b, 0) */
function saturatingSub(a: bigint, b: bigint): bigint {
  return a > b ? a - b : 0n;
}

/** UnitsMathLib.computeNAVDelta: signed a - b */
function computeNAVDelta(a: bigint, b: bigint): bigint {
  return a - b;
}

// ============================================================================
// Types
// ============================================================================

export type MarketState = "PERPETUAL" | "FIXED_TERM";

/** StaticCurveYDM curve, described by the three endpoint yield shares and the target (kink). */
export interface YDMCurve {
  yieldShareAtZeroUtilWAD: bigint; // y0
  yieldShareAtTargetWAD: bigint; // yTarget
  yieldShareAtFullUtilWAD: bigint; // y100
  targetUtilizationWAD: bigint; // kink
}

export interface MarketConfig {
  minCoverageWAD: bigint;
  coverageLiquidationUtilizationWAD: bigint;
  minLiquidityWAD: bigint;
  jtCoinvested: boolean;
  jtYDM: YDMCurve;
  ltYDM: YDMCurve;
  maxJTYieldShareWAD: bigint;
  maxLTYieldShareWAD: bigint;
  fixedTermDurationSeconds: bigint;
  stNAVDustTolerance: bigint;
  jtNAVDustTolerance: bigint;
  stProtocolFeeWAD: bigint;
  jtProtocolFeeWAD: bigint;
  jtYieldShareProtocolFeeWAD: bigint;
  ltYieldShareProtocolFeeWAD: bigint;
  /** Starting virtual clock (analog of setUp's vm.warp). */
  startTimestamp: bigint;
}

export interface SyncResult {
  marketState: MarketState;
  stRawNAV: bigint;
  jtRawNAV: bigint;
  stEffectiveNAV: bigint;
  jtEffectiveNAV: bigint;
  jtCoverageIL: bigint;
  jtCoverageImpermanentLossErased: bigint;
  coverageUtilWad: bigint;
  ltLiquidityPremium: bigint;
  stProtocolFee: bigint;
  jtProtocolFee: bigint;
  ltProtocolFee: bigint;
}

export interface MarketState_Internal {
  cfg: MarketConfig;
  effectiveNAVDustTolerance: bigint;
  // Checkpoints
  lastMarketState: MarketState;
  lastSTRawNAV: bigint;
  lastJTRawNAV: bigint;
  lastLTRawNAV: bigint;
  lastSTEffectiveNAV: bigint;
  lastJTEffectiveNAV: bigint;
  lastJTCoverageImpermanentLoss: bigint;
  fixedTermEndTimestamp: bigint;
  // Yield-share accrual accumulators
  twJTYieldShareAccruedWAD: bigint;
  twLTYieldShareAccruedWAD: bigint;
  lastYieldShareAccrualTimestamp: bigint;
  lastPremiumPaymentTimestamp: bigint;
  // Virtual clock (block.timestamp analog)
  now: bigint;
}

// ============================================================================
// StaticCurveYDM port
// ============================================================================

/** Slope helper: (y1 - y0) * WAD / (x1 - x0), floor. Solidity casts to uint64. */
function computeSlope(y0: bigint, y1: bigint, x0: bigint, x1: bigint): bigint {
  return mulDiv(y1 - y0, WAD, x1 - x0, Rounding.Floor);
}

/**
 * StaticCurveYDM._yieldShare — instantaneous yield share for a utilization.
 * marketState is unused by StaticCurveYDM (matches Solidity signature), kept for parity.
 */
export function ydmYieldShare(curve: YDMCurve, _marketState: MarketState, utilizationWAD: bigint): bigint {
  // Bound utilization to WAD
  let u = utilizationWAD;
  if (u > WAD) u = WAD;

  const uT = curve.targetUtilizationWAD;
  const slopeLt = computeSlope(curve.yieldShareAtZeroUtilWAD, curve.yieldShareAtTargetWAD, 0n, uT);
  const slopeGte = computeSlope(curve.yieldShareAtTargetWAD, curve.yieldShareAtFullUtilWAD, uT, WAD);

  if (u < uT) {
    return mulDiv(slopeLt, u, WAD, Rounding.Floor) + curve.yieldShareAtZeroUtilWAD;
  } else {
    return mulDiv(slopeGte, u - uT, WAD, Rounding.Floor) + curve.yieldShareAtTargetWAD;
  }
}

// ============================================================================
// UtilsLib port
// ============================================================================

/**
 * UtilsLib.computeCoverageUtilization.
 * Returns type(uint256).max when jtEff == 0 with live exposure.
 */
export function coverageUtilization(
  stRawNAV: bigint,
  jtRawNAV: bigint,
  jtCoinvested: boolean,
  minCoverageWAD: bigint,
  jtEffectiveNAV: bigint,
): bigint {
  if (minCoverageWAD === 0n) return 0n;
  const totalCoveredExposure = stRawNAV + (jtCoinvested ? jtRawNAV : 0n);
  if (totalCoveredExposure === 0n) return 0n;
  if (jtEffectiveNAV === 0n) return UINT256_MAX;
  return mulDiv(totalCoveredExposure, minCoverageWAD, jtEffectiveNAV, Rounding.Ceil);
}

/** UtilsLib.computeLiquidityUtilization. */
function liquidityUtilization(stEffectiveNAV: bigint, minLiquidityWAD: bigint, ltRawNAV: bigint): bigint {
  if (stEffectiveNAV === 0n || minLiquidityWAD === 0n) return 0n;
  if (ltRawNAV === 0n) return UINT256_MAX;
  return mulDiv(stEffectiveNAV, minLiquidityWAD, ltRawNAV, Rounding.Ceil);
}

// ============================================================================
// _attributeDeltaToClaimOnRawNAV
// ============================================================================

function attributeDeltaToClaimOnRawNAV(delta: bigint, claimOnTrancheRawNAV: bigint, lastTrancheRawNAV: bigint): bigint {
  if (delta === 0n || claimOnTrancheRawNAV === 0n || lastTrancheRawNAV === 0n) return 0n;
  const absDelta = delta < 0n ? -delta : delta;
  const attributedMagnitude = mulDiv(absDelta, claimOnTrancheRawNAV, lastTrancheRawNAV, Rounding.Floor);
  return delta < 0n ? -attributedMagnitude : attributedMagnitude;
}

// ============================================================================
// Market lifecycle
// ============================================================================

export function createMarket(cfg: MarketConfig): MarketState_Internal {
  return {
    cfg,
    effectiveNAVDustTolerance: cfg.stNAVDustTolerance + cfg.jtNAVDustTolerance,
    lastMarketState: "PERPETUAL",
    lastSTRawNAV: 0n,
    lastJTRawNAV: 0n,
    lastLTRawNAV: 0n,
    lastSTEffectiveNAV: 0n,
    lastJTEffectiveNAV: 0n,
    lastJTCoverageImpermanentLoss: 0n,
    fixedTermEndTimestamp: 0n,
    twJTYieldShareAccruedWAD: 0n,
    twLTYieldShareAccruedWAD: 0n,
    lastYieldShareAccrualTimestamp: 0n,
    lastPremiumPaymentTimestamp: 0n,
    now: cfg.startTimestamp,
  };
}

export type DepositTranche = "ST" | "JT";

/**
 * postOpSyncTrancheAccounting deposit path (JT_DEPOSIT / ST_DEPOSIT), used for genesis seeding.
 * amountNavUnits is the NEW absolute raw NAV of that tranche (mirrors VectorGen: passes full raw NAVs).
 * Deposits do not advance the clock or touch premium/yield-share timestamps.
 */
export function deposit(state: MarketState_Internal, tranche: DepositTranche, newStRawNAV: bigint, newJtRawNAV: bigint): void {
  const deltaSTRawNAV = computeNAVDelta(newStRawNAV, state.lastSTRawNAV);
  const deltaJTRawNAV = computeNAVDelta(newJtRawNAV, state.lastJTRawNAV);

  let stEffectiveNAV = state.lastSTEffectiveNAV;
  let jtEffectiveNAV = state.lastJTEffectiveNAV;

  if (tranche === "ST") {
    if (!(deltaSTRawNAV > 0n && deltaJTRawNAV === 0n)) throw new Error("INVALID_POST_OP_STATE ST_DEPOSIT");
    stEffectiveNAV = stEffectiveNAV + deltaSTRawNAV;
  } else {
    if (!(deltaJTRawNAV > 0n && deltaSTRawNAV === 0n)) throw new Error("INVALID_POST_OP_STATE JT_DEPOSIT");
    jtEffectiveNAV = jtEffectiveNAV + deltaJTRawNAV;
  }

  if (newStRawNAV + newJtRawNAV !== stEffectiveNAV + jtEffectiveNAV) throw new Error("NAV_CONSERVATION_VIOLATION");

  state.lastSTRawNAV = newStRawNAV;
  state.lastJTRawNAV = newJtRawNAV;
  state.lastSTEffectiveNAV = stEffectiveNAV;
  state.lastJTEffectiveNAV = jtEffectiveNAV;
}

// ============================================================================
// _accruePremiumYieldShares (mutating accrual invoked by preOpSync)
// ============================================================================

function accruePremiumYieldShares(state: MarketState_Internal): { twJT: bigint; twLT: bigint } {
  const lastUpdate = state.lastYieldShareAccrualTimestamp;
  if (lastUpdate === 0n) {
    state.lastYieldShareAccrualTimestamp = state.now;
    state.lastPremiumPaymentTimestamp = state.now;
    return { twJT: 0n, twLT: 0n };
  }
  // Mirror Solidity's `uint256 elapsed = block.timestamp - lastUpdate` (RoycoDayAccountant.sol:747).
  // If the clock has moved backward, this subtraction underflows and the contract reverts with
  // panic 0x11 (arithmetic underflow). Reproduce that revert exactly.
  if (state.now < lastUpdate) throw new Error("ARITHMETIC_UNDERFLOW: block.timestamp < lastYieldShareAccrualTimestamp");
  const elapsed = state.now - lastUpdate;
  if (elapsed === 0n) return { twJT: state.twJTYieldShareAccruedWAD, twLT: state.twLTYieldShareAccruedWAD };

  const covUtil = coverageUtilization(
    state.lastSTRawNAV,
    state.lastJTRawNAV,
    state.cfg.jtCoinvested,
    state.cfg.minCoverageWAD,
    state.lastJTEffectiveNAV,
  );
  const liqUtil = liquidityUtilization(state.lastSTEffectiveNAV, state.cfg.minLiquidityWAD, state.lastLTRawNAV);

  const jtYieldShareWAD = min(ydmYieldShare(state.cfg.jtYDM, state.lastMarketState, covUtil), state.cfg.maxJTYieldShareWAD);
  const ltYieldShareWAD = min(ydmYieldShare(state.cfg.ltYDM, state.lastMarketState, liqUtil), state.cfg.maxLTYieldShareWAD);

  state.twJTYieldShareAccruedWAD = state.twJTYieldShareAccruedWAD + jtYieldShareWAD * elapsed;
  state.twLTYieldShareAccruedWAD = state.twLTYieldShareAccruedWAD + ltYieldShareWAD * elapsed;
  state.lastYieldShareAccrualTimestamp = state.now;
  return { twJT: state.twJTYieldShareAccruedWAD, twLT: state.twLTYieldShareAccruedWAD };
}

// ============================================================================
// _previewSyncTrancheAccounting (the waterfall)
// ============================================================================

interface PreviewResult {
  marketState: MarketState;
  stEffectiveNAV: bigint;
  jtEffectiveNAV: bigint;
  jtCoverageImpermanentLoss: bigint;
  coverageUtilizationWAD: bigint;
  initialMarketState: MarketState;
  premiumsPaid: boolean;
  jtCoverageImpermanentLossErased: bigint;
  fixedTermEndTimestamp: bigint;
  ltLiquidityPremium: bigint;
  stProtocolFee: bigint;
  jtProtocolFee: bigint;
  ltProtocolFee: bigint;
}

function previewSyncTrancheAccounting(
  state: MarketState_Internal,
  stRawNAV: bigint,
  jtRawNAV: bigint,
  twJTYieldShareAccruedWAD: bigint,
  twLTYieldShareAccruedWAD: bigint,
): PreviewResult {
  const $ = state;
  const cfg = state.cfg;
  const initialMarketState = $.lastMarketState;

  let stEffectiveNAV = $.lastSTEffectiveNAV;
  let jtEffectiveNAV = $.lastJTEffectiveNAV;
  let jtCoverageImpermanentLoss = $.lastJTCoverageImpermanentLoss;
  const effectiveNAVDustTolerance = $.effectiveNAVDustTolerance;

  // --- PNL_ATTRIBUTION ---
  let deltaSTEffectiveNAV: bigint;
  let deltaJTEffectiveNAV: bigint;
  {
    const lastSTRawNAV = $.lastSTRawNAV;
    const lastJTRawNAV = $.lastJTRawNAV;

    const stClaimOnJTRawNAV = saturatingSub(stEffectiveNAV, lastSTRawNAV);
    const jtClaimOnSTRawNAV = saturatingSub(jtEffectiveNAV, lastJTRawNAV);
    const stClaimOnSTRawNAV = lastSTRawNAV - jtClaimOnSTRawNAV;

    const deltaSTRawNAV = computeNAVDelta(stRawNAV, lastSTRawNAV);
    const deltaJTRawNAV = computeNAVDelta(jtRawNAV, lastJTRawNAV);

    const deltaSTClaimOnSTRawNAV =
      lastSTRawNAV === 0n
        ? stEffectiveNAV > 0n
          ? deltaSTRawNAV
          : 0n
        : attributeDeltaToClaimOnRawNAV(deltaSTRawNAV, stClaimOnSTRawNAV, lastSTRawNAV);
    const deltaSTClaimOnJTRawNAV = attributeDeltaToClaimOnRawNAV(deltaJTRawNAV, stClaimOnJTRawNAV, lastJTRawNAV);

    deltaSTEffectiveNAV = deltaSTClaimOnSTRawNAV + deltaSTClaimOnJTRawNAV;
    deltaJTEffectiveNAV = deltaSTRawNAV + deltaJTRawNAV - deltaSTEffectiveNAV;
  }

  let ltLiquidityPremium = 0n;
  let stProtocolFee = 0n;
  let jtProtocolFee = 0n;
  let ltProtocolFee = 0n;
  let premiumsPaid = false;

  // --- MARK_TO_MARKET: JT side ---
  let jtNetGain = 0n;
  if (deltaJTEffectiveNAV < 0n) {
    const jtLoss = -deltaJTEffectiveNAV;
    jtEffectiveNAV = jtEffectiveNAV - jtLoss;
  } else if (deltaJTEffectiveNAV > 0n) {
    jtNetGain = deltaJTEffectiveNAV;
    if (jtNetGain > effectiveNAVDustTolerance) jtProtocolFee = mulDiv(jtNetGain, cfg.jtProtocolFeeWAD, WAD, Rounding.Floor);
    jtEffectiveNAV = jtEffectiveNAV + jtNetGain;
  }

  // --- MARK_TO_MARKET: ST side ---
  if (deltaSTEffectiveNAV < 0n) {
    let stLoss = -deltaSTEffectiveNAV;
    const coverageApplied = min(stLoss, jtEffectiveNAV);
    if (coverageApplied !== 0n) {
      if (jtProtocolFee !== 0n) {
        jtNetGain = saturatingSub(jtNetGain, coverageApplied);
        jtProtocolFee = jtNetGain > effectiveNAVDustTolerance ? mulDiv(jtNetGain, cfg.jtProtocolFeeWAD, WAD, Rounding.Floor) : 0n;
      }
      jtEffectiveNAV = jtEffectiveNAV - coverageApplied;
      jtCoverageImpermanentLoss = jtCoverageImpermanentLoss + coverageApplied;
      stLoss = stLoss - coverageApplied;
    }
    if (stLoss !== 0n) stEffectiveNAV = stEffectiveNAV - stLoss;
  } else if (deltaSTEffectiveNAV > 0n) {
    let stGain = deltaSTEffectiveNAV;

    // JT coverage IL recovery (first claim on ST appreciation)
    const jtCoverageImpermanentLossRecovery = min(stGain, jtCoverageImpermanentLoss);
    if (jtCoverageImpermanentLossRecovery !== 0n) {
      jtCoverageImpermanentLoss = jtCoverageImpermanentLoss - jtCoverageImpermanentLossRecovery;
      jtEffectiveNAV = jtEffectiveNAV + jtCoverageImpermanentLossRecovery;
      stGain = stGain - jtCoverageImpermanentLossRecovery;
    }

    // Pay premiums out of residual gain
    if (stGain !== 0n) {
      if (stGain > effectiveNAVDustTolerance) premiumsPaid = true;
      let jtRiskPremium = 0n;
      let elapsedSinceLastPremiumPayments = $.now - $.lastPremiumPaymentTimestamp;
      if (elapsedSinceLastPremiumPayments === 0n) {
        elapsedSinceLastPremiumPayments = 1n;
        twJTYieldShareAccruedWAD = min(
          ydmYieldShare(
            cfg.jtYDM,
            initialMarketState,
            coverageUtilization($.lastSTRawNAV, $.lastJTRawNAV, cfg.jtCoinvested, cfg.minCoverageWAD, $.lastJTEffectiveNAV),
          ),
          cfg.maxJTYieldShareWAD,
        );
        twLTYieldShareAccruedWAD = min(
          ydmYieldShare(cfg.ltYDM, initialMarketState, liquidityUtilization($.lastSTEffectiveNAV, cfg.minLiquidityWAD, $.lastLTRawNAV)),
          cfg.maxLTYieldShareWAD,
        );
      }
      jtRiskPremium = mulDiv(stGain, twJTYieldShareAccruedWAD, elapsedSinceLastPremiumPayments * WAD, Rounding.Floor);
      ltLiquidityPremium = mulDiv(stGain, twLTYieldShareAccruedWAD, elapsedSinceLastPremiumPayments * WAD, Rounding.Floor);
      if (jtRiskPremium + ltLiquidityPremium > stGain) throw new Error("PREMIUMS_EXCEED_SENIOR_YIELD");

      if (jtRiskPremium !== 0n) {
        if (premiumsPaid) jtProtocolFee = jtProtocolFee + mulDiv(jtRiskPremium, cfg.jtYieldShareProtocolFeeWAD, WAD, Rounding.Floor);
        jtEffectiveNAV = jtEffectiveNAV + jtRiskPremium;
        stGain = stGain - jtRiskPremium;
      }
      if (ltLiquidityPremium !== 0n) {
        if (premiumsPaid) ltProtocolFee = mulDiv(ltLiquidityPremium, cfg.ltYieldShareProtocolFeeWAD, WAD, Rounding.Floor);
        stGain = stGain - ltLiquidityPremium;
      }
      if (premiumsPaid) stProtocolFee = mulDiv(stGain, cfg.stProtocolFeeWAD, WAD, Rounding.Floor);
      stEffectiveNAV = stEffectiveNAV + stGain + ltLiquidityPremium;
    }
  }

  if (stRawNAV + jtRawNAV !== stEffectiveNAV + jtEffectiveNAV) throw new Error("NAV_CONSERVATION_VIOLATION");

  // --- APPLY_MARKET_STATE_TRANSITION ---
  const minCoverageWAD = cfg.minCoverageWAD;
  const coverageLiquidationUtilizationWAD = cfg.coverageLiquidationUtilizationWAD;
  const coverageUtilizationWAD = coverageUtilization(stRawNAV, jtRawNAV, cfg.jtCoinvested, minCoverageWAD, jtEffectiveNAV);
  let resultingMarketState: MarketState;
  let fixedTermEndTimestamp = $.fixedTermEndTimestamp;
  let jtCoverageImpermanentLossErased = 0n;
  {
    const fixedTermDurationSeconds = cfg.fixedTermDurationSeconds;
    // Faithful port of RoycoDayAccountant.sol:660-699. `initialMarketState` is the persisted
    // $.lastMarketState captured at the START of this sync (line 310). Elapse uses a NON-STRICT
    // `<=` comparison (line 661). The fixed-term end timestamp is re-anchored to
    // uint32(now + duration) ONLY on a PERPETUAL->FIXED_TERM entry (line 699); a
    // FIXED_TERM->FIXED_TERM sync carries the stored anchor UNCHANGED. Every PERPETUAL result
    // zeroes the anchor (lines 672, 680).
    if (
      fixedTermDurationSeconds === 0n ||
      (initialMarketState === "FIXED_TERM" && fixedTermEndTimestamp <= $.now) ||
      coverageUtilizationWAD >= coverageLiquidationUtilizationWAD ||
      (jtEffectiveNAV === 0n && stEffectiveNAV > 0n)
    ) {
      jtCoverageImpermanentLossErased = jtCoverageImpermanentLoss;
      jtCoverageImpermanentLoss = 0n;
      resultingMarketState = "PERPETUAL";
      fixedTermEndTimestamp = 0n;
    } else if (jtCoverageImpermanentLoss <= effectiveNAVDustTolerance) {
      if (initialMarketState === "PERPETUAL" || jtCoverageImpermanentLoss === 0n) {
        resultingMarketState = "PERPETUAL";
        fixedTermEndTimestamp = 0n;
      } else {
        // Dust-buffer rule (line 682-690): stay FIXED_TERM, carry the stored anchor unchanged.
        resultingMarketState = "FIXED_TERM";
        ltLiquidityPremium = 0n;
        stProtocolFee = 0n;
        jtProtocolFee = 0n;
        ltProtocolFee = 0n;
      }
    } else {
      resultingMarketState = "FIXED_TERM";
      ltLiquidityPremium = 0n;
      stProtocolFee = 0n;
      jtProtocolFee = 0n;
      ltProtocolFee = 0n;
      // Re-anchor ONLY on a PERPETUAL->FIXED_TERM entry (line 699), with uint32 truncation.
      if (initialMarketState === "PERPETUAL") fixedTermEndTimestamp = ($.now + fixedTermDurationSeconds) % 2n ** 32n;
    }
  }

  return {
    marketState: resultingMarketState,
    stEffectiveNAV,
    jtEffectiveNAV,
    jtCoverageImpermanentLoss,
    coverageUtilizationWAD,
    initialMarketState,
    premiumsPaid,
    jtCoverageImpermanentLossErased,
    fixedTermEndTimestamp,
    ltLiquidityPremium,
    stProtocolFee,
    jtProtocolFee,
    ltProtocolFee,
  };
}

// ============================================================================
// preOpSyncTrancheAccounting (drives + commits a sync)
// ============================================================================

/**
 * Advances the virtual clock by dtSeconds, then runs the pre-op sync (accrual + waterfall)
 * and commits the resulting checkpoints, mirroring RoycoDayAccountant.preOpSyncTrancheAccounting.
 */
export function sync(state: MarketState_Internal, newStRawNAV: bigint, newJtRawNAV: bigint, dtSeconds: bigint): SyncResult {
  const $ = state;
  if (dtSeconds > 0n) $.now = $.now + dtSeconds;

  const { twJT, twLT } = accruePremiumYieldShares($);
  const r = previewSyncTrancheAccounting($, newStRawNAV, newJtRawNAV, twJT, twLT);

  if (r.premiumsPaid) {
    $.twJTYieldShareAccruedWAD = 0n;
    $.twLTYieldShareAccruedWAD = 0n;
    $.lastPremiumPaymentTimestamp = $.now;
  }

  $.lastMarketState = r.marketState;
  $.lastSTRawNAV = newStRawNAV;
  $.lastJTRawNAV = newJtRawNAV;
  $.lastSTEffectiveNAV = r.stEffectiveNAV;
  $.lastJTEffectiveNAV = r.jtEffectiveNAV;
  $.lastJTCoverageImpermanentLoss = r.jtCoverageImpermanentLoss;

  // r.fixedTermEndTimestamp is authoritative in every branch (RoycoDayAccountant.sol:656-699):
  // re-anchored on PERPETUAL->FIXED_TERM entry, carried unchanged on FIXED_TERM->FIXED_TERM,
  // zeroed on any PERPETUAL result.
  $.fixedTermEndTimestamp = r.fixedTermEndTimestamp;

  return {
    marketState: r.marketState,
    stRawNAV: newStRawNAV,
    jtRawNAV: newJtRawNAV,
    stEffectiveNAV: r.stEffectiveNAV,
    jtEffectiveNAV: r.jtEffectiveNAV,
    jtCoverageIL: r.jtCoverageImpermanentLoss,
    jtCoverageImpermanentLossErased: r.jtCoverageImpermanentLossErased,
    coverageUtilWad: r.coverageUtilizationWAD,
    ltLiquidityPremium: r.ltLiquidityPremium,
    stProtocolFee: r.stProtocolFee,
    jtProtocolFee: r.jtProtocolFee,
    ltProtocolFee: r.ltProtocolFee,
  };
}
