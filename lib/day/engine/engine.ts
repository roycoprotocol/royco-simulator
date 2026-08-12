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
  toWad,
} from './wad';
import {
  type EclpParams,
  eclpInvariant,
  eclpParamsForWeight,
  eclpSellValue,
  eclpTVL,
  reservesPerL,
} from './eclp';

/** Fixed concentration used by the simulator's E-CLP quote model. Exported so
 * the UI can disclose the exact venue assumption without restating it. */
export const DAY_ECLP_SIMULATION_LAMBDA = 250;
export const DAY_ECLP_CANONICAL_PARAMS: EclpParams = {
  alpha: 0.98,
  beta: 1.0003,
  c: 0.707106781186547524,
  s: 0.707106781186547524,
  lambda: DAY_ECLP_SIMULATION_LAMBDA,
};
const VIRTUAL_SHARES = 1n;
const VIRTUAL_VALUE = 1n;
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
  _beta: number,
  coverageWad: bigint,
  jtEffective: bigint,
): bigint {
  if (coverageWad === 0n) return 0n;
  const exposure = stRaw + jtRaw;
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
  const supplied = cfg.eclpParams;
  const key = supplied
    ? `${supplied.alpha}|${supplied.beta}|${supplied.c}|${supplied.s}|${supplied.lambda}`
    : `${DAY_ECLP_SIMULATION_LAMBDA}|${cfg.eclpBandWidth}`;
  if (!eclpCache || eclpCache.key !== key) {
    eclpCache = {
      key,
      params:
        supplied ??
        eclpParamsForWeight(
          0.1,
          DAY_ECLP_SIMULATION_LAMBDA,
          cfg.eclpBandWidth,
        ),
    };
  }
  return eclpCache.params;
}

function poolSeniorWeightWad(cfg: MarketConfig): bigint {
  const reserves = reservesPerL(eclpParamsFor(cfg), 1);
  const total = reserves.x + reserves.y;
  if (!(total > 0) || !Number.isFinite(total)) return 0n;
  return toWad(Math.max(0, Math.min(1, reserves.x / total)));
}

export function valueForSharesWad(
  shares: bigint,
  totalValue: bigint,
  totalSupply: bigint,
): bigint {
  if (shares <= 0n) return 0n;
  return mulDiv(totalValue + VIRTUAL_VALUE, shares, totalSupply + VIRTUAL_SHARES);
}

export const stPriceWad = (state: LiveState): bigint =>
  valueForSharesWad(WAD, state.stEffectiveNAV, state.stShares);
export const jtPriceWad = (state: LiveState): bigint =>
  valueForSharesWad(WAD, state.jtEffectiveNAV, state.jtShares);

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
  ? valueForSharesWad(WAD, ltEffectiveNAVWad(state, cfg), state.ltShares)
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
  const effectiveSupply = totalSupply + VIRTUAL_SHARES;
  const denominator = totalValue + VIRTUAL_VALUE;
  const fairShares = mulDiv(effectiveSupply, value, denominator);
  let cap = UINT256_MAX;
  if (mulDiv(effectiveSupply, WAD - MAX_MINT_DILUTION_WAD, MAX_MINT_DILUTION_WAD, Rounding.Ceil) > denominator) {
    cap = mulDiv(effectiveSupply, MAX_MINT_DILUTION_WAD, WAD - MAX_MINT_DILUTION_WAD);
  }
  return minWad(fairShares, cap);
}

