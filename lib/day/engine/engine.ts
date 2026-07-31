// =============================================================================
// Royco Day — WAD-precise simulation engine
// -----------------------------------------------------------------------------
// Senior/Junior accounting, utilization, premiums, fees, share conversion, and
// kernel operation gates use 18-decimal bigint arithmetic with explicit
// Solidity rounding. The ECLP invariant is an off-chain venue model; its
// floating-point result is quantized to WAD before it enters accountant state.
// =============================================================================

import {
  MarketState,
  type EventKind,
  type LiveState,
  type MarketConfig,
  type PublicLiveState,
  type SecondaryExitQuote,
  type SimEvent,
  type Snapshot,
  type YDMConfig,
} from './types';
import { adaptYTargetWithAverage, YEAR_SEC } from './ydm';
import {
  Rounding,
  UINT256_MAX,
  WAD,
  fromWad,
  minWad,
  mulDiv,
  saturatingSub,
  signedMulDiv,
  toWad,
} from './wad';
import {
  type EclpParams,
  eclpInvariant,
  eclpParamsForWeight,
  eclpSellValue,
  eclpTVL,
} from './eclp';

const LT_LAMBDA = 1;
const LT_WEIGHT_WAD = toWad('0.1');
const ONE_NAV_WEI = 1n;
// Equivalent to the contract's finite dilution protection for a wiped tranche.
const MAX_MINT_DILUTION_WAD = WAD - 1_000_000n;

const dustWad = (cfg: MarketConfig) => toWad(cfg.dustTolerance);
const asSeconds = (value: number) => BigInt(Math.round(value));
const fmt = (value: bigint) => {
  const x = fromWad(value);
  return '$' + (Math.abs(x) >= 1e6
    ? `${(x / 1e6).toFixed(2)}M`
    : Math.abs(x) >= 1e3
      ? `${(x / 1e3).toFixed(1)}k`
      : x.toFixed(0));
};

// ---------------------------------------------------------------------------
// Utilization (ceil rounding favors Senior, matching UtilizationLogic.sol)
// ---------------------------------------------------------------------------

export function coverageUtilizationWad(
  stRaw: bigint,
  jtRaw: bigint,
  beta: number,
  coverageWad: bigint,
  jtEffective: bigint,
): bigint {
  if (coverageWad === 0n) return 0n;
  const exposure = stRaw + mulDiv(jtRaw, toWad(beta), WAD);
  if (exposure === 0n) return 0n;
  if (jtEffective === 0n) return UINT256_MAX;
  return mulDiv(exposure, coverageWad, jtEffective, Rounding.Ceil);
}

export function liquidityUtilizationWad(
  stEffective: bigint,
  minLiquidityWad: bigint,
  liquidityRawNAV: bigint,
): bigint {
  if (stEffective === 0n || minLiquidityWad === 0n) return 0n;
  if (liquidityRawNAV === 0n) return UINT256_MAX;
  return mulDiv(stEffective, minLiquidityWad, liquidityRawNAV, Rounding.Ceil);
}

const utilizationNumber = (value: bigint) => value === UINT256_MAX ? Infinity : fromWad(value);

export function utilization(
  stRaw: number,
  jtRaw: number,
  beta: number,
  coverage: number,
  jtEffective: number,
): number {
  return utilizationNumber(coverageUtilizationWad(
    toWad(stRaw),
    toWad(jtRaw),
    beta,
    toWad(coverage),
    toWad(jtEffective),
  ));
}

export function liquidityUtilization(
  stEffective: number,
  minLiquidity: number,
  liquidityRawNAV: number,
): number {
  return utilizationNumber(liquidityUtilizationWad(
    toWad(stEffective),
    toWad(minLiquidity),
    toWad(liquidityRawNAV),
  ));
}

// ---------------------------------------------------------------------------
// ECLP venue valuation. This is not part of RoycoDayAccountant Solidity math.
// ---------------------------------------------------------------------------

let eclpCache: { key: string; params: EclpParams } | null = null;
function eclpParamsFor(cfg: MarketConfig): EclpParams {
  const key = `${LT_LAMBDA}|${cfg.eclpBandWidth}`;
  if (!eclpCache || eclpCache.key !== key) {
    eclpCache = {
      key,
      params: eclpParamsForWeight(0.1, LT_LAMBDA, cfg.eclpBandWidth),
    };
  }
  return eclpCache.params;
}

export const stPriceWad = (state: LiveState): bigint => state.stShares > 0n
  ? mulDiv(state.stEffectiveNAV, WAD, state.stShares)
  : WAD;
export const jtPriceWad = (state: LiveState): bigint => state.jtShares > 0n
  ? mulDiv(state.jtEffectiveNAV, WAD, state.jtShares)
  : WAD;

export const poolValueWad = (state: LiveState): bigint =>
  mulDiv(state.pool.stShares, stPriceWad(state), WAD) + state.pool.stable;

export function ltRawNAVWad(state: LiveState, cfg: MarketConfig): bigint {
  const seniorLeg = fromWad(mulDiv(state.pool.stShares, stPriceWad(state), WAD));
  const stableLeg = fromWad(state.pool.stable);
  if (seniorLeg <= 0 && stableLeg <= 0) return 0n;
  const params = eclpParamsFor(cfg);
  return toWad(eclpTVL(params, eclpInvariant(params, seniorLeg, stableLeg), 1, 1));
}

export const ltOwnedSTValueWad = (state: LiveState): bigint =>
  mulDiv(state.ltOwnedSTShares, stPriceWad(state), WAD);
export const ltEffectiveNAVWad = (state: LiveState, cfg: MarketConfig): bigint =>
  ltRawNAVWad(state, cfg) + ltOwnedSTValueWad(state);
export const ltPriceWad = (state: LiveState, cfg: MarketConfig): bigint => state.ltShares > 0n
  ? mulDiv(ltEffectiveNAVWad(state, cfg), WAD, state.ltShares)
  : WAD;

export const stPrice = (state: LiveState) => fromWad(stPriceWad(state));
export const jtPrice = (state: LiveState) => fromWad(jtPriceWad(state));
export const poolValue = (state: LiveState) => fromWad(poolValueWad(state));
export const ltRawNAV = (state: LiveState, cfg: MarketConfig) => fromWad(ltRawNAVWad(state, cfg));
export const ltPrice = (state: LiveState, cfg: MarketConfig) => fromWad(ltPriceWad(state, cfg));

// ---------------------------------------------------------------------------
// Exact share conversion and ST/JT claim decomposition
// ---------------------------------------------------------------------------

