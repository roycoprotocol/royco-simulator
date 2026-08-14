import assert from "node:assert/strict";

import {
  deriveDayV3StartingYieldCurvePolicy,
  validateDayV3YieldCurveDesign,
  type DayV3StartingYieldCurveDefaults,
} from "@/lib/day-v3/yield-curves";

const defaults: DayV3StartingYieldCurveDefaults = {
  coverage: 0.05,
  minLiquidity: 0.1,
  riskYDM: { y0: 0.02, yTarget: 0.05, y100: 0.15 },
  liqYDM: { y0: 0.01, yTarget: 0.05, y100: 0.15 },
};

const close = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `expected ${actual} to equal ${expected}`,
  );

const valid = validateDayV3YieldCurveDesign({
  junior: { y0Pct: 2, yTargetPct: 12, y100Pct: 18 },
  slp: { y0Pct: 1, yTargetPct: 5, y100Pct: 14 },
});
assert.equal(valid.valid, true);
assert.equal(valid.combinedPeakPct, 32);

const inverted = validateDayV3YieldCurveDesign({
  junior: { y0Pct: 12, yTargetPct: 4, y100Pct: 18 },
  slp: { y0Pct: 1, yTargetPct: 5, y100Pct: 14 },
});
assert.equal(inverted.valid, false);
assert.match(inverted.issues.join(" "), /Y0 ≤ YT ≤ Y100/);

const overBudget = validateDayV3YieldCurveDesign({
  junior: { y0Pct: 10, yTargetPct: 50, y100Pct: 70 },
  slp: { y0Pct: 10, yTargetPct: 40, y100Pct: 50 },
});
assert.equal(overBudget.valid, false);
assert.match(overBudget.issues.join(" "), /anchors to total 100% or less/);
assert.match(
  overBudget.issues.join(" "),
  /hard caps are configured separately/,
);

const unchanged = deriveDayV3StartingYieldCurvePolicy(defaults, {
  coveragePct: 5,
  minimumLiquidityPct: 10,
});
assert.equal(unchanged.status, "resolved");
assert.ok(unchanged.design);
close(unchanged.design.junior.y0Pct, 2);
close(unchanged.design.junior.yTargetPct, 5);
close(unchanged.design.junior.y100Pct, 15);
close(unchanged.design.slp.y0Pct, 2);
close(unchanged.design.slp.yTargetPct, 10);
close(unchanged.design.slp.y100Pct, 30);
assert.equal(unchanged.budgetScale, 1);
assert.match(unchanged.evidence.join(" "), /capital-parity starting floor/);

const proportionallyScaled = deriveDayV3StartingYieldCurvePolicy(defaults, {
  coveragePct: 2.5,
  minimumLiquidityPct: 20,
});
assert.equal(proportionallyScaled.status, "resolved");
assert.ok(proportionallyScaled.design);
close(proportionallyScaled.design.junior.y0Pct, 1);
close(proportionallyScaled.design.junior.yTargetPct, 2.5);
close(proportionallyScaled.design.slp.y0Pct, 4);
close(proportionallyScaled.design.slp.yTargetPct, 20);
close(proportionallyScaled.design.junior.y100Pct, 7.5);
close(proportionallyScaled.design.slp.y100Pct, 60);
close(proportionallyScaled.budgetScale ?? 0, 1);

const currentCustom = deriveDayV3StartingYieldCurvePolicy(defaults, {
  coveragePct: 13.05,
  minimumLiquidityPct: 9.87,
});
assert.equal(currentCustom.status, "resolved");
assert.ok(currentCustom.design);
close(currentCustom.design.junior.y0Pct, 5.22);
close(currentCustom.design.junior.yTargetPct, 13.05);
close(currentCustom.design.slp.y0Pct, 1.974);
close(currentCustom.design.slp.yTargetPct, 9.87);
close(currentCustom.budgetScale ?? 0, 1);
close(currentCustom.design.junior.y100Pct, 39.15);
close(currentCustom.design.slp.y100Pct, 29.61);

const inactiveJunior = deriveDayV3StartingYieldCurvePolicy(defaults, {
  coveragePct: 0,
  minimumLiquidityPct: 10,
});
assert.equal(inactiveJunior.status, "resolved");
assert.deepEqual(inactiveJunior.design?.junior, {
  y0Pct: 0,
  yTargetPct: 0,
  y100Pct: 0,
});
assert.match(inactiveJunior.evidence.join(" "), /Junior starting curve is 0%/);

