// =============================================================================
// Royco Day — engine types
// -----------------------------------------------------------------------------
// All NAVs are expressed in NAV units (USD), as floating point. The on-chain
// system uses WAD (1e18) integers with explicit per-tranche dust tolerances; we
// model that with floats + a single dust tolerance, which is faithful for
// simulation (the dust tolerance is exactly what absorbs the WAD rounding the
// contracts round away). See AUDIT.md for the mapping to the Solidity.
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
  beta: number; // β    in [0, 1]               -> JT correlation to ST loss
  targetUtilization: number; // U*  (kink), default 0.90    -> TARGET_UTILIZATION_WAD
  liquidationUtilization: number; // > 1.0           -> liquidationUtilizationWAD
  fixedTermDurationSec: number; // 0 => permanently perpetual

  // ---- Protocol fees (taken from yield; 0 in fixed term) ----
  stProtocolFee: number; // on ST kept yield
  jtProtocolFee: number; // on JT total yield
  yieldShareProtocolFee: number; // on the ST->JT risk premium

  // ---- Risk-premium YDM (senior -> junior) ----
  riskYDM: YDMConfig;

  // ---- Royco Day: liquidity tranche ----
  minLiquidity: number; // MIN_LIQUIDITY (% of senior that must be pool-backed)
  liqTargetUtilization: number; // L* target for the liquidity curve (default 0.90)
  // Liquidity-premium YDM (senior -> liquidity), keyed on liquidityUtilization.
  liqYDM: YDMConfig;
  // When both premiums are demanded out of one ST-yield stream and they sum to
  // > 100%, who wins? Spec is silent (flagged gap). We make it explicit:
  //  "jtPriority": JT takes its full share, LT gets the remainder.
  //  "proRata":    both scaled down to sum to 1.
  premiumPriority: "jtPriority" | "proRata";

  // ---- Liquidity tranche pool (E-CLP BPT: ST-share / T-bill stable) ----
  // Swap yield is modeled directly as fee × volume (no curve simulation).
  stableYield: number; // T-bill rate on the stablecoin leg (≈3.5%)
  swapFeeBps: number; // pool trading fee, basis points
  poolTurnoverPerYear: number; // annual volume as a multiple of pool value (the "volume")
  eclpBandWidth: number; // peg band: how far ST can be sold before stable is exhausted

  // ---- ST self-liquidation bonus (kernel) ----
  stSelfLiquidationBonus: number; // fraction of redeemed ST NAV, capped util-neutral

  // ---- numerics ----
  dustTolerance: number; // NAV dust (abs) treated as zero
}

// The liquidity-tranche pool (E-CLP BPT: ~10% ST shares / 90% T-bill stable).
// Modeled by value, not by curve mechanics: the pool earns swap fees (fee × volume)
// plus the T-bill rate on its stable leg plus net senior yield on its ST-share leg.
export interface PoolState {
  stShares: number; // ST shares held in the pool
  stable: number; // stablecoin (NAV value) held in the pool; earns the T-bill rate
}

export interface LiveState {
  t: number; // seconds since start
  marketState: MarketState;
  fixedTermEndSec: number; // 0 if perpetual

  // checkpointed NAVs (NAV units)
  stRawNAV: number; // ST pure asset value
  jtRawNAV: number; // JT pure asset value
  stEffectiveNAV: number; // ST redemption value
  jtEffectiveNAV: number; // JT redemption value
  stImpermanentLoss: number; // ST IL (JT liability to ST)
  jtImpermanentLoss: number; // JT coverage IL (ST liability to JT)

  // share supplies (for price/NAV-per-share)
  stShares: number;
  jtShares: number;
  ltShares: number;

  // liquidity tranche
  pool: PoolState;
  accruedLiquidityPremium: number; // LT claim on ST assets (NAV units)

  // adaptive YDM state (Y_T values that drift over time)
  riskYTarget: number;
  liqYTarget: number;
  lastYDMUpdateSec: number;
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
  poolPctST: number;
  // invariant residual (should be ~0)
  conservationResidual: number;
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

export interface SimEvent {
  t: number;
  kind: EventKind;
  msg: string;
  level: "info" | "warn" | "danger" | "good";
}
