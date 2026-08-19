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
 * The simulator exposes the contract's Y0, YT, and Y100 anchors for both Day
 * YDMs. Deployment and pool overrides stay parseable so old links do not
 * break, but invisible fields must never change a displayed result.
 */
export function dayV3ActiveOverrides(
  overrides: DayV3Overrides,
): Readonly<DayV3Overrides> {
  return {
    ...EMPTY_DAY_V3_OVERRIDES,
    jrYieldShareAtZeroPct: overrides.jrYieldShareAtZeroPct,
    jrYieldShareAtTargetPct: overrides.jrYieldShareAtTargetPct,
    jrYieldShareAtFullPct: overrides.jrYieldShareAtFullPct,
    slpYieldShareAtZeroPct: overrides.slpYieldShareAtZeroPct,
    slpYieldShareAtTargetPct: overrides.slpYieldShareAtTargetPct,
    slpYieldShareAtFullPct: overrides.slpYieldShareAtFullPct,
  };
}
