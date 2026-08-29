import assert from "node:assert/strict";

import {
  DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA,
  dayV3SimulationPoolDesignMatchesRequest,
  dayV3SimulationPoolDesignRequestKey,
  isDayV3SimulationPoolDesignResult,
  type DayV3SimulationPoolDesignResult,
} from "@/lib/day-v3/simulation-pool-design";

const goals = {
  protectedDrawdownPct: 15,
  recoveryDays: 20,
  immediateExitSharePct: 10,
  minimumProceedsPer100: 95,
};

const policy = {
  status: "resolved",
  chainId: 1,
  chainName: "Ethereum",
  templateId: "balancer-v3-eclp",
  templateName: "Balancer V3 ECLP",
  templateAddress: "0x0000000000000000000000000000000000000001",
  swapFeeBps: 10,
  chargeYieldFeeOnSeniorTrancheShares: false,
  chargeYieldFeeOnQuoteAsset: false,
  protocolFees: {
    stProtocolFeeWad: "0",
    jtProtocolFeeWad: "0",
    jtYieldShareProtocolFeeWad: "450000000000000000",
    lptYieldShareProtocolFeeWad: "450000000000000000",
  },
  yieldModels: {
    source: "template-registry",
    jt: {
      STATIC_CURVE: "0x1111111111111111111111111111111111111111",
      ADAPTIVE_CURVE_V1: null,
      ADAPTIVE_CURVE_V2: null,
      FIXED: "0x2222222222222222222222222222222222222222",
    },
    lpt: {
      STATIC_CURVE: "0x3333333333333333333333333333333333333333",
      ADAPTIVE_CURVE_V1: null,
      ADAPTIVE_CURVE_V2: null,
      FIXED: "0x4444444444444444444444444444444444444444",
    },
    blockNumber: "123",
    resolvedAt: "2026-08-12T00:00:00.000Z",
  },
  blockNumber: "123",
  resolvedAt: "2026-08-12T00:00:00.000Z",
  selectionOrigin: "product-simulation-policy",
};

const deployment = {
  entryPointSettlementDays: null,
  collateralToExitDays: null,
  collateralToExitCostBps: null,
  fixedTermGraceDays: null,
  navUpdateDays: null,
  target: null,
  restock: {
    modelUsage: "not-modeled",
    hurdleBps: null,
    operationalHurdleBps: null,
    marginAfterPromisedExitBps: null,
    grossMarginAfterPromisedExitBps: null,
    economicFromSoldPct: null,
  },
};

const fields = Object.fromEntries(
  [
    ["maximumDiscountBps", 100],
    ["depthAtNavLambda", 300],
    ["maximumPremiumBps", 20],
    ["swapFeeBps", 10],
    ["poolFundingPer100Senior", 12],
  ].map(([key, value]) => [
    key,
    {
      value,
      unit: "test",
      origin:
        key === "swapFeeBps"
          ? "market-policy"
          : key === "maximumPremiumBps"
            ? "derived"
            : "recommended",
      deployPath: null,
      modelUsage:
        key === "maximumPremiumBps" ? "scenario-only" : "fully-modeled",
      evidence: ["canonical test vector"],
    },
  ]),
);

