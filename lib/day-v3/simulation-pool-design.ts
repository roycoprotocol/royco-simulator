import {
  DAY_V3_POOL_DESIGN_MODEL,
  DAY_V3_POOL_DESIGN_SCHEMA,
  isDayV3PoolDesignResult,
  isDayV3ResolvedPolicy,
  DAY_V3_POOL_SWAP_FEE_BPS_RANGE,
  type DayV3PoolDesignIssue,
  type DayV3PoolDesignRecommendation,
  type DayV3ResolvedPolicy,
} from "@/lib/day-v3/pool-design";

export const DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA = "1.1" as const;

export interface DayV3SimulationPoolDesignGoals {
  protectedDrawdownPct: number;
  recoveryDays: number;
  immediateExitSharePct: number;
  minimumProceedsPer100: number;
}

export interface DayV3SimulationPoolDesignContext {
  sourceApyPct: number;
  /** Market-specific pool creation fee supplied to the simulation solver. */
  swapFeeBps: number;
}

export interface DayV3SimulationPoolDesignRequest {
  schemaVersion: typeof DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA;
  goals: DayV3SimulationPoolDesignGoals;
  context: DayV3SimulationPoolDesignContext;
}

export interface DayV3SimulationPolicy extends DayV3ResolvedPolicy {
  selectionOrigin: "product-simulation-policy";
}

export interface DayV3SimulationDeploymentState {
  entryPointSettlementDays: null;
  collateralToExitDays: null;
  collateralToExitCostBps: null;
  fixedTermGraceDays: null;
  navUpdateDays: null;
  target: null;
  restock: {
    modelUsage: "not-modeled";
    hurdleBps: null;
    operationalHurdleBps: null;
    marginAfterPromisedExitBps: null;
    grossMarginAfterPromisedExitBps: null;
    economicFromSoldPct: null;
  };
}

interface DayV3SimulationPoolDesignBase {
  schemaVersion: typeof DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA;
  modelVersion: typeof DAY_V3_POOL_DESIGN_MODEL;
  mode: "simulation";
  goals: DayV3SimulationPoolDesignGoals;
  context: DayV3SimulationPoolDesignContext;
  policy: DayV3SimulationPolicy;
  deployment: DayV3SimulationDeploymentState;
}

export type DayV3SimulationPoolDesignResult =
  | (DayV3SimulationPoolDesignBase & {
      status: "resolved";
      recommendation: DayV3PoolDesignRecommendation;
      issues: [];
    })
  | (DayV3SimulationPoolDesignBase & {
      status: "infeasible";
      recommendation: null;
      issues: DayV3PoolDesignIssue[];
    })
  | {
      schemaVersion: typeof DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA;
      modelVersion: typeof DAY_V3_POOL_DESIGN_MODEL;
      mode: "simulation";
      status: "invalid" | "unresolved";
      goals?: DayV3SimulationPoolDesignGoals;
      context?: DayV3SimulationPoolDesignContext;
      policy?: null;
      deployment?: DayV3SimulationDeploymentState | null;
      recommendation: null;
      issues: DayV3PoolDesignIssue[];
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  const expected = new Set(allowed);
  return Object.keys(value).every((key) => expected.has(key));
}

export function isDayV3SimulationPoolDesignGoals(
  value: unknown,
): value is DayV3SimulationPoolDesignGoals {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "protectedDrawdownPct",
      "recoveryDays",
      "immediateExitSharePct",
      "minimumProceedsPer100",
    ]) &&
    isFiniteNumber(value.protectedDrawdownPct) &&
    value.protectedDrawdownPct >= 0 &&
    value.protectedDrawdownPct <= 95 &&
    isFiniteNumber(value.recoveryDays) &&
    Number.isInteger(value.recoveryDays) &&
    value.recoveryDays >= 0 &&
    value.recoveryDays <= 194 &&
    isFiniteNumber(value.immediateExitSharePct) &&
    value.immediateExitSharePct >= 0.01 &&
    value.immediateExitSharePct <= 100 &&
    isFiniteNumber(value.minimumProceedsPer100) &&
    value.minimumProceedsPer100 >= 0 &&
    value.minimumProceedsPer100 <= 100
  );
}

export function isDayV3SimulationPoolDesignContext(
  value: unknown,
): value is DayV3SimulationPoolDesignContext {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["sourceApyPct", "swapFeeBps"]) &&
    isFiniteNumber(value.sourceApyPct) &&
    value.sourceApyPct >= 0 &&
    value.sourceApyPct <= 100 &&
    isFiniteNumber(value.swapFeeBps) &&
    value.swapFeeBps >= DAY_V3_POOL_SWAP_FEE_BPS_RANGE.min &&
    value.swapFeeBps <= DAY_V3_POOL_SWAP_FEE_BPS_RANGE.max
  );
}

function isIssue(value: unknown): value is DayV3PoolDesignIssue {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["code", "message", "field"]) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    (value.field === undefined || typeof value.field === "string")
  );
}

function isSimulationPolicy(value: unknown): value is DayV3SimulationPolicy {
  return (
    isRecord(value) &&
    value.selectionOrigin === "product-simulation-policy" &&
    isDayV3ResolvedPolicy(value)
  );
}

