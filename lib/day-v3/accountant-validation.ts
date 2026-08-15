import contractLock from "@/lib/day/engine/vectors/contract-lock.json";
import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { buildDayYieldDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";
import {
  dayV3MinimumLiquidityForPoolFunding,
  recommendDayV3Coverage,
  runDayV3ProtectedExitScenarios,
} from "@/lib/day-v3";
import type { DayV3Features, DayV3Goals } from "@/lib/day-v3/types";

export const DAY_V3_ACCOUNTANT_VALIDATION_SCHEMA = "1.1" as const;
export const DAY_V3_ACCOUNTANT_VALIDATION_MODEL =
  "day-v3-accountant-validation-1.1.0" as const;

export type DayV3AccountantTerms = {
  minimumCoveragePct: number;
  minimumLiquidityPct: number;
  protectedExitThresholdPct: number;
  protectedExitBonusPct: number;
};

export type DayV3AccountantValidationRequest = {
  schemaVersion: typeof DAY_V3_ACCOUNTANT_VALIDATION_SCHEMA;
  source: { marketId: string; name: string; sourceApyPct: number };
  features: DayV3Features;
  goals: DayV3Goals;
  canonicalPool: { poolFundingPer100Senior: number };
  handoffTerms: DayV3AccountantTerms;
  proposedTerms: DayV3AccountantTerms;
};

export type DayV3AccountantValidationIssue = {
  code: string;
  path: string;
  message: string;
};

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const exactKeys = (value: JsonRecord, expected: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((entry, index) => entry === wanted[index])
  );
};

function inRange(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): value is number {
  return (
    finite(value) &&
    value >= minimum &&
    value <= maximum &&
    (!integer || Number.isInteger(value))
  );
}

function isFeatures(value: unknown): value is DayV3Features {
  return (
    isRecord(value) &&
    exactKeys(value, ["seniorProtection", "immediateExit"]) &&
    (value.seniorProtection === "enabled" ||
      value.seniorProtection === "disabled") &&
    (value.immediateExit === "enabled" || value.immediateExit === "disabled")
  );
}

function isTerms(
  value: unknown,
  features: DayV3Features,
): value is DayV3AccountantTerms {
  if (
    !(
      isRecord(value) &&
      exactKeys(value, [
        "minimumCoveragePct",
        "minimumLiquidityPct",
        "protectedExitThresholdPct",
        "protectedExitBonusPct",
      ]) &&
      inRange(value.minimumCoveragePct, 0, 89.99) &&
      inRange(value.minimumLiquidityPct, 0, 99.99) &&
      inRange(value.protectedExitThresholdPct, 0, 89.98) &&
      inRange(value.protectedExitBonusPct, 0, 99.99)
    )
  )
    return false;
  const protectionValid =
    features.seniorProtection === "disabled"
      ? value.minimumCoveragePct === 0 &&
        value.protectedExitThresholdPct === 0 &&
        value.protectedExitBonusPct === 0
      : value.minimumCoveragePct > 0 &&
        value.protectedExitThresholdPct > 0 &&
        value.protectedExitThresholdPct < value.minimumCoveragePct &&
        value.protectedExitBonusPct <= value.protectedExitThresholdPct;
  const liquidityValid =
    features.immediateExit === "disabled"
      ? value.minimumLiquidityPct === 0
      : value.minimumLiquidityPct > 0;
  return protectionValid && liquidityValid;
}

function isGoals(
  value: unknown,
  features: DayV3Features,
): value is DayV3Goals {
  if (
    !(
      isRecord(value) &&
      exactKeys(value, [
        "protectedDrawdownPct",
        "recoveryDays",
        "immediateExitSharePct",
        "minimumProceedsPer100",
        "entryPointSettlementDays",
        "collateralToExitDays",
        "collateralToExitCostBps",
        "fixedTermGraceDays",
        "navUpdateDays",
        "target",
      ]) &&
      inRange(value.protectedDrawdownPct, 0, 95) &&
      inRange(value.recoveryDays, 0, 194, true) &&
      inRange(value.immediateExitSharePct, 0, 100) &&
      inRange(value.minimumProceedsPer100, 0, 100) &&
      inRange(value.entryPointSettlementDays, 1, 194, true) &&
      inRange(value.fixedTermGraceDays, 0, 194, true) &&
      inRange(value.navUpdateDays, 1, 365, true) &&
      isRecord(value.target) &&
      exactKeys(value.target, ["chainId", "templateId"]) &&
      Number.isSafeInteger(value.target.chainId) &&
      Number(value.target.chainId) > 0 &&
      typeof value.target.templateId === "string" &&
      value.target.templateId.trim().length > 0
    )
  )
    return false;
  const protectionValid =
    features.seniorProtection === "disabled"
      ? value.protectedDrawdownPct === 0 &&
        value.recoveryDays === 0 &&
        value.fixedTermGraceDays === 0
      : value.protectedDrawdownPct > 0;
  const exitValid =
    features.immediateExit === "disabled"
      ? value.immediateExitSharePct === 0 &&
        value.minimumProceedsPer100 === 0 &&
        value.collateralToExitDays === null &&
        value.collateralToExitCostBps === null
      : value.immediateExitSharePct >= 0.01 &&
        inRange(value.collateralToExitDays, 0, 365, true) &&
        inRange(value.collateralToExitCostBps, 0, 9_999);
  return protectionValid && exitValid;
}

