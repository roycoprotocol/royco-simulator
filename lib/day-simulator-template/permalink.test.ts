import assert from "node:assert/strict";

import {
  decodeDayDesign,
  encodeDayDesign,
  hasDayDesign,
  type DayDesignParams,
} from "./permalink";

let passed = 0;
const check = (label: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const design: DayDesignParams = {
  coveragePct: 5,
  minLiquidityPct: 10,
  eclpBandWidthPct: 1,
  riskSharePct: 5,
  liqSharePct: 5,
  observationDays: 30,
  sourceApyPct: 5.8,
  stressDepthPct: 0,
  maintainCoverage: true,
};

console.log("Day design permalink");

check("a design survives a round trip exactly", () => {
  assert.deepEqual(decodeDayDesign(encodeDayDesign(design)), design);
});

check("every field is carried, so a link is never partial", () => {
  const params = encodeDayDesign(design);
  for (const key of ["cov", "liq", "band", "jrp", "slpp", "obs", "apy", "stress", "restore"]) {
    assert.ok(params.has(key), `missing ${key}`);
  }
});

check("an empty query yields nothing rather than zeroes", () => {
  assert.deepEqual(decodeDayDesign(""), {});
  assert.equal(hasDayDesign(""), false);
});

check("a partial link returns only what it carried", () => {
  assert.deepEqual(decodeDayDesign("cov=12"), { coveragePct: 12 });
  assert.equal(hasDayDesign("cov=12"), true);
});

check("an unrelated query is not mistaken for a design", () => {
  assert.equal(hasDayDesign("market=jbbb"), false);
});

check("out-of-range values are clamped, not accepted", () => {
  assert.equal(decodeDayDesign("cov=9999").coveragePct, 25);
  assert.equal(decodeDayDesign("cov=-40").coveragePct, 0);
  assert.equal(decodeDayDesign("obs=1").observationDays, 7);
  assert.equal(decodeDayDesign("obs=100000").observationDays, 194);
  assert.equal(decodeDayDesign("stress=500").stressDepthPct, 60);
  assert.equal(decodeDayDesign("band=0").eclpBandWidthPct, 0.25);
});

check("garbage and injection attempts are ignored", () => {
  for (const q of ["cov=abc", "cov=", "cov=NaN", "cov=Infinity", "cov=<script>"]) {
    assert.equal(decodeDayDesign(q).coveragePct, undefined, q);
  }
});

check("observation days stay whole", () => {
  assert.equal(decodeDayDesign("obs=30.7").observationDays, 31);
  assert.ok(Number.isInteger(decodeDayDesign("obs=30.7").observationDays));
});

check("the restore flag only accepts 1 or 0", () => {
  assert.equal(decodeDayDesign("restore=1").maintainCoverage, true);
  assert.equal(decodeDayDesign("restore=0").maintainCoverage, false);
  assert.equal(decodeDayDesign("restore=yes").maintainCoverage, undefined);
});

check("a decoded link never produces a non-finite term", () => {
  const decoded = decodeDayDesign("cov=1e400&liq=-1e400&apy=NaN&obs=Infinity");
  for (const value of Object.values(decoded)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
});

console.log(`\nResult: ${passed} passed, 0 failed`);