export function sharesForValue(value: number, totalValue: number, totalSupply: number): number {
  return fromWad(sharesForValueWad(toWad(value), toWad(totalValue), toWad(totalSupply)));
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
  const oldCollateral = oldStRaw + oldJtRaw;
  const newCollateral = newStRaw + newJtRaw;

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
  let jtProtocolFee = 0n;
  let stProtocolFee = 0n;
  let ltProtocolFee = 0n;
  let liquidityPremium = 0n;
  let riskShareUsed = 0n;
  let liquidityShareUsed = 0n;
  let premiumsPaid = false;

  if (newCollateral < oldCollateral) {
    let loss = oldCollateral - newCollateral;
    const juniorLoss = minWad(loss, jtEffective);
    if (juniorLoss > 0n) {
      jtEffective -= juniorLoss;
      jtImpermanentLoss += juniorLoss;
      loss -= juniorLoss;
    }
    if (loss > 0n) {
      stEffective -= loss;
      stImpermanentLoss += loss;
    }
  } else if (newCollateral > oldCollateral) {
    const totalGain = newCollateral - oldCollateral;
    let gain = totalGain;
    const recovery = minWad(gain, jtImpermanentLoss);
    if (recovery > 0n) {
      jtImpermanentLoss -= recovery;
      jtEffective += recovery;
      gain -= recovery;
    }
    stImpermanentLoss = saturatingSub(stImpermanentLoss, totalGain);
    const restoredCollateral = oldCollateral + recovery;
    if (gain > 0n) {
      const stGain = restoredCollateral === 0n
        ? gain
        : mulDiv(gain, stEffective, restoredCollateral);
      const jtGain = gain - stGain;
      if (jtGain > 0n) {
        if (jtGain > dust) {
          jtProtocolFee = mulDiv(jtGain, toWad(cfg.jtProtocolFee), WAD);
        }
        jtEffective += jtGain;
      }
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
  }

  if (newCollateral !== stEffective + jtEffective) {
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
  const noSenior = stEffective === 0n;
  const juniorWiped = jtEffective === 0n;
  const inDeploymentGrace = state.t < asSeconds(cfg.fixedTermGracePeriodSec);
  let nextState: MarketState;
  let erased = 0n;
  if (
    cfg.fixedTermDurationSec === 0 ||
    noSenior ||
    juniorWiped ||
    jtImpermanentLoss <= dust ||
    expired ||
    breached ||
    inDeploymentGrace
  ) {
    erased = jtImpermanentLoss;
    jtImpermanentLoss = 0n;
    nextState = MarketState.PERPETUAL;
    state.fixedTermEndSec = 0n;
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
    const netLiquidityPremium = saturatingSub(liquidityPremium, ltProtocolFee);
    const premiumShares = sharesForValueWad(netLiquidityPremium, retainedSeniorNAV, preMintSeniorSupply);
    const seniorFeeShares = sharesForValueWad(stProtocolFee + ltProtocolFee, retainedSeniorNAV, preMintSeniorSupply);
    state.stShares += premiumShares + seniorFeeShares;
    state.protocolSTShares += seniorFeeShares;

    // The current kernel mints the LPT premium net of its protocol fee as ST
    // shares. The fee is remitted as ST shares; it never mints LPT shares.
    if (cfg.reinvestLiquidityPremium) state.pool.stShares += premiumShares;
    else state.ltOwnedSTShares += premiumShares;

    const juniorFeeShares = sharesForValueWad(
      jtProtocolFee,
      saturatingSub(jtEffective, jtProtocolFee),
      state.jtShares,
    );
    state.jtShares += juniorFeeShares;
    state.protocolJTShares += juniorFeeShares;

    state.stRawNAV = newStRaw;
    state.jtRawNAV = newJtRaw;
    state.stEffectiveNAV = stEffective;
    state.jtEffectiveNAV = jtEffective;
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
  cfg: Pick<MarketConfig, 'beta' | 'coverage' | 'liquidationUtilization' | 'minLiquidity'>,
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
  const oldCollateral = state.stRawNAV + state.jtRawNAV;
  const collateral = input.stRaw + input.jtRaw;
  const deltaCollateral = collateral - oldCollateral;
  const deltaLT = input.ltRaw - input.previousLTRaw;
  let stEffective = state.stEffectiveNAV;
  let jtEffective = state.jtEffectiveNAV;
  const invalid = (): never => { throw new Error('INVALID_POST_OP_STATE'); };

  if (input.operation === 'ST_DEPOSIT') {
    if (deltaCollateral <= 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
    stEffective += deltaCollateral;
  } else if (input.operation === 'JT_DEPOSIT') {
    if (deltaCollateral <= 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
    jtEffective += deltaCollateral;
  } else if (input.operation === 'LT_DEPOSIT') {
    if (deltaLT <= 0n || deltaCollateral !== 0n || input.bonus !== 0n) invalid();
  } else if (input.operation === 'LT_REDEEM') {
    if (deltaLT >= 0n || deltaCollateral !== 0n || input.bonus !== 0n) invalid();
  } else if (input.operation === 'ST_REDEEM') {
    if (deltaCollateral >= 0n || deltaLT !== 0n || input.bonus > jtEffective || -deltaCollateral < input.bonus) invalid();
    jtEffective -= input.bonus;
    stEffective -= -deltaCollateral - input.bonus;
  } else {
    if (deltaCollateral >= 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
    jtEffective -= -deltaCollateral;
  }

  if (collateral !== stEffective + jtEffective) {
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
      (input.operation === 'ST_DEPOSIT' || input.operation === 'JT_REDEEM') &&
      coverageUtilWAD > WAD
    ) throw new Error('COVERAGE_REQUIREMENT_VIOLATED');
    if (
      input.operation === 'JT_DEPOSIT' &&
      coverageUtilWAD >= toWad(cfg.liquidationUtilization)
    ) throw new Error('JT_DEPOSIT_BLOCKED_DURING_LIQUIDATION');
    if (
      (input.operation === 'ST_DEPOSIT' || input.operation === 'LT_REDEEM') &&
      liquidityUtilWAD > WAD
    ) throw new Error('LIQUIDITY_REQUIREMENT_VIOLATED');
  }
  return {
    stRaw: input.stRaw,
    jtRaw: input.jtRaw,
    ltRaw: input.ltRaw,
    stEffective,
    jtEffective,
    jtIL: state.jtImpermanentLoss,
    coverageUtilWAD,
    liquidityUtilWAD,
  };
}

export interface SelfLiquidationWadInput {
  bonusWAD: bigint;
  stEffective: bigint;
  jtEffective: bigint;
  coverageUtilWAD: bigint;
  liquidationUtilWAD: bigint;
  claimCollateral: bigint;
  claimNAV: bigint;
}

/** Wei-exact mirror of SelfLiquidationLogic for a precomputed Senior claim. */
export function selfLiquidationClaimWad(input: SelfLiquidationWadInput): {
  bonus: bigint;
  claimCollateral: bigint;
  claimNAV: bigint;
} {
  if (input.coverageUtilWAD < input.liquidationUtilWAD || input.jtEffective === 0n) {
    return { bonus: 0n, claimCollateral: input.claimCollateral, claimNAV: input.claimNAV };
  }
  const desired = mulDiv(input.claimNAV, input.bonusWAD, WAD);
  const utilizationNeutralMax = input.stEffective === 0n
    ? 0n
    : mulDiv(input.claimNAV, input.jtEffective, input.stEffective);
  const bonus = minWad(desired, minWad(input.jtEffective, utilizationNeutralMax));
  return {
    bonus,
    claimCollateral: input.claimCollateral + bonus,
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

/** The contract holds one collateral asset. The two raw fields are retained as
 * display buckets, so withdrawals reduce them pro rata without affecting any
 * contract-facing calculation. */
function removeCollateralWad(state: LiveState, amount: bigint): void {
  const total = state.stRawNAV + state.jtRawNAV;
  if (amount <= 0n) return;
  if (amount > total) throw new Error('INSUFFICIENT_COLLATERAL');
  const fromST = total === 0n ? 0n : mulDiv(amount, state.stRawNAV, total);
  state.stRawNAV -= fromST;
  state.jtRawNAV -= amount - fromST;
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

export function jtDeposit(state: LiveState, cfg: MarketConfig, amount: number): OpResult {
  const amountWad = toWad(amount);
  if (state.marketState !== MarketState.PERPETUAL) return blocked(state, 'JT deposit blocked: only enabled in PERPETUAL (protects existing JT during recovery).');
  if (amountWad <= 0n) return blocked(state, 'JT deposit blocked: amount must be positive.');
  const coverageAfter = coverageUtilizationWad(
    state.stRawNAV,
    state.jtRawNAV + amountWad,
    cfg.beta,
    toWad(cfg.coverage),
    state.jtEffectiveNAV + amountWad,
  );
  if (coverageAfter >= toWad(cfg.liquidationUtilization)) {
    return blocked(state, 'JT deposit blocked: the deposit would leave coverage at or above the Protected Exit threshold.');
  }
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
  const redemptionNAV = valueForSharesWad(shares, state.stEffectiveNAV, state.stShares);
  const coverage = coverageUtilizationWad(state.stRawNAV, state.jtRawNAV, cfg.beta, toWad(cfg.coverage), state.jtEffectiveNAV);
  let bonus = 0n;
  if (coverage >= toWad(cfg.liquidationUtilization) && cfg.stSelfLiquidationBonus > 0) {
    const desired = mulDiv(redemptionNAV, toWad(cfg.stSelfLiquidationBonus), WAD);
    const neutralCap = state.stEffectiveNAV > 0n
      ? mulDiv(redemptionNAV, state.jtEffectiveNAV, state.stEffectiveNAV)
      : 0n;
    bonus = minWad(desired, minWad(state.jtEffectiveNAV, neutralCap));
  }
  removeCollateralWad(state, redemptionNAV + bonus);
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
  const redemptionNAV = valueForSharesWad(shares, state.jtEffectiveNAV, state.jtShares);
  const totalCollateral = state.stRawNAV + state.jtRawNAV;
  const coverageAfter = coverageUtilizationWad(
    saturatingSub(totalCollateral, redemptionNAV),
    0n,
    cfg.beta,
    toWad(cfg.coverage),
    state.jtEffectiveNAV - redemptionNAV,
  );
  if (coverageAfter > WAD && !bypass) return blocked(state, `JT redeem blocked: coverage requirement would break (utilization ${(utilizationNumber(coverageAfter) * 100).toFixed(1)}% > 100%).`);
  removeCollateralWad(state, redemptionNAV);
  state.jtEffectiveNAV -= redemptionNAV;
  state.jtShares -= shares;
  return { ok: true, events: [{ t: Number(state.t), kind: 'jt-redeem', msg: `JT redeem ${fromWad(shares).toFixed(2)} shares → ${fmt(redemptionNAV)}.`, level: 'info' }] };
}

export function ltDeposit(state: LiveState, cfg: MarketConfig, amount: number): OpResult {
  const amountWad = toWad(amount);
  if (amountWad <= 0n) return blocked(state, 'SLP deposit blocked: amount must be positive.');
  const shares = sharesForValueWad(amountWad, ltEffectiveNAVWad(state, cfg), state.ltShares);
  const rawBefore = ltRawNAVWad(state, cfg);
  if (rawBefore <= dustWad(cfg)) {
    const seniorWeight = poolSeniorWeightWad(cfg);
    state.pool.stShares += mulDiv(amountWad, seniorWeight, stPriceWad(state));
    state.pool.stable += mulDiv(amountWad, WAD - seniorWeight, WAD);
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
  const effectiveSupply = state.ltShares + VIRTUAL_SHARES;
  const poolSTOut = mulDiv(state.pool.stShares, shares, effectiveSupply);
  const stableOut = mulDiv(state.pool.stable, shares, effectiveSupply);
  const poolAfter = {
    stShares: state.pool.stShares - poolSTOut,
    stable: state.pool.stable - stableOut,
  };
  const rawAfter = ltRawNAVWad({ ...state, pool: poolAfter }, cfg);
  const liquidityAfter = liquidityUtilizationWad(state.stEffectiveNAV, toWad(cfg.minLiquidity), rawAfter);
  if (liquidityAfter > WAD && !bypass) return blocked(state, `SLP redemption blocked: secondary liquidity would fall below minimum (liquidity utilization ${(utilizationNumber(liquidityAfter) * 100).toFixed(0)}% > 100% after redemption).`);
  const bptOut = valueForSharesWad(shares, ltRawNAVWad(state, cfg), state.ltShares);
  const premiumSharesOut = mulDiv(shares, state.ltOwnedSTShares, effectiveSupply);
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
    state.stRawNAV + state.jtRawNAV,
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
  const seniorWeight = poolSeniorWeightWad(cfg);
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
      stShares: mulDiv(liquidity, seniorWeight, WAD),
      stable: mulDiv(liquidity, WAD - seniorWeight, WAD),
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
