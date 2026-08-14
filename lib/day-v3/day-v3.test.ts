import assert from "node:assert/strict";

import { DEFAULT_DAY_EXPLORER_MARKET } from "@/lib/day-markets/registry";
import { runDayHistoricalBacktest } from "@/lib/day-simulator-template/backtest";
import {
  buildDayV3DeploymentUrl,
  buildDayV3HandoffV3,
  dayV3DeploymentCta,
  dayV3HandoffMarketId,
  isDayV3HandoffReady,
  buildDayV3Query,
  dayV3CoverageKeepsSeniorWhole,
  dayV3MinimumLiquidityForPoolFunding,
  dayV3PoolDesignRequestKey,
  dayV3CapitalAtTarget,
  deriveDayV3ProtectedExitBonus,
  isDayV3PoolDesignInventory,
  isDayV3PoolDesignResult,
  isDayV3ResolvedPolicy,
  DAY_V3_POOL_DESIGN_SCHEMA,
  normalizeDayV3Defaults,
  readDayV3UrlState,
  recommendDayV3Coverage,
  recommendDayV3ProtectedExitTrigger,
  runDayV3ProtectedExitScenarios,
  runDayV3RecoveryAnalysis,
  type DayV3UrlState,
  type DayV3PoolDesignResult,
} from "@/lib/day-v3";

