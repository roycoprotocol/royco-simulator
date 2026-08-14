import assert from "node:assert/strict";

import { DEFAULT_DAY_EXPLORER_MARKET } from "@/lib/day-markets/registry";
import {
  buildDayV3Query,
  readDayV3UrlState,
  recommendDayV3Coverage,
  type DayV3UrlState,
} from "@/lib/day-v3";
import { createDayV3ModelSnapshot } from "@/lib/day-v3/model-state";
import { dayV3ActiveOverrides } from "@/lib/day-v3/mode-model";
import {
  dayV3ExitInputReadiness,
  dayV3InputReadiness,
  dayV3MissingPreview,
} from "@/lib/day-v3/input-readiness";
import { dayV3SimulationPoolDesignRequestKey } from "@/lib/day-v3/simulation-pool-design";

const fullDeployState: DayV3UrlState = {
  market: "custom",
  mode: "deploy",
  sourceApyPct: 6,
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
  incentiveBudgetPer100: 0,
  target: { chainId: 1, templateId: "balancer-v3-eclp" },
  overrides: {
    coveragePct: 13.5,
    minimumLiquidityPct: 9.87,
    maximumDiscountPct: 4.3,
    depthAtNav: 100,
    maximumPremiumPct: 0.2023,
    protectedExitThresholdPct: 5,
    protectedExitBonusPct: 0,
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
  "filled immediate-exit answers are complete independently of live validation",
);
assert.deepEqual(
  dayV3ExitInputReadiness({
    enabled: true,
    exitSharePct: null,
    minimumProceedsPer100: null,
  }),
  {
    complete: false,
    missing: ["Immediate exit amount", "Minimum payout"],
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
  { id: "target", label: "Deployment target", ready: false },
  { id: "nav", label: "NAV refresh cadence", ready: false },
  { id: "settlement", label: "Withdrawal settlement delay", ready: false },
]);
assert.equal(
  dayV3MissingPreview(namedReadiness.missing),
  "Deployment target, NAV refresh cadence +1 more",
);

const withoutMode = (value: DayV3UrlState) => {
  const { mode, ...state } = value;
  void mode;
  return state;
};
const asMode = (state: DayV3UrlState, mode: DayV3UrlState["mode"]) =>
  readDayV3UrlState(buildDayV3Query({ ...state, mode }));

const simulateState = asMode(fullDeployState, "simulate");
const deployAgain = asMode(simulateState, "deploy");

assert.equal(simulateState.mode, null);
assert.equal(deployAgain.mode, "deploy");
assert.deepEqual(withoutMode(simulateState), withoutMode(fullDeployState));
assert.deepEqual(withoutMode(deployAgain), withoutMode(fullDeployState));

// Hidden deployment overrides stay available for a lossless mode switch, but
// Simulate cannot silently use a value whose control is no longer visible.
const simulateOverrides = dayV3ActiveOverrides(false, simulateState.overrides);
const deployOverrides = dayV3ActiveOverrides(true, deployAgain.overrides);
assert.ok(Object.values(simulateOverrides).every((value) => value === null));
assert.deepEqual(deployOverrides, fullDeployState.overrides);

// Zero-valued hidden facts are deliberate values and survive both views.
assert.equal(simulateState.collateralToExitDays, 0);
assert.equal(simulateState.incentiveBudgetPer100, 0);
assert.equal(simulateState.overrides.protectedExitBonusPct, 0);

const visibleSimulationGoals = {
  protectedDrawdownPct: simulateState.protectedDrawdownPct as number,
  recoveryDays: simulateState.recoveryDays as number,
  immediateExitSharePct: simulateState.immediateExitSharePct as number,
  minimumProceedsPer100: simulateState.minimumProceedsPer100 as number,
};
const simulationKey = dayV3SimulationPoolDesignRequestKey(
  visibleSimulationGoals,
  simulateState.sourceApyPct,
);
assert.notEqual(simulationKey, null);
const simulationRequest = JSON.parse(simulationKey as string);
assert.deepEqual(simulationRequest.goals, visibleSimulationGoals);
assert.deepEqual(simulationRequest.context, { sourceApyPct: 6 });
assert.equal("target" in simulationRequest.goals, false);
assert.equal("navUpdateDays" in simulationRequest.goals, false);
assert.equal("entryPointSettlementDays" in simulationRequest.goals, false);
assert.equal("overrides" in simulationRequest, false);

// The accountant snapshot for Simulate likewise contains only modeled terms
// derived from visible goals and the independently resolved live policy.
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

// The shared-accountant protection output is likewise view-independent.
assert.deepEqual(
  recommendDayV3Coverage(DEFAULT_DAY_EXPLORER_MARKET.defaults, {
    protectedDrawdownPct: simulateState.protectedDrawdownPct as number,
  }),
  recommendDayV3Coverage(DEFAULT_DAY_EXPLORER_MARKET.defaults, {
    protectedDrawdownPct: deployAgain.protectedDrawdownPct as number,
  }),
);

// Editing one visible Simulate goal must not erase hidden deployment facts.
const editedSimulate = readDayV3UrlState(
  buildDayV3Query({
    ...simulateState,
    protectedDrawdownPct: 20,
    mode: "simulate",
  }),
);
assert.equal(editedSimulate.protectedDrawdownPct, 20);
for (const key of [
  "entryPointSettlementDays",
  "collateralToExitDays",
  "collateralToExitCostBps",
  "fixedTermGraceDays",
  "navUpdateDays",
  "depositDelaySeconds",
  "depositExpirySeconds",
  "withdrawalExpirySeconds",
  "gateByOracleUpdate",
  "maxReinvestmentSlippageBps",
  "incentiveBudgetPer100",
  "target",
  "overrides",
] as const) {
  assert.deepEqual(editedSimulate[key], simulateState[key]);
}

// Simplifying the Simulate surface must not manufacture operational defaults.
// A hidden unanswered fact stays unresolved and therefore continues to block
// the canonical request and deployment readiness.
const unresolvedSimulate = asMode(
  {
    ...fullDeployState,
    entryPointSettlementDays: null,
    collateralToExitDays: null,
    collateralToExitCostBps: null,
    fixedTermGraceDays: null,
    navUpdateDays: null,
  },
  "simulate",
);
assert.equal(unresolvedSimulate.entryPointSettlementDays, null);
assert.equal(unresolvedSimulate.collateralToExitDays, null);
assert.equal(unresolvedSimulate.collateralToExitCostBps, null);
assert.equal(unresolvedSimulate.fixedTermGraceDays, null);
assert.equal(unresolvedSimulate.navUpdateDays, null);

const incompleteGoals =
  unresolvedSimulate.entryPointSettlementDays === null ||
  unresolvedSimulate.fixedTermGraceDays === null ||
  unresolvedSimulate.navUpdateDays === null;
assert.equal(incompleteGoals, true);

console.log("Day V3 Simulate/Deploy state and model invariance: PASS");
