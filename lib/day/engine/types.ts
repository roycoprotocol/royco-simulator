// =============================================================================

import type { EclpParams } from "./eclp";
// Royco Day — engine types
// -----------------------------------------------------------------------------
// Contract-facing accounting values are stored as 18-decimal WAD bigint
// integers. `Snapshot` and `PublicLiveState` are the only number-facing views;
// they exist solely for charts, controls, and formatted copy.
// =============================================================================

export enum MarketState {
  PERPETUAL = "PERPETUAL",
  FIXED_TERM = "FIXED_TERM",
}

// Which YDM curve shape to use for a premium model. Dawn ships Static + two
// Adaptive variants; we implement Static and an Adaptive (V2-semantics: the
// kink yield-share Y_T translates the curve vertically over time).
export type YDMMode = "static" | "adaptive";

export interface YDMConfig {
  mode: YDMMode;
  // Anchor points, as a *fraction of senior yield* (WAD-equivalent in [0,1]).
  // Static:   piecewise-linear through (0%->y0, 90%->yTarget, 100%->y100).
  // Adaptive: yTarget is Y_T and adapts; y0/y100 define the fixed
  //           discount/premium spreads (V2). The curve is evaluated the same
  //           way, but Y_T drifts toward wherever utilization is pushing it.
  y0: number; // share at 0% utilization
  yTarget: number; // share at 90% (target/kink) utilization
  y100: number; // share at 100% utilization
  // Adaptive only: max curve adaptation speed (per year), and bounds on Y_T.
  maxAdaptSpeedPerYear?: number; // e.g. 1.0  (Y_T can ~e^1 per yr at the edge)
  minYTarget?: number; // floor for Y_T (default 1bp)
  maxYTarget?: number; // cap for Y_T  (default 1.0)
}

export interface MarketConfig {
  // ---- Dawn coverage parameters (RoycoAccountant) ----
  coverage: number; // COV  in [0.01, 1)            -> min senior protection
  /** @deprecated Royco Day v1.1.0 has one coinvested collateral ledger. This
   * field remains only so older callers continue to deserialize; accounting
   * always treats Senior and Junior as claims on the same collateral. */
  beta: number;
  targetUtilization: number; // U*  (kink), default 0.90    -> TARGET_UTILIZATION_WAD
  liquidationUtilization: number; // > 1.0           -> liquidationUtilizationWAD
  fixedTermDurationSec: number; // 0 => permanently perpetual
  /** Seconds after deployment before a Junior loss may start a fixed term. */
  fixedTermGracePeriodSec: number;

  // ---- Protocol fees (taken from yield; 0 in fixed term) ----
  stProtocolFee: number; // on ST kept yield
  jtProtocolFee: number; // on JT total yield
  yieldShareProtocolFee: number; // on the ST->JT risk premium
  ltYieldShareProtocolFee: number; // on the ST->LT liquidity premium

  // ---- Risk-premium YDM (senior -> junior) ----
  riskYDM: YDMConfig;
  maxJTYieldShare: number; // accountant cap on the JT YDM output

  // ---- Royco Day: liquidity tranche ----
  minLiquidity: number; // MIN_LIQUIDITY (% of senior that must be pool-backed)
  liqTargetUtilization: number; // L* target for the liquidity curve (default 0.90)
  // Liquidity-premium YDM (senior -> liquidity), keyed on liquidityUtilization.
  liqYDM: YDMConfig;
  maxLTYieldShare: number; // accountant cap on the LT YDM output

  // ---- Liquidity tranche pool (E-CLP BPT: ST-share / T-bill stable) ----
  // Swap yield is modeled directly as fee × volume (no curve simulation).
  stableYield: number; // T-bill rate on the stablecoin leg (≈3.5%)
  swapFeeBps: number; // pool trading fee, basis points
  poolTurnoverPerYear: number; // annual volume as a multiple of pool value (the "volume")
  eclpBandWidth: number; // peg band: how far ST can be sold before stable is exhausted
  /** Exact externally derived pool parameters. When absent, existing markets
   * retain the simulator's declared band/weight model. */
  eclpParams?: EclpParams;
  // Contract-side premium deployment policy. This is separate from modeled
  // venue yield/volume: true deploys newly minted LT-owned Senior shares into
  // the venue; false leaves them staged as idle LT-owned Senior shares.
  reinvestLiquidityPremium: boolean;

  // ---- ST self-liquidation bonus (kernel) ----
  stSelfLiquidationBonus: number; // fraction of redeemed ST NAV, capped util-neutral

  // ---- numerics ----
  dustTolerance: number; // NAV dust (abs) treated as zero
}

// The liquidity-tranche pool (E-CLP BPT: ~10% ST shares / 90% T-bill stable).
// Modeled by value, not by curve mechanics: the pool earns swap fees (fee × volume)
// plus the T-bill rate on its stable leg plus net senior yield on its ST-share leg.
export interface PoolState {
  stShares: bigint; // WAD ST shares held in the pool
  stable: bigint; // WAD stablecoin NAV held in the pool
}

export interface LiveState {
  t: bigint; // integer seconds since start
  marketState: MarketState;
  fixedTermEndSec: bigint; // 0 if perpetual