let passed = 0;
const check = (label: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const defaults = DEFAULT_DAY_EXPLORER_MARKET.defaults;
const DAY_MS = 86_400_000;

console.log("Day V3 goal-state and recommendations");

check("custom source handoffs use the accountant's custom registry key", () => {
  assert.equal(
    dayV3HandoffMarketId(true, "day-explorer-yield-draft"),
    "custom",
  );
  assert.equal(dayV3HandoffMarketId(false, "jbbb"), "jbbb");
});

check("incomplete designs export a draft instead of opening deployment", () => {
  assert.deepEqual(dayV3DeploymentCta(false), {
    action: "export-incomplete",
    label: "Export incomplete draft",
  });
  assert.deepEqual(dayV3DeploymentCta(true), {
    action: "continue-deployment",
    label: "Continue in deployment",
  });
});

check("downstream-only fields do not block a complete V3 handoff", () => {
  assert.equal(
    isDayV3HandoffReady([
      { ready: true, scope: "v3-handoff" },
      { ready: false, scope: "deployment" },
    ]),
    true,
  );
  assert.equal(
    isDayV3HandoffReady([
      { ready: false, scope: "v3-handoff" },
      { ready: false, scope: "deployment" },
    ]),
    false,
  );
});

const urlState: DayV3UrlState = {
  market: "custom",
  mode: "deploy",
  sourceApyPct: 8.25,
  quoteAssetLabel: "sUSDS",
  quoteAssetYieldPct: 4.5,
  marketMakerCostOfCapitalPct: 12,
  redemptionDays: 7,
  protectedDrawdownPct: 12.5,
  recoveryDays: 0,
  immediateExitSharePct: 15,
  minimumProceedsPer100: 98,
  entryPointSettlementDays: 7,
  collateralToExitDays: 2,
  collateralToExitCostBps: 35,
  fixedTermGraceDays: 0,
  navUpdateDays: 1,
  depositDelaySeconds: 300,
  depositExpirySeconds: 1_814_400,
  withdrawalExpirySeconds: "no-expiry",
  gateByOracleUpdate: true,
  maxReinvestmentSlippageBps: 50,
  incentiveBudgetPer100: 2,
  target: { chainId: 1, templateId: "0xabc" },
  overrides: {
    coveragePct: null,
    minimumLiquidityPct: 18,
    maximumDiscountPct: null,
    depthAtNav: 420,
    maximumPremiumPct: null,
    protectedExitThresholdPct: null,
    protectedExitBonusPct: 0,
    poolCapitalPer100: null,
    jrYieldShareAtZeroPct: null,
    jrYieldShareAtTargetPct: null,
    jrYieldShareAtFullPct: null,
    slpYieldShareAtZeroPct: null,
    slpYieldShareAtTargetPct: null,
    slpYieldShareAtFullPct: null,
  },
};

check("V3 URL round-trips only unified model inputs", () => {
  assert.deepEqual(readDayV3UrlState(buildDayV3Query(urlState)), {
    ...urlState,
    mode: null,
    fixedTermGraceDays: null,
    navUpdateDays: null,
    depositDelaySeconds: null,
    depositExpirySeconds: null,
    withdrawalExpirySeconds: null,
    gateByOracleUpdate: null,
    maxReinvestmentSlippageBps: null,
    incentiveBudgetPer100: null,
    target: null,
    overrides: {
      ...urlState.overrides,
      minimumLiquidityPct: null,
      depthAtNav: null,
      protectedExitBonusPct: null,
    },
  });
});

check(
  "operational durations are normalized to whole days in generated links",
  () => {
    const parsed = readDayV3UrlState(
      buildDayV3Query({
        ...urlState,
        recoveryDays: 7.49,
        entryPointSettlementDays: 7.5,
        collateralToExitDays: 2.4,
        fixedTermGraceDays: 6.6,
        navUpdateDays: 30.6,
      }),
    );
    assert.equal(parsed.recoveryDays, 7);
    assert.equal(parsed.entryPointSettlementDays, 8);
    assert.equal(parsed.collateralToExitDays, 2);
    assert.equal(parsed.fixedTermGraceDays, null);
    assert.equal(parsed.navUpdateDays, null);
  },
);

check(
  "fractional operational durations are rejected when parsing external URLs",
  () => {
    const parsed = readDayV3UrlState(
      "recover=7.5&settle=2.25&convert=3.5&grace=1.1&nav=1.1",
    );
    assert.equal(parsed.recoveryDays, null);
    assert.equal(parsed.entryPointSettlementDays, null);
    assert.equal(parsed.collateralToExitDays, null);
    assert.equal(parsed.fixedTermGraceDays, null);
    assert.equal(parsed.navUpdateDays, null);
  },
);

check("derived fields stay out of the URL until overridden", () => {
  const query = buildDayV3Query({
    ...urlState,
    overrides: Object.fromEntries(
      Object.keys(urlState.overrides).map((key) => [key, null]),
    ) as unknown as DayV3UrlState["overrides"],
  });
  assert.equal(new URLSearchParams(query).has("cov"), false);
  assert.equal(new URLSearchParams(query).has("lambda"), false);
});

check("removed deployment-only fields stay out of unified links", () => {
  const query = buildDayV3Query(urlState);
  const parsed = readDayV3UrlState(query);
  assert.equal(parsed.incentiveBudgetPer100, null);
  assert.equal(new URLSearchParams(query).has("incentive"), false);
  assert.equal(parsed.overrides.protectedExitBonusPct, null);
});

check("malformed or out-of-range URL input stays unresolved", () => {
  const parsed = readDayV3UrlState(
    "mode=other&protect=96&recover=195&exit=-1&target=nope&lambda=99",
  );
  assert.equal(parsed.mode, null);
  assert.equal(parsed.protectedDrawdownPct, null);
  assert.equal(parsed.recoveryDays, null);
  assert.equal(parsed.immediateExitSharePct, null);
  assert.equal(parsed.target, null);
  assert.equal(parsed.overrides.depthAtNav, null);
});

const poolGoals = {
  protectedDrawdownPct: 10,
  recoveryDays: 30,
  immediateExitSharePct: 10,
  minimumProceedsPer100: 98,
  entryPointSettlementDays: 7,
  collateralToExitDays: 2,
  collateralToExitCostBps: 35,
  fixedTermGraceDays: 0,
  navUpdateDays: 1,
  target: { chainId: 1, templateId: "balancer-v3-eclp" },
};
check("target and operational facts invalidate canonical pool results", () => {
  const context = {
    sourceApyPct: 12,
    exitAsset: null,
    exitAssetRateProvider: null,
    exitAssetYieldBearing: null,
  } as const;
  const key = dayV3PoolDesignRequestKey(poolGoals, context);
  assert.equal(dayV3PoolDesignRequestKey(poolGoals, null), null);
  assert.equal(dayV3PoolDesignRequestKey(poolGoals, undefined), null);
  assert.notEqual(
    dayV3PoolDesignRequestKey({ ...poolGoals, entryPointSettlementDays: 8 }),
    key,
  );
  assert.notEqual(
    dayV3PoolDesignRequestKey(poolGoals, { ...context, sourceApyPct: 13 }),
    key,
  );
  assert.notEqual(
    dayV3PoolDesignRequestKey({ ...poolGoals, collateralToExitCostBps: 36 }),
    key,
  );
  assert.notEqual(
    dayV3PoolDesignRequestKey({ ...poolGoals, fixedTermGraceDays: 1 }),
    key,
  );
  assert.notEqual(
    dayV3PoolDesignRequestKey({ ...poolGoals, navUpdateDays: 2 }),
    key,
  );
  assert.notEqual(
    dayV3PoolDesignRequestKey({
      ...poolGoals,
      target: { chainId: 8453, templateId: poolGoals.target.templateId },
    }),
    key,
  );
});
const canonicalPoolSnapshot = {
  schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
  modelVersion: "day-v3-eclp-goal-solver-1.1.0",
  status: "resolved",
  goals: poolGoals,
  context: {
    sourceApyPct: 12,
    exitAsset: null,
    exitAssetRateProvider: null,
    exitAssetYieldBearing: null,
  },
  policy: {
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
      resolvedAt: "2026-08-11T00:00:00.000Z",
    },
    blockNumber: "123",
    resolvedAt: "2026-08-11T00:00:00.000Z",
  },
  recommendation: {
    normalizedSenior: 100,
    fields: Object.fromEntries(
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
              ? "template-policy"
              : key === "maximumPremiumBps"
                ? "derived"
                : "recommended",
          deployPath: null,
          modelUsage:
            key === "maximumPremiumBps" ? "scenario-only" : "fully-modeled",
          evidence: ["test vector"],
        },
      ]),
    ),
    outcomes: {
      amountSellablePer100Senior: 10,
      proceedsForPromisedExit: 9.8,
      promisedExitCostBps: 200,
      lowestModeledPayoutPer100: 98,
      requiredPoolFundingPer100Senior: 12,
      nearNavCostBps: 10,
      exitAssetShareAtNavPct: 90,
      seniorShareAtNavPct: 10,
      restingExitAssetPer100Senior: 10.8,
      restingSeniorPer100Senior: 1.2,
      soldAfterPromisedExitPct: 9,
      restockModelUsage: "fully-modeled",
      restockHurdleBps: 20,
      restockOperationalHurdleBps: 10,
      collateralToExitCostBps: 35,
      restockSwapFeeBps: 10,
      restockGrossMarginAfterPromisedExitBps: 25,
      restockMarginAfterPromisedExitBps: 15,
      restockEconomicFromSoldPct: 8,
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
} as unknown as Extract<DayV3PoolDesignResult, { status: "resolved" }>;

