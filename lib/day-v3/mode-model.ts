import type { DayV3Overrides } from "@/lib/day-v3/types";

export const EMPTY_DAY_V3_OVERRIDES: Readonly<DayV3Overrides> = Object.freeze({
  coveragePct: null,
  minimumLiquidityPct: null,
  maximumDiscountPct: null,
  depthAtNav: null,
  maximumPremiumPct: null,
  protectedExitThresholdPct: null,
  protectedExitBonusPct: null,
  poolCapitalPer100: null,
  jrYieldShareAtZeroPct: null,
  jrYieldShareAtTargetPct: null,
  jrYieldShareAtFullPct: null,
  slpYieldShareAtZeroPct: null,
  slpYieldShareAtTargetPct: null,
  slpYieldShareAtFullPct: null,
});

/**
 * Manual contract fields belong to Deploy. Simulate keeps them in URL state so
 * a mode switch is lossless, but its models must only use controls the reader
 * can actually see.
 */
export function dayV3ActiveOverrides(
  deploying: boolean,
  overrides: DayV3Overrides,
): Readonly<DayV3Overrides> {
  return deploying ? overrides : EMPTY_DAY_V3_OVERRIDES;
}