export function sharesForValueWad(
  value: bigint,
  totalValue: bigint,
  totalSupply: bigint,
): bigint {
  if (value <= 0n) return 0n;
  if (totalSupply <= 0n) return value;
  const denominator = totalValue > 0n ? totalValue : ONE_NAV_WEI;
  const fairShares = mulDiv(totalSupply, value, denominator);
  const cap = mulDiv(totalSupply, MAX_MINT_DILUTION_WAD, WAD - MAX_MINT_DILUTION_WAD);
  return minWad(fairShares, cap);
}

export function sharesForValue(value: number, totalValue: number, totalSupply: number): number {
  return fromWad(sharesForValueWad(toWad(value), toWad(totalValue), toWad(totalSupply)));
}

export interface RawNAVClaimsWad {
  stClaimOnST: bigint;
  stClaimOnJT: bigint;
  jtClaimOnST: bigint;
  jtClaimOnJT: bigint;
}

export function rawNAVClaimsWad(
  stRaw: bigint,
  jtRaw: bigint,
  stEffective: bigint,
  jtEffective: bigint,
): RawNAVClaimsWad {
  const stClaimOnJT = saturatingSub(stEffective, stRaw);
  const jtClaimOnST = saturatingSub(jtEffective, jtRaw);
  return {
    stClaimOnST: saturatingSub(stRaw, jtClaimOnST),
    stClaimOnJT,
    jtClaimOnST,
    jtClaimOnJT: saturatingSub(jtRaw, stClaimOnJT),
  };
}

// ---------------------------------------------------------------------------
// YDM evaluation. Static curves are wei-exact. Adaptive target evolution uses
// the existing exponential off-chain model and quantizes its result to WAD.
// ---------------------------------------------------------------------------

export function ydmShareWad(
  cfg: YDMConfig,
  liveTarget: bigint,
  utilizationWad: bigint,
  targetUtilizationWad: bigint,
): bigint {
  const utilization = minWad(utilizationWad, WAD);
  const configuredTarget = toWad(cfg.yTarget);
  const lowerSpread = configuredTarget - toWad(cfg.y0);
  const upperSpread = toWad(cfg.y100) - configuredTarget;
  const y0 = saturatingSub(liveTarget, lowerSpread);
  const y100 = minWad(WAD, liveTarget + upperSpread);
  if (utilization < targetUtilizationWad) {
    const slope = mulDiv(liveTarget - y0, WAD, targetUtilizationWad);
    return y0 + mulDiv(slope, utilization, WAD);
  }
  const denominator = WAD - targetUtilizationWad;
  if (denominator === 0n) return liveTarget;
  const slope = mulDiv(y100 - liveTarget, WAD, denominator);
  return liveTarget + mulDiv(slope, utilization - targetUtilizationWad, WAD);
}

function adaptTarget(
  cfg: YDMConfig,
  current: bigint,
  utilizationWad: bigint,
  elapsed: bigint,
  targetUtilization: number,
): { next: bigint; average: bigint } {
  const result = adaptYTargetWithAverage(
    cfg,
    fromWad(current),
    utilizationNumber(utilizationWad),
    Number(elapsed),
    targetUtilization,
  );
  return { next: toWad(result.next), average: toWad(result.average) };
}

export interface ReconcileExtras {
  protocolFeeNAVAdded: number;
  riskShare: number;
  liqShare: number;
  contractValues: {
    liquidityPremium: bigint;
    stProtocolFee: bigint;
    jtProtocolFee: bigint;
    ltProtocolFee: bigint;
  };
  events: SimEvent[];
}

