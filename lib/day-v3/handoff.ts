import type {
  DayV3PoolDesignResult,
  DayV3PoolDesignTarget,
} from "@/lib/day-v3/pool-design";
import type {
  DayV3DeploymentPolicy,
  DayV3ExpiryPolicy,
  DayV3Features,
  DayV3Goals,
} from "@/lib/day-v3/types";
import {
  validateDayV3YieldCurveDesign,
  type DayV3YieldCurveDesign,
} from "@/lib/day-v3/yield-curves";

export const DAY_V3_HANDOFF_SCHEMA = "royco.day.v3-handoff" as const;
export const DAY_V3_HANDOFF_VERSION = 4 as const;

export interface DayV3HandoffYdmSelection {
  ydmType: "STATIC_CURVE" | "FIXED";
  registryAddress: `0x${string}`;
  curveParams:
    | {
        zeroUtilizationYieldShareWAD: string;
        targetUtilizationYieldShareWAD: string;
        fullUtilizationYieldShareWAD: string;
      }
    | { fixedYieldShareWAD: "0" };
  maximumYieldShareWAD: string;
}

export interface DayV3HandoffYieldPolicy {
  source: "template-registry";
  chainId: number;
  templateId: string;
  templateAddress: `0x${string}`;
  blockNumber: string;
  resolvedAt: string;
  jt: DayV3HandoffYdmSelection;
  lpt: DayV3HandoffYdmSelection;
}

export function dayV3HandoffMarketId(
  customSource: boolean,
  listedMarketId: string,
): string {
  return customSource ? "custom" : listedMarketId;
}

export function dayV3DeploymentCta(handoffReady: boolean): {
  action: "continue-deployment" | "export-incomplete";
  label: string;
} {
  return handoffReady
    ? { action: "continue-deployment", label: "Continue in deployment" }
    : { action: "export-incomplete", label: "Export incomplete draft" };
}

export function isDayV3HandoffReady(
  checks: readonly {
    ready: boolean;
    scope: "v3-handoff" | "deployment";
  }[],
): boolean {
  return checks.every((check) => check.scope !== "v3-handoff" || check.ready);
}

type ResolvedPoolDesign = Extract<
  DayV3PoolDesignResult,
  { status: "resolved" }
>;

export interface DayV3HandoffV3 {
  schema: typeof DAY_V3_HANDOFF_SCHEMA;
  version: typeof DAY_V3_HANDOFF_VERSION;
  exportedAt: string;
  status: "ready-for-revalidation";
  normalization: { senior: 100; targetUtilizationPct: 90 };
  source: {
    marketId: string;
    name: string;
    asset: string;
    sourceApyPct: number;
  };
  features: DayV3Features;
  goals: DayV3Goals;
  deploymentPolicy: DayV3DeploymentPolicy;
  modeledInputs: {
    staticYieldShareCurves: DayV3YieldCurveDesign;
    modeledShape: "STATIC_CURVE";
  };
  /** Exact registered shape selections; RWA must refresh and compare them. */
  yieldPolicy: DayV3HandoffYieldPolicy;
  recommendations: {
    minimumCoveragePct: number;
    minimumLiquidityPct: number;
    protectedExitThresholdPct: number;
    protectedExitBonusPct: number;
    canonicalPoolSnapshot: ResolvedPoolDesign | null;
  };
  warnings: string[];
}

const validInteger = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;

const validExpiry = (value: DayV3ExpiryPolicy) =>
  value === "no-expiry" || validInteger(value, 1, 4_294_967_294);

function assertDeploymentPolicy(policy: DayV3DeploymentPolicy) {
  const settlement = policy.settlement;
  if (
    settlement.appliesTo !== "all-tranches" ||
    !validInteger(settlement.depositDelaySeconds, 0, 16_777_215) ||
    !validExpiry(settlement.depositExpirySeconds) ||
    !validInteger(settlement.withdrawalDelaySeconds, 86_400, 16_777_215) ||
    !validExpiry(settlement.withdrawalExpirySeconds) ||
    typeof settlement.gateByOracleUpdate !== "boolean" ||
    !Number.isFinite(policy.maxReinvestmentSlippageBps) ||
    policy.maxReinvestmentSlippageBps < 0 ||
    policy.maxReinvestmentSlippageBps >= 10_000
  ) {
    throw new Error("INVALID_DAY_V3_DEPLOYMENT_POLICY");
  }
}

