import assert from "node:assert/strict";

import { DEFAULT_DAY_EXPLORER_MARKET } from "@/lib/day-markets/registry";
import {
  buildDayV3Query,
  readDayV3UrlState,
  recommendDayV3Coverage,
  type DayV3UrlState,
} from "@/lib/day-v3";
import {
  dayV3ExitInputReadiness,
  dayV3InputReadiness,
  dayV3MissingPreview,
} from "@/lib/day-v3/input-readiness";
import { createDayV3ModelSnapshot } from "@/lib/day-v3/model-state";
import {
  dayV3ActiveOverrides,
  EMPTY_DAY_V3_OVERRIDES,
} from "@/lib/day-v3/mode-model";
import { dayV3PoolDesignRequestKey } from "@/lib/day-v3/pool-design";
import type { DayV3Goals } from "@/lib/day-v3/types";

// Deliberately includes every legacy V3 field. The unified writer must keep
// only values that still change one of the four visible input steps or a model.
const legacyState: DayV3UrlState = {
  market: "custom",
  mode: "deploy",
  sourceApyPct: 6,
  quoteAssetLabel: "USDC",
  quoteAssetYieldPct: 0,
  poolTurnoverPerYear: 8,
  swapFeeBps: 30,
  poolPremiumBps: null,
  marketMakerCostOfCapitalPct: 12,
  redemptionDays: 7,
  protectedDrawdownPct: 15,
  recoveryDays: 20,
  immediateExitSharePct: 10,
  minimumProceedsPer100: 95,
  entryPointSettlementDays: 90,
  collateralToExitDays: 0,
  collateralToExitCostBps: 50,
  fixedTermGraceDays: 14,
  navUpdateDays: 1,
  depositDelaySeconds: 300,
  depositExpirySeconds: 1_814_400,
  withdrawalExpirySeconds: "no-expiry",
  gateByOracleUpdate: true,
  maxReinvestmentSlippageBps: 50,
  incentiveBudgetPer100: 2,
  target: { chainId: 1, templateId: "balancer-v3-eclp" },
  overrides: {
    coveragePct: 13.5,
    minimumLiquidityPct: 9.87,
    maximumDiscountPct: 4.3,
    depthAtNav: 100,
    maximumPremiumPct: 0.2023,
    protectedExitThresholdPct: 5,
    protectedExitBonusPct: 1,
    poolCapitalPer100: 10.96,
    jrYieldShareAtZeroPct: 2,
    jrYieldShareAtTargetPct: 12,
    jrYieldShareAtFullPct: 18,
    slpYieldShareAtZeroPct: 1,
    slpYieldShareAtTargetPct: 5,
    slpYieldShareAtFullPct: 14,
  },
};

assert.deepEqual(
  dayV3ExitInputReadiness({
    enabled: true,
    exitSharePct: 5,
    minimumProceedsPer100: 99,
  }),
  { complete: true, missing: [] },
  "filled immediate-exit goals are complete independently of live validation",
);
assert.deepEqual(
  dayV3ExitInputReadiness({
    enabled: true,
    exitSharePct: null,
    minimumProceedsPer100: null,
  }),
  {
    complete: false,
    missing: ["Depth at NAV", "Maximum discount"],
  },
);
assert.deepEqual(
  dayV3ExitInputReadiness({
    enabled: false,
    exitSharePct: 0,
    minimumProceedsPer100: 0,
  }),
  { complete: true, missing: [] },
  "an explicitly disabled immediate exit is a complete answer",
);
const namedReadiness = dayV3InputReadiness([
  { id: "source", label: "Source yield", ready: false },
  { id: "yield-split", label: "Target yield split", ready: false },
  { id: "protection", label: "Senior protection", ready: false },
  { id: "exit", label: "Senior exit", ready: false },
]);
assert.equal(
  dayV3MissingPreview(namedReadiness.missing),
  "Source yield, Target yield split +2 more",
);

// Old links remain readable so bookmarks do not break, but mode is no longer
// a product state and must disappear as soon as the link is canonicalized.
assert.equal(readDayV3UrlState("mode=simulate").mode, "simulate");
assert.equal(readDayV3UrlState("mode=deploy").mode, "deploy");
assert.equal(readDayV3UrlState("mode=unknown").mode, null);