export function parseDayV3AccountantValidationRequest(
  value: unknown,
):
  | { ok: true; request: DayV3AccountantValidationRequest }
  | { ok: false; issues: DayV3AccountantValidationIssue[] } {
  const invalid = (message: string, path = "request") => ({
    ok: false as const,
    issues: [{ code: "INVALID_REQUEST", path, message }],
  });
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "source",
      "features",
      "goals",
      "canonicalPool",
      "handoffTerms",
      "proposedTerms",
    ]) ||
    value.schemaVersion !== DAY_V3_ACCOUNTANT_VALIDATION_SCHEMA
  ) {
    return invalid("The request does not match accountant-validation schema 1.1.");
  }
  if (
    !isRecord(value.source) ||
    !exactKeys(value.source, ["marketId", "name", "sourceApyPct"]) ||
    typeof value.source.marketId !== "string" ||
    value.source.marketId.trim().length === 0 ||
    typeof value.source.name !== "string" ||
    value.source.name.trim().length === 0 ||
    !inRange(value.source.sourceApyPct, 0, 100)
  ) {
    return invalid("Source identity and net APY are required.", "source");
  }
  if (!isFeatures(value.features))
    return invalid("Contract feature flags are invalid.", "features");
  if (!isGoals(value.goals, value.features))
    return invalid("Issuer goals are invalid.", "goals");
  if (
    !isRecord(value.canonicalPool) ||
    !exactKeys(value.canonicalPool, ["poolFundingPer100Senior"]) ||
    !inRange(value.canonicalPool.poolFundingPer100Senior, 0, 1_000) ||
    (value.features.immediateExit === "disabled"
      ? value.canonicalPool.poolFundingPer100Senior !== 0
      : value.canonicalPool.poolFundingPer100Senior <= 0)
  ) {
    return invalid(
      "Canonical pool funding must be between 0 and 1,000 per 100 Senior.",
      "canonicalPool.poolFundingPer100Senior",
    );
  }
  if (!isTerms(value.handoffTerms, value.features))
    return invalid("The handoff accountant terms are invalid.", "handoffTerms");
  if (!isTerms(value.proposedTerms, value.features))
    return invalid("The proposed accountant terms are invalid.", "proposedTerms");
  return { ok: true, request: value as DayV3AccountantValidationRequest };
}

const nearlyEqual = (left: number, right: number) =>
  Math.abs(left - right) <= 1e-9;

function defaultsFor(
  request: DayV3AccountantValidationRequest,
):
  | {
      defaults: DaySimulatorDefaults;
      origin: "listed-registry" | "custom-v3-draft";
    }
  | null {
  if (request.source.marketId === "custom") {
    return {
      defaults: buildDayYieldDraftMarket({
        label: request.source.name,
        sourceApy: request.source.sourceApyPct / 100,
      }).defaults,
      origin: "custom-v3-draft",
    };
  }
  const market = DAY_MARKETS.find(
    (candidate) => candidate.id === request.source.marketId,
  );
  if (
    !market ||
    market.identity.marketName !== request.source.name ||
    !nearlyEqual(
      market.defaults.sourceApy * 100,
      request.source.sourceApyPct,
    )
  ) return null;
  return {
    defaults: market.defaults,
    origin: "listed-registry",
  };
}

