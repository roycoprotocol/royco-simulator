import type { DayV3Goals } from "@/lib/day-v3/types";

export const DAY_V3_POOL_DESIGN_SCHEMA = "1.2" as const;
export const DAY_V3_POOL_DESIGN_MODEL =
  "day-v3-eclp-goal-solver-1.1.0" as const;

export const DAY_V3_DERIVED_ECLP_KEYS = [
  "tauAlphaX",
  "tauAlphaY",
  "tauBetaX",
  "tauBetaY",
  "u",
  "v",
  "w",
  "z",
  "dSq",
] as const;

export const DAY_V3_YDM_TYPES = [
  "STATIC_CURVE",
  "ADAPTIVE_CURVE_V1",
  "ADAPTIVE_CURVE_V2",
  "FIXED",
] as const;

export type DayV3YdmType = (typeof DAY_V3_YDM_TYPES)[number];

export type DayV3RegisteredYdmAddresses = Record<
  DayV3YdmType,
  `0x${string}` | null
>;

export interface DayV3YieldModelPolicy {
  source: "template-registry";
  jt: DayV3RegisteredYdmAddresses;
  lpt: DayV3RegisteredYdmAddresses;
  blockNumber: string;
  resolvedAt: string;
}

export type DayV3DerivedEclpParams = Record<
  (typeof DAY_V3_DERIVED_ECLP_KEYS)[number],
  string
>;

export interface DayV3PoolDesignTarget {
  chainId: number;
  chainName: string;
  templateId: string;
  templateName: string;
  templateAddress: `0x${string}`;
  yieldModels: DayV3YieldModelPolicy;
}

export interface DayV3PoolDesignContext {
  sourceApyPct: number;
  exitAsset: `0x${string}` | null;
  exitAssetRateProvider: `0x${string}` | null;
  exitAssetYieldBearing: boolean | null;
}

export interface DayV3PoolDesignIssue {
  code: string;
  message: string;
  field?: string;
}