function isDeploymentState(
  value: unknown,
): value is DayV3SimulationDeploymentState {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "entryPointSettlementDays",
      "collateralToExitDays",
      "collateralToExitCostBps",
      "fixedTermGraceDays",
      "navUpdateDays",
      "target",
      "restock",
    ]) ||
    !isRecord(value.restock) ||
    !hasOnlyKeys(value.restock, [
      "modelUsage",
      "hurdleBps",
      "operationalHurdleBps",
      "marginAfterPromisedExitBps",
      "grossMarginAfterPromisedExitBps",
      "economicFromSoldPct",
    ])
  ) {
    return false;
  }
  return (
    value.entryPointSettlementDays === null &&
    value.collateralToExitDays === null &&
    value.collateralToExitCostBps === null &&
    value.fixedTermGraceDays === null &&
    value.navUpdateDays === null &&
    value.target === null &&
    value.restock.modelUsage === "not-modeled" &&
    value.restock.hurdleBps === null &&
    value.restock.operationalHurdleBps === null &&
    value.restock.marginAfterPromisedExitBps === null &&
    value.restock.grossMarginAfterPromisedExitBps === null &&
    value.restock.economicFromSoldPct === null
  );
}

function isSimulationRecommendation(
  value: unknown,
  goals: DayV3SimulationPoolDesignGoals,
  context: DayV3SimulationPoolDesignContext,
  policy: DayV3SimulationPolicy,
): value is DayV3PoolDesignRecommendation {
  // Recommendation and E-CLP validation stays byte-for-byte aligned with the
  // deploy parser. Null operational facts select its scenario-only restock
  // branch, which is exactly the Simulation endpoint's contract.
  return isDayV3PoolDesignResult({
    schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
    modelVersion: DAY_V3_POOL_DESIGN_MODEL,
    status: "resolved",
    goals: {
      ...goals,
      entryPointSettlementDays: 1,
      collateralToExitDays: null,
      collateralToExitCostBps: null,
      fixedTermGraceDays: 0,
      navUpdateDays: 1,
      target: { chainId: policy.chainId, templateId: policy.templateId },
    },
    context: {
      sourceApyPct: context.sourceApyPct,
      swapFeeBps: context.swapFeeBps,
      exitAsset: null,
      exitAssetRateProvider: null,
      exitAssetYieldBearing: null,
    },
    policy,
    recommendation: value,
    issues: [],
  });
}

export function isDayV3SimulationPoolDesignResult(
  value: unknown,
): value is DayV3SimulationPoolDesignResult {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA ||
    value.modelVersion !== DAY_V3_POOL_DESIGN_MODEL ||
    value.mode !== "simulation" ||
    !Array.isArray(value.issues) ||
    !value.issues.every(isIssue) ||
    value.recommendation === undefined
  ) {
    return false;
  }

  if (value.status === "invalid" || value.status === "unresolved") {
    return (
      value.recommendation === null &&
      (value.goals === undefined ||
        isDayV3SimulationPoolDesignGoals(value.goals)) &&
      (value.context === undefined ||
        isDayV3SimulationPoolDesignContext(value.context)) &&
      (value.policy === undefined || value.policy === null) &&
      (value.deployment === undefined ||
        value.deployment === null ||
        isDeploymentState(value.deployment))
    );
  }

  if (
    (value.status !== "resolved" && value.status !== "infeasible") ||
    !isDayV3SimulationPoolDesignGoals(value.goals) ||
    !isDayV3SimulationPoolDesignContext(value.context) ||
    !isSimulationPolicy(value.policy) ||
    !isDeploymentState(value.deployment)
  ) {
    return false;
  }

  if (value.status === "infeasible") {
    return value.recommendation === null && value.issues.length > 0;
  }
  return (
    value.issues.length === 0 &&
    isSimulationRecommendation(
      value.recommendation,
      value.goals,
      value.context,
      value.policy,
    )
  );
}

export function dayV3SimulationPoolDesignMatchesRequest(
  result: DayV3SimulationPoolDesignResult,
  goals: DayV3SimulationPoolDesignGoals,
  sourceApyPct: number,
  swapFeeBps: number,
): boolean {
  return (
    result.goals !== undefined &&
    result.context !== undefined &&
    result.goals.protectedDrawdownPct === goals.protectedDrawdownPct &&
    result.goals.recoveryDays === goals.recoveryDays &&
    result.goals.immediateExitSharePct === goals.immediateExitSharePct &&
    result.goals.minimumProceedsPer100 === goals.minimumProceedsPer100 &&
    result.context.sourceApyPct === sourceApyPct &&
    result.context.swapFeeBps === swapFeeBps
  );
}

/** The key is also the exact minimal request body sent by the client hook. */
export function dayV3SimulationPoolDesignRequestKey(
  goals: DayV3SimulationPoolDesignGoals | null,
  sourceApyPct: number | null,
  swapFeeBps: number | null,
): string | null {
  const context = { sourceApyPct, swapFeeBps };
  if (
    !isDayV3SimulationPoolDesignGoals(goals) ||
    !isDayV3SimulationPoolDesignContext(context)
  ) {
    return null;
  }
  return JSON.stringify({
    schemaVersion: DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA,
    goals,
    context,
  } satisfies DayV3SimulationPoolDesignRequest);
}
