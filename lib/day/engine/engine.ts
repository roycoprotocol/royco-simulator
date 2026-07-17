// =============================================================================
// Royco Day — simulation engine
// -----------------------------------------------------------------------------
// Faithful model of Dawn's two-tranche mechanics (RoycoAccountant / RoycoKernel)
// extended with the Royco Day Liquidity Tranche per the spec. Every block maps
// to a Solidity reference; see AUDIT.md.
//
// Invariant the contracts enforce (NAV_CONSERVATION_VIOLATION):
//     stRawNAV + jtRawNAV == stEffectiveNAV + jtEffectiveNAV
// With the LT paid out of ST yield in ST's asset, this generalizes to:
//     stRawNAV + jtRawNAV == stEffectiveNAV + jtEffectiveNAV
//                            + accruedLiquidityPremium + protocolFeeNAV
// (the pool's stablecoin is both an asset and an LT claim, so it cancels).
// =============================================================================

import {
  MarketState,
  type MarketConfig,
  type LiveState,
  type Snapshot,
  type SimEvent,
  type EventKind,
} from "./types";
import { ydmShare, adaptYTarget, YEAR_SEC } from "./ydm";
import { type EclpParams, eclpParamsForWeight, eclpInvariant, eclpTVL, eclpSellValue } from "./eclp";

// ---------------------------------------------------------------------------
// Health metrics
// ---------------------------------------------------------------------------

// Dawn utilization  (UtilsLib.computeUtilization). Rounds in favor of senior.
export function utilization(
  stRaw: number,
  jtRaw: number,
  beta: number,
  cov: number,
  jtEff: number,
): number {
  if (stRaw <= 0) return 0;
  if (jtEff <= 0) return Infinity;
  return (cov * (stRaw + jtRaw * beta)) / jtEff;
}

// Royco Day liquidity utilization  (spec: (ST_EFF * MIN_LIQUIDITY) / LT_RAW_NAV).
export function liquidityUtilization(
  stEff: number,
  minLiq: number,
  poolValue: number,
): number {
  if (minLiq <= 0) return 0;
  if (poolValue <= 0) return Infinity;
  return (stEff * minLiq) / poolValue;
}

// ---------------------------------------------------------------------------
// Liquidity-tranche pool (E-CLP BPT: ~10% ST shares / 90% T-bill stable).
//
// YIELDS are modeled directly — no AMM curve is simulated:
//   • swap income  = fee(bps) × volume   (volume = turnover × pool value)
//   • stable leg   = T-bill rate (≈3.5%)   • ST-share leg = senior net yield
//   • liquidity premium = a share of ST yield via the LT's YDM.
//
// VALUATION mimics Balancer's E-CLP oracle (EclpLPOracle): the BPT is valued from
// the *invariant* of the rate-scaled leg balances, not naive spot reserves —
//   ltRawNAV = eclpTVL(params, eclpInvariant(X, Y), 1, 1)
//   X = stShares·stPrice (ST leg NAV),  Y = stable (stable leg NAV).
// Both legs are already in NAV units (rate providers), so the oracle numeraire
// price is 1 per leg. Because the invariant is maximized at the peg composition,
// an imbalanced pool is valued *below* its naive spot sum — exactly the
// manipulation resistance the real oracle provides, and the wrong-way-risk the LT
// bears when a run fills the pool with ST. See AUDIT.md §6.
// (Day/Dawn only; the Dusk-as-collateral fixed point is out of scope.)
// ---------------------------------------------------------------------------

const LT_LAMBDA = 1; // E-CLP shape (circle base case) — verified stable/low-slippage
const LT_WEIGHT = 0.1; // target ST value weight at the peg (10% ST / 90% stable)

let _eclpCache: { key: string; p: EclpParams } | null = null;
function eclpParamsFor(cfg: MarketConfig): EclpParams {
  const key = `${LT_WEIGHT}|${LT_LAMBDA}|${cfg.eclpBandWidth}`;
  if (!_eclpCache || _eclpCache.key !== key)
    _eclpCache = { key, p: eclpParamsForWeight(LT_WEIGHT, LT_LAMBDA, cfg.eclpBandWidth) };
  return _eclpCache.p;
}