check("canonical inventory and result guards reject shape drift", () => {
  assert.equal(
    isDayV3PoolDesignInventory({
      schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
      modelVersion: "day-v3-eclp-goal-solver-1.1.0",
      status: "resolved",
      targets: [canonicalPoolSnapshot.policy],
      issues: [],
    }),
    true,
  );
  assert.equal(
    isDayV3PoolDesignInventory({
      schemaVersion: "0.9",
      modelVersion: "day-v3-eclp-goal-solver-1.1.0",
      status: "resolved",
      targets: [],
      issues: [],
    }),
    false,
  );
  assert.equal(isDayV3PoolDesignResult(canonicalPoolSnapshot), true);
  const incompleteDerivedParams = structuredClone(
    canonicalPoolSnapshot,
  ) as typeof canonicalPoolSnapshot;
  incompleteDerivedParams.recommendation.eclp.derivedParams = {
    u: "1",
  } as unknown as typeof incompleteDerivedParams.recommendation.eclp.derivedParams;
  assert.equal(isDayV3PoolDesignResult(incompleteDerivedParams), false);
  const extraDerivedParam = structuredClone(
    canonicalPoolSnapshot,
  ) as typeof canonicalPoolSnapshot & {
    recommendation: {
      eclp: { derivedParams: Record<string, string> };
    };
  };
  extraDerivedParam.recommendation.eclp.derivedParams.extra = "1";
  assert.equal(isDayV3PoolDesignResult(extraDerivedParam), false);
  assert.equal(
    isDayV3PoolDesignResult({ ...canonicalPoolSnapshot, recommendation: null }),
    false,
  );
  assert.equal(
    isDayV3PoolDesignResult({ ...canonicalPoolSnapshot, schemaVersion: "0.9" }),
    false,
  );
  const missingProtocolFees = structuredClone(
    canonicalPoolSnapshot,
  ) as unknown as { policy: Record<string, unknown> };
  delete missingProtocolFees.policy.protocolFees;
  assert.equal(isDayV3PoolDesignResult(missingProtocolFees), false);
  const missingYieldModels = structuredClone(
    canonicalPoolSnapshot,
  ) as unknown as { policy: Record<string, unknown> };
  delete missingYieldModels.policy.yieldModels;
  assert.equal(isDayV3PoolDesignResult(missingYieldModels), false);
  const zeroYieldModel = structuredClone(
    canonicalPoolSnapshot,
  ) as typeof canonicalPoolSnapshot;
  zeroYieldModel.policy.yieldModels.jt.STATIC_CURVE =
    "0x0000000000000000000000000000000000000000";
  assert.equal(isDayV3PoolDesignResult(zeroYieldModel), false);
  const mismatchedYieldPolicyBlock = structuredClone(
    canonicalPoolSnapshot,
  ) as typeof canonicalPoolSnapshot;
  mismatchedYieldPolicyBlock.policy.yieldModels.blockNumber = "124";
  assert.equal(isDayV3PoolDesignResult(mismatchedYieldPolicyBlock), false);
  const sharedYieldModel = structuredClone(
    canonicalPoolSnapshot,
  ) as typeof canonicalPoolSnapshot;
  sharedYieldModel.policy.yieldModels.lpt.STATIC_CURVE =
    sharedYieldModel.policy.yieldModels.jt.STATIC_CURVE;
  assert.equal(isDayV3PoolDesignResult(sharedYieldModel), false);
  const overstatedPremiumUsage = structuredClone(
    canonicalPoolSnapshot,
  ) as typeof canonicalPoolSnapshot;
  overstatedPremiumUsage.recommendation.fields.maximumPremiumBps.modelUsage =
    "fully-modeled";
  assert.equal(isDayV3PoolDesignResult(overstatedPremiumUsage), false);
  assert.equal(
    isDayV3PoolDesignResult({
      ...canonicalPoolSnapshot,
      goals: { ...poolGoals, recoveryDays: 7.5 },
    }),
    false,
  );
  assert.equal(
    isDayV3PoolDesignResult({
      schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
      modelVersion: "day-v3-eclp-goal-solver-1.1.0",
      status: "unresolved",
      recommendation: null,
      issues: [{ code: "POLICY_UNRESOLVED", message: "Live fee unavailable." }],
    }),
    true,
  );
  assert.equal(
    isDayV3PoolDesignResult({
      schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
      modelVersion: "wrong-model",
      status: "unresolved",
      recommendation: null,
      issues: [{ code: "POLICY_UNRESOLVED", message: "Live fee unavailable." }],
    }),
    false,
  );
});

