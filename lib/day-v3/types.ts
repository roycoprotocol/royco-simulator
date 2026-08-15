/** The V3 design is scale-free. Every capital and payout is quoted per 100 Senior. */
export const DAY_V3_SENIOR_BASIS = 100 as const;

export type DayV3FieldOrigin =
  | "issuer-goal"
  | "recommended"
  | "derived"
  | "template-policy"
  | "manual-override"
  | "unresolved";

export type DayV3ModelUsage =
  | "fully-modeled"
  | "scenario-only"
  | "not-modeled";

/**
 * A value shown in V3 must say where it came from and whether the accountant
 * actually used it. `null` is intentional: unresolved deployment inputs must
 * never be replaced by an illustrative number.
 */
export interface DayV3DesignField<T> {
  id: string;
  value: T | null;
  unit: string;
  origin: DayV3FieldOrigin;
  deployPath: string | null;
  modelUsage: DayV3ModelUsage;
  evidence: string[];
}

export interface DayV3DeploymentTarget {
  chainId: number;
  templateId: string;
}

/**
 * Contract-level feature switches are explicit in exported designs. A zero
 * goal by itself is not trusted as proof that the issuer intended to disable
 * a mechanism.
 */
export interface DayV3Features {
  seniorProtection: "enabled" | "disabled";
  immediateExit: "enabled" | "disabled";
}

/**
 * EntryPoint settlement is a single market-level product decision in the RWA
 * deployment flow. The same schedule is intentionally written to Senior,
 * Junior, and Senior LP. `"no-expiry"` is explicit and maps to uint32 max at
 * deployment; it is never overloaded with an unresolved/null value.
 */
export type DayV3ExpiryPolicy = number | "no-expiry";

export interface DayV3SettlementPolicy {
  appliesTo: "all-tranches";
  depositDelaySeconds: number;
  depositExpirySeconds: DayV3ExpiryPolicy;
  withdrawalDelaySeconds: number;
  withdrawalExpirySeconds: DayV3ExpiryPolicy;
  gateByOracleUpdate: boolean;
}

export interface DayV3DeploymentPolicy {
  settlement: DayV3SettlementPolicy;
  /** On-chain reinvestment value-loss ceiling. Must be strictly below 100%. */
  maxReinvestmentSlippageBps: number;
}

/**
 * Issuer goals accepted by the canonical pool-design service.
 *
 * The nullable deployment facts are deliberate. They are forwarded so a
 * response can still resolve live template policy and price the immediate
 * pool exit, but a deployment handoff may not be marked ready until the
 * issuer has supplied them.
 */
export interface DayV3Goals {
  protectedDrawdownPct: number;
  recoveryDays: number;
  immediateExitSharePct: number;
  minimumProceedsPer100: number;
  /** Minimum EntryPoint queue time before an in-kind Senior redemption may execute. */
  entryPointSettlementDays: number;
  /** Additional operational time to convert the redeemed underlying asset to the exit asset. */
  collateralToExitDays: number | null;
  /** Issuer-selected conservative external conversion-spread assumption; no fallback is allowed. */
  collateralToExitCostBps: number | null;
  /** Delay after deployment before a drawdown may start a fixed term. */
  fixedTermGraceDays: number;
  navUpdateDays: number;
  target: DayV3DeploymentTarget;
}

/** Custom sources deliberately begin with operational facts unresolved. */
export type DayV3GoalDraft = {
  [Key in keyof DayV3Goals]: DayV3Goals[Key] | null;
};

/**
 * Derived deployment parameters only enter the URL after a person overrides
 * them. Recommended/derived values remain reproducible from the goals.
 */
export interface DayV3Overrides {
  coveragePct: number | null;
  minimumLiquidityPct: number | null;
  maximumDiscountPct: number | null;
  depthAtNav: number | null;
  maximumPremiumPct: number | null;
  protectedExitThresholdPct: number | null;
  protectedExitBonusPct: number | null;
  poolCapitalPer100: number | null;
  /** Issuer-edited static Junior premium curve anchors. */
  jrYieldShareAtZeroPct: number | null;
  jrYieldShareAtTargetPct: number | null;
  jrYieldShareAtFullPct: number | null;
  /** Issuer-edited static SLP premium curve anchors. */
  slpYieldShareAtZeroPct: number | null;
  slpYieldShareAtTargetPct: number | null;
  slpYieldShareAtFullPct: number | null;
}