export interface DayV3ResolvedPolicy extends DayV3PoolDesignTarget {
  status: "resolved";
  swapFeeBps: number;
  chargeYieldFeeOnSeniorTrancheShares: boolean;
  chargeYieldFeeOnQuoteAsset: boolean;
  protocolFees: {
    stProtocolFeeWad: string;
    jtProtocolFeeWad: string;
    jtYieldShareProtocolFeeWad: string;
    lptYieldShareProtocolFeeWad: string;
  };
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
    /** Post-launch 90/10 resting inventory, never genesis seed instructions. */
    restingExitAssetPer100Senior: number;
    restingSeniorPer100Senior: number;
    soldAfterPromisedExitPct: number;
    restockModelUsage: "fully-modeled" | "scenario-only";
    restockHurdleBps: number | null;
    restockOperationalHurdleBps: number | null;
    collateralToExitCostBps: number | null;
    restockSwapFeeBps: number;
    restockGrossMarginAfterPromisedExitBps: number | null;
    restockMarginAfterPromisedExitBps: number | null;
    restockEconomicFromSoldPct: number | null;
  };
  eclp: {
    params: Record<"alpha" | "beta" | "c" | "s" | "lambda", string>;
    derivedParams: DayV3DerivedEclpParams;
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
      context: DayV3PoolDesignContext;
      policy: DayV3ResolvedPolicy;
      recommendation: DayV3PoolDesignRecommendation;
      issues: [];
    }
  | {
      schemaVersion: string;
      modelVersion: string;
      status: "infeasible" | "unresolved" | "invalid";
      goals?: DayV3Goals;
      context?: DayV3PoolDesignContext;
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
const FIELD_ORIGINS = new Set([
  "issuer-goal",
  "recommended",
  "derived",
  "template-policy",
  "manual-override",
  "unresolved",
]);
const MODEL_USAGES = new Set(["fully-modeled", "scenario-only", "not-modeled"]);

function isExactDerivedEclpParams(
  value: unknown,
): value is DayV3DerivedEclpParams {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== DAY_V3_DERIVED_ECLP_KEYS.length
  ) {
    return false;
  }
  const int256Min = -(1n << 255n);
  const int256Max = (1n << 255n) - 1n;
  try {
    for (const key of DAY_V3_DERIVED_ECLP_KEYS) {
      const entry = value[key];
      if (typeof entry !== "string" || !/^-?\d+$/.test(entry)) {
        return false;
      }
      const parsed = BigInt(entry);
      if (parsed < int256Min || parsed > int256Max) {
        return false;
      }
      if (key === "dSq" && parsed <= 0n) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function isUsableCanonicalEclpParams(
  value: unknown,
  expectedLambda: number,
): value is Record<"alpha" | "beta" | "c" | "s" | "lambda", string> {
  if (
    !isRecord(value) ||
    !["alpha", "beta", "c", "s", "lambda"].every(
      (key) => typeof value[key] === "string" && /^\d+$/.test(value[key]),
    )
  ) {
    return false;
  }
  try {
    const alpha = BigInt(value.alpha as string);
    const beta = BigInt(value.beta as string);
    const c = BigInt(value.c as string);
    const s = BigInt(value.s as string);
    const lambda = BigInt(value.lambda as string);
    const wad = 10n ** 18n;
    return (
      alpha > 0n &&
      alpha < beta &&
      beta < 2n * wad &&
      c >= 0n &&
      c <= wad &&
      s >= 0n &&
      s <= wad &&
      lambda === BigInt(expectedLambda) * wad &&
      [alpha, beta, c, s, lambda].every((entry) =>
        Number.isFinite(Number(entry) / 1e18),
      )
    );
  } catch {
    return false;
  }
}

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
    /^0x[0-9a-fA-F]{40}$/.test(value.templateAddress) &&
    isYieldModelPolicy(value.yieldModels)
  );
}

function isRegisteredYdmSide(
  value: unknown,
): value is DayV3RegisteredYdmAddresses {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== DAY_V3_YDM_TYPES.length ||
    !DAY_V3_YDM_TYPES.every((shape) => Object.hasOwn(value, shape))
  ) {
    return false;
  }
  let registered = 0;
  for (const shape of DAY_V3_YDM_TYPES) {
    const address = value[shape];
    if (address === null) continue;
    if (
      typeof address !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(address) ||
      /^0x0{40}$/i.test(address)
    ) {
      return false;
    }
    registered += 1;
  }
  return registered > 0;
}

function isYieldModelPolicy(value: unknown): value is DayV3YieldModelPolicy {
  const shapeValid =
    isRecord(value) &&
    value.source === "template-registry" &&
    isRegisteredYdmSide(value.jt) &&
    isRegisteredYdmSide(value.lpt) &&
    typeof value.blockNumber === "string" &&
    /^\d+$/.test(value.blockNumber) &&
    typeof value.resolvedAt === "string" &&
    Number.isFinite(Date.parse(value.resolvedAt));
  if (!shapeValid) return false;
  const policy = value as unknown as DayV3YieldModelPolicy;
  return DAY_V3_YDM_TYPES.every(
    (shape) =>
      policy.jt[shape] === null || policy.jt[shape] !== policy.lpt[shape],
  );
}

