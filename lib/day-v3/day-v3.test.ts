import assert from "node:assert/strict";

import { DEFAULT_DAY_EXPLORER_MARKET } from "@/lib/day-markets/registry";
import {
  buildDayV3DeploymentUrl,
  buildDayV3HandoffV1,
  buildDayV3Query,
  dayV3MinimumLiquidityForPoolFunding,
  dayV3CapitalAtTarget,
  deriveDayV3ProtectedExitBonus,
  isDayV3PoolDesignInventory,
  isDayV3PoolDesignResult,
  normalizeDayV3Defaults,
  readDayV3UrlState,
  recommendDayV3Coverage,
  recommendDayV3ProtectedExitTrigger,
  runDayV3ProtectedExitScenarios,
  runDayV3RecoveryAnalysis,
  toggleDayV3Mode,
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

console.log("Day V3 goal-state and recommendations");

check("V3 mode toggles directly", () => {
  assert.equal(toggleDayV3Mode("simulate"), "deploy");
  assert.equal(toggleDayV3Mode("deploy"), "simulate");
});

const urlState: DayV3UrlState = {
  market: "custom",
  mode: "deploy",
  sourceApyPct: 8.25,
  protectedDrawdownPct: 12.5,
  recoveryDays: 0,
  immediateExitSharePct: 15,
  minimumProceedsPer100: 98,
  redemptionDays: 7,
  navUpdateDays: 1,
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
  },
};

check("V3 URL goals and explicit overrides round-trip", () => {
  assert.deepEqual(readDayV3UrlState(buildDayV3Query(urlState)), urlState);
});

check("operational durations are normalized to whole days in generated links", () => {
  const parsed = readDayV3UrlState(
    buildDayV3Query({
      ...urlState,
      recoveryDays: 7.49,
      redemptionDays: 7.5,
      navUpdateDays: 30.6,
    }),
  );
  assert.equal(parsed.recoveryDays, 7);
  assert.equal(parsed.redemptionDays, 8);
  assert.equal(parsed.navUpdateDays, 31);
});

check("fractional operational durations are rejected when parsing external URLs", () => {
  const parsed = readDayV3UrlState("recover=7.5&redeem=2.25&nav=1.1");
  assert.equal(parsed.recoveryDays, null);
  assert.equal(parsed.redemptionDays, null);
  assert.equal(parsed.navUpdateDays, null);
});

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
  redemptionDays: 7,
  navUpdateDays: 1,
  target: { chainId: 1, templateId: "balancer-v3-eclp" },
};
const canonicalPoolSnapshot = {
  schemaVersion: "1.0",
  modelVersion: "day-v3-eclp-goal-solver-1.0.0",
  status: "resolved",
  goals: poolGoals,
  policy: {
    status: "resolved",
    chainId: 1,
    chainName: "Ethereum",
    templateId: "balancer-v3-eclp",
    templateName: "Balancer V3 ECLP",
    templateAddress: "0x0000000000000000000000000000000000000001",
    swapFeeBps: 10,
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
          modelUsage: "fully-modeled",
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
      exitAssetSeedPer100Senior: 10.8,
      seniorSeedPer100Senior: 1.2,
      soldAfterPromisedExitPct: 9,
      restockHurdleBps: 20,
      restockOperationalHurdleBps: 10,
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
      derivedParams: { u: "1" },
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
      schemaVersion: "1.0",
      modelVersion: "day-v3-eclp-goal-solver-1.0.0",
      status: "resolved",
      targets: [canonicalPoolSnapshot.policy],
      issues: [],
    }),
    true,
  );
  assert.equal(
    isDayV3PoolDesignInventory({
      schemaVersion: "0.9",
      modelVersion: "day-v3-eclp-goal-solver-1.0.0",
      status: "resolved",
      targets: [],
      issues: [],
    }),
    false,
  );
  assert.equal(isDayV3PoolDesignResult(canonicalPoolSnapshot), true);
  assert.equal(
    isDayV3PoolDesignResult({ ...canonicalPoolSnapshot, recommendation: null }),
    false,
  );
  assert.equal(
    isDayV3PoolDesignResult({ ...canonicalPoolSnapshot, schemaVersion: "0.9" }),
    false,
  );
  assert.equal(
    isDayV3PoolDesignResult({
      ...canonicalPoolSnapshot,
      goals: { ...poolGoals, recoveryDays: 7.5 },
    }),
    false,
  );
  assert.equal(
    isDayV3PoolDesignResult({
      schemaVersion: "1.0",
      modelVersion: "day-v3-eclp-goal-solver-1.0.0",
      status: "unresolved",
      recommendation: null,
      issues: [{ code: "POLICY_UNRESOLVED", message: "Live fee unavailable." }],
    }),
    true,
  );
  assert.equal(
    isDayV3PoolDesignResult({
      schemaVersion: "1.0",
      modelVersion: "wrong-model",
      status: "unresolved",
      recommendation: null,
      issues: [{ code: "POLICY_UNRESOLVED", message: "Live fee unavailable." }],
    }),
    false,
  );
});

