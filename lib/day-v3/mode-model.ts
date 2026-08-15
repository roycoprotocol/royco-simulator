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
 * The simulator exposes only the two yield shares paid at the operating
 * target. Legacy curve-shape and deployment overrides stay parseable so old
 * links do not break, but invisible fields must never change a displayed
 * result.
 */
export function dayV3ActiveOverrides(
  overrides: DayV3Overrides,
): Readonly<DayV3Overrides> {
  return {
    ...EMPTY_DAY_V3_OVERRIDES,
    jrYieldShareAtTargetPct: overrides.jrYieldShareAtTargetPct,
    slpYieldShareAtTargetPct: overrides.slpYieldShareAtTargetPct,
  };
}