check("live fee policy mirrors the contract's inclusive endpoints", () => {
  const policy = canonicalPoolSnapshot.policy;
  assert.equal(isDayV3ResolvedPolicy({ ...policy, swapFeeBps: 0 }), false);
  assert.equal(isDayV3ResolvedPolicy({ ...policy, swapFeeBps: 0.0099 }), false);
  assert.equal(isDayV3ResolvedPolicy({ ...policy, swapFeeBps: 0.01 }), true);
  assert.equal(isDayV3ResolvedPolicy({ ...policy, swapFeeBps: 10_000 }), true);
  assert.equal(
    isDayV3ResolvedPolicy({ ...policy, swapFeeBps: 10_000.01 }),
    false,
  );
});

check(
  "canonical result guards require restock evidence and usable exact ECLP",
  () => {
    const withoutRestock = structuredClone(
      canonicalPoolSnapshot,
    ) as unknown as {
      recommendation: { outcomes: Record<string, unknown> };
    };
    delete withoutRestock.recommendation.outcomes.restockEconomicFromSoldPct;
    assert.equal(isDayV3PoolDesignResult(withoutRestock), false);

    const mismatchedLambda = structuredClone(
      canonicalPoolSnapshot,
    ) as unknown as {
      recommendation: { eclp: { params: Record<string, string> } };
    };
    mismatchedLambda.recommendation.eclp.params.lambda =
      "301000000000000000000";
    assert.equal(isDayV3PoolDesignResult(mismatchedLambda), false);

    const invertedBounds = structuredClone(
      canonicalPoolSnapshot,
    ) as unknown as {
      recommendation: { eclp: { params: Record<string, string> } };
    };
    invertedBounds.recommendation.eclp.params.alpha =
      invertedBounds.recommendation.eclp.params.beta;
    assert.equal(isDayV3PoolDesignResult(invertedBounds), false);

    const underpaidPromise = structuredClone(
      canonicalPoolSnapshot,
    ) as typeof canonicalPoolSnapshot;
    underpaidPromise.recommendation.outcomes.proceedsForPromisedExit = 9.79;
    assert.equal(isDayV3PoolDesignResult(underpaidPromise), false);

    const uneconomicRestock = structuredClone(
      canonicalPoolSnapshot,
    ) as typeof canonicalPoolSnapshot;
    uneconomicRestock.recommendation.outcomes.restockMarginAfterPromisedExitBps =
      -0.01;
    assert.equal(isDayV3PoolDesignResult(uneconomicRestock), false);
  },
);

check(
  "restock stays explicitly unresolved without conversion assumptions",
  () => {
    const unresolvedRestock = structuredClone(
      canonicalPoolSnapshot,
    ) as typeof canonicalPoolSnapshot;
    unresolvedRestock.goals.collateralToExitDays = null;
    unresolvedRestock.goals.collateralToExitCostBps = 35;
    unresolvedRestock.recommendation.outcomes.restockHurdleBps = null;
    unresolvedRestock.recommendation.outcomes.restockOperationalHurdleBps =
      null;
    unresolvedRestock.recommendation.outcomes.collateralToExitCostBps = 35;
    unresolvedRestock.recommendation.outcomes.restockModelUsage =
      "scenario-only";
    unresolvedRestock.recommendation.outcomes.restockGrossMarginAfterPromisedExitBps =
      null;
    unresolvedRestock.recommendation.outcomes.restockMarginAfterPromisedExitBps =
      null;
    unresolvedRestock.recommendation.outcomes.restockEconomicFromSoldPct = null;
    assert.equal(isDayV3PoolDesignResult(unresolvedRestock), true);

    unresolvedRestock.recommendation.outcomes.restockHurdleBps = 20;
    assert.equal(isDayV3PoolDesignResult(unresolvedRestock), false);

    const wrongRestockFee = structuredClone(
      canonicalPoolSnapshot,
    ) as typeof canonicalPoolSnapshot;
    wrongRestockFee.recommendation.outcomes.restockSwapFeeBps = 11;
    assert.equal(isDayV3PoolDesignResult(wrongRestockFee), false);
  },
);