const expectedCanonicalKeys = [
  "apy",
  "convert",
  "convertCost",
  "exit",
  "fee",
  "jr0",
  "jr100",
  "jr90",
  "m",
  "mmCost",
  "mmDays",
  "protect",
  "quote",
  "quoteApy",
  "receive",
  "recover",
  "settle",
  "slp0",
  "slp100",
  "slp90",
  "turnover",
];
const canonicalQuery = buildDayV3Query(legacyState);
const canonicalParams = new URLSearchParams(canonicalQuery);
assert.deepEqual(
  [...canonicalParams.keys()].sort(),
  expectedCanonicalKeys,
  "Unified links must contain only the four visible input steps",
);
assert.equal(canonicalParams.has("mode"), false);
assert.equal(canonicalParams.get("jr90"), "12");
assert.equal(canonicalParams.get("slp90"), "5");
assert.equal(canonicalParams.get("protect"), "15");
assert.equal(canonicalParams.get("recover"), "20");
assert.equal(canonicalParams.get("exit"), "10");
assert.equal(canonicalParams.get("receive"), "95");
assert.equal(canonicalParams.get("settle"), "90");
assert.equal(canonicalParams.get("convert"), "0");
assert.equal(canonicalParams.get("convertCost"), "50");
assert.equal(canonicalParams.get("fee"), "30");

for (const removedKey of [
  "mode",
  "grace",
  "nav",
  "depDelay",
  "depExpiry",
  "wdExpiry",
  "priceGate",
  "reinvestSlip",
  "incentive",
  "target",
  "cov",
  "liq",
  "discount",
  "lambda",
  "premium",
  "pexit",
  "bonus",
  "pool",
  "starter",
]) {
  assert.equal(
    canonicalParams.has(removedKey),
    false,
    `canonical unified links must not serialize removed field ${removedKey}`,
  );
}

assert.equal(
  buildDayV3Query({ ...legacyState, mode: "simulate" }),
  buildDayV3Query({ ...legacyState, mode: "deploy" }),
  "legacy mode must not change a canonical unified link",
);

const canonicalState = readDayV3UrlState(canonicalQuery);
assert.equal(canonicalState.mode, null);
assert.equal(canonicalState.market, "custom");
assert.equal(canonicalState.sourceApyPct, 6);
assert.equal(canonicalState.protectedDrawdownPct, 15);
assert.equal(canonicalState.recoveryDays, 20);
assert.equal(canonicalState.immediateExitSharePct, 10);
assert.equal(canonicalState.minimumProceedsPer100, 95);
assert.equal(canonicalState.entryPointSettlementDays, 90);
assert.equal(canonicalState.collateralToExitDays, 0);
assert.equal(canonicalState.collateralToExitCostBps, 50);
// A hand-set pool fee is a model input: it changes every quote the page draws,
// so a shared link that dropped it would describe a different market.
assert.equal(canonicalState.swapFeeBps, 30);
assert.equal(canonicalState.overrides.jrYieldShareAtTargetPct, 12);
assert.equal(canonicalState.overrides.slpYieldShareAtTargetPct, 5);
for (const field of [
  "fixedTermGraceDays",
  "navUpdateDays",
  "depositDelaySeconds",
  "depositExpirySeconds",
  "withdrawalExpirySeconds",
  "gateByOracleUpdate",
  "maxReinvestmentSlippageBps",
  "incentiveBudgetPer100",
  "target",
] as const) {
  assert.equal(
    canonicalState[field],
    null,
    `${field} must remain parse-only and absent from canonical unified state`,
  );
}

// The unified simulator exposes the six contract curve anchors. Pool and
// deployment overrides may parse, but cannot affect any result.
const expectedActiveOverrides = {
  ...EMPTY_DAY_V3_OVERRIDES,
  jrYieldShareAtZeroPct: 2,
  jrYieldShareAtTargetPct: 12,
  jrYieldShareAtFullPct: 18,
  slpYieldShareAtZeroPct: 1,
  slpYieldShareAtTargetPct: 5,
  slpYieldShareAtFullPct: 14,
};
assert.deepEqual(
  dayV3ActiveOverrides(canonicalState.overrides),
  expectedActiveOverrides,
);
assert.deepEqual(
  dayV3ActiveOverrides(legacyState.overrides),
  expectedActiveOverrides,
  "all six visible contract anchors must remain active after canonicalization",
);