  // checkpointed NAVs (NAV units). Royco Day v1.1.0 has one collateral NAV.
  // The two raw fields are retained as compatibility bookkeeping for existing
  // charts/adapters; all contract-facing accounting consumes their sum.
  stRawNAV: bigint;
  jtRawNAV: bigint;
  stEffectiveNAV: bigint; // WAD ST redemption value
  jtEffectiveNAV: bigint; // WAD JT redemption value
  stImpermanentLoss: bigint; // WAD presentation diagnostic
  jtImpermanentLoss: bigint; // WAD JT coverage IL

  // share supplies (for price/NAV-per-share)
  stShares: bigint;
  jtShares: bigint;
  ltShares: bigint;

  // protocol-owned shares minted as fee carve-outs. Fees reassign claims; they
  // do not remove assets from effective NAV.
  protocolSTShares: bigint;
  protocolJTShares: bigint;
  /** @deprecated v1.1.0 carves the LPT protocol fee out as Senior shares. */
  protocolLTShares: bigint;

  // liquidity tranche
  pool: PoolState;
  ltOwnedSTShares: bigint; // WAD senior shares held by LT from liquidity premiums

  // adaptive YDM state (Y_T values that drift over time)
  riskYTarget: bigint;
  liqYTarget: bigint;
  lastYDMUpdateSec: bigint;
  lastPremiumPaymentSec: bigint;
  twRiskShareSeconds: bigint;
  twLiqShareSeconds: bigint;
  yieldShareAccrualInitialized: boolean;
}

/** Number-only adapter exposed by `Sim.state` for React and test ergonomics. */
export interface PublicLiveState {
  t: number;
  marketState: MarketState;
  fixedTermEndSec: number;
  stRawNAV: number;
  jtRawNAV: number;
  stEffectiveNAV: number;
  jtEffectiveNAV: number;
  stImpermanentLoss: number;
  jtImpermanentLoss: number;
  stShares: number;
  jtShares: number;
  ltShares: number;
  protocolSTShares: number;
  protocolJTShares: number;
  protocolLTShares: number;
  pool: { stShares: number; stable: number };
  ltOwnedSTShares: number;
  riskYTarget: number;
  liqYTarget: number;
  lastYDMUpdateSec: number;
  lastPremiumPaymentSec: number;
  twRiskShareSeconds: number;
  twLiqShareSeconds: number;
  yieldShareAccrualInitialized: boolean;
}

export interface Snapshot {
  t: number;
  state: MarketState;
  fixedTermRemaining: number;
  // raw / effective / IL
  stRawNAV: number;
  jtRawNAV: number;
  stEffectiveNAV: number;
  jtEffectiveNAV: number;
  ltNAV: number; // ltRawNAV (oracle) + accrued premium
  ltRawNAV: number; // BPT value via the E-CLP oracle (manipulation-resistant)
  poolValue: number; // naive spot value of pool reserves at NAV (for divergence)
  accruedLiquidityPremium: number;
  stIL: number;
  jtIL: number;
  // health
  coverageRequiredNAV: number; // ceil(COV * (stRaw + beta * jtRaw))
  liquidityRequiredNAV: number; // ceil(MIN_LIQUIDITY * stEffective)
  utilization: number;
  liquidityUtilization: number;
  coverageOK: boolean; // utilization <= 1
  // per-share prices (NAV per whole share)
  stPrice: number;
  jtPrice: number;
  ltPrice: number;
  // live premium shares (this step)
  riskShare: number;
  liqShare: number;
  // pool composition
  poolSeniorNAV: number;
  poolStableNAV: number;
  poolPctST: number;
  // invariant residual (should be ~0)
  conservationResidual: number;
}

export interface SecondaryExitQuote {
  requestedNAV: number;
  /** Gross Senior input accepted from the seller. */
  filledNAV: number;
  /** Senior input that reaches the E-CLP after the exact-input swap fee. */
  effectiveInputNAV: number;
  /** Swap fee retained in the pool for SLP. */
  swapFeeNAV: number;
  stableOutNAV: number;
  unfilledNAV: number;
  executionPrice: number;
  slippage: number;
  poolPctSTAfter: number;
}

export type EventKind =
  | "init"
  | "accrue"
  | "shock"
  | "st-deposit"
  | "st-redeem"
  | "jt-deposit"
  | "jt-redeem"
  | "lt-deposit"
  | "lt-redeem"
  | "secondary-sell"
  | "enter-fixed-term"
  | "exit-fixed-term"
  | "jt-il-erased"
  | "self-liq-bonus"
  | "blocked"
  | "invariant-violation";

export type ObservationExitReason =
  | "period-ended"
  | "protected-exit"
  | "st-impairment"
  | "recovered";

export interface SimEvent {
  t: number;
  kind: EventKind;
  msg: string;
  level: "info" | "warn" | "danger" | "good";
  /** Exact NAV amount for value-bearing events. Never recover accounting data from msg. */
  amountNAV?: number;
  /** Structured lifecycle reason for Observation Period exits. Never infer this from msg. */
  observationExitReason?: ObservationExitReason;
}