check("V3 handoff round-trips without imported price history", () => {
  const staticYieldShareCurves = {
    junior: { y0Pct: 2, yTargetPct: 12, y100Pct: 18 },
    slp: { y0Pct: 1, yTargetPct: 5, y100Pct: 14 },
  };
  const handoff = buildDayV3HandoffV3({
    exportedAt: "2026-08-11T00:00:00.000Z",
    source: {
      marketId: "custom",
      name: "Custom yield source",
      asset: "Custom source",
      sourceApyPct: 12,
    },
    features: {
      seniorProtection: "enabled",
      immediateExit: "enabled",
    },
    goals: poolGoals,
    deploymentPolicy: {
      settlement: {
        appliesTo: "all-tranches",
        depositDelaySeconds: 300,
        depositExpirySeconds: "no-expiry",
        withdrawalDelaySeconds: 604_800,
        withdrawalExpirySeconds: "no-expiry",
        gateByOracleUpdate: true,
      },
      maxReinvestmentSlippageBps: 50,
    },
    minimumCoveragePct: 9,
    minimumLiquidityPct: 10,
    protectedExitThresholdPct: 5,
    protectedExitBonusPct: 0,
    canonicalPoolSnapshot,
    liveYieldTarget: canonicalPoolSnapshot.policy,
    staticYieldShareCurves,
  });
  const url = new URL(
    buildDayV3DeploymentUrl("https://royco.org/deploy-market/", handoff),
  );
  const parsed = JSON.parse(url.searchParams.get("dayV3") ?? "null");
  assert.deepEqual(parsed, handoff);
  assert.equal(parsed.status, "ready-for-revalidation");
  assert.equal(parsed.version, 4);
  assert.equal(parsed.goals.entryPointSettlementDays, 7);
  assert.deepEqual(parsed.modeledInputs, {
    staticYieldShareCurves,
    modeledShape: "STATIC_CURVE",
  });
  assert.deepEqual(parsed.yieldPolicy.jt, {
    ydmType: "STATIC_CURVE",
    registryAddress: "0x1111111111111111111111111111111111111111",
    curveParams: {
      zeroUtilizationYieldShareWAD: "20000000000000000",
      targetUtilizationYieldShareWAD: "120000000000000000",
      fullUtilizationYieldShareWAD: "180000000000000000",
    },
    maximumYieldShareWAD: "180000000000000000",
  });
  assert.equal(parsed.yieldPolicy.lpt.ydmType, "STATIC_CURVE");
  assert.equal(parsed.deploymentPolicy.settlement.appliesTo, "all-tranches");
  assert.equal(parsed.deploymentPolicy.maxReinvestmentSlippageBps, 50);
  assert.match(parsed.warnings.join(" "), /preserve the exact shape identity/);
  assert.equal(JSON.stringify(parsed).includes("series"), false);
  assert.equal(JSON.stringify(parsed).includes("priceHistory"), false);
});

check(
  "V3 handoff exports contract no-op semantics for disabled mechanisms",
  () => {
    const deploymentPolicy = {
      settlement: {
        appliesTo: "all-tranches" as const,
        depositDelaySeconds: 300,
        depositExpirySeconds: "no-expiry" as const,
        withdrawalDelaySeconds: 86_400,
        withdrawalExpirySeconds: "no-expiry" as const,
        gateByOracleUpdate: true,
      },
      maxReinvestmentSlippageBps: 50,
    };
    const protectionOff = buildDayV3HandoffV3({
      exportedAt: "2026-08-13T00:00:00.000Z",
      source: {
        marketId: "custom",
        name: "Custom source",
        asset: "Custom asset",
        sourceApyPct: 8,
      },
      features: { seniorProtection: "disabled", immediateExit: "enabled" },
      goals: {
        ...poolGoals,
        protectedDrawdownPct: 0,
        recoveryDays: 0,
        fixedTermGraceDays: 0,
      },
      deploymentPolicy,
      minimumCoveragePct: 0,
      minimumLiquidityPct: 10,
      protectedExitThresholdPct: 0,
      protectedExitBonusPct: 0,
      canonicalPoolSnapshot,
      liveYieldTarget: canonicalPoolSnapshot.policy,
      staticYieldShareCurves: {
        junior: { y0Pct: 0, yTargetPct: 0, y100Pct: 0 },
        slp: { y0Pct: 1, yTargetPct: 5, y100Pct: 10 },
      },
    });
    assert.equal(protectionOff.recommendations.minimumCoveragePct, 0);
    assert.equal(protectionOff.recommendations.protectedExitThresholdPct, 0);
    assert.equal(protectionOff.yieldPolicy.jt.ydmType, "FIXED");
    assert.equal(protectionOff.yieldPolicy.jt.maximumYieldShareWAD, "0");

    const exitOff = buildDayV3HandoffV3({
      exportedAt: "2026-08-13T00:00:00.000Z",
      source: protectionOff.source,
      features: { seniorProtection: "enabled", immediateExit: "disabled" },
      goals: {
        ...poolGoals,
        immediateExitSharePct: 0,
        minimumProceedsPer100: 0,
      },
      deploymentPolicy,
      minimumCoveragePct: 9,
      minimumLiquidityPct: 0,
      protectedExitThresholdPct: 5,
      protectedExitBonusPct: 0,
      canonicalPoolSnapshot: null,
      liveYieldTarget: canonicalPoolSnapshot.policy,
      staticYieldShareCurves: {
        junior: { y0Pct: 2, yTargetPct: 9, y100Pct: 15 },
        slp: { y0Pct: 0, yTargetPct: 0, y100Pct: 0 },
      },
    });
    assert.equal(exitOff.recommendations.minimumLiquidityPct, 0);
    assert.equal(exitOff.yieldPolicy.lpt.ydmType, "FIXED");
    assert.equal(exitOff.yieldPolicy.lpt.maximumYieldShareWAD, "0");

    assert.throws(
      () =>
        buildDayV3HandoffV3({
          exportedAt: exitOff.exportedAt,
          source: exitOff.source,
          features: { ...exitOff.features, immediateExit: "enabled" },
          goals: exitOff.goals,
          deploymentPolicy: exitOff.deploymentPolicy,
          minimumCoveragePct: exitOff.recommendations.minimumCoveragePct,
          minimumLiquidityPct: exitOff.recommendations.minimumLiquidityPct,
          protectedExitThresholdPct:
            exitOff.recommendations.protectedExitThresholdPct,
          protectedExitBonusPct: exitOff.recommendations.protectedExitBonusPct,
          canonicalPoolSnapshot: exitOff.recommendations.canonicalPoolSnapshot,
          liveYieldTarget: canonicalPoolSnapshot.policy,
          staticYieldShareCurves: exitOff.modeledInputs.staticYieldShareCurves,
        }),
      /INCONSISTENT_ENABLED_DAY_V3_EXIT/,
    );
  },
);

