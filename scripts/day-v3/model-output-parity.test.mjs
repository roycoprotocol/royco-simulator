import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const summary = read("components/day-v3/DayV3Summary.tsx");
const hero = read("components/day-v3/DayV3Hero.tsx");
const goals = read("components/day-v3/DayV3Goals.tsx");
const editor = read("components/day-v3/DayV3PremiumCurveEditor.tsx");
const modeModel = read("lib/day-v3/mode-model.ts");
const yieldCurves = read("lib/day-v3/yield-curves.ts");

// One workflow must retain every forward model that explains how an issuer's
// four inputs change returns, capital, protection, and immediate exits.
const modelFamilies = [
  ["position return cards", "Scenario returns at these terms"],
  ["capital stack", "<DayV3CapitalStack"],
  ["loss waterfall and stress slider", "<DayV3LossWaterfall"],
  ["issuer goal versus canonical exit", "<DayV3ExitModel"],
  ["atomic exit cost/depth curve and table", "<DayV3ExitCost"],
  ["one-year growth chart", "<DayV3Chart"],
  ["position/yield composition table", "<DayV3Comparison"],
  ["visible premium curves", "<DayV3YieldModels"],
];
for (const [name, marker] of modelFamilies) {
  assert.ok(summary.includes(marker), `Unified V3 is missing ${name}`);
}

