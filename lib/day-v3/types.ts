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

/** Fully resolved goals accepted by the canonical pool-design service. */
export interface DayV3Goals {
  protectedDrawdownPct: number;
  recoveryDays: number;
  immediateExitSharePct: number;
  minimumProceedsPer100: number;
  redemptionDays: number;
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
}