// Naive spot value of pool reserves at NAV (manipulable; shown for divergence).
export function poolValue(state: LiveState): number {
  return state.pool.stShares * stPrice(state) + state.pool.stable;
}

// Manipulation-resistant BPT NAV (Balancer EclpLPOracle): value the invariant of
// the rate-scaled balances at numeraire prices [1, 1].
export function ltRawNAV(state: LiveState, cfg: MarketConfig): number {
  const X = state.pool.stShares * stPrice(state);
  const Y = state.pool.stable;
  if (X <= 0 && Y <= 0) return 0;
  const p = eclpParamsFor(cfg);
  return eclpTVL(p, eclpInvariant(p, X, Y), 1, 1);
}

// ---------------------------------------------------------------------------
// Per-share prices (NAV per whole share). Bootstrap at 1.0.
// ---------------------------------------------------------------------------
export const stPrice = (s: LiveState) =>
  s.stShares > 0 ? s.stEffectiveNAV / s.stShares : 1;
export const jtPrice = (s: LiveState) =>
  s.jtShares > 0 ? s.jtEffectiveNAV / s.jtShares : 1;
export const ltEffectiveNAV = (s: LiveState, cfg: MarketConfig) =>
  ltRawNAV(s, cfg) + s.accruedLiquidityPremium;
export const ltPrice = (s: LiveState, cfg: MarketConfig) =>
  s.ltShares > 0 ? ltEffectiveNAV(s, cfg) / s.ltShares : 1;

// ---------------------------------------------------------------------------
// Premium priority (spec gap: two premiums, one yield stream).
// ---------------------------------------------------------------------------
function capShares(
  jtShare: number,
  liqShare: number,
  mode: MarketConfig["premiumPriority"],
): [number, number] {
  if (jtShare + liqShare <= 1) return [jtShare, liqShare];
  if (mode === "jtPriority") return [Math.min(jtShare, 1), Math.max(0, 1 - jtShare)];
  const k = 1 / (jtShare + liqShare); // proRata
  return [jtShare * k, liqShare * k];
}

// ---------------------------------------------------------------------------
// reconcile = pre-op sync (RoycoAccountant.previewSyncTrancheAccounting):
// reconcile organic PnL, apply the loss waterfall, distribute yield via both
// YDMs, accrue protocol fees, run the market state machine. Mutates `state`.
// `protocolFeeNAV` is returned-by-ref via state for the conservation check.
// ---------------------------------------------------------------------------
export interface ReconcileExtras {
  protocolFeeNAVAdded: number;
  riskShare: number;
  liqShare: number;
  events: SimEvent[];
}

