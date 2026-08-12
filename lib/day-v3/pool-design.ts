import type { DayV3Goals } from "@/lib/day-v3/types";

export const DAY_V3_POOL_DESIGN_SCHEMA = "1.0" as const;
export const DAY_V3_POOL_DESIGN_MODEL =
  "day-v3-eclp-goal-solver-1.0.0" as const;

export interface DayV3PoolDesignTarget {
  chainId: number;
  chainName: string;
  templateId: string;
  templateName: string;
  templateAddress: `0x${string}`;
}

export interface DayV3PoolDesignIssue {
  code: string;
  message: string;
  field?: string;
}

export interface DayV3ResolvedPolicy extends DayV3PoolDesignTarget {
  status: "resolved";
  swapFeeBps: number;
  blockNumber: string;
  resolvedAt: string;
}

export interface DayV3PoolDesignField {
  value: number;
  unit: string;
  origin:
    | "issuer-goal"
    | "recommended"
    | "derived"
    | "template-policy"
    | "manual-override"
    | "unresolved";
  deployPath: string | null;
  modelUsage: "fully-modeled" | "scenario-only" | "not-modeled";
  evidence: string[];
}

export interface DayV3PoolDesignRecommendation {
  normalizedSenior: 100;
  fields: {
    maximumDiscountBps: DayV3PoolDesignField;
    depthAtNavLambda: DayV3PoolDesignField;
    maximumPremiumBps: DayV3PoolDesignField;
    swapFeeBps: DayV3PoolDesignField;
    poolFundingPer100Senior: DayV3PoolDesignField;
  };
  outcomes: {
    amountSellablePer100Senior: number;
    proceedsForPromisedExit: number;
    promisedExitCostBps: number;
    lowestModeledPayoutPer100: number;
    requiredPoolFundingPer100Senior: number;
    nearNavCostBps: number;
    exitAssetShareAtNavPct: number;
    seniorShareAtNavPct: number;
    exitAssetSeedPer100Senior: number;
    seniorSeedPer100Senior: number;
    soldAfterPromisedExitPct: number;
    restockHurdleBps: number;
    restockOperationalHurdleBps: number;
    restockSwapFeeBps: number;
    restockGrossMarginAfterPromisedExitBps: number;
    restockMarginAfterPromisedExitBps: number;
    restockEconomicFromSoldPct: number | null;
  };
  eclp: {
    params: Record<"alpha" | "beta" | "c" | "s" | "lambda", string>;
    derivedParams: Record<string, string>;
  };
  search: {
    maximumPoolFundingPer100Senior: number;
    fundingIncrement: number;
    discountStepBps: number;
    lambdaStep: number;
    ranking: ["least-pool-capital", "tightest-floor", "cheapest-near-nav"];
  };
}

export type DayV3PoolDesignResult =
  | {
      schemaVersion: typeof DAY_V3_POOL_DESIGN_SCHEMA;
      modelVersion: typeof DAY_V3_POOL_DESIGN_MODEL;
      status: "resolved";
      goals: DayV3Goals;
      policy: DayV3ResolvedPolicy;
      recommendation: DayV3PoolDesignRecommendation;
      issues: [];
    }
  | {
      schemaVersion: string;
      modelVersion: string;
      status: "infeasible" | "unresolved" | "invalid";
      goals?: DayV3Goals;
      policy?: unknown;
      recommendation: null;
      issues: DayV3PoolDesignIssue[];
      availableTargets?: DayV3PoolDesignTarget[];
    };

export interface DayV3PoolDesignInventory {
  schemaVersion: typeof DAY_V3_POOL_DESIGN_SCHEMA;
  modelVersion: typeof DAY_V3_POOL_DESIGN_MODEL;
  status: "resolved" | "unresolved";
  targets: DayV3PoolDesignTarget[];
  issues: DayV3PoolDesignIssue[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
const FIELD_ORIGINS = new Set([
  "issuer-goal",
  "recommended",
  "derived",
  "template-policy",
  "manual-override",
  "unresolved",
]);
const MODEL_USAGES = new Set([
  "fully-modeled",
  "scenario-only",
  "not-modeled",
]);

function isTarget(value: unknown): value is DayV3PoolDesignTarget {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.chainId) &&
    Number(value.chainId) > 0 &&
    typeof value.chainName === "string" &&
    typeof value.templateId === "string" &&
    value.templateId.length > 0 &&
    typeof value.templateName === "string" &&
    typeof value.templateAddress === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(value.templateAddress)
  );
}