export function reconcile(
  state: LiveState,
  cfg: MarketConfig,
  newStRaw: bigint,
  newJtRaw: bigint,
): ReconcileExtras {
  const dust = dustWad(cfg);
  const events: SimEvent[] = [];
  const push = (
    kind: EventKind,
    msg: string,
    level: SimEvent['level'],
    amount?: bigint,
    observationExitReason?: SimEvent['observationExitReason'],
  ) => {
    events.push({
      t: Number(state.t),
      kind,
      msg,
      level,
      ...(amount === undefined ? {} : { amountNAV: fromWad(amount) }),
      ...(observationExitReason === undefined ? {} : { observationExitReason }),
    });
  };
  const initialState = state.marketState;
  const oldStRaw = state.stRawNAV;
  const oldJtRaw = state.jtRawNAV;
  const oldStEffective = state.stEffectiveNAV;
  const oldJtEffective = state.jtEffectiveNAV;
  const claims = rawNAVClaimsWad(oldStRaw, oldJtRaw, oldStEffective, oldJtEffective);
  const deltaStRaw = newStRaw - oldStRaw;
  const deltaJtRaw = newJtRaw - oldJtRaw;
  const deltaStOnSt = oldStRaw === 0n
    ? (oldStEffective > 0n ? deltaStRaw : 0n)
    : signedMulDiv(deltaStRaw, claims.stClaimOnST, oldStRaw);
  const deltaStOnJt = oldJtRaw === 0n
    ? 0n
    : signedMulDiv(deltaJtRaw, claims.stClaimOnJT, oldJtRaw);
  const deltaStEffective = deltaStOnSt + deltaStOnJt;
  const deltaJtEffective = deltaStRaw + deltaJtRaw - deltaStEffective;

  const coverageWad = toWad(cfg.coverage);
  const minLiquidityWad = toWad(cfg.minLiquidity);
  const targetUtilWad = toWad(cfg.targetUtilization);
  const liquidityTargetWad = toWad(cfg.liqTargetUtilization);
  const preCoverage = coverageUtilizationWad(
    oldStRaw,
    oldJtRaw,
    cfg.beta,
    coverageWad,
    oldJtEffective,
  );
  const preLiquidity = liquidityUtilizationWad(
    oldStEffective,
    minLiquidityWad,
    ltRawNAVWad(state, cfg),
  );
  const elapsed = state.t > state.lastYDMUpdateSec ? state.t - state.lastYDMUpdateSec : 0n;
  let riskTargetForAccrual = state.riskYTarget;
  let liquidityTargetForAccrual = state.liqYTarget;
  if (state.yieldShareAccrualInitialized) {
    if (initialState === MarketState.PERPETUAL && elapsed > 0n) {
      const riskAdaptation = adaptTarget(
        cfg.riskYDM,
        state.riskYTarget,
        preCoverage,
        elapsed,
        cfg.targetUtilization,
      );
      const liquidityAdaptation = adaptTarget(
        cfg.liqYDM,
        state.liqYTarget,
        preLiquidity,
        elapsed,
        cfg.liqTargetUtilization,
      );
      state.riskYTarget = riskAdaptation.next;
      state.liqYTarget = liquidityAdaptation.next;
      riskTargetForAccrual = riskAdaptation.average;
      liquidityTargetForAccrual = liquidityAdaptation.average;
    }
    const currentRiskShare = minWad(
      ydmShareWad(cfg.riskYDM, riskTargetForAccrual, preCoverage, targetUtilWad),
      toWad(cfg.maxJTYieldShare),
    );
    const currentLiquidityShare = minWad(
      ydmShareWad(cfg.liqYDM, liquidityTargetForAccrual, preLiquidity, liquidityTargetWad),
      toWad(cfg.maxLTYieldShare),
    );
    state.twRiskShareSeconds += currentRiskShare * elapsed;
    state.twLiqShareSeconds += currentLiquidityShare * elapsed;
  } else {
    state.yieldShareAccrualInitialized = true;
    state.lastPremiumPaymentSec = state.t;
  }
  state.lastYDMUpdateSec = state.t;

  let stEffective = oldStEffective;
  let jtEffective = oldJtEffective;
  let stImpermanentLoss = state.stImpermanentLoss;
  let jtImpermanentLoss = state.jtImpermanentLoss;
  let jtNetGain = 0n;
  let jtProtocolFee = 0n;
  let stProtocolFee = 0n;
  let ltProtocolFee = 0n;
  let liquidityPremium = 0n;
  let riskShareUsed = 0n;
  let liquidityShareUsed = 0n;
  let premiumsPaid = false;

  if (deltaJtEffective < 0n) {
    jtEffective += deltaJtEffective;
  } else if (deltaJtEffective > 0n) {
    jtNetGain = deltaJtEffective;
    if (jtNetGain > dust) {
      jtProtocolFee = mulDiv(jtNetGain, toWad(cfg.jtProtocolFee), WAD);
    }
    jtEffective += jtNetGain;
  }

  if (deltaStEffective < 0n) {
    let stLoss = -deltaStEffective;
    const coverageApplied = minWad(stLoss, jtEffective);
    if (coverageApplied > 0n) {
      if (jtProtocolFee > 0n) {
        jtNetGain = saturatingSub(jtNetGain, coverageApplied);
        jtProtocolFee = jtNetGain > dust
          ? mulDiv(jtNetGain, toWad(cfg.jtProtocolFee), WAD)
          : 0n;
      }
      jtEffective -= coverageApplied;
      jtImpermanentLoss += coverageApplied;
      stLoss -= coverageApplied;
    }
    if (stLoss > 0n) {
      stEffective -= stLoss;
      stImpermanentLoss += stLoss;
    }
  } else if (deltaStEffective > 0n) {
    let stGain = deltaStEffective;
    const recovery = minWad(stGain, jtImpermanentLoss);
    if (recovery > 0n) {
      jtImpermanentLoss -= recovery;
      jtEffective += recovery;
      stGain -= recovery;
    }
    stImpermanentLoss = saturatingSub(stImpermanentLoss, deltaStEffective);
    if (stGain > 0n) {
      premiumsPaid = stGain > dust;
      let elapsedSincePremium = state.t - state.lastPremiumPaymentSec;
      if (elapsedSincePremium === 0n) elapsedSincePremium = 1n;
      const instantaneousRisk = minWad(
        ydmShareWad(cfg.riskYDM, state.riskYTarget, preCoverage, targetUtilWad),
        toWad(cfg.maxJTYieldShare),
      );
      const instantaneousLiquidity = minWad(
        ydmShareWad(cfg.liqYDM, state.liqYTarget, preLiquidity, liquidityTargetWad),
        toWad(cfg.maxLTYieldShare),
      );
      riskShareUsed = state.twRiskShareSeconds > 0n
        ? state.twRiskShareSeconds / elapsedSincePremium
        : instantaneousRisk;
      liquidityShareUsed = state.twLiqShareSeconds > 0n
        ? state.twLiqShareSeconds / elapsedSincePremium
        : instantaneousLiquidity;
      if (riskShareUsed + liquidityShareUsed > WAD) {
        throw new Error('PREMIUMS_EXCEED_SENIOR_YIELD');
      }
      const juniorPremium = mulDiv(stGain, riskShareUsed, WAD);
      liquidityPremium = mulDiv(stGain, liquidityShareUsed, WAD);
      const retainedSeniorGain = stGain - juniorPremium - liquidityPremium;
      if (juniorPremium > 0n) {
        if (premiumsPaid) {
          jtProtocolFee += mulDiv(juniorPremium, toWad(cfg.yieldShareProtocolFee), WAD);
        }
        jtEffective += juniorPremium;
      }
      if (liquidityPremium > 0n && premiumsPaid) {
        ltProtocolFee = mulDiv(liquidityPremium, toWad(cfg.ltYieldShareProtocolFee), WAD);
      }
      if (premiumsPaid) {
        stProtocolFee = mulDiv(retainedSeniorGain, toWad(cfg.stProtocolFee), WAD);
      }
      // LT premium remains in ST effective NAV; ownership moves by minting ST shares.
      stEffective += retainedSeniorGain + liquidityPremium;
    }
  }

  if (newStRaw + newJtRaw !== stEffective + jtEffective) {
    throw new Error('NAV_CONSERVATION_VIOLATION');
  }

  const coverageAfter = coverageUtilizationWad(
    newStRaw,
    newJtRaw,
    cfg.beta,
    coverageWad,
    jtEffective,
  );
  const expired = initialState === MarketState.FIXED_TERM && state.fixedTermEndSec <= state.t;
  const breached = coverageAfter >= toWad(cfg.liquidationUtilization);
  const undercollateralized = jtEffective === 0n && stEffective > 0n;
  let nextState: MarketState;
  let erased = 0n;
  if (cfg.fixedTermDurationSec === 0 || expired || breached || undercollateralized) {
    erased = jtImpermanentLoss;
    jtImpermanentLoss = 0n;
    nextState = MarketState.PERPETUAL;
    state.fixedTermEndSec = 0n;
  } else if (jtImpermanentLoss <= dust) {
    if (initialState === MarketState.PERPETUAL || jtImpermanentLoss === 0n) {
      nextState = MarketState.PERPETUAL;
      state.fixedTermEndSec = 0n;
    } else {
      nextState = MarketState.FIXED_TERM;
      liquidityPremium = 0n;
      stProtocolFee = 0n;
      jtProtocolFee = 0n;
      ltProtocolFee = 0n;
    }
  } else {
    nextState = MarketState.FIXED_TERM;
    liquidityPremium = 0n;
    stProtocolFee = 0n;
    jtProtocolFee = 0n;
    ltProtocolFee = 0n;
    if (initialState === MarketState.PERPETUAL) {
      state.fixedTermEndSec = state.t + asSeconds(cfg.fixedTermDurationSec);
    }
  }

  if (initialState === MarketState.PERPETUAL && nextState === MarketState.FIXED_TERM) {
    push('enter-fixed-term', 'JT covered an ST drawdown — the Observation Period begins. Primary ST redemption pauses, YDM freezes, and secondary ST sales through SLP remain available.', 'warn');
  }
  if (initialState === MarketState.FIXED_TERM && nextState === MarketState.PERPETUAL) {
    if (erased > dust) {
      push(
        'exit-fixed-term',
        `Observation Period closes without full recovery (${expired ? 'period ended' : breached ? 'Protected Exit threshold breached' : 'ST impairment'}) — the JT recovery claim resets.`,
        'danger',
        undefined,
        expired ? 'period-ended' : breached ? 'protected-exit' : 'st-impairment',
      );
    } else {
      push(
        'exit-fixed-term',
        'Strategy base asset fully recovered — the Observation Period closes and JT is made whole.',
        'good',
        undefined,
        'recovered',
      );
    }
  }
  if (erased > dust) {
    push('jt-il-erased', `JT recovery claim reset: ${fmt(erased)} finalized as a JT loss.`, 'danger', erased);
  }

  let feeNAV = 0n;
  if (nextState === MarketState.PERPETUAL) {
    const preMintSeniorSupply = state.stShares;
    const retainedSeniorNAV = saturatingSub(stEffective, liquidityPremium + stProtocolFee);
    const premiumShares = sharesForValueWad(liquidityPremium, retainedSeniorNAV, preMintSeniorSupply);
    const seniorFeeShares = sharesForValueWad(stProtocolFee, retainedSeniorNAV, preMintSeniorSupply);
    state.stShares += premiumShares + seniorFeeShares;
    state.protocolSTShares += seniorFeeShares;

    // FeeAndLiquidityPremiumLogic attempts to reinvest the full premium. The
    // market config chooses the deterministic outcome of that contract call;
    // it does not choose or freeze the venue's variable yield/volume economics.
    if (cfg.reinvestLiquidityPremium) state.pool.stShares += premiumShares;
    else state.ltOwnedSTShares += premiumShares;

    const juniorFeeShares = sharesForValueWad(
      jtProtocolFee,
      saturatingSub(jtEffective, jtProtocolFee),
      state.jtShares,
    );
    state.jtShares += juniorFeeShares;
    state.protocolJTShares += juniorFeeShares;

    // Fee shares price against LT effective NAV after the premium reinvestment.
    state.stRawNAV = newStRaw;
    state.jtRawNAV = newJtRaw;
    state.stEffectiveNAV = stEffective;
    state.jtEffectiveNAV = jtEffective;
    const ltNAVBeforeFeeMint = ltEffectiveNAVWad(state, cfg);
    const liquidityFeeShares = sharesForValueWad(
      ltProtocolFee,
      saturatingSub(ltNAVBeforeFeeMint, ltProtocolFee),
      state.ltShares,
    );
    state.ltShares += liquidityFeeShares;
    state.protocolLTShares += liquidityFeeShares;
    feeNAV = stProtocolFee + jtProtocolFee + ltProtocolFee;
  }

  if (premiumsPaid) {
    state.twRiskShareSeconds = 0n;
    state.twLiqShareSeconds = 0n;
    state.lastPremiumPaymentSec = state.t;
  }
  state.stRawNAV = newStRaw;
  state.jtRawNAV = newJtRaw;
  state.stEffectiveNAV = stEffective;
  state.jtEffectiveNAV = jtEffective;
  state.stImpermanentLoss = stImpermanentLoss;
  state.jtImpermanentLoss = jtImpermanentLoss;
  state.marketState = nextState;

  return {
    protocolFeeNAVAdded: fromWad(feeNAV),
    riskShare: fromWad(riskShareUsed),
    liqShare: fromWad(liquidityShareUsed),
    contractValues: {
      liquidityPremium,
      stProtocolFee,
      jtProtocolFee,
      ltProtocolFee,
    },
    events,
  };
}

