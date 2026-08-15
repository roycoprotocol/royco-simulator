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
import { YEAR_SEC } from './ydm';
import {
  Rounding,
  UINT256_MAX,
  WAD,
  fromWad,
  minWad,
  mulDiv,
  saturatingSub,
  toWad,
  toWadFloor,
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
export const DAY_ECLP_SIMULATION_LAMBDA = 1;
/**
 * Where the pool rests, as a share of its value held in Senior shares.
 *
 * This used to be a flat `0.1` applied to every market. It is not a free
 * constant: an E-CLP rests at whatever composition its own parameters imply,
 * and seeding it anywhere else opens the pool off its own peg. Measured before
 * this change: the eleven markets that declare a curve all rest at 3.884%
 * Senior and were every one of them seeded at 10%, holding 2.6x the Senior
 * their curve was built to carry.
 *
 * The seed is now read from the curve, which is what the deployment interface
 * does (`stableShareAtPeg` in royco-rwa-frontend, and `solveBeta` for the
 * inverse). `0.1` survives only as the weight the *fallback* curve is solved
 * for, so a market that declares no curve of its own is unchanged.
 */
const DAY_FALLBACK_POOL_SENIOR_WEIGHT = 0.1;
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
  const collateralNAV = stRaw + jtRaw;
  if (collateralNAV === 0n) return 0n;
  if (jtEffective === 0n) return UINT256_MAX;
  return mulDiv(collateralNAV, coverageWad, jtEffective, Rounding.Ceil);
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
/**
 * The Senior share the configured curve rests at, 0..1.
 *
 * `reservesPerL(params, 1)` is the pool's composition at price 1, and at the
 * peg both legs are already NAV-denominated, so the Senior share is simply
 * `x / (x + y)`. This is the same quantity the deployment interface calls the
 * resting split.
 */
export function poolSeniorWeightAtPeg(cfg: MarketConfig): number {
  // A market that supplies no curve gets the fallback, which is *solved for*
  // this weight — so the weight is known exactly and re-deriving it by
  // bisection would only add error. Measured: doing so moved JBBB's boundary
  // sell in the 14th significant digit, which is noise but is noise this
  // function has no reason to introduce.
  if (!cfg.eclpParams) return DAY_FALLBACK_POOL_SENIOR_WEIGHT;
  const r = reservesPerL(cfg.eclpParams, 1);
  const total = r.x + r.y;
  if (!Number.isFinite(total) || total <= 0) return DAY_FALLBACK_POOL_SENIOR_WEIGHT;
  const w = r.x / total;
  return Number.isFinite(w) && w > 0 && w < 1 ? w : DAY_FALLBACK_POOL_SENIOR_WEIGHT;
}

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
          DAY_FALLBACK_POOL_SENIOR_WEIGHT,
          DAY_ECLP_SIMULATION_LAMBDA,
          cfg.eclpBandWidth,
        ),
    };
  }
  return eclpCache.params;
}

export const stPriceWad = (state: LiveState): bigint => state.stShares > 0n
  ? mulDiv(state.stEffectiveNAV + VIRTUAL_VALUE, WAD, state.stShares + VIRTUAL_SHARES)
  : WAD;
export const jtPriceWad = (state: LiveState): bigint => state.jtShares > 0n
  ? mulDiv(state.jtEffectiveNAV + VIRTUAL_VALUE, WAD, state.jtShares + VIRTUAL_SHARES)
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
  ? mulDiv(ltEffectiveNAVWad(state, cfg) + VIRTUAL_VALUE, WAD, state.ltShares + VIRTUAL_SHARES)
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
  const clampArmed = mulDiv(
    effectiveSupply,
    WAD - MAX_MINT_DILUTION_WAD,
    MAX_MINT_DILUTION_WAD,
    Rounding.Ceil,
  ) > denominator;
  if (!clampArmed) return fairShares;
  const cap = mulDiv(
    effectiveSupply,
    MAX_MINT_DILUTION_WAD,
    WAD - MAX_MINT_DILUTION_WAD,
  );
  return minWad(fairShares, cap);
}