function isResolvedPolicy(value: unknown): value is DayV3ResolvedPolicy {
  return (
    isTarget(value) &&
    isRecord(value) &&
    value.status === "resolved" &&
    isFiniteNumber(value.swapFeeBps) &&
    value.swapFeeBps >= 0 &&
    value.swapFeeBps < 10_000 &&
    typeof value.blockNumber === "string" &&
    /^\d+$/.test(value.blockNumber) &&
    typeof value.resolvedAt === "string" &&
    Number.isFinite(Date.parse(value.resolvedAt))
  );
}

function isGoals(value: unknown): value is DayV3Goals {
  if (!isRecord(value) || !isRecord(value.target)) return false;
  return (
    isFiniteNumber(value.protectedDrawdownPct) &&
    value.protectedDrawdownPct >= 0 &&
    value.protectedDrawdownPct <= 95 &&
    isFiniteNumber(value.recoveryDays) &&
    Number.isInteger(value.recoveryDays) &&
    value.recoveryDays >= 0 &&
    value.recoveryDays <= 194 &&
    isFiniteNumber(value.immediateExitSharePct) &&
    value.immediateExitSharePct > 0 &&
    value.immediateExitSharePct <= 100 &&
    isFiniteNumber(value.minimumProceedsPer100) &&
    value.minimumProceedsPer100 >= 0 &&
    value.minimumProceedsPer100 <= 100 &&
    isFiniteNumber(value.redemptionDays) &&
    Number.isInteger(value.redemptionDays) &&
    value.redemptionDays >= 0 &&
    value.redemptionDays <= 365 &&
    isFiniteNumber(value.navUpdateDays) &&
    Number.isInteger(value.navUpdateDays) &&
    value.navUpdateDays >= 1 &&
    value.navUpdateDays <= 365 &&
    Number.isSafeInteger(value.target.chainId) &&
    Number(value.target.chainId) > 0 &&
    typeof value.target.templateId === "string" &&
    value.target.templateId.length > 0
  );
}

function isIssue(value: unknown): value is DayV3PoolDesignIssue {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    (value.field === undefined || typeof value.field === "string")
  );
}

function isDesignField(value: unknown): value is DayV3PoolDesignField {
  return (
    isRecord(value) &&
    isFiniteNumber(value.value) &&
    typeof value.unit === "string" &&
    FIELD_ORIGINS.has(String(value.origin)) &&
    (value.deployPath === null || typeof value.deployPath === "string") &&
    MODEL_USAGES.has(String(value.modelUsage)) &&
    Array.isArray(value.evidence) &&
    value.evidence.every((entry) => typeof entry === "string")
  );
}

export function isDayV3PoolDesignInventory(
  value: unknown,
): value is DayV3PoolDesignInventory {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DAY_V3_POOL_DESIGN_SCHEMA ||
    value.modelVersion !== DAY_V3_POOL_DESIGN_MODEL
  ) {
    return false;
  }
  if (
    !["resolved", "unresolved"].includes(String(value.status)) ||
    !Array.isArray(value.targets) ||
    !Array.isArray(value.issues)
  ) {
    return false;
  }
  return value.targets.every(isTarget) && value.issues.every(isIssue);
}