const inactiveSlp = deriveDayV3StartingYieldCurvePolicy(defaults, {
  coveragePct: 5,
  minimumLiquidityPct: 0,
});
assert.equal(inactiveSlp.status, "resolved");
assert.deepEqual(inactiveSlp.design?.slp, {
  y0Pct: 0,
  yTargetPct: 0,
  y100Pct: 0,
});

const overBudgetPolicy = deriveDayV3StartingYieldCurvePolicy(
  {
    ...defaults,
    riskYDM: { y0: 0.2, yTarget: 0.3, y100: 0.6 },
    liqYDM: { y0: 0.1, yTarget: 0.2, y100: 0.5 },
  },
  { coveragePct: 10, minimumLiquidityPct: 20 },
);
assert.equal(overBudgetPolicy.status, "resolved");
assert.ok(overBudgetPolicy.design);
close(overBudgetPolicy.budgetScale ?? 0, 1);
close(overBudgetPolicy.design.junior.yTargetPct, 10);
close(overBudgetPolicy.design.slp.yTargetPct, 20);
close(
  overBudgetPolicy.design.junior.y100Pct + overBudgetPolicy.design.slp.y100Pct,
  70,
);
close(
  overBudgetPolicy.design.junior.y0Pct /
    overBudgetPolicy.design.junior.yTargetPct,
  2 / 3,
);
close(
  (overBudgetPolicy.design.junior.y100Pct -
    overBudgetPolicy.design.junior.yTargetPct) /
    (overBudgetPolicy.design.slp.y100Pct -
      overBudgetPolicy.design.slp.yTargetPct),
  1 / 3,
);
assert.match(
  overBudgetPolicy.evidence.join(" "),
  /no shared-budget adjustment was needed/,
);

const noJuniorBaseline = deriveDayV3StartingYieldCurvePolicy(
  {
    ...defaults,
    riskYDM: { y0: 0, yTarget: 0, y100: 0 },
  },
  { coveragePct: 5, minimumLiquidityPct: 10 },
);
assert.equal(noJuniorBaseline.status, "unresolved");
assert.equal(noJuniorBaseline.design, null);
assert.equal(noJuniorBaseline.budgetScale, null);
assert.match(
  noJuniorBaseline.evidence.join(" "),
  /no positive Junior YT anchor/,
);

const noSlpBaseline = deriveDayV3StartingYieldCurvePolicy(
  {
    ...defaults,
    liqYDM: { y0: 0, yTarget: 0, y100: 0 },
  },
  { coveragePct: 5, minimumLiquidityPct: 10 },
);
assert.equal(noSlpBaseline.status, "unresolved");
assert.equal(noSlpBaseline.design, null);
assert.match(noSlpBaseline.evidence.join(" "), /no positive SLP YT anchor/);

const impossibleTargets = deriveDayV3StartingYieldCurvePolicy(defaults, {
  coveragePct: 60,
  minimumLiquidityPct: 50,
});
assert.equal(impossibleTargets.status, "unresolved");
assert.equal(impossibleTargets.design, null);
assert.equal(impossibleTargets.budgetScale, null);
assert.match(impossibleTargets.evidence.join(" "), /capital-parity rule requires/);
assert.match(impossibleTargets.evidence.join(" "), /110.00%/);

const malformedBaseline = deriveDayV3StartingYieldCurvePolicy(
  {
    ...defaults,
    riskYDM: { y0: 0.1, yTarget: 0.05, y100: 0.15 },
  },
  { coveragePct: 5, minimumLiquidityPct: 10 },
);
assert.equal(malformedBaseline.status, "unresolved");
assert.equal(malformedBaseline.design, null);
assert.match(malformedBaseline.evidence.join(" "), /Y0 ≤ YT ≤ Y100/);

const invalidRequirement = deriveDayV3StartingYieldCurvePolicy(defaults, {
  coveragePct: Number.NaN,
  minimumLiquidityPct: 10,
});
assert.equal(invalidRequirement.status, "unresolved");
assert.equal(invalidRequirement.design, null);
assert.equal(invalidRequirement.budgetScale, null);

console.log("Day V3 yield-curve validation: PASS");
