import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const summary = read("components/day-v3/DayV3Summary.tsx");
const goals = read("components/day-v3/DayV3Goals.tsx");
const deployment = read("components/day-v3/DayV3Deployment.tsx");
const deploymentPolicy = read(
  "components/day-v3/DayV3DeploymentPolicy.tsx",
);
const editor = read("components/day-v3/DayV3PremiumCurveEditor.tsx");
const yieldCurves = read("lib/day-v3/yield-curves.ts");

// Every user-facing V2 model has a V3-native equivalent. The test deliberately
// checks V3 integration points rather than importing V2 runtime components.
const parity = [
  ["position return cards", "Scenario returns at these terms"],
  ["capital stack", "<DayV3CapitalStack"],
  ["loss waterfall and stress slider", "<DayV3LossWaterfall"],
  ["atomic exit cost/depth curve and table", "<DayV3ExitCost"],
  ["one-year growth chart", "<DayV3Chart"],
  ["position/yield composition table", "<DayV3Comparison"],
  ["historical chart, monthly table, and restoration", "<DayV3Backtest"],
];

for (const [name, marker] of parity) {
  assert.ok(summary.includes(marker), `V3 is missing the V2 ${name} model`);
}

const v3Additions = [
  ["issuer goal versus canonical exit", "<DayV3ExitModel"],
  ["visible premium curves", "<DayV3YieldModels"],
];
for (const [name, marker] of v3Additions) {
  assert.ok(summary.includes(marker), `V3 is missing ${name}`);
}

assert.doesNotMatch(
  summary,
  /@\/components\/day-v2\//,
  "V3 must not import V2 runtime components",
);
assert.doesNotMatch(
  summary,
  /<DayV3ProtectionSensitivity/,
  "V3 must not render the removed protection sensitivity section",
);
assert.doesNotMatch(
  summary,
  /<DayV3ProtectedExitModel/,
  "V3 must not render the removed Protected Exit redemption model",
);
assert.match(
  summary,
  /data-model-column="exit"[\s\S]*<DayV3ExitModel[\s\S]*<DayV3ExitCost/,
  "Exit cost and depth must stay directly beneath the exit promise model",
);
assert.match(
  summary,
  /modelUpdating[\s\S]*Updating every model/,
  "V3 must hide stale model evidence while its atomic snapshot updates",
);

// Simulate stays goal-first: operational facts and deployment configuration are
// present only when Deploy is active, while all model families remain shared.
assert.match(
  summary,
  /deploying \? \([\s\S]*<DayV3OperationalFacts/,
  "Simulate must not render operational deployment facts",
);
assert.match(
  summary,
  /<DayV3Goals[\s\S]*deploying=\{deploying\}/,
  "The goal surface must receive the active workflow",
);
assert.doesNotMatch(
  goals,
  /summary="Deployment mapping"/,
  "Derived deployment mapping must not be nested inside issuer goal inputs",
);
for (const marker of [
  'label="Minimum Liquidity"',
  'label="Maximum Discount"',
  'label="Depth at NAV"',
  'label="Maximum Premium"',
  '"Swap Fee"',
]) {
  assert.ok(
    deployment.includes(marker),
    `The bottom deployment handoff lost its ${marker} mapping`,
  );
}
assert.match(
  goals,
  /deploying \? \([\s\S]*title="Protected Exit"/,
  "Protected Exit configuration must be Deploy-only",
);
assert.match(
  goals,
  /\{deploying \? premiumCurveEditor : null\}[\s\S]*title="Protected Exit"/,
  "The Deploy-only premium editor must appear before Protected Exit",
);
assert.match(
  summary,
  /premiumCurveEditor=\{premiumCurveEditor\}/,
  "The premium editor must be mounted in the V3 goal flow",
);
assert.match(
  summary,
  /<\/section>\s*\{deploying \? deploymentPanel : null\}\s*<p className=/,
  "The Deploy handoff must remain at the bottom after the complete model section",
);
assert.match(
  goals,
  /After this minimum delay, execution may proceed once any post-request oracle gate and market-state checks pass\. This is not the conversion time below\./,
  "Withdrawal settlement must remain distinct from post-claim conversion timing",
);
assert.match(
  deploymentPolicy,
  /settlement[\s\S]*delay must pass,[\s\S]*oracle must publish a timestamp after the[\s\S]*request was queued\.[\s\S]*EntryPoint does not compare the old and new[\s\S]*price values/,
  "The oracle gate must require a post-request timestamp in addition to the settlement delay",
);
assert.match(
  deploymentPolicy,
  /Gate off uses the[\s\S]*settlement delay without that extra freshness check\./,
  "Disabling the oracle gate must leave the settlement delay in force",
);
for (const marker of [
  "jrYieldShareAtZeroPct",
  "jrYieldShareAtTargetPct",
  "jrYieldShareAtFullPct",
  "slpYieldShareAtZeroPct",
  "slpYieldShareAtTargetPct",
  "slpYieldShareAtFullPct",
]) {
  assert.ok(
    summary.includes(marker),
    `Premium editor lost state wiring: ${marker}`,
  );
}
assert.equal(
  editor.match(/<DayV3Slider/g)?.length,
  3,
  "Each of the two curve cards must reuse the same three-anchor slider surface",
);
assert.match(
  summary,
  /deriveDayV3StartingYieldCurvePolicy/,
  "V3 must derive one complete starting policy for all six premium anchors",
);
assert.doesNotMatch(
  summary,
  /dayV3EffectiveShares/,
  "V3 must not update YT while leaving Y0 and Y100 on frozen template values",
);
assert.match(
  yieldCurves,
  /juniorTargetPct = coveragePct;[\s\S]*slpTargetPct = minimumLiquidityPct;/,
  "The starting policy must use the explicit capital-parity floor rather than an unexplained premium uplift",
);

const exitCost = read("components/day-v3/DayV3ExitCost.tsx");
for (const marker of [
  "Senior amount sold into the SLP",
  "Exit discount",
  "Given up",
  "Received",
  "<DayV3ExitChart",
  "Capacity may reset",
]) {
  assert.ok(exitCost.includes(marker), `Atomic exit model lost: ${marker}`);
}

const backtest = read("components/day-v3/DayV3Backtest.tsx");
for (const marker of [
  "Historical backtest",
  "Backtest window",
  "<DayV3BacktestChart",
  "Coverage restoration",
  "<TableHead>Month</TableHead>",
]) {
  assert.ok(backtest.includes(marker), `Historical model lost: ${marker}`);
}

console.log(
  `Day V3 model-output parity: PASS (${parity.length}/${parity.length} V2 model families; ${v3Additions.length} V3 additions)`,
);
