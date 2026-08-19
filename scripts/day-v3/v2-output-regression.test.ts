import assert from "node:assert/strict";

import { JBBB_SAMPLE_MARKET } from "@/lib/day-sample-sources/jbbb/market";
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
// exact-input pool fee before E-CLP pricing and the uniform 5% protocol fee on
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
    seniorApy: 0.04353777871863951,
    juniorApy: 0.09741459113398454,
    liquidityApy: 0.06973721931312293,
  },
  capitalStack: {
    coverageLossLimit: 0.22222222222299992,
    boundarySellPer100: 10.060437952874835,
    onePercentSellPer100: 10.060437952874835,
    onePercentExecutionPrice: 0.9939925127357162,
  },
});

console.log("Day V2 key-output regression: PASS (fee-inclusive shared-engine baseline)");