/** Current Royco tranche redemption pricing, including the one-wei virtual
 * value/share offset used by the onchain ERC-4626 surfaces. */
export function valueForSharesWad(
  shares: bigint,
  totalValue: bigint,
  totalSupply: bigint,
): bigint {
  if (shares <= 0n) return 0n;
  return mulDiv(totalValue + VIRTUAL_VALUE, shares, totalSupply + VIRTUAL_SHARES);
}

export function sharesForValue(value: number, totalValue: number, totalSupply: number): number {
  return fromWad(sharesForValueWad(toWad(value), toWad(totalValue), toWad(totalSupply)));
}

export interface FeeAndLiquidityPremiumWadInput {
  stEffective: bigint;
  jtEffective: bigint;
  grossLiquidityPremium: bigint;
  stProtocolFee: bigint;
  jtProtocolFee: bigint;
  lptProtocolFee: bigint;
  stSupply: bigint;
  jtSupply: bigint;
  lptSupply: bigint;
  reinvestSucceeded: boolean;
}

export interface FeeAndLiquidityPremiumWadResult {
  stSupplyAfter: bigint;
  jtSupplyAfter: bigint;
  lptSupplyAfter: bigint;
  premiumShares: bigint;
  stFeeShares: bigint;
  jtFeeShares: bigint;
  lptFeeShares: bigint;
  idlePremiumShares: bigint;
}

/** Exact share-mint surface of FeeAndLiquidityPremiumLogic. Current Royco Day
 * carves the LPT fee out as protocol-owned Senior shares and never mints LPT
 * fee shares. A failed reinvestment leaves the premium's Senior shares idle. */
export function processFeeAndLiquidityPremiumWad(
  input: FeeAndLiquidityPremiumWadInput,
): FeeAndLiquidityPremiumWadResult {
  const retainedSeniorNAV = saturatingSub(
    input.stEffective,
    input.grossLiquidityPremium + input.stProtocolFee,
  );
  const premiumShares = sharesForValueWad(
    saturatingSub(input.grossLiquidityPremium, input.lptProtocolFee),
    retainedSeniorNAV,
    input.stSupply,
  );
  const stFeeShares = sharesForValueWad(
    input.stProtocolFee + input.lptProtocolFee,
    retainedSeniorNAV,
    input.stSupply,
  );
  const jtFeeShares = sharesForValueWad(
    input.jtProtocolFee,
    saturatingSub(input.jtEffective, input.jtProtocolFee),
    input.jtSupply,
  );
  return {
    stSupplyAfter: input.stSupply + premiumShares + stFeeShares,
    jtSupplyAfter: input.jtSupply + jtFeeShares,
    lptSupplyAfter: input.lptSupply,
    premiumShares,
    stFeeShares,
    jtFeeShares,
    lptFeeShares: 0n,
    idlePremiumShares: input.reinvestSucceeded ? 0n : premiumShares,
  };
}

export interface RawNAVClaimsWad {
  stClaimOnST: bigint;
  stClaimOnJT: bigint;
  jtClaimOnST: bigint;
  jtClaimOnJT: bigint;
}