function isResolvedPolicy(value: unknown): value is DayV3ResolvedPolicy {
  const feeKeys = [
    "stProtocolFeeWad",
    "jtProtocolFeeWad",
    "jtYieldShareProtocolFeeWad",
    "lptYieldShareProtocolFeeWad",
  ];
  const protocolFees = isRecord(value) ? value.protocolFees : null;
  const validProtocolFees =
    isRecord(protocolFees) &&
    feeKeys.every(
      (key) =>
        typeof protocolFees[key] === "string" &&
        /^\d+$/.test(protocolFees[key] as string) &&
        BigInt(protocolFees[key] as string) <= 10n ** 18n,
    );
  return (
    isTarget(value) &&
    isRecord(value) &&
    value.status === "resolved" &&
    isFiniteNumber(value.swapFeeBps) &&
    // Template validation accepts swap fees from 1e12 through 1e18 WAD,
    // inclusive. In basis points that is 0.01 through 10,000. Mirror those
    // contract endpoints exactly: zero is not deployable, while the upper
    // endpoint is.
    value.swapFeeBps >= 0.01 &&
    value.swapFeeBps <= 10_000 &&
    typeof value.chargeYieldFeeOnSeniorTrancheShares === "boolean" &&
    typeof value.chargeYieldFeeOnQuoteAsset === "boolean" &&
    validProtocolFees &&
    typeof value.blockNumber === "string" &&
    /^\d+$/.test(value.blockNumber) &&
    value.yieldModels.blockNumber === value.blockNumber &&
    value.yieldModels.resolvedAt === value.resolvedAt &&
    typeof value.resolvedAt === "string" &&
    Number.isFinite(Date.parse(value.resolvedAt))
  );
}

/** Shared provenance guard for deployment and simulation responses. */
export const isDayV3ResolvedPolicy = isResolvedPolicy;

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
    isFiniteNumber(value.entryPointSettlementDays) &&
    Number.isInteger(value.entryPointSettlementDays) &&
    value.entryPointSettlementDays >= 1 &&
    value.entryPointSettlementDays <= 194 &&
    (value.collateralToExitDays === null ||
      (isFiniteNumber(value.collateralToExitDays) &&
        Number.isInteger(value.collateralToExitDays) &&
        value.collateralToExitDays >= 0 &&
        value.collateralToExitDays <= 365)) &&
    (value.collateralToExitCostBps === null ||
      (isFiniteNumber(value.collateralToExitCostBps) &&
        value.collateralToExitCostBps >= 0 &&
        value.collateralToExitCostBps <= 9_999)) &&
    isFiniteNumber(value.fixedTermGraceDays) &&
    Number.isInteger(value.fixedTermGraceDays) &&
    value.fixedTermGraceDays >= 0 &&
    value.fixedTermGraceDays <= 194 &&
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