export function reconcile(
  state: LiveState,
  cfg: MarketConfig,
  newStRaw: number,
  newJtRaw: number,
  dtSec: number,
): ReconcileExtras {
  const dust = cfg.dustTolerance;
  const ev: SimEvent[] = [];
  const push = (
    kind: EventKind,
    msg: string,
    level: SimEvent["level"],
    amountNAV?: number,
  ) => ev.push({ t: state.t, kind, msg, level, amountNAV });

  const initialState = state.marketState;
  const inFT = initialState === MarketState.FIXED_TERM;

  const dST = newStRaw - state.stRawNAV;
  const dJT = newJtRaw - state.jtRawNAV;
  state.stRawNAV = newStRaw;
  state.jtRawNAV = newJtRaw;

  let stEff = state.stEffectiveNAV;
  let jtEff = state.jtEffectiveNAV;
  let stIL = state.stImpermanentLoss;
  let jtIL = state.jtImpermanentLoss;
  let feeAdded = 0;
  let riskShareUsed = 0;
  let liqShareUsed = 0;
  // Protocol-fee bases are accrued during the waterfall but the keep/zero decision is
  // deferred to AFTER the state machine: the contract keeps fees iff the RESULTING
  // state is PERPETUAL (it fees the residual yield even on a FIXED_TERM→PERPETUAL
  // recovery) and zeroes them iff the resulting state is FIXED_TERM. Gating on the
  // initial state (the old behavior) skipped fees on a recovery the contract fees.
  let jtGainFeeBase = 0; // JT residual gain (net of ST-IL recovery), before coverage
  let coverageApplied = 0; // JT buffer consumed as ST coverage this sync
  let yieldShareFeeBase = 0; // JT risk-premium yield (yieldShareProtocolFee base)
  let stYieldFeeBase = 0; // ST residual yield (stProtocolFee base)

  // ---- JT own PnL (its own deployment) -----------------------------------
  if (dJT < -dust) {
    const loss = -dJT;
    const absorbed = Math.min(loss, jtEff);
    jtEff -= absorbed;
    const spill = loss - absorbed;
    if (spill > dust) {
      // JT effective NAV depleted -> spill to ST as ST IL
      stEff -= spill;
      stIL += spill;
    }
  } else if (dJT > dust) {
    let gain = dJT;
    // senior priority: JT appreciation first makes ST whole (STEP_APPLY_JT_GAIN)
    const r0 = Math.min(gain, stIL);
    stIL -= r0;
    stEff += r0;
    gain -= r0;
    if (gain > dust) {
      jtGainFeeBase = gain; // fee taken later (on the post-coverage net), if PERPETUAL
      jtEff += gain; // JT accrues residual gain (full; fee deducted post-state-machine)
    }
  }

  // ---- ST PnL (with coverage + IL waterfall) -----------------------------
  if (dST < -dust) {
    let loss = -dST;
    // JT provides coverage up to its available buffer
    const coverage = Math.min(loss, jtEff);
    coverageApplied = coverage; // strips JT of gain the JT fee would be charged on
    jtEff -= coverage;
    jtIL += coverage; // JT claim on future ST appreciation
    loss -= coverage;
    if (loss > dust) {
      // residual uncovered loss absorbed by ST
      stEff -= loss;
      stIL += loss;
    }
  } else if (dST > dust) {
    let gain = dST;
    // 1) recover ST IL first (senior priority)
    const r1 = Math.min(gain, stIL);
    stIL -= r1;
    stEff += r1;
    gain -= r1;
    // 2) recover JT coverage IL second
    const r2 = Math.min(gain, jtIL);
    jtIL -= r2;
    jtEff += r2;
    gain -= r2;
    // 3) distribute residual as yield via both YDMs
    if (gain > dust) {
      const pv = ltRawNAV(state, cfg); // spec: liquidityUtilization keys on LT_RAW_NAV (oracle)
      const U = utilization(state.stRawNAV, state.jtRawNAV, cfg.beta, cfg.coverage, jtEff);
      const Lu = liquidityUtilization(stEff, cfg.minLiquidity, pv);
      // adapt the kink only when the market is perpetual (YDM frozen in fixed term)
      if (!inFT) {
        state.riskYTarget = adaptYTarget(cfg.riskYDM, state.riskYTarget, U, dtSec, cfg.targetUtilization);
        state.liqYTarget = adaptYTarget(cfg.liqYDM, state.liqYTarget, Lu, dtSec, cfg.liqTargetUtilization);
      }
      let jtShare = ydmShare(cfg.riskYDM, state.riskYTarget, U, cfg.targetUtilization);
      let liqShare = ydmShare(cfg.liqYDM, state.liqYTarget, Lu, cfg.liqTargetUtilization);
      [jtShare, liqShare] = capShares(jtShare, liqShare, cfg.premiumPriority);
      riskShareUsed = jtShare;
      liqShareUsed = liqShare;

      const jtYield = gain * jtShare;
      const ltYield = gain * liqShare;
      const stYield = gain - jtYield - ltYield;
      yieldShareFeeBase = jtYield; // fee bases; deducted post-state-machine if PERPETUAL
      stYieldFeeBase = stYield;

      stEff += stYield; // full yield credited; protocol fees carved out later
      jtEff += jtYield;
      state.accruedLiquidityPremium += ltYield; // LT claim on ST assets (in ST asset)
    }
  }

  // ---- market state machine (mirrors RoycoAccountant resulting-state branch) ----
  const U = utilization(state.stRawNAV, state.jtRawNAV, cfg.beta, cfg.coverage, jtEff);
  const expired = initialState === MarketState.FIXED_TERM && state.t >= state.fixedTermEndSec;
  const breached = U >= cfg.liquidationUtilization; // >= per Solidity
  const distressed = stIL > dust;
  let newState: MarketState;
  let jtILErased = 0;

  if (cfg.fixedTermDurationSec === 0 || expired || breached || distressed) {
    // 1. Forced Perpetual: JT coverage IL is explicitly cleared
    if (jtIL > dust) jtILErased = jtIL;
    jtIL = 0;
    newState = MarketState.PERPETUAL;
    state.fixedTermEndSec = 0;
  } else if (jtIL <= dust) {
    // 2. Normal Perpetual / dust
    if (initialState === MarketState.PERPETUAL || jtIL <= 1e-12) {
      newState = MarketState.PERPETUAL;
      state.fixedTermEndSec = 0;
    } else {
      // was fixed-term, coverage IL within dust but not fully zero -> hold until restored
      newState = MarketState.FIXED_TERM;
    }
  } else {
    // 3. Fixed-term: jtIL above dust, healthy, not distressed, not expired, duration > 0
    newState = MarketState.FIXED_TERM;
    if (initialState === MarketState.PERPETUAL) state.fixedTermEndSec = state.t + cfg.fixedTermDurationSec;
  }

  if (initialState === MarketState.PERPETUAL && newState === MarketState.FIXED_TERM)
    push("enter-fixed-term", `JT covered an ST drawdown — FIXED_TERM begins (ST redemptions & JT deposits blocked; YDM frozen).`, "warn");
  if (initialState === MarketState.FIXED_TERM && newState === MarketState.PERPETUAL) {
    if (jtILErased > dust)
      push("exit-fixed-term", `Forced to PERPETUAL (${expired ? "term expired" : breached ? "liquidation breach" : "ST impairment"}) — JT forfeits its recovery claim.`, "danger");
    else push("exit-fixed-term", `Drawdown fully recovered — back to PERPETUAL, JT made whole.`, "good");
  }
  if (jtILErased > dust) {
    push(
      "jt-il-erased",
      `JT impermanent loss erased: ${fmt(jtILErased)} realized as a JT loss.`,
      "danger",
      jtILErased,
    );
  }

  // ---- protocol fees: taken iff the RESULTING state is PERPETUAL (never in FIXED_TERM) ----
  if (newState === MarketState.PERPETUAL) {
    // JT-gain fee on the net gain that actually survived same-sync ST coverage
    // (RoycoAccountant recomputes jtNetGain -= coverageApplied before the fee).
    const jtNetGain = Math.max(0, jtGainFeeBase - coverageApplied);
    if (cfg.jtProtocolFee > 0 && jtNetGain > dust) {
      const f = jtNetGain * cfg.jtProtocolFee;
      jtEff -= f;
      feeAdded += f;
    }
    if (cfg.yieldShareProtocolFee > 0 && yieldShareFeeBase > dust) {
      const f = yieldShareFeeBase * cfg.yieldShareProtocolFee;
      jtEff -= f;
      feeAdded += f;
    }
    if (cfg.stProtocolFee > 0 && stYieldFeeBase > dust) {
      const f = stYieldFeeBase * cfg.stProtocolFee;
      stEff -= f;
      feeAdded += f;
    }
  }

  state.stEffectiveNAV = stEff;
  state.jtEffectiveNAV = jtEff;
  state.stImpermanentLoss = stIL;
  state.jtImpermanentLoss = jtIL;
  state.marketState = newState;
  state.lastYDMUpdateSec = state.t;

  return { protocolFeeNAVAdded: feeAdded, riskShare: riskShareUsed, liqShare: liqShareUsed, events: ev };
}

