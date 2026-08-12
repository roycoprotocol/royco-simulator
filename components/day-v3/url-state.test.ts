import assert from "node:assert/strict";

import {
  buildDayV3Query,
  readDayV3UrlState,
  toggleDayV3Mode,
} from "./url-state";

assert.equal(toggleDayV3Mode("simulate"), "deploy");
assert.equal(toggleDayV3Mode("deploy"), "simulate");

const query = buildDayV3Query({
  market: "custom",
  mode: "deploy",
  sourceApyPct: 8.25,
  protectedDrawdownPct: 18,
  recoveryDays: 45,
  immediateExitSharePct: 10,
  minimumProceedsPer100: 98.5,
  redemptionDays: 7,
  navUpdateDays: 1,
  target: { chainId: 1, templateId: "day-template" },
  overrides: {
    coveragePct: null,
    minimumLiquidityPct: null,
    maximumDiscountPct: null,
    depthAtNav: null,
    maximumPremiumPct: null,
    protectedExitThresholdPct: null,
    protectedExitBonusPct: null,
    poolCapitalPer100: null,
  },
});
const parsed = readDayV3UrlState(query);
assert.equal(parsed.market, "custom");
assert.equal(parsed.mode, "deploy");
assert.equal(parsed.protectedDrawdownPct, 18);
assert.equal(parsed.recoveryDays, 45);
assert.equal(parsed.immediateExitSharePct, 10);
assert.equal(parsed.minimumProceedsPer100, 98.5);
assert.deepEqual(parsed.target, { chainId: 1, templateId: "day-template" });
assert.equal(query.includes("cov="), false);
assert.equal(query.includes("liq="), false);

const overridden = readDayV3UrlState(
  `${query}&cov=20&liq=12&discount=2.5&lambda=300&premium=0.08&pexit=10&bonus=1&pool=13`,
);
assert.deepEqual(overridden.overrides, {
  coveragePct: 20,
  minimumLiquidityPct: 12,
  maximumDiscountPct: 2.5,
  depthAtNav: 300,
  maximumPremiumPct: 0.08,
  protectedExitThresholdPct: 10,
  protectedExitBonusPct: 1,
  poolCapitalPer100: 13,
});

const malformed = readDayV3UrlState(
  "m=custom&apy=NaN&protect=999&recover=1.5&exit=-1&receive=101&target=bad",
);
assert.equal(malformed.sourceApyPct, null);
assert.equal(malformed.protectedDrawdownPct, null);
assert.equal(malformed.recoveryDays, null);
assert.equal(malformed.immediateExitSharePct, null);
assert.equal(malformed.minimumProceedsPer100, null);
assert.equal(malformed.target, null);

console.log("Day V3 independent goal URL state: PASS");