check("V3 handoff rejects invalid contract deployment policy", () => {
  assert.throws(
    () =>
      buildDayV3HandoffV3({
        exportedAt: "2026-08-11T00:00:00.000Z",
        source: {
          marketId: "custom",
          name: "Custom yield source",
          asset: "Custom source",
          sourceApyPct: 12,
        },
        features: {
          seniorProtection: "enabled",
          immediateExit: "enabled",
        },
        goals: poolGoals,
        deploymentPolicy: {
          settlement: {
            appliesTo: "all-tranches",
            depositDelaySeconds: 300,
            depositExpirySeconds: "no-expiry",
            withdrawalDelaySeconds: 86_399,
            withdrawalExpirySeconds: "no-expiry",
            gateByOracleUpdate: true,
          },
          maxReinvestmentSlippageBps: 50,
        },
        minimumCoveragePct: 9,
        minimumLiquidityPct: 10,
        protectedExitThresholdPct: 5,
        protectedExitBonusPct: 0,
        canonicalPoolSnapshot,
        liveYieldTarget: canonicalPoolSnapshot.policy,
        staticYieldShareCurves: {
          junior: { y0Pct: 2, yTargetPct: 9, y100Pct: 15 },
          slp: { y0Pct: 1, yTargetPct: 5, y100Pct: 10 },
        },
      }),
    /INVALID_DAY_V3_DEPLOYMENT_POLICY/,
  );
});

check("normalization preserves ratios and fixes Senior at 100", () => {
  const normalized = normalizeDayV3Defaults(defaults);
  const scale = 100 / defaults.initialST;
  assert.equal(normalized.initialST, 100);
  assert.ok(
    Math.abs(normalized.initialJT - defaults.initialJT * scale) < 1e-12,
  );
  assert.ok(
    Math.abs(normalized.initialLT - defaults.initialLT * scale) < 1e-12,
  );
});

check("relative capital is sized by the shared 90% utilization helper", () => {
  const capital = dayV3CapitalAtTarget(defaults, {
    coveragePct: 20,
    minimumLiquidityPct: 10,
  });
  assert.equal(capital.seniorPer100, 100);
  assert.ok(Math.abs(capital.juniorPer100 - 28.5714285714) < 1e-8);
  assert.ok(Math.abs(capital.slpPer100 - 11.1111111111) < 1e-8);
  assert.equal(capital.targetUtilization, 0.9);
});

check(
  "canonical pool funding is inverted through shared liquidity sizing",
  () => {
    const result = dayV3MinimumLiquidityForPoolFunding(defaults, {
      poolFundingPer100Senior: 11.1111111111,
      coveragePct: 20,
    });
    assert.equal(result.status, "recommended");
    assert.equal(result.minimumLiquidity.value, 10);
    assert.ok((result.capital?.slpPer100 ?? 0) >= 11.1111111111 - 1e-9);
    assert.ok(
      dayV3CapitalAtTarget(defaults, {
        coveragePct: 20,
        minimumLiquidityPct: 9.99,
      }).slpPer100 < 11.1111111111,
    );
  },
);

check(
  "coverage search finds the smallest basis-point setting that protects Senior",
  () => {
    const result = recommendDayV3Coverage(defaults, {
      protectedDrawdownPct: 10,
      minimumLiquidityPct: 10,
    });
    assert.equal(result.status, "recommended");
    assert.equal(result.coverage.value, 9);
    assert.equal(result.seniorBasis, 100);
    assert.equal(result.stress.keepsSeniorWhole, true);
    assert.ok((result.stress.seniorLossPer100 ?? 1) < 1e-8);
    assert.ok((result.capital?.juniorPer100 ?? 0) > 0);
    assert.ok((result.projectedApy.junior ?? 0) > 0);
    assert.equal(
      dayV3CoverageKeepsSeniorWhole(defaults, {
        protectedDrawdownPct: 10,
        coveragePct: (result.coverage.value ?? 0) - 0.01,
        minimumLiquidityPct: 10,
      }),
      false,
    );
  },
);

check(
  "coverage search leaves SLP unresolved when no exit requirement exists",
  () => {
    const result = recommendDayV3Coverage(defaults, {
      protectedDrawdownPct: 5,
    });
    assert.equal(result.status, "recommended");
    assert.equal(result.capital?.slpPer100, null);
    assert.equal(result.projectedApy.slp, null);
  },
);

check("turning protection off resolves to zero Junior capital", () => {
  const result = recommendDayV3Coverage(defaults, {
    protectedDrawdownPct: 0,
    minimumLiquidityPct: 0,
  });
  assert.equal(result.status, "recommended");
  assert.equal(result.coverage.value, 0);
  assert.equal(result.capital?.juniorPer100, 0);
  assert.equal(result.capital?.slpPer100, 0);
  assert.equal(result.stress.seniorLossPer100, 0);
  assert.equal(result.projectedApy.junior, null);
  assert.equal(result.projectedApy.slp, null);
});