// ---------------------------------------------------------------------------
// Operations (RoycoKernel). Each assumes reconcile (pre-op sync) already ran.
// Returns the event(s); a blocked op leaves state untouched.
// ---------------------------------------------------------------------------

export interface OpResult {
  ok: boolean;
  events: SimEvent[];
}

function blocked(state: LiveState, kind: EventKind, msg: string): OpResult {
  return { ok: false, events: [{ t: state.t, kind: "blocked", msg, level: "warn" }] };
}

export function stDeposit(state: LiveState, cfg: MarketConfig, amountNAV: number): OpResult {
  const dust = cfg.dustTolerance;
  if (state.stImpermanentLoss > dust)
    return blocked(state, "st-deposit", "ST deposit blocked: ST impermanent loss exists (would dilute existing senior LPs).");
  const price = stPrice(state);
  const shares = amountNAV / price;
  // post-op utilization: ST deposit raises the numerator (more senior to protect),
  // the JT buffer (denominator) is unchanged -> utilization rises.
  const U = utilization(state.stRawNAV + amountNAV, state.jtRawNAV, cfg.beta, cfg.coverage, state.jtEffectiveNAV);
  if (U > 1 + 1e-12)
    return blocked(state, "st-deposit", `ST deposit blocked: coverage requirement violated (utilization ${(U * 100).toFixed(1)}% > 100%). JT buffer too thin.`);
  state.stRawNAV += amountNAV;
  state.stEffectiveNAV += amountNAV;
  state.stShares += shares;
  return { ok: true, events: [{ t: state.t, kind: "st-deposit", msg: `ST deposit ${fmt(amountNAV)} → ${shares.toFixed(2)} shares.`, level: "info" }] };
}

