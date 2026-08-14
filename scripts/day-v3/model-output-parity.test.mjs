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
const modelState = read("lib/day-v3/model-state.ts");
const yieldCurves = read("lib/day-v3/yield-curves.ts");
const backtest = read("components/day-v3/DayV3Backtest.tsx");
const modelGroup = read("components/day-v3/DayV3ModelGroup.tsx");

// One workflow must retain every model that explains how an issuer's four
// inputs change returns, capital, protection, immediate exits, and history.
const modelFamilies = [
  ["position return cards", "Scenario returns at these terms"],
  ["capital stack", "<DayV3CapitalStack"],
  ["loss waterfall and stress slider", "<DayV3LossWaterfall"],
  ["issuer goal versus canonical exit", "<DayV3ExitModel"],
  ["atomic exit cost/depth curve and table", "<DayV3ExitCost"],
  ["one-year growth chart", "<DayV3Chart"],
  ["position/yield composition table", "<DayV3Comparison"],
  ["visible premium curves", "<DayV3YieldModels"],
  ["historical backtest", "<DayV3Backtest"],
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
  /dayV3ReturnDisplayState\(\{[\s\S]*modelUpdating,[\s\S]*sourceApyResolved:/,
  "The APY display must receive update state and source-yield readiness",
);
assert.match(
  modelState,
  /if \(!input\.sourceApyResolved\) return "missing-source";[\s\S]*return "ready";/,
  "A deferred shared-accountant snapshot must remain a visible APY answer",
);
assert.doesNotMatch(
  modelState,
  /if \(input\.modelUpdating\) return "updating"/,
  "An in-flight refresh must not replace numeric APYs with a loading state",
);
assert.match(
  summary,
  /\{modelUpdating \? <Badge tone="neutral">updating<\/Badge> : null\}[\s\S]*modelUpdating[\s\S]*"a year · updating"/,
  "Model updates must be communicated beside still-visible APY cards",
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

// The questionnaire has exactly four ordered input groups. Source comes first,
// protection and exit live in DayV3Goals, and the tranche-aware yield split is
// always last.
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
  /id="day-v3-source-inputs"[\s\S]*<DayV3Goals[\s\S]*\{premiumCurveEditor\}/,
  "The visible input flow must be source, protection, exit, then yield split",
);
assert.match(
  summary,
  /const premiumCurveEditor =[\s\S]*protectionEnabled \|\| exitEnabled[\s\S]*juniorEnabled=\{protectionEnabled\}[\s\S]*slpEnabled=\{exitEnabled\}/,
  "The last yield-split step must render only the active supporting tranches",
);
assert.match(
  editor,
  /if \(!juniorEnabled && !slpEnabled\) \{[\s\S]*return null;[\s\S]*activeCurveLabels =[\s\S]*juniorEnabled[\s\S]*slpEnabled/,
  "The yield editor must disappear with no supporting tranche and label the active ones",
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

const protectionGroupStart = goals.indexOf(
  "Should Senior have first-loss protection?",
);
const exitGroupStart = goals.indexOf(
  "Should Senior have an immediate pool exit?",
);
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
// The guard here used to ban the four refill-assumption labels outright. What
// it was actually protecting is that no refill input may gate a result: the
// removed block fed the canonical pool request and withheld pool sizing until
// every operational fact was answered. The simulator now asks a market maker's
// cost of capital and redemption wait so a reader can see whether the discount
// their design creates is worth arbitraging, and those answers reach only the
// local scenario check. Assert that boundary, not the absence of the words.
assert.match(
  exitGroup,
  /<DayV3RestockCheck[\s\S]*view=\{restock\}/,
  "Senior exit must show whether a refill trade pays at the terms on screen",
);
assert.doesNotMatch(
  goals,
  /Refill feasibility assumptions/,
  "The blocking deployment-facts form must not return",
);
assert.doesNotMatch(
  summary,
  /marketMakerCostOfCapitalPct[\s\S]{0,400}poolDesignGoals|poolDesignGoals[\s\S]{0,400}marketMakerCostOfCapitalPct/,
  "Refill assumptions must never enter the canonical pool-design request",
);
for (const gate of [
  /advancedExitComplete =\s*exitInputReadiness\.complete/,
  /const exitInputReadiness = dayV3ExitInputReadiness\(\{\s*enabled: !exitDisabled,\s*exitSharePct: immediateExitSharePct,\s*minimumProceedsPer100,\s*\}\)/,
]) {
  assert.match(
    summary,
    gate,
    "Exit readiness must stay the two visible goals, with no refill inputs added",
  );
}

// The simulator asks only for the four issuer goals. Exact deployment facts
// remain the responsibility of Royco Deploy and cannot gate scenario APYs.
assert.match(
  summary,
  /useDayV3SimulationPoolDesign\(\s*poolDesignGoals,\s*sourceApyPct,?\s*\)/,
  "The unified simulator must use the four-goal simulation pool-design request",
);
assert.doesNotMatch(
  summary,
  /useDayV3PoolDesign|entryPointSettlementDays:\s*entryPointSettlementDays|collateralToExitDays:\s*collateralToExitDays|collateralToExitCostBps:\s*collateralToExitCostBps/,
  "The simulator must not send hidden deployment-only inputs to pool sizing",
);
assert.match(
  summary,
  /recoveryDays:\s*recoveryDaysInput \?\? 0[\s\S]*immediateExitSharePct,[\s\S]*minimumProceedsPer100/,
  "Forward pool checking must remain available before an observation mode is chosen",
);
assert.match(
  summary,
  /const liquidityPct = exitDisabled[\s\S]*defaults\.minLiquidity \* 100/,
  "SLP APY must use the source's disclosed illustrative liquidity basis when exact sizing is unavailable",
);
assert.match(
  summary,
  /slpCapitalPer100=\{model\.balances\.lt\}[\s\S]*slpMinimumLiquidityPct=\{liquidityPct\}/,
  "The yield-split editor must disclose the capital basis behind SLP APY",
);
assert.doesNotMatch(
  `${summary}\n${editor}`,
  /slpPending|SLP share awaits exit validation|SLP yield share is awaiting exit validation/,
  "Unavailable exact pool validation must never suppress an SLP return",
);

// Every model family is shared because there is no mode branch around the
// capital/protection, E-CLP, or APY explanation groups.
for (const id of [
  "day-v3-capital-models",
  "day-v3-risk-models",
  "day-v3-exit-models",
  "day-v3-return-models",
  "day-v3-history-models",
]) {
  assert.equal(
    summary.match(new RegExp(`id="${id}"`, "g"))?.length,
    1,
    `Unified V3 must render exactly one ${id} model group`,
  );
}
const capitalModelStart = summary.indexOf('id="day-v3-capital-models"');
const protectionModelStart = summary.indexOf('id="day-v3-risk-models"');
const exitModelStart = summary.indexOf('id="day-v3-exit-models"');
assert.ok(
  capitalModelStart >= 0 &&
    protectionModelStart > capitalModelStart &&
    exitModelStart > protectionModelStart,
  "Capital stack and protection must remain separate, ordered model groups",
);
const capitalModelGroup = summary.slice(capitalModelStart, protectionModelStart);
const protectionModelGroup = summary.slice(protectionModelStart, exitModelStart);
assert.match(capitalModelGroup, /<DayV3CapitalStack/);
assert.doesNotMatch(capitalModelGroup, /<DayV3LossWaterfall/);
assert.match(protectionModelGroup, /<DayV3LossWaterfall/);
assert.doesNotMatch(protectionModelGroup, /<DayV3CapitalStack/);

// Removed deployment-form surfaces cannot return under a different name.
for (const [name, marker] of [
  ["market operations", /<DayV3OperationalFacts|day-v3-deployment-setup-inputs/],
  ["request policy", /<DayV3DeploymentPolicy|day-v3-request-policy-inputs/],
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

for (const marker of [
  "Historical backtest",
  "Backtest window",
  "<DayV3BacktestChart",
  "Coverage restoration",
  "<TableHead>Month</TableHead>",
]) {
  assert.ok(backtest.includes(marker), `Historical model lost: ${marker}`);
}

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


// The pool's quote side is an issuer answer now, not a flat zero. It has to
// reach the accountant run *and* the backtest, or the projection and the
// history would price the same pool with two different exit assets.
assert.match(
  summary,
  /stableYield: modeledQuoteAssetYieldPct \/ 100/,
  "The quote asset's yield must feed the shared accountant's pool carry",
);
assert.match(
  summary,
  /quoteAssetYieldPct=\{inputs\.quoteAssetYieldPct\}/,
  "The historical backtest must run on the same quote asset as the projection",
);
assert.match(
  backtest,
  /\.\.\.market\.defaults, stableYield: quoteAssetYieldInput \/ 100/,
  "The backtest must not fall back to the market template's own exit-asset yield",
);

// A tranche the issuer switched off has no model to show, so its result
// section is inert rather than an accordion over an empty market.
for (const [marker, name] of [
  [/disabledReason=\{\s*protectionDisabled/, "Junior"],
  [/disabledReason=\{\s*exitDisabled/, "SLP"],
]) {
  assert.match(
    summary,
    marker,
    `The ${name} result section must grey out when its tranche is off`,
  );
}
assert.match(
  modelGroup,
  /const disabled = Boolean\(disabledReason\);[\s\S]*if \(disabled\) return;/,
  "A disabled model section must not open",
);

console.log(
  `Day V3 unified model architecture: PASS (${modelFamilies.length}/${modelFamilies.length} shared model families)`,
);
