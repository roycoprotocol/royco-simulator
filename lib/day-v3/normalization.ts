import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";
import { dayCapitalAtUtilization } from "@/lib/day-simulator-template/capital-sizing";
import { DAY_TARGET_UTILIZATION } from "@/lib/day-simulator-template/runtime";
import { DAY_V3_SENIOR_BASIS } from "@/lib/day-v3/types";

export interface DayV3RelativeCapital {
  seniorPer100: number;
  juniorPer100: number;
  slpPer100: number;
  targetUtilization: number;
}

/** Preserve a market's ratios while replacing its arbitrary notional with 100 Senior. */
export function normalizeDayV3Defaults(
  defaults: DaySimulatorDefaults,
): DaySimulatorDefaults {
  const scale = defaults.initialST > 0
    ? DAY_V3_SENIOR_BASIS / defaults.initialST
    : 0;
  return {
    ...defaults,
    initialST: DAY_V3_SENIOR_BASIS,
    initialJT: defaults.initialJT * scale,
    initialLT: defaults.initialLT * scale,
  };
}

/** Size Junior and SLP through the shared utilization inversion, not UI math. */
export function dayV3CapitalAtTarget(
  defaults: DaySimulatorDefaults,
  terms: { coveragePct: number; minimumLiquidityPct: number },
): DayV3RelativeCapital {
  if (
    !Number.isFinite(terms.coveragePct) ||
    terms.coveragePct < 0 ||
    terms.coveragePct >= DAY_TARGET_UTILIZATION * 100
  ) {
    throw new Error("V3 coverage must be at least 0% and below the 90% operating target");
  }
  if (
    !Number.isFinite(terms.minimumLiquidityPct) ||
    terms.minimumLiquidityPct < 0 ||
    terms.minimumLiquidityPct >= 100
  ) {
    throw new Error("V3 minimum liquidity must be at least 0% and below 100%");
  }

  const balances = dayCapitalAtUtilization(
    normalizeDayV3Defaults(defaults),
    {
      coverage: terms.coveragePct / 100,
      minLiquidity: terms.minimumLiquidityPct / 100,
    },
    DAY_TARGET_UTILIZATION,
  );
  return {
    seniorPer100: balances.st,
    juniorPer100: balances.jt,
    slpPer100: balances.lt,
    targetUtilization: DAY_TARGET_UTILIZATION,
  };
}

