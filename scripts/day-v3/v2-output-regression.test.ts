import assert from "node:assert/strict";

import { JBBB_SAMPLE_MARKET } from "@/lib/day-sample-sources/jbbb/market";
import { JBBB_V3_DEFAULTS } from "@/lib/day-sample-sources/jbbb/v3-defaults";
import { recommendDayV3Coverage } from "@/lib/day-v3/protection";
import { buildDayExplainerMetrics } from "@/lib/day-simulator-template/explainer";
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
  runDayTargetScenario,
} from "@/lib/day-simulator-template/runtime";

const defaults = JBBB_SAMPLE_MARKET.defaults;
const terms = {
  coverage: defaults.coverage,
  minLiquidity: defaults.minLiquidity,
  eclpBandWidth: defaults.eclpBandWidth,
  observationDays: defaults.observationDays,
  riskYieldShare: defaults.riskYDM.yTarget,
  liquidityYieldShare: defaults.liqYDM.yTarget,
};
const balances = buildDayInitialBalances(defaults, terms);
const scenario = runDayTargetScenario(defaults);
const explainer = buildDayExplainerMetrics(
  buildDayMarketConfig(defaults, terms),
  balances,
);

const actual = {
  market: JBBB_SAMPLE_MARKET.id,
  terms,
  balances,
  scenario,
  capitalStack: {
    coverageLossLimit: explainer.coverage.coverageLossLimit,
    boundarySellPer100:
      explainer.liquidity.boundarySellShareOfSenior * 100,
    onePercentSellPer100:
      explainer.liquidity.referenceSellShareOfSenior * 100,
    onePercentExecutionPrice:
      explainer.liquidity.referenceQuote.executionPrice,
  },
};

// Captured after the authorized shared-engine correction that applies the
// exact-input pool fee before E-CLP pricing, values the SLP BPT with Balancer's
// fixed-point EclpLPOracle path, and applies the uniform 5% protocol fee on
// Junior and SLP yield premiums. The route/components remain frozen; this
// baseline intentionally records the corrected all-in returns and exit quote.
assert.deepEqual(actual, {
  market: "jbbb",
  terms: {
    coverage: 0.2,
    minLiquidity: 0.1,
    eclpBandWidth: 0.01,
    observationDays: 30,
    riskYieldShare: 0.2,
    liquidityYieldShare: 0.05,
  },
  balances: {
    st: 40000000,
    jt: 11428571.42857143,
    lt: 4444444.444444445,
  },
  scenario: {
    seniorApy: 0.044616621878814655,
    juniorApy: 0.09985058019648951,
    liquidityApy: 0.07048238362780723,
  },
  capitalStack: {
    coverageLossLimit: 0.22222222222299992,
    boundarySellPer100: 10.060437952874835,
    onePercentSellPer100: 10.060437952874835,
    onePercentExecutionPrice: 0.9939925127357162,
  },
});

// The JBBB Explorer default keeps its published forward SEC yield independent
// from the raw historical path. This records the explicitly selected no-SLP
// design under the live 5% premium-fee policy.
const jbbbCoverage = recommendDayV3Coverage(defaults, {
  protectedDrawdownPct: JBBB_V3_DEFAULTS.protectedDrawdownPct,
});
assert.equal(jbbbCoverage.status, "recommended");
assert.equal(jbbbCoverage.coverage.value, 15);
assert.equal(JBBB_V3_DEFAULTS.immediateExitSharePct, 0);
const noSlp = { mode: "static" as const, y0: 0, yTarget: 0, y100: 0 };
const jbbbDefaultScenario = runDayTargetScenario({
  ...defaults,
  coverage: 0.15,
  minLiquidity: 0,
  observationDays: JBBB_V3_DEFAULTS.recoveryDays,
  riskYDM: {
    ...defaults.riskYDM,
    y0: JBBB_V3_DEFAULTS.overrides.jrYieldShareAtZeroPct / 100,
    yTarget: JBBB_V3_DEFAULTS.overrides.jrYieldShareAtTargetPct / 100,
    y100: JBBB_V3_DEFAULTS.overrides.jrYieldShareAtFullPct / 100,
  },
  liqYDM: noSlp,
});
assert.ok(
  Math.abs(jbbbDefaultScenario.seniorApy - 0.05098398920715996) < 1e-12,
  `JBBB Senior default drifted (got ${jbbbDefaultScenario.seniorApy})`,
);
assert.equal(jbbbDefaultScenario.liquidityApy, 0);
assert.ok(
  Math.abs(jbbbDefaultScenario.juniorApy - 0.10106262326699689) < 1e-12,
  `JBBB Junior default drifted (got ${jbbbDefaultScenario.juniorApy})`,
);

console.log("Day V2 key-output regression: PASS (fee-inclusive shared-engine baseline)");
