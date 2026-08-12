import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";
import { dayV3CapitalAtTarget, type DayV3RelativeCapital } from "@/lib/day-v3/normalization";
import type { DayV3DesignField } from "@/lib/day-v3/types";

export type DayV3LiquidityInversionStatus =
  | "recommended"
  | "infeasible"
  | "invalid-input";

export interface DayV3LiquidityInversion {
  status: DayV3LiquidityInversionStatus;
  minimumLiquidity: DayV3DesignField<number>;
  capital: DayV3RelativeCapital | null;
  poolFundingPer100Senior: number;
  reason: string;
}

const unresolved = (
  status: Exclude<DayV3LiquidityInversionStatus, "recommended">,
  poolFundingPer100Senior: number,
  reason: string,
): DayV3LiquidityInversion => ({
  status,
  minimumLiquidity: {
    id: "minimum-liquidity",
    value: null,
    unit: "%",
    origin: "unresolved",
    deployPath: "accountantParams.minLiquidityWAD",
    modelUsage: "fully-modeled",
    evidence: [reason],
  },
  capital: null,
  poolFundingPer100Senior,
  reason,
});

/**
 * Invert the shared 90%-utilization capital sizing numerically. This converts
 * a canonical service's pool funding into the on-chain Minimum Liquidity term
 * without restating the accountant relationship.
 */
export function dayV3MinimumLiquidityForPoolFunding(
  defaults: DaySimulatorDefaults,
  input: {
    poolFundingPer100Senior: number;
    coveragePct: number;
    liquidityResolutionBps?: number;
  },
): DayV3LiquidityInversion {
  const { poolFundingPer100Senior, coveragePct } = input;
  if (!Number.isFinite(poolFundingPer100Senior) || poolFundingPer100Senior < 0) {
    return unresolved(
      "invalid-input",
      poolFundingPer100Senior,
      "Pool funding per 100 Senior must be a non-negative number.",
    );
  }
  if (!Number.isFinite(coveragePct) || coveragePct < 0 || coveragePct >= 90) {
    return unresolved(
      "invalid-input",
      poolFundingPer100Senior,
      "Coverage must be at least 0% and below the 90% operating target.",
    );
  }
  const resolution = input.liquidityResolutionBps ?? 1;
  if (!Number.isInteger(resolution) || resolution < 1 || resolution > 100) {
    return unresolved(
      "invalid-input",
      poolFundingPer100Senior,
      "Liquidity resolution must be a whole number from 1 to 100 basis points.",
    );
  }
  let maxStep = Math.floor(9_999 / resolution);
  const at = (step: number) => dayV3CapitalAtTarget(defaults, {
    coveragePct,
    minimumLiquidityPct: (step * resolution) / 100,
  });
  const maximum = at(maxStep);
  if (maximum.slpPer100 + 1e-9 < poolFundingPer100Senior) {
    return unresolved(
      "infeasible",
      poolFundingPer100Senior,
      "The requested pool funding exceeds the largest deployable Minimum Liquidity setting.",
    );
  }

  let lowStep = 0;
  while (lowStep < maxStep) {
    const mid = Math.floor((lowStep + maxStep) / 2);
    if (at(mid).slpPer100 + 1e-9 >= poolFundingPer100Senior) maxStep = mid;
    else lowStep = mid + 1;
  }
  const capital = at(lowStep);
  const minimumLiquidityPct = (lowStep * resolution) / 100;
  return {
    status: "recommended",
    minimumLiquidity: {
      id: "minimum-liquidity",
      value: minimumLiquidityPct,
      unit: "%",
      origin: "derived",
      deployPath: "accountantParams.minLiquidityWAD",
      modelUsage: "fully-modeled",
      evidence: [
        `Smallest ${resolution} bp setting whose shared 90%-utilization sizing funds at least ${poolFundingPer100Senior} per 100 Senior.`,
      ],
    },
    capital,
    poolFundingPer100Senior,
    reason: "Converted through the shared capital-utilization solver.",
  };
}