export function jtDeposit(state: LiveState, cfg: MarketConfig, amountNAV: number): OpResult {
  if (state.marketState !== MarketState.PERPETUAL)
    return blocked(state, "jt-deposit", "JT deposit blocked: only enabled in PERPETUAL (protects existing JT during recovery).");
  const price = jtPrice(state);
  const shares = amountNAV / price;
  state.jtRawNAV += amountNAV;
  state.jtEffectiveNAV += amountNAV;
  state.jtShares += shares;
  return { ok: true, events: [{ t: state.t, kind: "jt-deposit", msg: `JT deposit ${fmt(amountNAV)} → ${shares.toFixed(2)} shares.`, level: "info" }] };
}

export function stRedeem(state: LiveState, cfg: MarketConfig, shares: number, bypass = false): OpResult {
  const dust = cfg.dustTolerance;
  if (state.marketState !== MarketState.PERPETUAL && !bypass)
    return blocked(state, "st-redeem", "ST redeem blocked: only enabled in PERPETUAL (the secondary pool is the intended exit in FIXED_TERM).");
  if (shares > state.stShares + dust) shares = state.stShares;
  const frac = shares / state.stShares;
  const redemptionNAV = frac * state.stEffectiveNAV;

  // ST self-liquidation bonus when the liquidation threshold is breached
  let bonus = 0;
  const U = utilization(state.stRawNAV, state.jtRawNAV, cfg.beta, cfg.coverage, state.jtEffectiveNAV);
  if (U >= cfg.liquidationUtilization && cfg.stSelfLiquidationBonus > 0) {
    const desired = redemptionNAV * cfg.stSelfLiquidationBonus;
    const A0 = state.stRawNAV + state.jtRawNAV * cfg.beta; // covered exposure
    // Utilization-neutral cap. The bonus debits both jtEff and jtRaw, so jtRaw enters
    // the post-redeem numerator β-weighted: U' = cov·(A0−redeem−β·b)/(jtEff−b) ≤ U
    // requires b ≤ redeem·jtEff/(A0 − β·jtEff). This is RoycoKernel's Case-2 denominator
    // (E − β·jtEff) — the engine sources the bonus from JT's own raw pool. It reduces to
    // A0 at β=0 and A0−jtEff at β=1, and is provably > 0 when the breach branch runs
    // (U ≥ liqUtil ≥ 1 with cov < 1 ⇒ A0 > jtEff ≥ β·jtEff).
    const denom = A0 - cfg.beta * state.jtEffectiveNAV;
    const utilNeutralCap = denom > 0 ? (redemptionNAV * state.jtEffectiveNAV) / denom : Infinity;
    bonus = Math.min(desired, state.jtEffectiveNAV, utilNeutralCap);
  }

  state.stRawNAV -= redemptionNAV;
  state.stEffectiveNAV -= redemptionNAV;
  state.stShares -= shares;
  if (bonus > dust) {
    state.jtEffectiveNAV -= bonus; // bonus sourced from JT effective NAV (delevers)
    state.jtRawNAV -= bonus; // ...and the assets physically leave JT (conservation)
  }
  // proportional ST IL realization by the exiting senior LP
  if (state.stImpermanentLoss > dust && state.stEffectiveNAV > dust) {
    state.stImpermanentLoss *= (1 - frac);
  }
  const events: SimEvent[] = [{ t: state.t, kind: "st-redeem", msg: `ST redeem ${shares.toFixed(2)} shares → ${fmt(redemptionNAV + bonus)}.`, level: "info" }];
  if (bonus > dust) events.push({ t: state.t, kind: "self-liq-bonus", msg: `Self-liquidation bonus ${fmt(bonus)} paid from JT to delever (util ${(U * 100).toFixed(0)}% > liq threshold).`, level: "warn" });
  return { ok: true, events };
}