function assertFeatureInvariants(input: {
  features: DayV3Features;
  goals: DayV3Goals;
  minimumCoveragePct: number;
  minimumLiquidityPct: number;
  protectedExitThresholdPct: number;
  protectedExitBonusPct: number;
  canonicalPoolSnapshot: ResolvedPoolDesign | null;
}) {
  if (input.features.seniorProtection === "disabled") {
    if (
      input.goals.protectedDrawdownPct !== 0 ||
      input.goals.recoveryDays !== 0 ||
      input.goals.fixedTermGraceDays !== 0 ||
      input.minimumCoveragePct !== 0 ||
      input.protectedExitThresholdPct !== 0 ||
      input.protectedExitBonusPct !== 0
    ) {
      throw new Error("INCONSISTENT_DISABLED_DAY_V3_PROTECTION");
    }
  } else if (
    input.goals.protectedDrawdownPct <= 0 ||
    input.minimumCoveragePct <= 0 ||
    input.protectedExitThresholdPct <= 0 ||
    input.protectedExitThresholdPct >= input.minimumCoveragePct ||
    input.protectedExitBonusPct < 0 ||
    input.protectedExitBonusPct > input.protectedExitThresholdPct
  ) {
    throw new Error("INCONSISTENT_ENABLED_DAY_V3_PROTECTION");
  }

  if (input.features.immediateExit === "disabled") {
    if (
      input.goals.immediateExitSharePct !== 0 ||
      input.goals.minimumProceedsPer100 !== 0 ||
      input.minimumLiquidityPct !== 0
    ) {
      throw new Error("INCONSISTENT_DISABLED_DAY_V3_EXIT");
    }
  } else if (
    input.goals.immediateExitSharePct < 0.01 ||
    input.minimumLiquidityPct <= 0 ||
    input.canonicalPoolSnapshot === null
  ) {
    throw new Error("INCONSISTENT_ENABLED_DAY_V3_EXIT");
  }
}

export const percentToWad = (value: number): string => {
  if (!Number.isFinite(value) || value < 0 || value >= 100) {
    throw new Error("INVALID_DAY_V3_YIELD_SHARE");
  }
  const text = value.toFixed(12);
  const [whole, fraction = ""] = text.split(".");
  return (
    BigInt(whole) * 10n ** 16n +
    BigInt(fraction.padEnd(12, "0")) * 10n ** 4n
  ).toString();
};

function ydmSelection(
  side: "jt" | "lpt",
  enabled: boolean,
  curves: DayV3YieldCurveDesign,
  target: DayV3PoolDesignTarget,
): DayV3HandoffYdmSelection {
  const registry = target.yieldModels[side];
  const ydmType = enabled ? "STATIC_CURVE" : "FIXED";
  const registryAddress = registry[ydmType];
  if (registryAddress === null) {
    throw new Error(`UNREGISTERED_DAY_V3_${side.toUpperCase()}_${ydmType}`);
  }
  if (!enabled) {
    return {
      ydmType,
      registryAddress,
      curveParams: { fixedYieldShareWAD: "0" },
      maximumYieldShareWAD: "0",
    };
  }
  const curve = side === "jt" ? curves.junior : curves.slp;
  return {
    ydmType,
    registryAddress,
    curveParams: {
      zeroUtilizationYieldShareWAD: percentToWad(curve.y0Pct),
      targetUtilizationYieldShareWAD: percentToWad(curve.yTargetPct),
      fullUtilizationYieldShareWAD: percentToWad(curve.y100Pct),
    },
    maximumYieldShareWAD: percentToWad(curve.y100Pct),
  };
}