// Every visible market-design input feeds one exact deployment-service request.
const canonicalGoals: DayV3Goals = {
  protectedDrawdownPct: canonicalState.protectedDrawdownPct as number,
  recoveryDays: canonicalState.recoveryDays as number,
  immediateExitSharePct: canonicalState.immediateExitSharePct as number,
  minimumProceedsPer100: canonicalState.minimumProceedsPer100 as number,
  entryPointSettlementDays:
    canonicalState.entryPointSettlementDays as number,
  collateralToExitDays: canonicalState.collateralToExitDays,
  collateralToExitCostBps: canonicalState.collateralToExitCostBps,
  fixedTermGraceDays: 0,
  navUpdateDays: 1,
  target: { chainId: 1, templateId: "balancer-v3-eclp" },
};
const canonicalContext = {
  sourceApyPct: canonicalState.sourceApyPct as number,
  swapFeeBps: canonicalState.swapFeeBps as number,
  exitAsset: null,
  exitAssetRateProvider: null,
  exitAssetYieldBearing: null,
};
const canonicalKey = dayV3PoolDesignRequestKey(
  canonicalGoals,
  canonicalContext,
);
assert.notEqual(canonicalKey, null);
const canonicalRequest = JSON.parse(canonicalKey as string);
assert.deepEqual(canonicalRequest.goals, canonicalGoals);
assert.deepEqual(canonicalRequest.context, canonicalContext);
assert.deepEqual(Object.keys(canonicalRequest.goals).sort(), [
  "collateralToExitCostBps",
  "collateralToExitDays",
  "entryPointSettlementDays",
  "fixedTermGraceDays",
  "immediateExitSharePct",
  "minimumProceedsPer100",
  "navUpdateDays",
  "protectedDrawdownPct",
  "recoveryDays",
  "target",
]);
for (const removedField of [
  "depositDelaySeconds",
  "depositExpirySeconds",
  "withdrawalExpirySeconds",
  "gateByOracleUpdate",
  "maxReinvestmentSlippageBps",
  "incentiveBudgetPer100",
  "overrides",
]) {
  assert.equal(
    removedField in canonicalRequest.goals || removedField in canonicalRequest,
    false,
    `canonical request regained removed dependency ${removedField}`,
  );
}

// Every model continues to read one atomic shared-accountant snapshot.
const enginePolicy = { swapFeeBps: 10, policyId: "test-live-policy" };
assert.deepEqual(
  createDayV3ModelSnapshot(
    { coveragePct: 13.5, liquidityPct: 9.87 },
    enginePolicy,
  ),
  {
    coveragePct: 13.5,
    liquidityPct: 9.87,
    engineOverrides: enginePolicy,
  },
);
assert.deepEqual(
  recommendDayV3Coverage(DEFAULT_DAY_EXPLORER_MARKET.defaults, {
    protectedDrawdownPct: canonicalState.protectedDrawdownPct as number,
  }),
  recommendDayV3Coverage(DEFAULT_DAY_EXPLORER_MARKET.defaults, {
    protectedDrawdownPct: legacyState.protectedDrawdownPct as number,
  }),
  "legacy mode metadata must not change the shared-accountant result",
);

// Editing any one visible input preserves the other three steps.
const editedState = readDayV3UrlState(
  buildDayV3Query({
    ...canonicalState,
    sourceApyPct: 7,
    overrides: {
      ...canonicalState.overrides,
      jrYieldShareAtTargetPct: 15,
      slpYieldShareAtTargetPct: 10,
    },
  }),
);
assert.equal(editedState.sourceApyPct, 7);
assert.equal(editedState.protectedDrawdownPct, 15);
assert.equal(editedState.recoveryDays, 20);
assert.equal(editedState.immediateExitSharePct, 10);
assert.equal(editedState.minimumProceedsPer100, 95);
assert.equal(editedState.entryPointSettlementDays, 90);
assert.equal(editedState.collateralToExitDays, 0);
assert.equal(editedState.collateralToExitCostBps, 50);
assert.equal(editedState.overrides.jrYieldShareAtTargetPct, 15);
assert.equal(editedState.overrides.slpYieldShareAtTargetPct, 10);
assert.equal(editedState.mode, null);

// Feature-off sentinels remain explicit and remove now-irrelevant inputs.
const disabledParams = new URLSearchParams(
  buildDayV3Query({
    ...legacyState,
    protectedDrawdownPct: 0,
    immediateExitSharePct: 0,
    minimumProceedsPer100: 0,
  }),
);
assert.equal(disabledParams.get("protect"), "0");
assert.equal(disabledParams.get("recover"), "0");
assert.equal(disabledParams.get("exit"), "0");
assert.equal(disabledParams.get("receive"), "0");
assert.equal(disabledParams.has("grace"), false);
assert.equal(disabledParams.has("settle"), false);
assert.equal(disabledParams.has("convert"), false);
assert.equal(disabledParams.has("convertCost"), false);
assert.equal(disabledParams.has("jr90"), false);
assert.equal(disabledParams.has("slp90"), false);

console.log("Day V3 unified four-step state contract: PASS");