check("invalid stress goals never receive a recommendation", () => {
  const result = recommendDayV3Coverage(defaults, { protectedDrawdownPct: 96 });
  assert.equal(result.status, "invalid-input");
  assert.equal(result.coverage.value, null);
  assert.equal(result.coverage.origin, "unresolved");
});

const alternatingSeries = (recoveredEpisodes: number) =>
  Array.from({ length: recoveredEpisodes * 2 + 1 }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
    price: index % 2 === 0 ? 1 : 0.99,
  }));

const recoveryTerms = {
  coveragePct: 5,
  minLiquidityPct: 10,
  eclpBandWidthPct: 1,
  riskSharePct: 5,
  liqSharePct: 10,
};

check(
  "p90 is recommended only after five accountant-confirmed recoveries",
  () => {
    const sufficient = runDayV3RecoveryAnalysis({
      defaults,
      series: alternatingSeries(5),
      terms: recoveryTerms,
    });
    assert.equal(sufficient.status, "recommended");
    assert.equal(sufficient.recoveredEpisodeCount, 5);
    assert.equal(sufficient.field.value, 1);
    assert.ok(
      sufficient.episodes.every(
        (episode) => episode.exitReason === "recovered",
      ),
    );

    const sparse = runDayV3RecoveryAnalysis({
      defaults,
      series: alternatingSeries(4),
      terms: recoveryTerms,
    });
    assert.equal(sparse.status, "sparse-history");
    assert.equal(sparse.field.value, null);
  },
);

check(
  "recovery evidence is not censored by an existing Protected Exit trigger",
  () => {
    const result = runDayV3RecoveryAnalysis({
      defaults,
      series: Array.from({ length: 11 }, (_, index) => ({
        date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
        price: index % 2 === 0 ? 1 : 0.9,
      })),
      terms: {
        ...recoveryTerms,
        coveragePct: 20,
        riskSharePct: 20,
      },
    });
    assert.equal(result.status, "recommended");
    assert.equal(result.recoveredEpisodeCount, 5);
  },
);

check(
  "raw drawdowns do not count when the accountant opens no Observation Period",
  () => {
    const result = runDayV3RecoveryAnalysis({
      defaults,
      series: alternatingSeries(6),
      terms: { ...recoveryTerms, coveragePct: 0, riskSharePct: 0 },
    });
    assert.equal(result.status, "no-observation-periods");
    assert.equal(result.recoveredEpisodeCount, 0);
  },
);

check("a recovery at the 194-day deployment boundary remains eligible", () => {
  const series = [{ date: "2020-01-01", price: 1 }];
  let cursor = Date.parse("2020-01-01T00:00:00Z");
  for (let episode = 0; episode < 5; episode += 1) {
    cursor += 86_400_000;
    series.push({
      date: new Date(cursor).toISOString().slice(0, 10),
      price: 0.99,
    });
    cursor += 194 * 86_400_000;
    series.push({
      date: new Date(cursor).toISOString().slice(0, 10),
      price: 1,
    });
  }
  const result = runDayV3RecoveryAnalysis({
    defaults,
    series,
    terms: recoveryTerms,
  });
  assert.equal(result.status, "recommended");
  assert.equal(result.field.value, 194);
  assert.equal(result.percentile90Days, 194);
});

check(
  "history beyond 194 days does not receive a shortened recommendation",
  () => {
    const series = [{ date: "2020-01-01", price: 1 }];
    let cursor = Date.parse("2020-01-01T00:00:00Z");
    for (let episode = 0; episode < 5; episode += 1) {
      cursor += 86_400_000;
      series.push({
        date: new Date(cursor).toISOString().slice(0, 10),
        price: 0.99,
      });
      cursor += 195 * 86_400_000;
      series.push({
        date: new Date(cursor).toISOString().slice(0, 10),
        price: 1,
      });
    }
    const result = runDayV3RecoveryAnalysis({
      defaults,
      series,
      terms: recoveryTerms,
    });
    assert.equal(result.status, "outside-deployment-window");
    assert.equal(result.field.value, null);
    assert.equal(result.percentile90Days, 195);
    assert.equal(result.cappedByDeploymentLimit, true);
  },
);

check(
  "daily history beyond 194 days remains visible as out-of-window evidence",
  () => {
    const series = [{ date: "2020-01-01", price: 1 }];
    let cursor = Date.parse("2020-01-01T00:00:00Z");
    for (let episode = 0; episode < 5; episode += 1) {
      cursor += DAY_MS;
      // The loss opens on day 1; recovery on day 196 is 195 elapsed days.
      for (let day = 1; day <= 196; day += 1) {
        series.push({
          date: new Date(cursor).toISOString().slice(0, 10),
          price: day === 196 ? 1 : 0.99,
        });
        cursor += DAY_MS;
      }
    }
    const result = runDayV3RecoveryAnalysis({
      defaults,
      series,
      terms: recoveryTerms,
    });
    assert.equal(result.status, "outside-deployment-window");
    assert.equal(result.recoveredEpisodeCount, 5);
    assert.equal(result.percentile90Days, 195);
    assert.ok(result.referenceObservationDays > 194);
    assert.ok(
      result.episodes.every((episode) => episode.exitReason === "recovered"),
    );
  },
);

