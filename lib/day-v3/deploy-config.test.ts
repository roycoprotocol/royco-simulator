import assert from "node:assert/strict";

import {
  buildDayV3DeployConfig,
  dayV3DeployConfigFilename,
  type DayV3DeployConfigInput,
} from "@/lib/day-v3/deploy-config";

let passed = 0;
const check = (label: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

console.log("Day V3 Royco Deploy config export");

const input: DayV3DeployConfigInput = {
  exportedAt: "2026-09-02T00:00:00.000Z",
  marketName: "Pareto FalconX",
  chainId: 42161,
  sourceApyPct: 9.94,
  exitAssetYieldPct: 3.5,
  coveragePct: 3,
  minimumLiquidityPct: 10,
  observationDays: 7,
  curveModels: { junior: "ADAPTIVE_CURVE_V2", slp: "STATIC_CURVE" },
  curves: {
    junior: { y0Pct: 0.5, yTargetPct: 2.7, y100Pct: 31 },
    slp: { y0Pct: 5.1, yTargetPct: 9.1, y100Pct: 31 },
  },
  maximumDiscountBps: 200,
  maximumPremiumBps: 12.5,
  lambda: 250,
  swapFeeBps: 10,
  redemptionDelayDays: 7,
};

check("carries the modeled terms in the flow's envelope and units", () => {
  const config = buildDayV3DeployConfig(input);
  assert.equal(config.format, "royco-day-market-config");
  assert.equal(config.source, "royco-day-simulator");
  const { draft } = config;
  assert.equal(draft.version, 1);
  assert.equal(draft.createdAt, Date.parse(input.exportedAt));
  assert.equal(draft.chainId, 42161);
  assert.equal(draft.identity.marketName, "Pareto FalconX");
  assert.equal(draft.economics.minCoverageWAD, "30000000000000000");
  assert.equal(draft.economics.minLiquidityWAD, "100000000000000000");
  assert.equal(draft.economics.fixedTermDurationSeconds, 7 * 86_400);
  assert.equal(draft.economics.maxJTYieldShareWAD, "310000000000000000");
  assert.equal(draft.economics.maxLPTYieldShareWAD, "310000000000000000");
  assert.deepEqual(draft.yield.jt, {
    ydmType: "ADAPTIVE_CURVE_V2",
    curveParams: {
      zeroUtilizationDiscountWAD: "5000000000000000",
      targetUtilizationYieldShareWAD: "27000000000000000",
      fullUtilizationYieldShareWAD: "310000000000000000",
    },
  });
  assert.deepEqual(draft.yield.lpt, {
    ydmType: "STATIC_CURVE",
    curveParams: {
      zeroUtilizationYieldShareWAD: "51000000000000000",
      targetUtilizationYieldShareWAD: "91000000000000000",
      fullUtilizationYieldShareWAD: "310000000000000000",
    },
  });
  assert.deepEqual(draft.poolSizing, {
    assetYieldPct: "9.94",
    exitLiquidityTvl: "",
    maxDiscountBps: "200",
    maxPremiumBps: "12.5",
    redemptionDelayDays: "7",
    navUpdateCadenceHours: "",
    exitFeeBps: "10",
    lambda: "250",
    stablecoinYieldPct: "3.5",
  });
});

check("leaves every deployment-only field for Royco Deploy", () => {
  const { draft } = buildDayV3DeployConfig(input);
  assert.equal(draft.assets.collateralAsset, "");
  assert.equal(draft.assets.quoteAsset, "");
  assert.equal(draft.oracle.recipe, null);
  assert.equal(draft.economics.fixedTermGracePeriodSeconds, 0);
  assert.equal(
    draft.economics.coverageLiquidationUtilizationWAD,
    (2n ** 256n - 1n).toString(),
  );
  assert.equal(draft.economics.stSelfLiquidationBonusWAD, "0");
  assert.equal(draft.kernel.maxReinvestmentSlippageWAD, "");
  assert.deepEqual(draft.entryPoint.st, {
    enabled: true,
    depositDelaySeconds: 300,
    depositExpirySeconds: 4_294_967_295,
    redemptionDelaySeconds: 86_400,
    redemptionExpirySeconds: 4_294_967_295,
    gateByOracleUpdate: true,
  });
  assert.equal(draft.seed.quoteAmount, "");
  assert.equal(draft.mining.minedMarketId, null);
  assert.equal(draft.execution.backendRecordStatus, "idle");
});

check("encodes disabled mechanisms as the flow's no-op payloads", () => {
  const { draft } = buildDayV3DeployConfig({
    ...input,
    coveragePct: 0,
    minimumLiquidityPct: 0,
    chainId: null,
    maximumPremiumBps: null,
    lambda: null,
  });
  assert.equal(draft.chainId, 1);
  assert.equal(draft.economics.minCoverageWAD, "0");
  assert.equal(draft.economics.minLiquidityWAD, "0");
  assert.equal(draft.economics.fixedTermDurationSeconds, 0);
  assert.equal(draft.economics.maxJTYieldShareWAD, "0");
  assert.deepEqual(draft.yield.jt, {
    ydmType: "FIXED",
    curveParams: { fixedYieldShareWAD: "0" },
  });
  assert.deepEqual(draft.yield.lpt, draft.yield.jt);
  assert.equal(draft.poolSizing.maxPremiumBps, "");
  assert.equal(draft.poolSizing.lambda, "");
});

check("maps the two-anchor and fixed shapes onto their own params", () => {
  const { draft } = buildDayV3DeployConfig({
    ...input,
    curveModels: { junior: "ADAPTIVE_CURVE_V1", slp: "FIXED" },
  });
  assert.deepEqual(draft.yield.jt.curveParams, {
    targetUtilizationYieldShareWAD: "27000000000000000",
    fullUtilizationYieldShareWAD: "310000000000000000",
  });
  assert.deepEqual(draft.yield.lpt.curveParams, {
    fixedYieldShareWAD: "91000000000000000",
  });
  assert.equal(draft.economics.maxLPTYieldShareWAD, "91000000000000000");
});

check("names the file after the market", () => {
  assert.equal(
    dayV3DeployConfigFilename("Pareto FalconX"),
    "royco-day-market-pareto-falconx.json",
  );
  assert.equal(dayV3DeployConfigFilename(""), "royco-day-market-config.json");
});

console.log(`${passed} checks passed`);