export function jtRedeem(state: LiveState, cfg: MarketConfig, shares: number, bypass = false): OpResult {
  const dust = cfg.dustTolerance;
  if (shares > state.jtShares + dust) shares = state.jtShares;
  const frac = shares / state.jtShares;
  const redemptionNAV = frac * state.jtEffectiveNAV;
  // simulate post-op coverage
  const U = utilization(state.stRawNAV, state.jtRawNAV - redemptionNAV, cfg.beta, cfg.coverage, state.jtEffectiveNAV - redemptionNAV);
  if (U > 1 + 1e-12 && !bypass)
    return blocked(state, "jt-redeem", `JT redeem blocked: coverage requirement would break (utilization ${(U * 100).toFixed(1)}% > 100%).`);
  state.jtRawNAV -= redemptionNAV;
  state.jtEffectiveNAV -= redemptionNAV;
  state.jtShares -= shares;
  // exiting JT realizes its proportional share of coverage IL & forfeits recovery optionality
  if (state.jtImpermanentLoss > dust) state.jtImpermanentLoss *= 1 - frac;
  return { ok: true, events: [{ t: state.t, kind: "jt-redeem", msg: `JT redeem ${shares.toFixed(2)} shares → ${fmt(redemptionNAV)}.`, level: "info" }] };
}

// LT deposit: add BPT worth `amountNAV`, split into the pool at current ratio.
// Spec: "Deposits are enabled at all times."
export function ltDeposit(state: LiveState, cfg: MarketConfig, amountNAV: number): OpResult {
  const price = ltPrice(state, cfg);
  const shares = amountNAV / price;
  // Size the proportional add by the manipulation-resistant ORACLE NAV, not spot
  // reserves. Shares are minted at the oracle ltPrice; scaling reserves by the same
  // valuation (k = amountNAV / ltRawNAV) makes the added oracle NAV exactly amountNAV,
  // so ltPrice is invariant across deposits at ANY composition. Using spot poolValue()
  // here would transfer value between LT cohorts whenever the pool is off-peg.
  const pv = ltRawNAV(state, cfg);
  if (pv <= cfg.dustTolerance) {
    // bootstrap pool at the target peg composition (10% ST / 90% stable)
    state.pool.stShares += (amountNAV * LT_WEIGHT) / stPrice(state);
    state.pool.stable += amountNAV * (1 - LT_WEIGHT);
  } else {
    const k = amountNAV / pv; // proportional add keeps composition
    state.pool.stShares += state.pool.stShares * k;
    state.pool.stable += state.pool.stable * k;
  }
  state.ltShares += shares;
  return { ok: true, events: [{ t: state.t, kind: "lt-deposit", msg: `LT deposit ${fmt(amountNAV)} BPT → ${shares.toFixed(2)} shares.`, level: "info" }] };
}