check("V3 handoff round-trips without imported price history", () => {
  const handoff = buildDayV3HandoffV1({
    exportedAt: "2026-08-11T00:00:00.000Z",
    source: {
      marketId: "custom",
      name: "Custom yield source",
      asset: "Custom source",
      sourceApyPct: 12,
    },
    goals: poolGoals,
    minimumCoveragePct: 9,
    minimumLiquidityPct: 10,
    protectedExitThresholdPct: 5,
    protectedExitBonusPct: 0,
    canonicalPoolSnapshot,
  });
  const url = new URL(buildDayV3DeploymentUrl("https://royco.org/deploy-market/", handoff));
  const parsed = JSON.parse(url.searchParams.get("dayV3") ?? "null");
  assert.deepEqual(parsed, handoff);
  assert.equal(parsed.status, "ready-for-revalidation");
  assert.equal(JSON.stringify(parsed).includes("series"), false);
  assert.equal(JSON.stringify(parsed).includes("priceHistory"), false);
});

check("normalization preserves ratios and fixes Senior at 100", () => {
  const normalized = normalizeDayV3Defaults(defaults);
  const scale = 100 / defaults.initialST;
  assert.equal(normalized.initialST, 100);
  assert.ok(Math.abs(normalized.initialJT - defaults.initialJT * scale) < 1e-12);
  assert.ok(Math.abs(normalized.initialLT - defaults.initialLT * scale) < 1e-12);
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

check("canonical pool funding is inverted through shared liquidity sizing", () => {
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
});

check("coverage search finds the smallest basis-point setting that protects Senior", () => {
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
});

check("coverage search leaves SLP unresolved when no exit requirement exists", () => {
  const result = recommendDayV3Coverage(defaults, { protectedDrawdownPct: 5 });
  assert.equal(result.status, "recommended");
  assert.equal(result.capital?.slpPer100, null);
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

check("p90 is recommended only after five accountant-confirmed recoveries", () => {
  const sufficient = runDayV3RecoveryAnalysis({
    defaults,
    series: alternatingSeries(5),
    terms: recoveryTerms,
  });
  assert.equal(sufficient.status, "recommended");
  assert.equal(sufficient.recoveredEpisodeCount, 5);
  assert.equal(sufficient.field.value, 1);
  assert.ok(sufficient.episodes.every((episode) => episode.exitReason === "recovered"));

  const sparse = runDayV3RecoveryAnalysis({
    defaults,
    series: alternatingSeries(4),
    terms: recoveryTerms,
  });
  assert.equal(sparse.status, "sparse-history");
  assert.equal(sparse.field.value, null);
});

check("recovery evidence is not censored by an existing Protected Exit trigger", () => {
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
});

check("raw drawdowns do not count when the accountant opens no Observation Period", () => {
  const result = runDayV3RecoveryAnalysis({
    defaults,
    series: alternatingSeries(6),
    terms: { ...recoveryTerms, coveragePct: 0, riskSharePct: 0 },
  });
  assert.equal(result.status, "no-observation-periods");
  assert.equal(result.recoveredEpisodeCount, 0);
});

check("a recovery at the 194-day deployment boundary remains eligible", () => {
  const series = [{ date: "2020-01-01", price: 1 }];
  let cursor = Date.parse("2020-01-01T00:00:00Z");
  for (let episode = 0; episode < 5; episode += 1) {
    cursor += 86_400_000;
    series.push({ date: new Date(cursor).toISOString().slice(0, 10), price: 0.99 });
    cursor += 194 * 86_400_000;
    series.push({ date: new Date(cursor).toISOString().slice(0, 10), price: 1 });
  }
  const result = runDayV3RecoveryAnalysis({ defaults, series, terms: recoveryTerms });
  assert.equal(result.status, "recommended");
  assert.equal(result.field.value, 194);
  assert.equal(result.percentile90Days, 194);
});

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

check("missing history remains unresolved", () => {
  const result = runDayV3RecoveryAnalysis({
    defaults,
    series: [],
    terms: recoveryTerms,
  });
  assert.equal(result.status, "no-history");
  assert.equal(result.field.value, null);
});

check("Protected Exit trigger stays unresolved with insufficient recovery evidence", () => {
  const result = recommendDayV3ProtectedExitTrigger({
    defaults,
    series: alternatingSeries(4),
    terms: recoveryTerms,
    recoveryDays: 30,
  });
  assert.equal(result.status, "unresolved");
  assert.equal(result.recoveredEpisodeCount, 4);
  assert.equal(result.trigger.value, null);
});

check("Protected Exit trigger preserves every sufficiently evidenced recovery", () => {
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
});

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
  assert.ok(scenarios.scenarios.every((scenario) => scenario.bonusPaidPer100 === 0));
  assert.ok(
    scenarios.scenarios.every(
      (scenario) => Math.abs(scenario.payoutPer100 - scenario.baseRedemptionPer100) < 1e-9,
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
    assert.ok(scenario.bonusPaidPer100 <= scenario.onChainBonusCapPer100 + 1e-9);
    assert.ok(Math.abs(scenario.juniorConsumedPer100 - scenario.bonusPaidPer100) < 1e-9);
    assert.ok(
      Math.abs(
        scenario.payoutPer100 -
          (scenario.baseRedemptionPer100 + scenario.bonusPaidPer100),
      ) < 1e-9,
    );
  }
});

check("a budget above the trigger is never silently clamped", () => {
  const bonus = deriveDayV3ProtectedExitBonus(6, 5);
  assert.equal(bonus.status, "unresolved");
  assert.equal(bonus.bonus.value, null);
});

console.log(`Day V3 core: ${passed} checks passed`);