assert.doesNotMatch(
  summary,
  /@\/components\/day-v2\//,
  "V3 must not import V2 runtime components",
);
assert.doesNotMatch(
  summary,
  /<DayV3ProtectionSensitivity|<DayV3ProtectedExitModel/,
  "Unified V3 must not restore either removed model",
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

// The mode split is gone. Legacy URL parsing lives in url-state; no component
// may render a toggle, badge, conditional input flow, or conditional model set.
assert.match(summary, /<DayV3Hero\s*\/>/, "The hero must be mode-free");
assert.match(hero, /export default function DayV3Hero\(\)/);
assert.doesNotMatch(
  `${summary}\n${hero}`,
  /\bDayV3Mode\b|\bdeploying\b|\bsetMode\b|onModeChange|mode=\{mode\}/,
  "The unified simulator must not retain runtime mode branching",
);
assert.doesNotMatch(
  hero,
  /Switch to|Simulate|Deploy|Simple|Advanced|DayV3SegmentedControl/,
  "The hero must not expose a mode toggle",
);
assert.doesNotMatch(
  summary,
  /Advanced only|ADVANCED ONLY|deployOnly=|Edit APYs in Simple/,
  "The unified flow must not show mode-specific badges or actions",
);

// The questionnaire has exactly four ordered input groups. Source and target
// yield split live in Summary/editor; protection and exit live in DayV3Goals.
const inputSurface = `${summary}\n${editor}\n${goals}`;
const inputGroups = [
  ["day-v3-source-inputs", "Yield source"],
  ["day-v3-premium-inputs", "Yield split"],
  ["day-v3-protection-inputs", "Senior protection"],
  ["day-v3-exit-inputs", "Senior exit"],
];
for (const [id, label] of inputGroups) {
  assert.equal(
    inputSurface.match(new RegExp(`id="${id}"`, "g"))?.length,
    1,
    `Unified V3 must render exactly one ${label} input group`,
  );
}
assert.match(
  summary,
  /id="day-v3-source-inputs"[\s\S]*premiumCurveEditor[\s\S]*<DayV3Goals/,
  "The visible input flow must be source, target yield split, protection, then exit",
);
assert.doesNotMatch(
  `${summary}\n${editor}`,
  /presentation=|showCurveShapeAnchors|deployOnly|\bsimple\b|\bAdvanced\b|six YDM anchors|deployment handoff|suggestedCurve/,
  "The sole yield-split editor must not retain mode-specific or full-curve controls",
);
assert.doesNotMatch(
  editor,
  /onRiskY0Pct|onRiskY100Pct|onLiqY0Pct|onLiqY100Pct|No coverage used \(Y0\)|Full coverage used \(Y100\)/,
  "The unified editor must expose only operating-target yield shares",
);
assert.match(
  modeModel,
  /jrYieldShareAtTargetPct:\s*overrides\.jrYieldShareAtTargetPct[\s\S]*slpYieldShareAtTargetPct:\s*overrides\.slpYieldShareAtTargetPct/,
  "Only the two visible target yield shares may remain active",
);

const protectionGroupStart = goals.indexOf('id="day-v3-protection-inputs"');
const exitGroupStart = goals.indexOf('id="day-v3-exit-inputs"');
assert.ok(
  protectionGroupStart >= 0 && exitGroupStart > protectionGroupStart,
  "Senior protection must precede Senior exit",
);
const protectionGroup = goals.slice(protectionGroupStart, exitGroupStart);
const exitGroup = goals.slice(exitGroupStart);
assert.match(
  protectionGroup,
  /Should Senior have first-loss protection\?[\s\S]*ariaLabel="Observation mode"[\s\S]*Realize immediately[\s\S]*Allow recovery/,
  "Protection and observation mode must stay in one input group",
);
assert.match(
  protectionGroup,
  /How long should a temporary loss have to recover\?[\s\S]*onChange=\{onRecoveryDays\}[\s\S]*value=\{recoveryDays\}/,
  "Recovery duration must stay inside Senior protection",
);
assert.match(
  exitGroup,
  /Should Senior have an immediate pool exit\?/,
  "The immediate-exit choice must stay inside Senior exit",
);
for (const [name, marker] of [
  [
    "redemption settlement time",
    /Days until Senior redeems for the underlying asset/,
  ],
  [
    "underlying conversion time",
    /Additional days to convert the underlying asset/,
  ],
  ["stressed conversion cost", /Stressed conversion cost per \$100/],
]) {
  assert.match(
    exitGroup,
    marker,
    `Senior exit must retain the ${name} refill assumption`,
  );
}
assert.match(
  exitGroup,
  /What would it take to refill the pool\?[\s\S]*entryPointSettlementDays[\s\S]*conversionDays[\s\S]*conversionCostBps/,
  "All three refill assumptions must stay folded into Senior exit",
);

// There is one exact, unconditional pool-design request for the unified flow.
assert.match(
  summary,
  /useDayV3PoolDesign\(\s*poolDesignGoals,\s*poolDesignContext,\s*true,?\s*\)/,
  "The unified simulator must call the exact canonical pool-design service",
);
assert.doesNotMatch(
  summary,
  /useDayV3SimulationPoolDesign|deploying\s*\?\s*poolDesignGoals|deploying\s*\?\s*poolDesignContext/,
  "The unified simulator must not use a reduced or mode-gated E-CLP request",
);
assert.match(
  summary,
  /recoveryDays:\s*recoveryDaysInput[\s\S]*entryPointSettlementDays[\s\S]*collateralToExitDays[\s\S]*collateralToExitCostBps[\s\S]*fixedTermGraceDays:\s*0[\s\S]*navUpdateDays:\s*1/,
  "The exact request must contain observation time and the three visible refill assumptions",
);

// Every model family is shared because there is no mode branch around the
// capital/protection, E-CLP, or APY explanation groups.
for (const id of [
  "day-v3-risk-models",
  "day-v3-exit-models",
  "day-v3-return-models",
]) {
  assert.equal(
    summary.match(new RegExp(`id="${id}"`, "g"))?.length,
    1,
    `Unified V3 must render exactly one ${id} model group`,
  );
}

// Removed deployment-form surfaces cannot return under a different name.
for (const [name, marker] of [
  ["market operations", /<DayV3OperationalFacts|day-v3-deployment-setup-inputs/],
  ["request policy", /<DayV3DeploymentPolicy|day-v3-request-policy-inputs/],
  ["historical evidence", /<DayV3Backtest|day-v3-history-models/],
  ["Protected Exit", /day-v3-protected-exit-inputs|protectedExitView/],
  ["deployment handoff", /<DayV3Deployment|deploymentPanel/],
]) {
  assert.doesNotMatch(
    summary,
    marker,
    `Unified V3 must not render ${name}`,
  );
}
assert.doesNotMatch(
  goals,
  /summary="Deployment mapping"|day-v3-deployment-setup-inputs|day-v3-protected-exit-inputs/,
  "Removed deployment sections must not be nested inside issuer inputs",
);

// Hidden legacy curve anchors remain derived and cannot affect the unified UI.
assert.equal(
  editor.match(/<DayV3Slider/g)?.length,
  1,
  "One target-share slider must be reused by the Junior and SLP cards",
);
assert.match(
  summary,
  /deriveDayV3StartingYieldCurvePolicy/,
  "V3 must derive one complete starting policy behind the two visible shares",
);
assert.doesNotMatch(
  summary,
  /dayV3EffectiveShares/,
  "V3 must not update YT while leaving Y0 and Y100 on frozen template values",
);
assert.match(
  yieldCurves,
  /juniorTargetPct = coveragePct;[\s\S]*slpTargetPct = minimumLiquidityPct;/,
  "The starting policy must retain the explicit capital-parity floor",
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

console.log(
  `Day V3 unified model architecture: PASS (${modelFamilies.length}/${modelFamilies.length} shared model families)`,
);
