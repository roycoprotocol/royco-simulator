import assert from "node:assert/strict";

import {
  buildDayV2Query,
  readDayV2UrlState,
  toggleDayV2Mode,
} from "./url-state";

assert.equal(toggleDayV2Mode("simulate"), "deploy");
assert.equal(toggleDayV2Mode("deploy"), "simulate");

const customQuery = buildDayV2Query({
  market: "custom",
  mode: "deploy",
  coveragePct: 20,
  liquidityPct: 10,
  sourceApyPct: 8.25,
  observationDays: 30,
  bandPct: 3.5,
  maintainCoverage: true,
  riskSharePct: null,
  liqSharePct: null,
  y0Pct: null,
  y100Pct: null,
  liqY0Pct: null,
  liqY100Pct: null,
});
const custom = readDayV2UrlState(customQuery);
assert.equal(custom.market, "custom");
assert.equal(custom.mode, "deploy");
assert.equal(custom.sourceApyPct, 8.25);

const fullCurveQuery = buildDayV2Query({
  market: "custom",
  mode: "deploy",
  coveragePct: 18,
  liquidityPct: 12,
  sourceApyPct: 9.4,
  observationDays: 45,
  bandPct: 4.5,
  maintainCoverage: false,
  riskSharePct: 19,
  liqSharePct: 8,
  y0Pct: 7,
  y100Pct: 42,
  liqY0Pct: 2,
  liqY100Pct: 16,
});
const fullCurve = readDayV2UrlState(fullCurveQuery);
assert.deepEqual(fullCurve, {
  market: "custom",
  mode: "deploy",
  coveragePct: 18,
  liquidityPct: 12,
  sourceApyPct: 9.4,
  observationDays: 45,
  bandPct: 4.5,
  maintainCoverage: false,
  riskSharePct: 19,
  liqSharePct: 8,
  y0Pct: 7,
  y100Pct: 42,
  liqY0Pct: 2,
  liqY100Pct: 16,
});

const registered = readDayV2UrlState("m=jbbb&mode=simulate&apy=5.82");
assert.equal(registered.market, "jbbb");
assert.equal(registered.mode, "simulate");

const malformed = readDayV2UrlState("m=custom&apy=NaN&cov=999&mode=other");
assert.equal(malformed.sourceApyPct, null);
assert.equal(malformed.coveragePct, null);
assert.equal(malformed.mode, null);

assert.equal(readDayV2UrlState("band=0.5").bandPct, 0.5);
assert.equal(readDayV2UrlState("band=5").bandPct, 5);
assert.equal(readDayV2UrlState("band=0.25").bandPct, null);
assert.equal(readDayV2UrlState("band=5.25").bandPct, null);

console.log("Day V2 URL state and two-mode toggle: PASS");