export function isDayV3PoolDesignResult(
  value: unknown,
): value is DayV3PoolDesignResult {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (!Array.isArray(value.issues) || !value.issues.every(isIssue)) return false;
  if (value.status === "resolved") {
    if (
      value.schemaVersion !== DAY_V3_POOL_DESIGN_SCHEMA ||
      value.modelVersion !== DAY_V3_POOL_DESIGN_MODEL ||
      !isGoals(value.goals) ||
      !isResolvedPolicy(value.policy) ||
      value.policy.chainId !== value.goals.target.chainId ||
      value.policy.templateId !== value.goals.target.templateId ||
      !isRecord(value.recommendation) ||
      value.recommendation.normalizedSenior !== 100 ||
      !isRecord(value.recommendation.fields) ||
      !isRecord(value.recommendation.outcomes) ||
      !isRecord(value.recommendation.eclp) ||
      !isRecord(value.recommendation.search) ||
      value.issues.length !== 0
    ) {
      return false;
    }
    const fields = value.recommendation.fields;
    if (
      !isDesignField(fields.maximumDiscountBps) ||
      !isDesignField(fields.depthAtNavLambda) ||
      !isDesignField(fields.maximumPremiumBps) ||
      !isDesignField(fields.swapFeeBps) ||
      !isDesignField(fields.poolFundingPer100Senior) ||
      fields.swapFeeBps.value !== value.policy.swapFeeBps ||
      fields.maximumDiscountBps.origin !== "recommended" ||
      fields.depthAtNavLambda.origin !== "recommended" ||
      fields.maximumPremiumBps.origin !== "derived" ||
      fields.swapFeeBps.origin !== "template-policy" ||
      fields.poolFundingPer100Senior.origin !== "recommended"
    ) {
      return false;
    }
    const outcomes = value.recommendation.outcomes;
    const numericOutcomes = [
      outcomes.amountSellablePer100Senior,
      outcomes.proceedsForPromisedExit,
      outcomes.promisedExitCostBps,
      outcomes.lowestModeledPayoutPer100,
      outcomes.requiredPoolFundingPer100Senior,
      outcomes.nearNavCostBps,
      outcomes.exitAssetShareAtNavPct,
      outcomes.seniorShareAtNavPct,
      outcomes.exitAssetSeedPer100Senior,
      outcomes.seniorSeedPer100Senior,
      outcomes.soldAfterPromisedExitPct,
      outcomes.restockHurdleBps,
      outcomes.restockOperationalHurdleBps,
      outcomes.restockSwapFeeBps,
      outcomes.restockGrossMarginAfterPromisedExitBps,
      outcomes.restockMarginAfterPromisedExitBps,
    ];
    if (
      !numericOutcomes.every(isFiniteNumber) ||
      outcomes.amountSellablePer100Senior !==
        value.goals.immediateExitSharePct ||
      outcomes.requiredPoolFundingPer100Senior !==
        fields.poolFundingPer100Senior.value ||
      outcomes.proceedsForPromisedExit < 0 ||
      outcomes.lowestModeledPayoutPer100 < value.goals.minimumProceedsPer100 ||
      Math.abs(
        outcomes.exitAssetShareAtNavPct + outcomes.seniorShareAtNavPct - 100,
      ) > 1e-4 ||
      (outcomes.restockEconomicFromSoldPct !== null &&
        !isFiniteNumber(outcomes.restockEconomicFromSoldPct))
    ) {
      return false;
    }
    const params = value.recommendation.eclp.params;
    if (
      !isRecord(params) ||
      !["alpha", "beta", "c", "s", "lambda"].every(
        (key) => typeof params[key] === "string" && /^-?\d+$/.test(params[key]),
      ) ||
      !isStringRecord(value.recommendation.eclp.derivedParams)
    ) {
      return false;
    }
    const search = value.recommendation.search;
    return (
      [
        search.maximumPoolFundingPer100Senior,
        search.fundingIncrement,
        search.discountStepBps,
        search.lambdaStep,
      ].every(isFiniteNumber) &&
      Array.isArray(search.ranking) &&
      search.ranking.join("|") ===
        "least-pool-capital|tightest-floor|cheapest-near-nav"
    );
  }
  return (
    value.schemaVersion === DAY_V3_POOL_DESIGN_SCHEMA &&
    value.modelVersion === DAY_V3_POOL_DESIGN_MODEL &&
    ["infeasible", "unresolved", "invalid"].includes(value.status) &&
    value.recommendation === null &&
    (value.goals === undefined || isGoals(value.goals)) &&
    (value.availableTargets === undefined ||
      (Array.isArray(value.availableTargets) &&
        value.availableTargets.every(isTarget)))
  );
}

export function dayV3PoolDesignMatchesGoals(
  result: Extract<DayV3PoolDesignResult, { status: "resolved" }>,
  goals: DayV3Goals,
): boolean {
  return (
    result.goals.protectedDrawdownPct === goals.protectedDrawdownPct &&
    result.goals.recoveryDays === goals.recoveryDays &&
    result.goals.immediateExitSharePct === goals.immediateExitSharePct &&
    result.goals.minimumProceedsPer100 === goals.minimumProceedsPer100 &&
    result.goals.redemptionDays === goals.redemptionDays &&
    result.goals.navUpdateDays === goals.navUpdateDays &&
    result.goals.target.chainId === goals.target.chainId &&
    result.goals.target.templateId === goals.target.templateId
  );
}

export function dayV3PoolDesignIssueMessage(
  issues: DayV3PoolDesignIssue[],
  fallback: string,
): string {
  const messages = issues
    .map((issue) => issue.message.trim())
    .filter(Boolean);
  return messages.length > 0 ? messages.join(" ") : fallback;
}