check("zero-day recovery remains an explicit accountant scenario", () => {
  const trigger = recommendDayV3ProtectedExitTrigger({
    defaults,
    series: alternatingSeries(5),
    terms: recoveryTerms,
    recoveryDays: 0,
  });
  assert.equal(trigger.recoveryDays, 0);
  assert.equal(trigger.status, "unresolved");

  const scenarios = runDayV3ProtectedExitScenarios({
    defaults,
    coveragePct: 20,
    protectedExitThresholdPct: 5,
    bonusPct: 0,
    recoveryDays: 0,
  });
  assert.equal(scenarios.status, "ready");
});

check("zero-day recovery finalizes Junior loss immediately", () => {
  const result = runDayV3RecoveryAnalysis({
    defaults,
    series: alternatingSeries(5),
    terms: recoveryTerms,
  });
  const zeroDayBacktest = runDayHistoricalBacktest({
    defaults,
    series: alternatingSeries(1),
    terms: { ...recoveryTerms, observationDays: 0 },
    maintainCoverage: false,
    omitInitialZeroReturnPeriod: false,
  });
  assert.ok(result.referenceObservationDays > 194);
  assert.equal(zeroDayBacktest.observationPeriods.length, 0);
  assert.ok(
    zeroDayBacktest.sim.events.some((event) => event.kind === "jt-il-erased"),
  );
  assert.equal(
    zeroDayBacktest.sim.events.some(
      (event) => event.kind === "exit-fixed-term",
    ),
    false,
  );
});

check("missing history remains unresolved", () => {
  const result = runDayV3RecoveryAnalysis({
    defaults,
    series: [],
    terms: recoveryTerms,
  });
  assert.equal(result.status, "no-history");
  assert.equal(result.field.value, null);
});

check(
  "Protected Exit trigger stays unresolved with insufficient recovery evidence",
  () => {
    const result = recommendDayV3ProtectedExitTrigger({
      defaults,
      series: alternatingSeries(4),
      terms: recoveryTerms,
      recoveryDays: 30,
    });
    assert.equal(result.status, "unresolved");
    assert.equal(result.recoveredEpisodeCount, 4);
    assert.equal(result.trigger.value, null);
  },
);

check(
  "Protected Exit trigger preserves every sufficiently evidenced recovery",
  () => {
    const result = recommendDayV3ProtectedExitTrigger({
      defaults,
      series: alternatingSeries(5),
      terms: recoveryTerms,
      recoveryDays: 30,
    });
    assert.equal(result.status, "recommended");
    assert.equal(result.recoveredEpisodeCount, 5);
    assert.ok((result.trigger.value ?? 0) > 0);
    assert.ok((result.trigger.value ?? 100) < recoveryTerms.coveragePct);
    assert.ok((result.liquidationUtilization ?? 0) > 1);
  },
);

check("no incentive budget produces an explicit zero bonus", () => {
  const bonus = deriveDayV3ProtectedExitBonus(null, null);
  assert.equal(bonus.status, "ready");
  assert.equal(bonus.bonus.value, 0);
  assert.equal(bonus.bonus.origin, "derived");

  const scenarios = runDayV3ProtectedExitScenarios({
    defaults,
    coveragePct: 20,
    protectedExitThresholdPct: 5,
    bonusPct: 0,
    recoveryDays: 30,
  });
  assert.equal(scenarios.status, "ready");
  assert.ok(
    scenarios.scenarios.every((scenario) => scenario.bonusPaidPer100 === 0),
  );
  assert.ok(
    scenarios.scenarios.every(
      (scenario) =>
        Math.abs(scenario.payoutPer100 - scenario.baseRedemptionPer100) < 1e-9,
    ),
  );
});

check("Protected Exit scenarios expose the engine's dynamic bonus cap", () => {
  const bonus = deriveDayV3ProtectedExitBonus(5, 5);
  assert.equal(bonus.status, "ready");
  assert.equal(bonus.bonus.value, 5);
  const scenarios = runDayV3ProtectedExitScenarios({
    defaults,
    coveragePct: 20,
    protectedExitThresholdPct: 5,
    bonusPct: 5,
    recoveryDays: 30,
  });
  assert.equal(scenarios.status, "ready");
  assert.deepEqual(
    scenarios.scenarios.map((scenario) => scenario.redeemedSeniorPct),
    [25, 50, 100],
  );
  for (const scenario of scenarios.scenarios) {
    assert.ok(scenario.onChainBonusCapPer100 > 0);
    assert.ok(
      scenario.bonusPaidPer100 <= scenario.onChainBonusCapPer100 + 1e-9,
    );
    assert.ok(
      Math.abs(scenario.juniorConsumedPer100 - scenario.bonusPaidPer100) < 1e-9,
    );
    assert.ok(
      Math.abs(
        scenario.payoutPer100 -
          (scenario.baseRedemptionPer100 + scenario.bonusPaidPer100),
      ) < 1e-9,
    );
    assert.ok(Number.isFinite(scenario.remainingCoveragePct));
    assert.ok(scenario.remainingCoveragePct >= 0);
    assert.ok(scenario.remainingCoveragePct <= 100);
  }
});

check("a budget above the trigger is never silently clamped", () => {
  const bonus = deriveDayV3ProtectedExitBonus(6, 5);
  assert.equal(bonus.status, "unresolved");
  assert.equal(bonus.bonus.value, null);
});

console.log(`Day V3 core: ${passed} checks passed`);
