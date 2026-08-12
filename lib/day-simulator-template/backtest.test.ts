import assert from "node:assert/strict";

import { JBBB_SAMPLE_MARKET } from "@/lib/day-sample-sources/jbbb/market";
import { runDayHistoricalBacktest } from "@/lib/day-simulator-template/backtest";

const market = JBBB_SAMPLE_MARKET;
const base = {
  defaults: market.defaults,
  series: market.series.slice(0, 300),
  maintainCoverage: true,
  omitInitialZeroReturnPeriod: false,
  terms: {
    coveragePct: 20,
    minLiquidityPct: 10,
    eclpBandWidthPct: 1,
    riskSharePct: 20,
    liqSharePct: 5,
    observationDays: 30,
  },
};

const implicit = runDayHistoricalBacktest(base);
const explicitDefaults = runDayHistoricalBacktest({
  ...base,
  terms: {
    ...base.terms,
    riskY0Pct: market.defaults.riskYDM.y0 * 100,
    riskY100Pct: market.defaults.riskYDM.y100 * 100,
    liqY0Pct: market.defaults.liqYDM.y0 * 100,
    liqY100Pct: market.defaults.liqYDM.y100 * 100,
  },
});
assert.equal(explicitDefaults.seniorApy, implicit.seniorApy);
assert.equal(explicitDefaults.juniorApy, implicit.juniorApy);
assert.equal(explicitDefaults.liquidityApy, implicit.liquidityApy);

const reshaped = runDayHistoricalBacktest({
  ...base,
  terms: {
    ...base.terms,
    riskY0Pct: 20,
    riskY100Pct: 60,
    liqY0Pct: 5,
    liqY100Pct: 15,
  },
});
assert.notEqual(reshaped.seniorApy, implicit.seniorApy);
assert.notEqual(reshaped.juniorApy, implicit.juniorApy);
assert.notEqual(reshaped.liquidityApy, implicit.liquidityApy);

// A covered drawdown expires under the short Observation Period, while the
// same path recovers before a longer period ends. `maintainCoverage` is off so
// the test observes that lifecycle directly rather than masking it with a Jr
// refill from outside the market.
const recoverySeries = [
  { date: "2025-01-01", price: 1 },
  { date: "2025-01-02", price: 0.95 },
  { date: "2025-01-04", price: 0.95 },
  { date: "2025-01-10", price: 1 },
];
const observationBase = {
  defaults: market.defaults,
  series: recoverySeries,
  maintainCoverage: false,
  omitInitialZeroReturnPeriod: false,
  terms: {
    coveragePct: 20,
    minLiquidityPct: 10,
    eclpBandWidthPct: 1,
    riskSharePct: 20,
    liqSharePct: 5,
    observationDays: 1,
  },
};
const shortObservation = runDayHistoricalBacktest(observationBase);
const longObservation = runDayHistoricalBacktest({
  ...observationBase,
  terms: { ...observationBase.terms, observationDays: 30 },
});

assert.equal(shortObservation.cfg.fixedTermDurationSec, 86_400);
assert.equal(longObservation.cfg.fixedTermDurationSec, 30 * 86_400);
assert.equal(shortObservation.erasedRecoveryClaims, 1);
assert.equal(longObservation.erasedRecoveryClaims, 0);
assert.equal(shortObservation.observationPeriods.length, 1);
assert.equal(longObservation.observationPeriods.length, 1);
assert.deepEqual(
  {
    start: shortObservation.observationPeriods[0].startDate,
    end: shortObservation.observationPeriods[0].endDate,
    days: shortObservation.observationPeriods[0].days,
    target: shortObservation.observationPeriods[0].targetDays,
    expired: shortObservation.observationPeriods[0].expired,
  },
  { start: "2025-01-02", end: "2025-01-04", days: 2, target: 1, expired: true },
);
assert.deepEqual(
  {
    start: longObservation.observationPeriods[0].startDate,
    end: longObservation.observationPeriods[0].endDate,
    days: longObservation.observationPeriods[0].days,
    target: longObservation.observationPeriods[0].targetDays,
    expired: longObservation.observationPeriods[0].expired,
  },
  {
    start: "2025-01-02",
    end: "2025-01-10",
    days: 8,
    target: 30,
    expired: false,
  },
);
assert.ok(longObservation.final.jtPrice > shortObservation.final.jtPrice);
assert.ok(longObservation.juniorApy > shortObservation.juniorApy);

console.log(
  "Day historical backtest curve anchors and Observation Period: PASS",
);