// LT redeem (Day spec): enabled ONLY in PERPETUAL state AND only if
// liquidityUtilization <= 100% AFTER the redemption. Both conditions are enforced
// pre-op (state untouched on a block), so the "minimum secondary liquidity at all
// times" guarantee (product requirement 2) cannot be breached on exit. Proceeds are
// valued via the manipulation-resistant oracle (LT_RAW_NAV), matching the share price.
export function ltRedeem(state: LiveState, cfg: MarketConfig, shares: number, bypass = false): OpResult {
  const dust = cfg.dustTolerance;
  if (state.marketState !== MarketState.PERPETUAL)
    return blocked(state, "lt-redeem", "LT redeem blocked: only enabled in PERPETUAL (per spec).");
  if (shares > state.ltShares + dust) shares = state.ltShares;
  const frac = shares / state.ltShares;
  // Post-redeem liquidity utilization via the oracle on the post-redeem balances
  // (stEffectiveNAV is unchanged by an LT redeem). Block if it would breach 100%.
  const poolAfter = { stShares: state.pool.stShares * (1 - frac), stable: state.pool.stable * (1 - frac) };
  const ltRawAfter = ltRawNAV({ ...state, pool: poolAfter }, cfg);
  const LuAfter = liquidityUtilization(state.stEffectiveNAV, cfg.minLiquidity, ltRawAfter);
  if (LuAfter > 1 + 1e-12 && !bypass)
    return blocked(state, "lt-redeem", `LT redeem blocked: secondary liquidity would fall below minimum (liqUtil ${(LuAfter * 100).toFixed(0)}% > 100% after redemption).`);
  const bptOut = frac * ltRawNAV(state, cfg); // oracle-valued proceeds (matches ltPrice)
  const premOut = frac * state.accruedLiquidityPremium;
  state.pool.stShares = poolAfter.stShares;
  state.pool.stable = poolAfter.stable;
  state.accruedLiquidityPremium *= (1 - frac);
  state.ltShares -= shares;
  return { ok: true, events: [{ t: state.t, kind: "lt-redeem", msg: `LT redeem ${shares.toFixed(2)} shares → ${fmt(bptOut)} BPT + ${fmt(premOut)} premium (liqUtil ${(LuAfter * 100).toFixed(0)}% after).`, level: "info" }] };
}

// Secondary sale: an ST holder exits by selling ST shares into the BPT instead of
// primary redemption (the intended FIXED_TERM exit). This IS a swap, so it follows
// the E-CLP curve and conserves the invariant — the seller bears slippage that
// grows as the pool drains, and once the stable inventory is gone the rest cannot
// fill (band floor). The pool fills with ST shares (wrong-way risk); when ST is
// later impaired, the now-ST-heavy BPT loses far more than a balanced pool would.
// ST tranche NAVs are untouched — the shares just move into the LT-held pool.
export function secondarySell(state: LiveState, cfg: MarketConfig, sellNAV: number): OpResult {
  const px = stPrice(state);
  const X = state.pool.stShares * px; // ST leg NAV
  const Y = state.pool.stable; // stable leg NAV
  if (Y <= cfg.dustTolerance) return blocked(state, "secondary-sell", "Pool stablecoin exhausted — secondary exit liquidity is zero.");
  const p = eclpParamsFor(cfg);
  const { stableOut, filled } = eclpSellValue(p, X, Y, sellNAV);
  const unfilled = sellNAV - filled;
  const slip = filled > 0 ? 1 - stableOut / filled : 1;
  state.pool.stShares += filled / px; // pool absorbs the ST it bought...
  state.pool.stable -= stableOut; // ...and pays out the stable, along the curve
  const events: SimEvent[] = [
    { t: state.t, kind: "secondary-sell", msg: `Secondary sell ${fmt(filled)} ST → ${fmt(stableOut)} stable (${(slip * 100).toFixed(1)}% slippage). Pool now ${(poolPctST(state) * 100).toFixed(0)}% ST.`, level: slip > 0.05 ? "danger" : "info" },
  ];
  if (unfilled > cfg.dustTolerance) events.push({ t: state.t, kind: "secondary-sell", msg: `${fmt(unfilled)} of the sell could NOT fill — stable depleted, BPT is all-ST. Remaining sellers are stuck at primary redemption (blocked in FIXED_TERM).`, level: "danger" });
  return { ok: true, events };
}

export function poolPctST(state: LiveState): number {
  const pv = poolValue(state);
  if (pv <= 0) return 0;
  return (state.pool.stShares * stPrice(state)) / pv;
}