export function rawNAVClaimsWad(
  _stRaw: bigint,
  _jtRaw: bigint,
  stEffective: bigint,
  jtEffective: bigint,
): RawNAVClaimsWad {
  // Compatibility projection for callers written before Royco Day moved to a
  // single coinvested collateral asset. Both tranches now redeem that asset;
  // there are no cross-asset claim legs.
  return {
    stClaimOnST: stEffective,
    stClaimOnJT: 0n,
    jtClaimOnST: jtEffective,
    jtClaimOnJT: 0n,
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
  if (utilization <= targetUtilizationWad) {
    if (targetUtilizationWad === 0n) return liveTarget;
    const normalizedMagnitude = mulDiv(targetUtilizationWad - utilization, WAD, targetUtilizationWad);
    const adjustment = mulDiv(normalizedMagnitude, lowerSpread, WAD);
    return saturatingSub(liveTarget, adjustment);
  }
  const denominator = WAD - targetUtilizationWad;
  if (denominator === 0n) return liveTarget;
  const normalizedMagnitude = mulDiv(utilization - targetUtilizationWad, WAD, denominator);
  const adjustment = mulDiv(normalizedMagnitude, upperSpread, WAD);
  return minWad(WAD, liveTarget + adjustment);
}

const EXP_WAD_ZERO_THRESHOLD = -41446531673892822313n;
const EXP_WAD_OVERFLOW_THRESHOLD = 135305999368893231589n;
const MAX_LINEAR_ADAPTATION_WAD = 135305999368893231588n;

/** Exact BigInt port of Solady FixedPointMathLib.expWad used by the canonical
 * AdaptiveCurveYDM_V2. Signed BigInt division truncates toward zero, matching
 * EVM `sdiv`; signed right shifts match `sar`. */
function expWad(xInput: bigint): bigint {
  let x = xInput;
  if (x <= EXP_WAD_ZERO_THRESHOLD) return 0n;
  if (x >= EXP_WAD_OVERFLOW_THRESHOLD) throw new Error('EXP_WAD_OVERFLOW');
  x = (x << 78n) / (5n ** 18n);
  const k = (((x << 96n) / 54916777467707473351141471128n) + (2n ** 95n)) >> 96n;
  x -= k * 54916777467707473351141471128n;

  let y = x + 1346386616545796478920950773328n;
  y = ((y * x) >> 96n) + 57155421227552351082224309758442n;
  let p = y + x - 94201549194550492254356042504812n;
  p = ((p * y) >> 96n) + 28719021644029726153956944680412240n;
  p = p * x + (4385272521454847904659076985693276n << 96n);

  let q = x - 2855989394907223263936484059900n;
  q = ((q * x) >> 96n) + 50020603652535783019961831881945n;
  q = ((q * x) >> 96n) - 533845033583426703283633433725380n;
  q = ((q * x) >> 96n) + 3604857256930695427073651918091429n;
  q = ((q * x) >> 96n) - 14423608567350463180887372962807573n;
  q = ((q * x) >> 96n) + 26449188498355588339934803723976023n;

  const r = p / q;
  return (r * 3822833074963236453042738258902158003155416615667n) >> (195n - k);
}

export function adaptYTargetWadWithAverage(
  cfg: YDMConfig,
  current: bigint,
  utilizationWad: bigint,
  elapsed: bigint,
  targetUtilizationWad: bigint,
): { next: bigint; average: bigint } {
  if (cfg.mode !== 'adaptive' || elapsed <= 0n) return { next: current, average: current };
  const utilization = minWad(utilizationWad, WAD);
  const maxDelta = utilization > targetUtilizationWad
    ? WAD - targetUtilizationWad
    : targetUtilizationWad;
  if (maxDelta === 0n) return { next: current, average: current };
  const normalizedDelta = ((utilization - targetUtilizationWad) * WAD) / maxDelta;
  const speedAtBoundaryWad = toWad(cfg.maxAdaptSpeedPerYear ?? 1) / BigInt(YEAR_SEC);
  const currentSpeedWad = (speedAtBoundaryWad * normalizedDelta) / WAD;
  const linear = currentSpeedWad * elapsed;
  const boundedLinear = linear > MAX_LINEAR_ADAPTATION_WAD
    ? MAX_LINEAR_ADAPTATION_WAD
    : linear;
  const minTarget = toWad(cfg.minYTarget ?? 1e-4);
  const maxTarget = toWad(cfg.maxYTarget ?? 1);
  const computeTarget = (adaptation: bigint): bigint => {
    const candidate = mulDiv(current, expWad(adaptation), WAD);
    return candidate < minTarget ? minTarget : candidate > maxTarget ? maxTarget : candidate;
  };
  const next = computeTarget(boundedLinear);
  const midpoint = computeTarget(boundedLinear / 2n);
  return { next, average: (current + next + 2n * midpoint) / 4n };
}

function adaptTarget(
  cfg: YDMConfig,
  current: bigint,
  utilizationWad: bigint,
  elapsed: bigint,
  targetUtilization: number,
): { next: bigint; average: bigint } {
  return adaptYTargetWadWithAverage(
    cfg,
    current,
    utilizationWad,
    elapsed,
    toWad(targetUtilization),
  );
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
  let oldCollateralNAV = oldStRaw + oldJtRaw;
  const newCollateralNAV = newStRaw + newJtRaw;
  const deltaCollateralNAV = newCollateralNAV - oldCollateralNAV;

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

  // v1.1.0 has one coinvested collateral mark. Losses consume Junior first,
  // including Junior's own pro-rata economic loss, and every absorbed wei is
  // recorded as recoverable Junior IL. Gains repay that ledger before any
  // residual appreciation is split between the restored effective claims.
  if (deltaCollateralNAV < 0n) {
    let loss = -deltaCollateralNAV;
    const juniorAbsorption = minWad(loss, jtEffective);
    if (juniorAbsorption > 0n) {
      jtEffective -= juniorAbsorption;
      jtImpermanentLoss += juniorAbsorption;
      loss -= juniorAbsorption;
    }
    if (loss > 0n) {
      stEffective -= loss;
      stImpermanentLoss += loss;
    }
  } else if (deltaCollateralNAV > 0n) {
    let gain = deltaCollateralNAV;
    const recovery = minWad(gain, jtImpermanentLoss);
    if (recovery > 0n) {
      jtImpermanentLoss -= recovery;
      jtEffective += recovery;
      gain -= recovery;
      oldCollateralNAV += recovery;
    }
    stImpermanentLoss = saturatingSub(stImpermanentLoss, deltaCollateralNAV);
    if (gain > 0n) {
      const stGain = oldCollateralNAV === 0n
        ? gain
        : mulDiv(gain, stEffective, oldCollateralNAV);
      const jtGain = gain - stGain;
      if (jtGain > 0n) {
        if (jtGain > dust) {
          jtProtocolFee = mulDiv(jtGain, toWad(cfg.jtProtocolFee), WAD);
        }
        jtEffective += jtGain;
      }
      if (stGain > 0n) {
        premiumsPaid = stGain > dust;
        const elapsedSincePremium = state.t - state.lastPremiumPaymentSec;
        const samePremiumBlock = elapsedSincePremium === 0n;
        const instantaneousRisk = minWad(
          ydmShareWad(cfg.riskYDM, state.riskYTarget, preCoverage, targetUtilWad),
          toWad(cfg.maxJTYieldShare),
        );
        const instantaneousLiquidity = minWad(
          ydmShareWad(cfg.liqYDM, state.liqYTarget, preLiquidity, liquidityTargetWad),
          toWad(cfg.maxLTYieldShare),
        );

        // RoycoDayAccountant selects one branch for both tranches based only on
        // elapsed time. A zero accumulator in a nonzero window must therefore
        // remain zero; it must not fall back to a newly observed spot rate.
        riskShareUsed = samePremiumBlock
          ? instantaneousRisk
          : state.twRiskShareSeconds / elapsedSincePremium;
        liquidityShareUsed = samePremiumBlock
          ? instantaneousLiquidity
          : state.twLiqShareSeconds / elapsedSincePremium;

        // Match the contract's single mulDiv. Dividing the weighted accumulator
        // first would introduce a second floor and can lose one wei.
        const juniorPremium = samePremiumBlock
          ? mulDiv(stGain, instantaneousRisk, WAD)
          : mulDiv(stGain, state.twRiskShareSeconds, elapsedSincePremium * WAD);
        liquidityPremium = samePremiumBlock
          ? mulDiv(stGain, instantaneousLiquidity, WAD)
          : mulDiv(stGain, state.twLiqShareSeconds, elapsedSincePremium * WAD);
        if (juniorPremium + liquidityPremium > stGain) {
          throw new Error('PREMIUMS_EXCEED_SENIOR_YIELD');
        }
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

  if (newCollateralNAV !== stEffective + jtEffective) {
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
  const noSeniorToProtect = stEffective === 0n;
  const juniorWiped = jtEffective === 0n;
  const withinDeploymentGrace = state.t < asSeconds(cfg.fixedTermGracePeriodSec);
  let nextState: MarketState;
  let erased = 0n;
  if (
    cfg.fixedTermDurationSec === 0 ||
    noSeniorToProtect ||
    juniorWiped ||
    jtImpermanentLoss <= dust ||
    expired ||
    breached ||
    withinDeploymentGrace
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
    const processed = processFeeAndLiquidityPremiumWad({
      stEffective,
      jtEffective,
      grossLiquidityPremium: liquidityPremium,
      stProtocolFee,
      jtProtocolFee,
      lptProtocolFee: ltProtocolFee,
      stSupply: state.stShares,
      jtSupply: state.jtShares,
      lptSupply: state.ltShares,
      reinvestSucceeded: cfg.reinvestLiquidityPremium,
    });
    state.stShares = processed.stSupplyAfter;
    state.jtShares = processed.jtSupplyAfter;
    state.ltShares = processed.lptSupplyAfter;
    state.protocolSTShares += processed.stFeeShares;
    state.protocolJTShares += processed.jtFeeShares;

    // FeeAndLiquidityPremiumLogic attempts to reinvest the full premium. The
    // market config chooses the deterministic outcome of that contract call;
    // it does not choose or freeze the venue's variable yield/volume economics.
    if (cfg.reinvestLiquidityPremium) state.pool.stShares += processed.premiumShares;
    else state.ltOwnedSTShares += processed.idlePremiumShares;

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
  cfg: Pick<MarketConfig, 'beta' | 'coverage' | 'minLiquidity'> &
    Partial<Pick<MarketConfig, 'liquidationUtilization'>>,
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
  const previousCollateral = state.stRawNAV + state.jtRawNAV;
  const collateral = input.stRaw + input.jtRaw;
  const deltaCollateral = collateral - previousCollateral;
  const deltaLT = input.ltRaw - input.previousLTRaw;
  let stEffective = state.stEffectiveNAV;
  let jtEffective = state.jtEffectiveNAV;
  const jtIL = state.jtImpermanentLoss;
  const invalid = (): never => { throw new Error('INVALID_POST_OP_STATE'); };

  if (input.operation === 'ST_DEPOSIT') {
    if (deltaCollateral <= 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
    stEffective += deltaCollateral;
  } else if (input.operation === 'JT_DEPOSIT') {
    if (deltaCollateral <= 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
    jtEffective += deltaCollateral;
  } else if (input.operation === 'LT_DEPOSIT') {
    if (deltaLT <= 0n || deltaCollateral !== 0n || input.bonus !== 0n) invalid();
  } else {
    if (input.operation === 'ST_REDEEM') {
      if (deltaCollateral >= 0n || deltaLT !== 0n) invalid();
      const totalRedemption = -deltaCollateral;
      if (input.bonus > jtEffective || totalRedemption < input.bonus) invalid();
      jtEffective -= input.bonus;
      stEffective -= totalRedemption - input.bonus;
    } else if (input.operation === 'JT_REDEEM') {
      if (deltaCollateral >= 0n || deltaLT !== 0n || input.bonus !== 0n) invalid();
      const totalRedemption = -deltaCollateral;
      jtEffective -= totalRedemption;
    } else {
      if (deltaLT >= 0n || deltaCollateral !== 0n || input.bonus !== 0n) invalid();
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
      (input.operation === 'ST_DEPOSIT' || input.operation === 'JT_REDEEM') &&
      coverageUtilWAD > WAD
    ) throw new Error('COVERAGE_REQUIREMENT_VIOLATED');
    if (
      input.operation === 'JT_DEPOSIT' &&
      coverageUtilWAD >= toWad(cfg.liquidationUtilization ?? Number.MAX_SAFE_INTEGER)
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
  if (input.claimNAV === 0n || input.stEffective === 0n) {
    return { bonus: 0n, claimST: input.claimST, claimJT: input.claimJT, claimNAV: input.claimNAV };
  }
  const utilizationNeutralMax = mulDiv(
    input.claimNAV,
    input.jtEffective,
    input.stEffective,
  );
  const bonus = minWad(desired, minWad(input.jtEffective, utilizationNeutralMax));
  return {
    bonus,
    // Legacy output names: the single current collateral claim is represented
    // by claimST. claimJT no longer identifies a second asset leg.
    claimST: input.claimST + bonus,
    claimJT: input.claimJT,
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

const collateralNAVWad = (state: Pick<LiveState, 'stRawNAV' | 'jtRawNAV'>) =>
  state.stRawNAV + state.jtRawNAV;

/** Debit the compatibility raw buckets pro-rata. The onchain market has one
 * collateral ledger; only the sum is contract-facing. */
function debitCollateralNAV(state: LiveState, amount: bigint): void {
  const total = collateralNAVWad(state);
  if (amount < 0n || amount > total) throw new Error('COLLATERAL_DEBIT_EXCEEDS_BALANCE');
  if (amount === 0n) return;
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
    return blocked(state, 'JT deposit blocked during coverage liquidation.');
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
  debitCollateralNAV(state, redemptionNAV + bonus);
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
  const collateralAfter = collateralNAVWad(state) - redemptionNAV;
  const coverageAfter = coverageUtilizationWad(
    collateralAfter,
    0n,
    cfg.beta,
    toWad(cfg.coverage),
    state.jtEffectiveNAV - redemptionNAV,
  );
  if (coverageAfter > WAD && !bypass) return blocked(state, `JT redeem blocked: coverage requirement would break (utilization ${(utilizationNumber(coverageAfter) * 100).toFixed(1)}% > 100%).`);
  debitCollateralNAV(state, redemptionNAV);
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
    // First deposit into an empty pool seeds it, so it uses the same resting
    // split `newMarket` does. Every later deposit is pro-rata to what is there.
    const weight = toWad(poolSeniorWeightAtPeg(cfg));
    state.pool.stShares += mulDiv(amountWad, weight, stPriceWad(state));
    state.pool.stable += mulDiv(amountWad, WAD - weight, WAD);
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
  const redeemedPoolSTShares = mulDiv(state.pool.stShares, shares, effectiveSupply);
  const redeemedStable = mulDiv(state.pool.stable, shares, effectiveSupply);
  const premiumSharesOut = mulDiv(state.ltOwnedSTShares, shares, effectiveSupply);
  const poolAfter = {
    stShares: state.pool.stShares - redeemedPoolSTShares,
    stable: state.pool.stable - redeemedStable,
  };
  const rawAfter = ltRawNAVWad({ ...state, pool: poolAfter }, cfg);
  const liquidityAfter = liquidityUtilizationWad(state.stEffectiveNAV, toWad(cfg.minLiquidity), rawAfter);
  if (liquidityAfter > WAD && !bypass) return blocked(state, `SLP redemption blocked: secondary liquidity would fall below minimum (liquidity utilization ${(utilizationNumber(liquidityAfter) * 100).toFixed(0)}% > 100% after redemption).`);
  const bptOut = mulDiv(ltRawNAVWad(state, cfg), shares, effectiveSupply);
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
  // Balancer exact-input swaps are atomic. The partial-fill quote is useful for
  // displaying pool capacity, but executing a larger order must leave the pool
  // untouched rather than silently accepting only the fillable portion.
  if (unfilled > 0n) {
    return blocked(
      state,
      `Secondary sell blocked: the pool can fill at most ${fmt(filled)} ST in one atomic trade; reduce the ${fmt(toWad(quote.requestedNAV))} ST order.`,
    );
  }
  state.pool.stShares += mulDiv(filled, WAD, priceWad);
  if (stableOut > state.pool.stable) throw new Error('SECONDARY_EXIT_OUTPUT_EXCEEDS_POOL');
  state.pool.stable -= stableOut;
  const events: SimEvent[] = [{ t: Number(state.t), kind: 'secondary-sell', msg: `Secondary sell ${fmt(filled)} ST → ${fmt(stableOut)} stable (${(quote.slippage * 100).toFixed(1)}% all-in cost, including ${fmt(toWad(quote.swapFeeNAV))} swap fee). Pool now ${(poolPctST(state) * 100).toFixed(0)}% ST.`, level: quote.slippage > 0.05 ? 'danger' : 'info' }];
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
  const swapFeeWad = toWad(cfg.swapFeeBps / 10_000);
  if (swapFeeWad < 0n || swapFeeWad > WAD) {
    throw new Error('INVALID_SWAP_FEE');
  }
  if (requested === 0n || priceWad === 0n || state.pool.stable === 0n) {
    return {
      requestedNAV: fromWad(requested),
      filledNAV: 0,
      effectiveInputNAV: 0,
      swapFeeNAV: 0,
      stableOutNAV: 0,
      unfilledNAV: fromWad(requested),
      executionPrice: 0,
      slippage: requested === 0n ? 0 : 1,
      poolPctSTAfter: poolPctST(state),
    };
  }
  const feeForGross = (gross: bigint) => mulDiv(
    gross,
    swapFeeWad,
    WAD,
    Rounding.Ceil,
  );
  const netForGross = (gross: bigint) => saturatingSub(gross, feeForGross(gross));
  const requestedNet = netForGross(requested);
  if (requestedNet === 0n) {
    return {
      requestedNAV: fromWad(requested),
      filledNAV: 0,
      effectiveInputNAV: 0,
      swapFeeNAV: 0,
      stableOutNAV: 0,
      unfilledNAV: fromWad(requested),
      executionPrice: 0,
      slippage: 1,
      poolPctSTAfter: poolPctST(state),
    };
  }
  const seniorLeg = mulDiv(state.pool.stShares, priceWad, WAD);
  const params = eclpParamsFor(cfg);
  const requestedNetNumber = fromWad(requestedNet);
  const rawQuote = eclpSellValue(
    params,
    fromWad(seniorLeg),
    fromWad(state.pool.stable),
    requestedNetNumber,
  );
  const netCapacity = minWad(toWad(rawQuote.filled), requestedNet);

  // The E-CLP reports capacity in fee-adjusted units. Convert that capacity
  // back to the largest gross seller amount whose rounded-up fee still fits.
  let filled = requested;
  const fullFillTolerance = Math.max(1e-12, requestedNetNumber * 1e-12);
  if (rawQuote.filled + fullFillTolerance < requestedNetNumber) {
    let low = 0n;
    let high = requested;
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      if (netForGross(middle) <= netCapacity) low = middle;
      else high = middle - 1n;
    }
    filled = low;
  }
  const swapFee = filled > 0n ? feeForGross(filled) : 0n;
  const effectiveInput = saturatingSub(filled, swapFee);
  const appliedQuote = effectiveInput > 0n
    ? eclpSellValue(
        params,
        fromWad(seniorLeg),
        fromWad(state.pool.stable),
        fromWad(effectiveInput),
      )
    : { stableOut: 0, filled: 0 };
  // The E-CLP adapter is float-based. Quantize outputs down, then cap them at
  // the actual reserve so a boundary quote can never create a sub-wei overdraft.
  const stableOut = minWad(
    toWadFloor(Math.max(0, appliedQuote.stableOut)),
    state.pool.stable,
  );
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
    effectiveInputNAV: fromWad(effectiveInput),
    swapFeeNAV: fromWad(swapFee),
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
    pool: (() => {
      // Seeded at the curve's own resting split, so the pool opens at its peg
      // rather than off it.
      const weight = toWad(poolSeniorWeightAtPeg(cfg));
      return {
        stShares: mulDiv(liquidity, weight, WAD),
        stable: mulDiv(liquidity, WAD - weight, WAD),
      };
    })(),
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