export type ContractOperation =
  | 'ST_DEPOSIT'
  | 'ST_REDEEM'
  | 'JT_DEPOSIT'
  | 'JT_REDEEM'
  | 'LT_DEPOSIT'
  | 'LT_REDEEM';

export interface PostOpAccountingResult {
  stRaw: bigint;
  jtRaw: bigint;
  ltRaw: bigint;
  stEffective: bigint;
  jtEffective: bigint;
  jtIL: bigint;
  coverageUtilWAD: bigint;
  liquidityUtilWAD: bigint;
}

/** Wei-exact mirror of RoycoDayAccountant.postOpSyncTrancheAccounting. */
export function postOpAccountingWad(
  state: Pick<LiveState, 'stRawNAV' | 'jtRawNAV' | 'stEffectiveNAV' | 'jtEffectiveNAV' | 'jtImpermanentLoss'>,
  cfg: Pick<MarketConfig, 'beta' | 'coverage' | 'minLiquidity'>,
  input: {
    operation: ContractOperation;
    stRaw: bigint;
    jtRaw: bigint;
    ltRaw: bigint;
    previousLTRaw: bigint;
    bonus: bigint;
    enforce: boolean;
  },
): PostOpAccountingResult {
  const deltaST = input.stRaw - state.stRawNAV;
  const deltaJT = input.jtRaw - state.jtRawNAV;
  const deltaLT = input.ltRaw - input.previousLTRaw;
  let stEffective = state.stEffectiveNAV;
  let jtEffective = state.jtEffectiveNAV;
  let jtIL = state.jtImpermanentLoss;
  const invalid = (): never => { throw new Error('INVALID_POST_OP_STATE'); };

  if (input.operation === 'ST_DEPOSIT') {
    if (deltaST <= 0n || deltaJT !== 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
    stEffective += deltaST;
  } else if (input.operation === 'JT_DEPOSIT') {
    if (deltaJT <= 0n || deltaST !== 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
    jtEffective += deltaJT;
  } else if (input.operation === 'LT_DEPOSIT') {
    if (deltaLT <= 0n || deltaST < 0n || deltaJT !== 0n || input.bonus !== 0n) invalid();
    stEffective += deltaST;
  } else {
    if (deltaST > 0n || deltaJT > 0n) invalid();
    const totalRedemption = -deltaST + -deltaJT;
    if (input.operation === 'ST_REDEEM' || input.operation === 'LT_REDEEM') {
      if (input.operation === 'LT_REDEEM') {
        if (deltaLT > 0n) invalid();
      } else if (deltaLT !== 0n || totalRedemption <= 0n) invalid();
      if (input.bonus > jtEffective || totalRedemption < input.bonus) invalid();
      jtEffective -= input.bonus;
      stEffective -= totalRedemption - input.bonus;
    } else {
      if (deltaLT !== 0n || totalRedemption <= 0n || input.bonus !== 0n) invalid();
      const oldJTEffective = jtEffective;
      jtEffective -= totalRedemption;
      if (jtIL !== 0n) jtIL = mulDiv(jtIL, jtEffective, oldJTEffective);
    }
  }

  if (input.stRaw + input.jtRaw !== stEffective + jtEffective) {
    throw new Error('NAV_CONSERVATION_VIOLATION');
  }
  const coverageUtilWAD = coverageUtilizationWad(
    input.stRaw,
    input.jtRaw,
    cfg.beta,
    toWad(cfg.coverage),
    jtEffective,
  );
  const liquidityUtilWAD = liquidityUtilizationWad(
    stEffective,
    toWad(cfg.minLiquidity),
    input.ltRaw,
  );
  if (input.enforce) {
    if (
      (input.operation === 'ST_DEPOSIT' || input.operation === 'LT_DEPOSIT' || input.operation === 'JT_REDEEM') &&
      coverageUtilWAD > WAD
    ) throw new Error('COVERAGE_REQUIREMENT_VIOLATED');
    if (
      (input.operation === 'ST_DEPOSIT' || input.operation === 'LT_DEPOSIT' || input.operation === 'LT_REDEEM') &&
      liquidityUtilWAD > WAD
    ) throw new Error('LIQUIDITY_REQUIREMENT_VIOLATED');
  }
  return {
    stRaw: input.stRaw,
    jtRaw: input.jtRaw,
    ltRaw: input.ltRaw,
    stEffective,
    jtEffective,
    jtIL,
    coverageUtilWAD,
    liquidityUtilWAD,
  };
}

export interface SelfLiquidationWadInput {
  bonusWAD: bigint;
  stRaw: bigint;
  jtRaw: bigint;
  stEffective: bigint;
  jtEffective: bigint;
  coverageUtilWAD: bigint;
  liquidationUtilWAD: bigint;
  jtCoinvested: boolean;
  claimST: bigint;
  claimJT: bigint;
  claimNAV: bigint;
}

/** Wei-exact mirror of SelfLiquidationLogic for a precomputed Senior claim. */
export function selfLiquidationClaimWad(input: SelfLiquidationWadInput): {
  bonus: bigint;
  claimST: bigint;
  claimJT: bigint;
  claimNAV: bigint;
} {
  if (input.coverageUtilWAD < input.liquidationUtilWAD || input.jtEffective === 0n) {
    return { bonus: 0n, claimST: input.claimST, claimJT: input.claimJT, claimNAV: input.claimNAV };
  }
  const desired = mulDiv(input.claimNAV, input.bonusWAD, WAD);
  const jtClaimOnST = saturatingSub(input.jtEffective, input.jtRaw);
  const covered = input.stRaw + (input.jtCoinvested ? input.jtRaw : 0n);
  const weightedClaim = input.claimST + (input.jtCoinvested ? input.claimJT : 0n);
  if (weightedClaim === 0n) {
    return { bonus: 0n, claimST: input.claimST, claimJT: input.claimJT, claimNAV: input.claimNAV };
  }
  const firstMax = mulDiv(weightedClaim, input.jtEffective, covered - input.jtEffective);
  const utilizationNeutralMax = firstMax <= jtClaimOnST
    ? firstMax
    : mulDiv(
        weightedClaim + (input.jtCoinvested ? 0n : jtClaimOnST),
        input.jtEffective,
        covered - (input.jtCoinvested ? input.jtEffective : 0n),
      );
  const bonus = minWad(desired, minWad(input.jtEffective, utilizationNeutralMax));
  const fromST = minWad(bonus, jtClaimOnST);
  return {
    bonus,
    claimST: input.claimST + fromST,
    claimJT: input.claimJT + bonus - fromST,
    claimNAV: input.claimNAV + bonus,
  };
}

// ---------------------------------------------------------------------------
// Kernel operations
// ---------------------------------------------------------------------------

export interface OpResult { ok: boolean; events: SimEvent[] }

function blocked(state: LiveState, msg: string): OpResult {
  return { ok: false, events: [{ t: Number(state.t), kind: 'blocked', msg, level: 'warn' }] };
}

export function stDeposit(state: LiveState, cfg: MarketConfig, amount: number): OpResult {
  const amountWad = toWad(amount);
  if (state.marketState !== MarketState.PERPETUAL) return blocked(state, 'ST deposit blocked: only enabled in PERPETUAL.');
  if (amountWad <= 0n) return blocked(state, 'ST deposit blocked: amount must be positive.');
  const coverageAfter = coverageUtilizationWad(
    state.stRawNAV + amountWad,
    state.jtRawNAV,
    cfg.beta,
    toWad(cfg.coverage),
    state.jtEffectiveNAV,
  );
  if (coverageAfter > WAD) return blocked(state, `ST deposit blocked: coverage requirement violated (utilization ${(utilizationNumber(coverageAfter) * 100).toFixed(1)}% > 100%). JT buffer too thin.`);
  const liquidityAfter = liquidityUtilizationWad(
    state.stEffectiveNAV + amountWad,
    toWad(cfg.minLiquidity),
    ltRawNAVWad(state, cfg),
  );
  if (liquidityAfter > WAD) return blocked(state, `ST deposit blocked: liquidity requirement violated (utilization ${(utilizationNumber(liquidityAfter) * 100).toFixed(1)}% > 100%).`);
  const shares = sharesForValueWad(amountWad, state.stEffectiveNAV, state.stShares);
  state.stRawNAV += amountWad;
  state.stEffectiveNAV += amountWad;
  state.stShares += shares;
  return { ok: true, events: [{ t: Number(state.t), kind: 'st-deposit', msg: `ST deposit ${fmt(amountWad)} → ${fromWad(shares).toFixed(2)} shares.`, level: 'info' }] };
}

export function jtDeposit(state: LiveState, _cfg: MarketConfig, amount: number): OpResult {
  const amountWad = toWad(amount);
  if (state.marketState !== MarketState.PERPETUAL) return blocked(state, 'JT deposit blocked: only enabled in PERPETUAL (protects existing JT during recovery).');
  if (amountWad <= 0n) return blocked(state, 'JT deposit blocked: amount must be positive.');
  const shares = sharesForValueWad(amountWad, state.jtEffectiveNAV, state.jtShares);
  state.jtRawNAV += amountWad;
  state.jtEffectiveNAV += amountWad;
  state.jtShares += shares;
  return { ok: true, events: [{ t: Number(state.t), kind: 'jt-deposit', msg: `JT deposit ${fmt(amountWad)} → ${fromWad(shares).toFixed(2)} shares.`, level: 'info' }] };
}

export function stRedeem(state: LiveState, cfg: MarketConfig, shareAmount: number, bypass = false): OpResult {
  const dust = dustWad(cfg);
  let shares = toWad(shareAmount);
  if (state.marketState !== MarketState.PERPETUAL && !bypass) return blocked(state, 'Primary ST redemption is paused during the Observation Period; secondary sale through SLP remains available.');
  if (shares <= 0n || state.stShares <= 0n) return blocked(state, 'ST redeem blocked: shares must be positive.');
  if (shares > state.stShares) shares = state.stShares;
  const redemptionNAV = mulDiv(shares, state.stEffectiveNAV, state.stShares);
  const claims = rawNAVClaimsWad(state.stRawNAV, state.jtRawNAV, state.stEffectiveNAV, state.jtEffectiveNAV);
  const baseSTClaim = mulDiv(claims.stClaimOnST, shares, state.stShares);
  const baseJTClaim = mulDiv(claims.stClaimOnJT, shares, state.stShares);
  const coverage = coverageUtilizationWad(state.stRawNAV, state.jtRawNAV, cfg.beta, toWad(cfg.coverage), state.jtEffectiveNAV);
  let bonus = 0n;
  let bonusFromST = 0n;
  let bonusFromJT = 0n;
  if (coverage >= toWad(cfg.liquidationUtilization) && cfg.stSelfLiquidationBonus > 0) {
    const desired = mulDiv(redemptionNAV, toWad(cfg.stSelfLiquidationBonus), WAD);
    const betaWad = toWad(cfg.beta);
    const coveredExposure = state.stRawNAV + mulDiv(state.jtRawNAV, betaWad, WAD);
    const weightedClaim = baseSTClaim + mulDiv(baseJTClaim, betaWad, WAD);
    const caseOneDenominator = saturatingSub(coveredExposure, state.jtEffectiveNAV);
    const caseOneCap = caseOneDenominator > 0n
      ? mulDiv(weightedClaim, state.jtEffectiveNAV, caseOneDenominator)
      : 0n;
    let neutralCap = caseOneCap;
    if (caseOneCap > claims.jtClaimOnST) {
      const adjustedClaim = weightedClaim + (cfg.beta > 0 ? 0n : claims.jtClaimOnST);
      const caseTwoDenominator = saturatingSub(coveredExposure, cfg.beta > 0 ? state.jtEffectiveNAV : 0n);
      neutralCap = caseTwoDenominator > 0n
        ? mulDiv(adjustedClaim, state.jtEffectiveNAV, caseTwoDenominator)
        : 0n;
    }
    bonus = minWad(desired, minWad(state.jtEffectiveNAV, neutralCap));
    bonusFromST = minWad(bonus, claims.jtClaimOnST);
    bonusFromJT = bonus - bonusFromST;
  }
  state.stRawNAV -= baseSTClaim + bonusFromST;
  state.jtRawNAV -= baseJTClaim + bonusFromJT;
  state.stEffectiveNAV -= redemptionNAV;
  state.stShares -= shares;
  if (bonus > 0n) state.jtEffectiveNAV -= bonus;
  if (state.stImpermanentLoss > dust && state.stEffectiveNAV > dust) {
    state.stImpermanentLoss = mulDiv(state.stImpermanentLoss, state.stShares, state.stShares + shares);
  }
  const events: SimEvent[] = [{ t: Number(state.t), kind: 'st-redeem', msg: `ST redeem ${fromWad(shares).toFixed(2)} shares → ${fmt(redemptionNAV + bonus)}.`, level: 'info' }];
  if (bonus > dust) events.push({ t: Number(state.t), kind: 'self-liq-bonus', msg: `Protected Exit bonus ${fmt(bonus)} paid from JT to reduce ST exposure (coverage utilization ${(utilizationNumber(coverage) * 100).toFixed(0)}% exceeded the threshold).`, level: 'warn' });
  return { ok: true, events };
}

export function jtRedeem(state: LiveState, cfg: MarketConfig, shareAmount: number, bypass = false): OpResult {
  let shares = toWad(shareAmount);
  if (state.marketState !== MarketState.PERPETUAL && !bypass) return blocked(state, 'JT redeem blocked: only enabled in PERPETUAL.');
  if (shares <= 0n || state.jtShares <= 0n) return blocked(state, 'JT redeem blocked: shares must be positive.');
  if (shares > state.jtShares) shares = state.jtShares;
  const redemptionNAV = mulDiv(shares, state.jtEffectiveNAV, state.jtShares);
  const claims = rawNAVClaimsWad(state.stRawNAV, state.jtRawNAV, state.stEffectiveNAV, state.jtEffectiveNAV);
  const stClaim = mulDiv(claims.jtClaimOnST, shares, state.jtShares);
  const jtClaim = mulDiv(claims.jtClaimOnJT, shares, state.jtShares);
  const coverageAfter = coverageUtilizationWad(
    state.stRawNAV - stClaim,
    state.jtRawNAV - jtClaim,
    cfg.beta,
    toWad(cfg.coverage),
    state.jtEffectiveNAV - redemptionNAV,
  );
  if (coverageAfter > WAD && !bypass) return blocked(state, `JT redeem blocked: coverage requirement would break (utilization ${(utilizationNumber(coverageAfter) * 100).toFixed(1)}% > 100%).`);
  const oldEffective = state.jtEffectiveNAV;
  state.stRawNAV -= stClaim;
  state.jtRawNAV -= jtClaim;
  state.jtEffectiveNAV -= redemptionNAV;
  state.jtShares -= shares;
  if (state.jtImpermanentLoss > 0n && oldEffective > 0n) {
    state.jtImpermanentLoss = mulDiv(state.jtImpermanentLoss, state.jtEffectiveNAV, oldEffective);
  }
  return { ok: true, events: [{ t: Number(state.t), kind: 'jt-redeem', msg: `JT redeem ${fromWad(shares).toFixed(2)} shares → ${fmt(redemptionNAV)}.`, level: 'info' }] };
}

export function ltDeposit(state: LiveState, cfg: MarketConfig, amount: number): OpResult {
  const amountWad = toWad(amount);
  if (amountWad <= 0n) return blocked(state, 'SLP deposit blocked: amount must be positive.');
  const shares = sharesForValueWad(amountWad, ltEffectiveNAVWad(state, cfg), state.ltShares);
  const rawBefore = ltRawNAVWad(state, cfg);
  if (rawBefore <= dustWad(cfg)) {
    state.pool.stShares += mulDiv(amountWad, LT_WEIGHT_WAD, stPriceWad(state));
    state.pool.stable += mulDiv(amountWad, WAD - LT_WEIGHT_WAD, WAD);
  } else {
    state.pool.stShares += mulDiv(state.pool.stShares, amountWad, rawBefore);
    state.pool.stable += mulDiv(state.pool.stable, amountWad, rawBefore);
  }
  state.ltShares += shares;
  return { ok: true, events: [{ t: Number(state.t), kind: 'lt-deposit', msg: `SLP deposit ${fmt(amountWad)} BPT → ${fromWad(shares).toFixed(2)} shares.`, level: 'info' }] };
}

export function ltRedeem(state: LiveState, cfg: MarketConfig, shareAmount: number, bypass = false): OpResult {
  let shares = toWad(shareAmount);
  if (state.marketState !== MarketState.PERPETUAL) return blocked(state, 'SLP redemption blocked during the Observation Period.');
  if (shares <= 0n || state.ltShares <= 0n) return blocked(state, 'SLP redemption blocked: shares must be positive.');
  if (shares > state.ltShares) shares = state.ltShares;
  const remainingShares = state.ltShares - shares;
  const poolAfter = {
    stShares: mulDiv(state.pool.stShares, remainingShares, state.ltShares),
    stable: mulDiv(state.pool.stable, remainingShares, state.ltShares),
  };
  const rawAfter = ltRawNAVWad({ ...state, pool: poolAfter }, cfg);
  const liquidityAfter = liquidityUtilizationWad(state.stEffectiveNAV, toWad(cfg.minLiquidity), rawAfter);
  const coverage = coverageUtilizationWad(state.stRawNAV, state.jtRawNAV, cfg.beta, toWad(cfg.coverage), state.jtEffectiveNAV);
  const liquidationExemption = coverage >= toWad(cfg.liquidationUtilization);
  if (liquidityAfter > WAD && !liquidationExemption && !bypass) return blocked(state, `SLP redemption blocked: secondary liquidity would fall below minimum (liquidity utilization ${(utilizationNumber(liquidityAfter) * 100).toFixed(0)}% > 100% after redemption).`);
  const bptOut = mulDiv(shares, ltRawNAVWad(state, cfg), state.ltShares);
  const premiumSharesOut = mulDiv(shares, state.ltOwnedSTShares, state.ltShares);
  const premiumValueOut = mulDiv(premiumSharesOut, stPriceWad(state), WAD);
  state.pool = poolAfter;
  state.ltOwnedSTShares -= premiumSharesOut;
  state.ltShares -= shares;
  return { ok: true, events: [{ t: Number(state.t), kind: 'lt-redeem', msg: `SLP redemption ${fromWad(shares).toFixed(2)} shares → ${fmt(bptOut)} BPT + ${fromWad(premiumSharesOut).toFixed(2)} ST shares (${fmt(premiumValueOut)}; liquidity utilization ${(utilizationNumber(liquidityAfter) * 100).toFixed(0)}% after).`, level: 'info' }] };
}

export function secondarySell(state: LiveState, cfg: MarketConfig, amount: number): OpResult {
  if (state.pool.stable <= dustWad(cfg)) return blocked(state, 'Pool stablecoin exhausted — secondary exit liquidity is zero.');
  const quote = previewSecondarySell(state, cfg, amount);
  const priceWad = stPriceWad(state);
  const stableOut = toWad(quote.stableOutNAV);
  const filled = toWad(quote.filledNAV);
  const unfilled = toWad(quote.unfilledNAV);
  state.pool.stShares += mulDiv(filled, WAD, priceWad);
  state.pool.stable = saturatingSub(state.pool.stable, stableOut);
  const events: SimEvent[] = [{ t: Number(state.t), kind: 'secondary-sell', msg: `Secondary sell ${fmt(filled)} ST → ${fmt(stableOut)} stable (${(quote.slippage * 100).toFixed(1)}% slippage). Pool now ${(poolPctST(state) * 100).toFixed(0)}% ST.`, level: quote.slippage > 0.05 ? 'danger' : 'info' }];
  if (unfilled > dustWad(cfg)) events.push({ t: Number(state.t), kind: 'secondary-sell', msg: `${fmt(unfilled)} of the ST sale could not fill — stable assets are depleted and the pool is all-ST. Remaining holders must wait for primary redemption, which is paused during the Observation Period.`, level: 'danger' });
  return { ok: true, events };
}

/**
 * Read-only E-CLP quote used by the simulator UI and tests. The returned WAD-
 * quantized amounts are exactly the values `secondarySell` will apply.
 */
export function previewSecondarySell(
  state: LiveState,
  cfg: MarketConfig,
  amount: number,
): SecondaryExitQuote {
  const requested = toWad(Math.max(0, amount));
  const priceWad = stPriceWad(state);
  if (requested === 0n || priceWad === 0n || state.pool.stable === 0n) {
    return {
      requestedNAV: fromWad(requested),
      filledNAV: 0,
      stableOutNAV: 0,
      unfilledNAV: fromWad(requested),
      executionPrice: 0,
      slippage: 1,
      poolPctSTAfter: poolPctST(state),
    };
  }
  const seniorLeg = mulDiv(state.pool.stShares, priceWad, WAD);
  const params = eclpParamsFor(cfg);
  const rawQuote = eclpSellValue(
    params,
    fromWad(seniorLeg),
    fromWad(state.pool.stable),
    fromWad(requested),
  );
  const stableOut = toWad(rawQuote.stableOut);
  const filled = toWad(rawQuote.filled);
  const unfilled = saturatingSub(requested, filled);
  const poolAfter: LiveState = {
    ...state,
    pool: {
      stShares: state.pool.stShares + mulDiv(filled, WAD, priceWad),
      stable: saturatingSub(state.pool.stable, stableOut),
    },
  };
  return {
    requestedNAV: fromWad(requested),
    filledNAV: fromWad(filled),
    stableOutNAV: fromWad(stableOut),
    unfilledNAV: fromWad(unfilled),
    executionPrice: filled > 0n ? fromWad(stableOut) / fromWad(filled) : 0,
    slippage: filled > 0n ? 1 - fromWad(stableOut) / fromWad(filled) : 1,
    poolPctSTAfter: poolPctST(poolAfter),
  };
}

export function poolPctST(state: LiveState): number {
  const total = poolValueWad(state);
  return total > 0n ? fromWad(mulDiv(mulDiv(state.pool.stShares, stPriceWad(state), WAD), WAD, total)) : 0;
}

export function accruePoolCarry(state: LiveState, cfg: MarketConfig, dtSec: number): void {
  const dt = asSeconds(dtSec);
  if (dt <= 0n) return;
  const swapAPY = toWad((cfg.poolTurnoverPerYear * cfg.swapFeeBps) / 10_000);
  const stableAPY = toWad(cfg.stableYield);
  const swapIncome = mulDiv(mulDiv(poolValueWad(state), swapAPY, WAD), dt, BigInt(YEAR_SEC));
  const stableIncome = mulDiv(mulDiv(state.pool.stable, stableAPY, WAD), dt, BigInt(YEAR_SEC));
  state.pool.stable += swapIncome + stableIncome;
}

// ---------------------------------------------------------------------------
// Number-facing adapters
// ---------------------------------------------------------------------------

export function protocolFeeValue(state: LiveState, cfg: MarketConfig): number {
  return fromWad(
    mulDiv(state.protocolSTShares, stPriceWad(state), WAD) +
    mulDiv(state.protocolJTShares, jtPriceWad(state), WAD) +
    mulDiv(state.protocolLTShares, ltPriceWad(state, cfg), WAD),
  );
}

export const conservationResidualWad = (state: LiveState): bigint =>
  state.stRawNAV + state.jtRawNAV - state.stEffectiveNAV - state.jtEffectiveNAV;
export const conservationResidual = (state: LiveState): number => fromWad(conservationResidualWad(state));

export function snapshot(state: LiveState, cfg: MarketConfig, riskShare: number, liqShare: number): Snapshot {
  const rawLiquidity = ltRawNAVWad(state, cfg);
  const spotLiquidity = poolValueWad(state);
  const premium = ltOwnedSTValueWad(state);
  const poolSenior = mulDiv(state.pool.stShares, stPriceWad(state), WAD);
  const coverageRequired = mulDiv(
    state.stRawNAV + mulDiv(state.jtRawNAV, toWad(cfg.beta), WAD),
    toWad(cfg.coverage),
    WAD,
    Rounding.Ceil,
  );
  const liquidityRequired = mulDiv(
    state.stEffectiveNAV,
    toWad(cfg.minLiquidity),
    WAD,
    Rounding.Ceil,
  );
  const coverage = coverageUtilizationWad(state.stRawNAV, state.jtRawNAV, cfg.beta, toWad(cfg.coverage), state.jtEffectiveNAV);
  const liquidity = liquidityUtilizationWad(state.stEffectiveNAV, toWad(cfg.minLiquidity), rawLiquidity);
  return {
    t: Number(state.t),
    state: state.marketState,
    fixedTermRemaining: Number(state.fixedTermEndSec > state.t ? state.fixedTermEndSec - state.t : 0n),
    stRawNAV: fromWad(state.stRawNAV),
    jtRawNAV: fromWad(state.jtRawNAV),
    stEffectiveNAV: fromWad(state.stEffectiveNAV),
    jtEffectiveNAV: fromWad(state.jtEffectiveNAV),
    ltNAV: fromWad(rawLiquidity + premium),
    ltRawNAV: fromWad(rawLiquidity),
    poolValue: fromWad(spotLiquidity),
    accruedLiquidityPremium: fromWad(premium),
    stIL: fromWad(state.stImpermanentLoss),
    jtIL: fromWad(state.jtImpermanentLoss),
    coverageRequiredNAV: fromWad(coverageRequired),
    liquidityRequiredNAV: fromWad(liquidityRequired),
    utilization: utilizationNumber(coverage),
    liquidityUtilization: utilizationNumber(liquidity),
    coverageOK: coverage <= WAD,
    stPrice: fromWad(stPriceWad(state)),
    jtPrice: fromWad(jtPriceWad(state)),
    ltPrice: fromWad(ltPriceWad(state, cfg)),
    riskShare,
    liqShare,
    poolSeniorNAV: fromWad(poolSenior),
    poolStableNAV: fromWad(state.pool.stable),
    poolPctST: poolPctST(state),
    conservationResidual: fromWad(conservationResidualWad(state)),
  };
}

export function publicState(state: LiveState): PublicLiveState {
  return {
    t: Number(state.t),
    marketState: state.marketState,
    fixedTermEndSec: Number(state.fixedTermEndSec),
    stRawNAV: fromWad(state.stRawNAV),
    jtRawNAV: fromWad(state.jtRawNAV),
    stEffectiveNAV: fromWad(state.stEffectiveNAV),
    jtEffectiveNAV: fromWad(state.jtEffectiveNAV),
    stImpermanentLoss: fromWad(state.stImpermanentLoss),
    jtImpermanentLoss: fromWad(state.jtImpermanentLoss),
    stShares: fromWad(state.stShares),
    jtShares: fromWad(state.jtShares),
    ltShares: fromWad(state.ltShares),
    protocolSTShares: fromWad(state.protocolSTShares),
    protocolJTShares: fromWad(state.protocolJTShares),
    protocolLTShares: fromWad(state.protocolLTShares),
    pool: { stShares: fromWad(state.pool.stShares), stable: fromWad(state.pool.stable) },
    ltOwnedSTShares: fromWad(state.ltOwnedSTShares),
    riskYTarget: fromWad(state.riskYTarget),
    liqYTarget: fromWad(state.liqYTarget),
    lastYDMUpdateSec: Number(state.lastYDMUpdateSec),
    lastPremiumPaymentSec: Number(state.lastPremiumPaymentSec),
    twRiskShareSeconds: fromWad(state.twRiskShareSeconds),
    twLiqShareSeconds: fromWad(state.twLiqShareSeconds),
    yieldShareAccrualInitialized: state.yieldShareAccrualInitialized,
  };
}

export function newMarket(cfg: MarketConfig, init: { st: number; jt: number; lt: number }): LiveState {
  const st = toWad(init.st);
  const jt = toWad(init.jt);
  const liquidity = toWad(init.lt);
  const state: LiveState = {
    t: 0n,
    marketState: MarketState.PERPETUAL,
    fixedTermEndSec: 0n,
    stRawNAV: st,
    jtRawNAV: jt,
    stEffectiveNAV: st,
    jtEffectiveNAV: jt,
    stImpermanentLoss: 0n,
    jtImpermanentLoss: 0n,
    stShares: st,
    jtShares: jt,
    ltShares: liquidity,
    protocolSTShares: 0n,
    protocolJTShares: 0n,
    protocolLTShares: 0n,
    pool: {
      stShares: mulDiv(liquidity, LT_WEIGHT_WAD, WAD),
      stable: mulDiv(liquidity, WAD - LT_WEIGHT_WAD, WAD),
    },
    ltOwnedSTShares: 0n,
    riskYTarget: toWad(cfg.riskYDM.yTarget),
    liqYTarget: toWad(cfg.liqYDM.yTarget),
    lastYDMUpdateSec: 0n,
    lastPremiumPaymentSec: 0n,
    twRiskShareSeconds: 0n,
    twLiqShareSeconds: 0n,
    yieldShareAccrualInitialized: false,
  };
  const coverage = coverageUtilizationWad(st, jt, cfg.beta, toWad(cfg.coverage), jt);
  const liquidityUtil = liquidityUtilizationWad(st, toWad(cfg.minLiquidity), ltRawNAVWad(state, cfg));
  if (coverage > WAD || liquidityUtil > WAD) {
    throw new Error('INVALID_INITIAL_MARKET: initial coverage or liquidity requirement is violated');
  }
  return state;
}