export function validateDayV3AccountantTerms(
  request: DayV3AccountantValidationRequest,
): Record<string, unknown> {
  const resolvedDefaults = defaultsFor(request);
  if (!resolvedDefaults) {
    return rejected(request, [
      {
        code: "SOURCE_IDENTITY_MISMATCH",
        path: "source",
        message:
          "A listed source must match the Dawn registry market ID, name, and net APY. Use marketId custom for an unlisted or issuer-supplied source.",
      },
    ]);
  }

  const coverage = recommendDayV3Coverage(resolvedDefaults.defaults, {
    protectedDrawdownPct: request.goals.protectedDrawdownPct,
  });
  if (coverage.status !== "recommended" || coverage.coverage.value === null) {
    return rejected(request, [
      { code: "COVERAGE_UNRESOLVED", path: "proposedTerms.minimumCoveragePct", message: coverage.reason },
    ]);
  }
  if (
    request.features.seniorProtection === "disabled" &&
    coverage.coverage.value !== 0
  ) {
    return rejected(request, [
      {
        code: "DISABLED_COVERAGE_NONZERO",
        path: "proposedTerms.minimumCoveragePct",
        message: "Disabled Senior protection must recompute to zero coverage.",
      },
    ]);
  }
  const liquidity =
    request.features.immediateExit === "disabled"
      ? null
      : dayV3MinimumLiquidityForPoolFunding(resolvedDefaults.defaults, {
          poolFundingPer100Senior:
            request.canonicalPool.poolFundingPer100Senior,
          coveragePct: coverage.coverage.value,
        });
  if (
    liquidity !== null &&
    (liquidity.status !== "recommended" ||
      liquidity.minimumLiquidity.value === null)
  ) {
    return rejected(request, [
      { code: "LIQUIDITY_UNRESOLVED", path: "proposedTerms.minimumLiquidityPct", message: liquidity.reason },
    ]);
  }

  const canonical: DayV3AccountantTerms = {
    minimumCoveragePct: coverage.coverage.value,
    minimumLiquidityPct:
      request.features.immediateExit === "disabled"
        ? 0
        : (liquidity?.minimumLiquidity.value ?? 0),
    // Imported history is intentionally private to Dawn. Exact equality to the
    // handoff baseline prevents an in-bounds trigger or bonus from being
    // substituted in transit; the accountant independently reruns its effects.
    protectedExitThresholdPct:
      request.handoffTerms.protectedExitThresholdPct,
    protectedExitBonusPct: request.handoffTerms.protectedExitBonusPct,
  };
  const issues: DayV3AccountantValidationIssue[] = [];
  for (const key of Object.keys(canonical) as (keyof DayV3AccountantTerms)[]) {
    if (!nearlyEqual(request.handoffTerms[key], request.proposedTerms[key])) {
      issues.push({
        code: "HANDOFF_TERM_CHANGED",
        path: `proposedTerms.${key}`,
        message: "The proposed value does not match the exported Dawn handoff.",
      });
    }
    if (!nearlyEqual(canonical[key], request.proposedTerms[key])) {
      issues.push({
        code: "ACCOUNTANT_TERM_MISMATCH",
        path: `proposedTerms.${key}`,
        message: "The proposed value does not match the shared accountant result.",
      });
    }
  }
  if (issues.length > 0) return rejected(request, issues);

  const scenarios =
    request.features.seniorProtection === "disabled"
      ? null
      : runDayV3ProtectedExitScenarios({
          defaults: resolvedDefaults.defaults,
          coveragePct: canonical.minimumCoveragePct,
          protectedExitThresholdPct: canonical.protectedExitThresholdPct,
          bonusPct: canonical.protectedExitBonusPct,
          recoveryDays: request.goals.recoveryDays,
          minimumLiquidityPct: canonical.minimumLiquidityPct,
        });
  if (scenarios !== null && scenarios.status !== "ready") {
    return rejected(request, [
      { code: "PROTECTED_EXIT_UNRESOLVED", path: "proposedTerms.protectedExitThresholdPct", message: scenarios.reason },
    ]);
  }

  return {
    schemaVersion: DAY_V3_ACCOUNTANT_VALIDATION_SCHEMA,
    modelVersion: DAY_V3_ACCOUNTANT_VALIDATION_MODEL,
    status: "validated",
    normalizedRequest: request,
    canonical,
    provenance: {
      engine: "lib/day/engine",
      accountantModelVersion: DAY_V3_ACCOUNTANT_VALIDATION_MODEL,
      marketDefaultsOrigin: resolvedDefaults.origin,
      contractLock,
      historyValidation: {
        status: "not-validated",
        message:
          "Imported history stays local to Dawn. This endpoint validates the exported trigger baseline and reruns its accountant effects; it does not authenticate the historical earliest-trigger provenance.",
      },
    },
    scenarios:
      scenarios === null
        ? {
            status: "disabled",
            activationStressPct: null,
            reason:
              "Senior protection is disabled, so Protected Exit is encoded as a no-op and no redemption scenario is required.",
            items: [],
          }
        : {
            status: "ready",
            activationStressPct: scenarios.activationStressPct,
            reason: scenarios.reason,
            items: scenarios.scenarios,
          },
    issues: [],
  };
}

function rejected(
  request: DayV3AccountantValidationRequest | null,
  issues: DayV3AccountantValidationIssue[],
): Record<string, unknown> {
  return {
    schemaVersion: DAY_V3_ACCOUNTANT_VALIDATION_SCHEMA,
    modelVersion: DAY_V3_ACCOUNTANT_VALIDATION_MODEL,
    status: "rejected",
    normalizedRequest: request,
    canonical: null,
    provenance: null,
    scenarios: null,
    issues,
  };
}

export function rejectedDayV3AccountantValidation(
  issues: DayV3AccountantValidationIssue[],
): Record<string, unknown> {
  return rejected(null, issues);
}