function isContext(value: unknown): value is DayV3PoolDesignContext {
  const optionalAddress = (entry: unknown) =>
    entry === null ||
    (typeof entry === "string" && /^0x[0-9a-fA-F]{40}$/.test(entry));
  return (
    isRecord(value) &&
    isFiniteNumber(value.sourceApyPct) &&
    value.sourceApyPct >= 0 &&
    value.sourceApyPct <= 100 &&
    optionalAddress(value.exitAsset) &&
    optionalAddress(value.exitAssetRateProvider) &&
    (value.exitAssetYieldBearing === null ||
      typeof value.exitAssetYieldBearing === "boolean")
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
  if (!Array.isArray(value.issues) || !value.issues.every(isIssue))
    return false;
  if (value.status === "resolved") {
    if (
      value.schemaVersion !== DAY_V3_POOL_DESIGN_SCHEMA ||
      value.modelVersion !== DAY_V3_POOL_DESIGN_MODEL ||
      !isGoals(value.goals) ||
      !isContext(value.context) ||
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
      fields.maximumPremiumBps.modelUsage !== "scenario-only" ||
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
      outcomes.restingExitAssetPer100Senior,
      outcomes.restingSeniorPer100Senior,
      outcomes.soldAfterPromisedExitPct,
      outcomes.restockSwapFeeBps,
    ];
    if (!numericOutcomes.every(isFiniteNumber)) {
      return false;
    }
    const amountSellablePer100Senior =
      outcomes.amountSellablePer100Senior as number;
    const requiredPoolFundingPer100Senior =
      outcomes.requiredPoolFundingPer100Senior as number;
    const proceedsForPromisedExit = outcomes.proceedsForPromisedExit as number;
    const minimumPromisedProceeds =
      (value.goals.immediateExitSharePct * value.goals.minimumProceedsPer100) /
      100;
    const lowestModeledPayoutPer100 =
      outcomes.lowestModeledPayoutPer100 as number;
    const exitAssetShareAtNavPct = outcomes.exitAssetShareAtNavPct as number;
    const seniorShareAtNavPct = outcomes.seniorShareAtNavPct as number;
    const restockFields = [
      outcomes.restockHurdleBps,
      outcomes.restockOperationalHurdleBps,
      outcomes.restockGrossMarginAfterPromisedExitBps,
      outcomes.restockMarginAfterPromisedExitBps,
      outcomes.restockEconomicFromSoldPct,
    ];
    const conversionResolved =
      value.goals.collateralToExitDays !== null &&
      value.goals.collateralToExitCostBps !== null;
    const restockShapeValid = conversionResolved
      ? restockFields.every(isFiniteNumber) &&
        outcomes.restockModelUsage === "fully-modeled" &&
        outcomes.collateralToExitCostBps === value.goals.collateralToExitCostBps
      : restockFields.every((entry) => entry === null) &&
        outcomes.restockModelUsage === "scenario-only" &&
        outcomes.collateralToExitCostBps ===
          value.goals.collateralToExitCostBps;
    if (
      amountSellablePer100Senior !== value.goals.immediateExitSharePct ||
      requiredPoolFundingPer100Senior !==
        fields.poolFundingPer100Senior.value ||
      proceedsForPromisedExit + 1e-9 < minimumPromisedProceeds ||
      lowestModeledPayoutPer100 < value.goals.minimumProceedsPer100 ||
      Math.abs(exitAssetShareAtNavPct + seniorShareAtNavPct - 100) > 1e-4 ||
      outcomes.restockSwapFeeBps !== value.policy.swapFeeBps ||
      !restockShapeValid ||
      (conversionResolved &&
        ((outcomes.restockEconomicFromSoldPct as number) < 0 ||
          (outcomes.restockEconomicFromSoldPct as number) >
            (outcomes.soldAfterPromisedExitPct as number) ||
          (outcomes.restockMarginAfterPromisedExitBps as number) < 0))
    ) {
      return false;
    }
    const params = value.recommendation.eclp.params;
    if (
      !isUsableCanonicalEclpParams(params, fields.depthAtNavLambda.value) ||
      !isExactDerivedEclpParams(value.recommendation.eclp.derivedParams)
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
  context?: DayV3PoolDesignContext,
): boolean {
  return (
    result.goals.protectedDrawdownPct === goals.protectedDrawdownPct &&
    result.goals.recoveryDays === goals.recoveryDays &&
    result.goals.immediateExitSharePct === goals.immediateExitSharePct &&
    result.goals.minimumProceedsPer100 === goals.minimumProceedsPer100 &&
    result.goals.entryPointSettlementDays === goals.entryPointSettlementDays &&
    result.goals.collateralToExitDays === goals.collateralToExitDays &&
    result.goals.collateralToExitCostBps === goals.collateralToExitCostBps &&
    result.goals.fixedTermGraceDays === goals.fixedTermGraceDays &&
    result.goals.navUpdateDays === goals.navUpdateDays &&
    result.goals.target.chainId === goals.target.chainId &&
    result.goals.target.templateId === goals.target.templateId &&
    (context === undefined ||
      (result.context.sourceApyPct === context.sourceApyPct &&
        result.context.exitAsset === context.exitAsset &&
        result.context.exitAssetRateProvider ===
          context.exitAssetRateProvider &&
        result.context.exitAssetYieldBearing === context.exitAssetYieldBearing))
  );
}

export function dayV3PoolDesignIssueMessage(
  issues: DayV3PoolDesignIssue[],
  fallback: string,
): string {
  const messages = issues.map((issue) => issue.message.trim()).filter(Boolean);
  return messages.length > 0 ? messages.join(" ") : fallback;
}

/** Every operational fact and target participates in request invalidation. */
export function dayV3PoolDesignRequestKey(
  goals: DayV3Goals | null,
  context?: DayV3PoolDesignContext | null,
): string | null {
  return goals === null || context == null
    ? null
    : JSON.stringify({ goals, context });
}
