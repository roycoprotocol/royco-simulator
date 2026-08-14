import assert from "node:assert/strict";

import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { runDayHistoricalBacktest } from "@/lib/day-simulator-template/backtest";
import { runDayTargetScenario } from "@/lib/day-simulator-template/runtime";
import {
  createDayV3ModelSnapshot,
  dayV3ReturnDisplayState,
} from "@/lib/day-v3/model-state";

const policy = { swapFeeBps: 10 };
const snapshot = createDayV3ModelSnapshot(
  { coveragePct: 13.5, liquidityPct: 9.87 },
  policy,
);

assert.deepEqual(snapshot, {
  coveragePct: 13.5,
  liquidityPct: 9.87,
  engineOverrides: policy,
});
assert.equal(snapshot.engineOverrides, policy);

// A deferred snapshot remains a valid shared-accountant answer while the next
// one is calculating. The UI labels it as updating rather than replacing a
// numeric result with punctuation.
assert.equal(
  dayV3ReturnDisplayState({
    modelUpdating: true,
    sourceApyResolved: true,
  }),
  "ready",
);
assert.equal(
  dayV3ReturnDisplayState({
    modelUpdating: false,
    sourceApyResolved: false,
  }),
  "missing-source",
);
assert.equal(
  dayV3ReturnDisplayState({
    modelUpdating: false,
    sourceApyResolved: true,
  }),
  "ready",
);

// Recovery timing may change historical results, but it must never suppress a
// valid forward return. Both paths continue to use the shared Day runtime.
const market = DAY_MARKETS.find((candidate) => candidate.id === "jbbb");
assert.ok(market, "JBBB must remain available as a listed Day market");

for (const observationDays of [0, 7]) {
  const result = runDayTargetScenario({
    ...market.defaults,
    observationDays,
  });

  for (const [position, apy] of [
    ["Senior", result.seniorApy],
    ["Junior", result.juniorApy],
    ["SLP", result.liquidityApy],
  ] as const) {
    assert.ok(
      Number.isFinite(apy),
      `${position} must remain finite with a ${observationDays}-day recovery window`,
    );
  }
}

const historicalTerms = {
  coveragePct: market.defaults.coverage * 100,
  minLiquidityPct: market.defaults.minLiquidity * 100,
  eclpBandWidthPct: market.defaults.eclpBandWidth * 100,
  riskSharePct: market.defaults.riskYDM.yTarget * 100,
  riskY0Pct: market.defaults.riskYDM.y0 * 100,
  riskY100Pct: market.defaults.riskYDM.y100 * 100,
  liqSharePct: market.defaults.liqYDM.yTarget * 100,
  liqY0Pct: market.defaults.liqYDM.y0 * 100,
  liqY100Pct: market.defaults.liqYDM.y100 * 100,
};

const historicalAt = (observationDays: number) =>
  runDayHistoricalBacktest({
    defaults: market.defaults,
    series: market.series,
    maintainCoverage: false,
    omitInitialZeroReturnPeriod: false,
    terms: { ...historicalTerms, observationDays },
  });

const immediate = historicalAt(0);
const recoverable = historicalAt(30);

assert.equal(immediate.observationPeriods.length, 0);
assert.ok(
  recoverable.observationPeriods.length > 0,
  "JBBB history must continue to exercise the Observation Period path",
);
assert.notEqual(
  recoverable.juniorApy,
  immediate.juniorApy,
  "historical Junior returns must remain sensitive to the recovery window",
);

console.log("Day V3 atomic model snapshot state: PASS");