// ---------------------------------------------------------------------------
// Pool carry: swap fees + stable-leg yield accrue to the pool each step.
// ---------------------------------------------------------------------------
export function accruePoolCarry(state: LiveState, cfg: MarketConfig, dtSec: number) {
  const yrs = dtSec / YEAR_SEC;
  // swap yield = fee × volume   (volume = turnover × pool value)
  const swapAPY = (cfg.poolTurnoverPerYear * cfg.swapFeeBps) / 10000;
  const swapIncome = poolValue(state) * swapAPY * yrs;
  // T-bill rate on the stable leg
  const stableIncome = state.pool.stable * cfg.stableYield * yrs;
  state.pool.stable += swapIncome + stableIncome; // realized into the stable leg
}

// ---------------------------------------------------------------------------
// Snapshot + conservation check
// ---------------------------------------------------------------------------
export function conservationResidual(state: LiveState, protocolFeeNAV: number): number {
  return state.stRawNAV + state.jtRawNAV - (state.stEffectiveNAV + state.jtEffectiveNAV + state.accruedLiquidityPremium + protocolFeeNAV);
}

export function snapshot(state: LiveState, cfg: MarketConfig, protocolFeeNAV: number, riskShare: number, liqShare: number): Snapshot {
  const rawLT = ltRawNAV(state, cfg); // manipulation-resistant BPT value (EclpLPOracle)
  const spotLT = poolValue(state); // naive spot value of reserves (for divergence)
  const U = utilization(state.stRawNAV, state.jtRawNAV, cfg.beta, cfg.coverage, state.jtEffectiveNAV);
  const Lu = liquidityUtilization(state.stEffectiveNAV, cfg.minLiquidity, rawLT); // spec: LT_RAW_NAV
  return {
    t: state.t,
    state: state.marketState,
    fixedTermRemaining: Math.max(0, state.fixedTermEndSec - state.t),
    stRawNAV: state.stRawNAV,
    jtRawNAV: state.jtRawNAV,
    stEffectiveNAV: state.stEffectiveNAV,
    jtEffectiveNAV: state.jtEffectiveNAV,
    ltNAV: rawLT + state.accruedLiquidityPremium,
    ltRawNAV: rawLT,
    poolValue: spotLT,
    accruedLiquidityPremium: state.accruedLiquidityPremium,
    stIL: state.stImpermanentLoss,
    jtIL: state.jtImpermanentLoss,
    utilization: U,
    liquidityUtilization: Lu,
    coverageOK: U <= 1 + 1e-9,
    stPrice: stPrice(state),
    jtPrice: jtPrice(state),
    ltPrice: ltPrice(state, cfg),
    riskShare,
    liqShare,
    poolPctST: poolPctST(state),
    conservationResidual: conservationResidual(state, protocolFeeNAV),
  };
}

// ---------------------------------------------------------------------------
// Bootstrap a fresh market with initial deposits.
// ---------------------------------------------------------------------------
export function newMarket(cfg: MarketConfig, init: { st: number; jt: number; lt: number }): LiveState {
  const state: LiveState = {
    t: 0,
    marketState: MarketState.PERPETUAL,
    fixedTermEndSec: 0,
    stRawNAV: 0,
    jtRawNAV: 0,
    stEffectiveNAV: 0,
    jtEffectiveNAV: 0,
    stImpermanentLoss: 0,
    jtImpermanentLoss: 0,
    stShares: 0,
    jtShares: 0,
    ltShares: 0,
    pool: { stShares: 0, stable: 0 },
    accruedLiquidityPremium: 0,
    riskYTarget: cfg.riskYDM.yTarget,
    liqYTarget: cfg.liqYDM.yTarget,
    lastYDMUpdateSec: 0,
  };
  // JT first (so coverage is available), then ST, then LT.
  jtDeposit(state, cfg, init.jt);
  stDeposit(state, cfg, init.st);
  ltDeposit(state, cfg, init.lt);
  return state;
}

const fmt = (x: number) => "$" + (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(2) + "M" : Math.abs(x) >= 1e3 ? (x / 1e3).toFixed(1) + "k" : x.toFixed(0));