export function buildDayV3HandoffV3(input: {
  exportedAt: string;
  source: DayV3HandoffV3["source"];
  features: DayV3Features;
  goals: DayV3Goals;
  deploymentPolicy: DayV3DeploymentPolicy;
  minimumCoveragePct: number;
  minimumLiquidityPct: number;
  protectedExitThresholdPct: number;
  protectedExitBonusPct: number;
  canonicalPoolSnapshot: ResolvedPoolDesign | null;
  liveYieldTarget: DayV3PoolDesignTarget;
  staticYieldShareCurves: DayV3YieldCurveDesign;
}): DayV3HandoffV3 {
  if (!validateDayV3YieldCurveDesign(input.staticYieldShareCurves).valid) {
    throw new Error("INVALID_DAY_V3_YIELD_CURVE_DESIGN");
  }
  if (
    input.liveYieldTarget.chainId !== input.goals.target.chainId ||
    input.liveYieldTarget.templateId !== input.goals.target.templateId
  ) {
    throw new Error("DAY_V3_LIVE_YDM_TARGET_MISMATCH");
  }
  assertDeploymentPolicy(input.deploymentPolicy);
  assertFeatureInvariants(input);
  return {
    schema: DAY_V3_HANDOFF_SCHEMA,
    version: DAY_V3_HANDOFF_VERSION,
    exportedAt: input.exportedAt,
    status: "ready-for-revalidation",
    normalization: { senior: 100, targetUtilizationPct: 90 },
    source: input.source,
    features: input.features,
    goals: input.goals,
    deploymentPolicy: input.deploymentPolicy,
    modeledInputs: {
      staticYieldShareCurves: input.staticYieldShareCurves,
      modeledShape: "STATIC_CURVE",
    },
    yieldPolicy: {
      source: "template-registry",
      chainId: input.liveYieldTarget.chainId,
      templateId: input.liveYieldTarget.templateId,
      templateAddress: input.liveYieldTarget.templateAddress,
      blockNumber: input.liveYieldTarget.yieldModels.blockNumber,
      resolvedAt: input.liveYieldTarget.yieldModels.resolvedAt,
      jt: ydmSelection(
        "jt",
        input.features.seniorProtection === "enabled",
        input.staticYieldShareCurves,
        input.liveYieldTarget,
      ),
      lpt: ydmSelection(
        "lpt",
        input.features.immediateExit === "enabled",
        input.staticYieldShareCurves,
        input.liveYieldTarget,
      ),
    },
    recommendations: {
      minimumCoveragePct: input.minimumCoveragePct,
      minimumLiquidityPct: input.minimumLiquidityPct,
      protectedExitThresholdPct: input.protectedExitThresholdPct,
      protectedExitBonusPct: input.protectedExitBonusPct,
      canonicalPoolSnapshot: input.canonicalPoolSnapshot,
    },
    warnings: [
      "This handoff is untrusted input to deployment.",
      "Deployment must validate every goal, refresh template policy, and recompute E-CLP fields. Absolute genesis funding remains unresolved until deployment has a notional and initialization policy.",
      "Senior redemption returns the underlying asset. The external underlying-to-exit spread is an issuer-selected stress assumption; the pool-state discount and selected market pool fee are modeled separately, and none is a protocol guarantee.",
      "Settlement is a market-level product decision applied identically to Senior, Junior, and Senior LP, even though the contracts store three separate queue configs.",
      "Finite execution windows must be revalidated against the selected oracle recipe's freshness limits. NAV cadence is a modeling fact, not an EntryPoint contract field.",
      "Reinvestment slippage is an on-chain ceiling. Deployment must revalidate it against the final exit asset, rate provider, and canonical E-CLP.",
      "The 90/10 values are post-launch resting inventory, not genesis seed instructions.",
      "The handoff selects registered STATIC_CURVE models for enabled sides and FIXED zero-share models for disabled sides. Deployment must refresh the registry addresses and preserve the exact shape identity, anchors, and caps.",
      "Imported price history is intentionally excluded.",
    ],
  };
}

export function buildDayV3DeploymentUrl(
  baseUrl: string,
  handoff: DayV3HandoffV3,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("dayV3", JSON.stringify(handoff));
  return url.toString();
}