const resolved = {
  schemaVersion: DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA,
  modelVersion: "day-v3-eclp-goal-solver-1.2.0",
  mode: "simulation",
  status: "resolved",
  goals,
  context: { sourceApyPct: 6, swapFeeBps: 10 },
  policy,
  deployment,
  recommendation: {
    normalizedSenior: 100,
    fields,
    outcomes: {
      amountSellablePer100Senior: 10,
      proceedsForPromisedExit: 9.5,
      promisedExitCostBps: 500,
      lowestModeledPayoutPer100: 95,
      requiredPoolFundingPer100Senior: 12,
      nearNavCostBps: 10,
      exitAssetShareAtNavPct: 90,
      seniorShareAtNavPct: 10,
      restingExitAssetPer100Senior: 10.8,
      restingSeniorPer100Senior: 1.2,
      soldAfterPromisedExitPct: 9,
      restockModelUsage: "scenario-only",
      restockHurdleBps: null,
      restockOperationalHurdleBps: null,
      collateralToExitCostBps: null,
      restockSwapFeeBps: 10,
      restockGrossMarginAfterPromisedExitBps: null,
      restockMarginAfterPromisedExitBps: null,
      restockEconomicFromSoldPct: null,
    },
    eclp: {
      params: {
        alpha: "990000000000000000",
        beta: "1010000000000000000",
        c: "707106781186547524",
        s: "707106781186547524",
        lambda: "300000000000000000000",
      },
      derivedParams: {
        tauAlphaX: "-94773130622350963813402481283118800045",
        tauAlphaY: "31906953976191491086066439875451340751",
        tauBetaX: "9455562426453687808195961460162004",
        tauBetaY: "99999999552961694941282054418046780509",
        u: "47391293092388708696875030401893946254",
        v: "65953476764576592938898894892506970789",
        w: "34046522788385101889007253374479656387",
        z: "-47381837529962255009077554770064379269",
        dSq: "99999999999999999886624093342106115200",
      },
    },
    search: {
      maximumPoolFundingPer100Senior: 1000,
      fundingIncrement: 0.01,
      discountStepBps: 10,
      lambdaStep: 50,
      ranking: ["least-pool-capital", "tightest-floor", "cheapest-near-nav"],
    },
  },
  issues: [],
} as unknown as Extract<
  DayV3SimulationPoolDesignResult,
  { status: "resolved" }
>;

assert.equal(isDayV3SimulationPoolDesignResult(resolved), true);
assert.equal(
  dayV3SimulationPoolDesignMatchesRequest(resolved, goals, 6, 10),
  true,
);
assert.equal(
  dayV3SimulationPoolDesignMatchesRequest(resolved, goals, 7, 10),
  false,
);

const key = dayV3SimulationPoolDesignRequestKey(goals, 6, 10);
assert.notEqual(key, null);
assert.deepEqual(JSON.parse(key as string), {
  schemaVersion: "1.1",
  goals,
  context: { sourceApyPct: 6, swapFeeBps: 10 },
});
assert.notEqual(dayV3SimulationPoolDesignRequestKey(goals, 0, 10), null);
assert.equal(dayV3SimulationPoolDesignRequestKey(goals, null, 10), null);
assert.equal(
  dayV3SimulationPoolDesignRequestKey(
    { ...goals, recoveryDays: 20.5 },
    6,
    10,
  ),
  null,
);
assert.equal(
  dayV3SimulationPoolDesignRequestKey(
    { ...goals, navUpdateDays: 1 } as typeof goals,
    6,
    10,
  ),
  null,
  "deployment fields must not enter the simulation request",
);

const wrongOrigin = structuredClone(resolved) as unknown as {
  policy: Record<string, unknown>;
};
wrongOrigin.policy.selectionOrigin = "issuer-goal";
assert.equal(isDayV3SimulationPoolDesignResult(wrongOrigin), false);

const leakedDeployment = structuredClone(resolved) as unknown as {
  deployment: Record<string, unknown>;
};
leakedDeployment.deployment.navUpdateDays = 1;
assert.equal(isDayV3SimulationPoolDesignResult(leakedDeployment), false);

const modeledRestock = structuredClone(resolved) as unknown as {
  recommendation: { outcomes: Record<string, unknown> };
};
modeledRestock.recommendation.outcomes.restockModelUsage = "fully-modeled";
modeledRestock.recommendation.outcomes.restockHurdleBps = 20;
assert.equal(isDayV3SimulationPoolDesignResult(modeledRestock), false);

const infeasible = {
  ...resolved,
  status: "infeasible",
  recommendation: null,
  issues: [{ code: "NO_FEASIBLE_DESIGN", message: "Reduce the exit size." }],
};
assert.equal(isDayV3SimulationPoolDesignResult(infeasible), true);

assert.equal(
  isDayV3SimulationPoolDesignResult({
    schemaVersion: "1.1",
    modelVersion: "day-v3-eclp-goal-solver-1.2.0",
    mode: "simulation",
    status: "unresolved",
    policy: null,
    deployment: null,
    recommendation: null,
    issues: [
      {
        code: "POOL_DESIGN_SERVICE_UNAVAILABLE",
        message: "No fee or pool parameters were assumed.",
      },
    ],
  }),
  true,
);

console.log(
  "Day V3 simulation pool-design request isolation and response validation: PASS",
);
