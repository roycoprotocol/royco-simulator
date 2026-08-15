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
const backtestChart = read("components/day-v3/DayV3BacktestChart.tsx");
const historicalReturns = read("lib/day-v3/historical-returns.ts");
const modelGroup = read("components/day-v3/DayV3ModelGroup.tsx");
const quoteAsset = read("components/day-v3/DayV3QuoteAsset.tsx");
const simulationPoolDesign = read("lib/day-v3/simulation-pool-design.ts");

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
  "Exit cost and depth must stay directly beneath the exit model",
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
  summary,
  /id="day-v3-restock-models"[\s\S]*<DayV3RestockCheck[\s\S]*view=\{restockView\}/,
  "The refill verdict is its own result section, after the exit it judges",
);
assert.ok(
  summary.indexOf('id="day-v3-restock-models"') >
    summary.indexOf('id="day-v3-exit-models"'),
  "The refill question follows the exit design it is asked about",
);
assert.doesNotMatch(
  goals,
  /<DayV3RestockCheck/,
  "The refill check is a model, not another input to answer",
);
// An arbitrageur trades against the pool, so both discounts are quotes from one
// engine run against one pool: the deepest fill it can do, and the fill the
// promised exit takes. Two earlier versions stitched a canonical scalar to a
// live input, which let the payout floor move nothing at all.
assert.match(
  summary,
  /dayV3QuoteDiscountBps\(\s*model\.illustrativeExit\.quote,?\s*\)/,
  "The selected-sale discount must be a quote for the fill that exit takes",
);
assert.match(
  summary,
  /dayV3QuoteDiscountBps\(\s*model\.explainer\.liquidity\.boundaryQuote,?\s*\)/,
  "The worst case must be a quote for the deepest fill the pool can do",
);
// The band IS the pool's maximum discount. Pinned to the market's constant, an
// issuer could drag the payout floor from $99 to $50 and the pool would not
// move; measured on the shared engine, that range is 0.60% to 28% of discount.
assert.match(
  summary,
  /const floorBandPct =[\s\S]*100 - minimumProceedsPer100/,
  "With no live template the payout floor must set the pool's maximum discount",
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
// The guard that pinned `slpCapitalPer100` / `slpMinimumLiquidityPct` into the
// yield-split editor is gone with the paragraph it protected: the editor's
// "Why the SLP rate is what it is" note was removed at the issuer's request,
// and those two props existed only to feed it. Removed because the feature was
// deliberately deleted, not to make a check pass — the basis itself is still
// pinned by the `liquidityPct` guard directly above.
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
  "day-v3-restock-models",
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
  /\.\.\.market\.defaults,\s*poolTurnoverPerYear: poolTurnoverInput,\s*stableYield: quoteAssetYieldInput \/ 100,/,
  "The backtest must not fall back to the template's own quote asset or volume",
);
assert.match(
  summary,
  /poolTurnoverPerYear=\{inputs\.poolTurnoverPerYear\}/,
  "The history must run the same annual volume forecast as the projection",
);
assert.match(
  summary,
  /poolTurnoverPerYear: modeledPoolTurnover/,
  "Annual volume is the issuer's forecast, not a pinned zero",
);

// The pool's swap fee is settable per market. It is the one issuer answer the
// canonical service cannot be asked to honour — its request body is
// key-restricted and its parser asserts the returned fee equals the live
// template policy — so the whole feature turns on the fee winning locally and
// the canonical outcomes standing down when it does.
assert.match(
  summary,
  /swapFeeBps: swapFeeBps \?\? defaults\.swapFeeBps/,
  "A hand-set pool fee must reach the shared accountant, not just the display",
);
assert.match(
  summary,
  /\.\.\.\(hasCurveOverride \? canonicalPolicy : canonical\),\s*\.\.\.\(feeOverridden \? \{ swapFeeBps: swapFeeBps as number \} : \{\}\),/,
  "The engine override must keep the live E-CLP and protocol fees while replacing only the fee — except when the reader drew the curve themselves",
);
assert.match(
  summary,
  /\]\.some\(\(value\) => value !== null\) \|\| feeOverridden;/,
  "A hand-set fee must suppress the canonical pool design like any other pool override",
);
assert.match(
  summary,
  /const canonicalPoolDesign =\s*rawCanonicalPoolDesign && !hasPoolOverride/,
  "Canonical outcomes solved at another fee must not survive the override gate",
);
const poolDesignRequest = summary.slice(
  summary.indexOf("const poolDesignGoals ="),
  summary.indexOf("const activePoolDesign ="),
);
assert.doesNotMatch(
  poolDesignRequest,
  /swapFeeBps|feeOverridden/,
  "A hand-set fee must never enter the canonical pool-design request",
);
assert.doesNotMatch(
  simulationPoolDesign,
  /swapFeeBps/,
  "The simulation pool-design contract must stay the four goals and the source APY",
);
// The projection and the history have to run the same pool. Both merge these
// overrides by spread, so a key present and `undefined` erases a real value.
assert.match(
  summary,
  /const backtestConfigOverrides = useMemo\(\(\) => \{[\s\S]*inputs\.engineOverrides\?\.swapFeeBps !== undefined\) \{\s*overrides\.swapFeeBps = inputs\.engineOverrides\.swapFeeBps;/,
  "The backtest must run the same swap fee the projection was priced at",
);
assert.doesNotMatch(
  summary,
  /eclpParams: inputs\.engineOverrides\.eclpParams,\s*swapFeeBps: inputs\.engineOverrides\.swapFeeBps,/,
  "Engine overrides must be built by omitting keys, never by writing undefined ones",
);
assert.match(
  summary,
  /poolConfigOverrides=\{backtestConfigOverrides\}/,
  "The historical backtest must receive the same override object",
);
// Honesty: a fee the issuer typed is never presented as the market's own, and
// the swap-fee line in the position comparison stays a two-run engine
// differential rather than fee x turnover arithmetic written into the UI.
assert.match(
  summary,
  /policyBasis: feeOverridden\s*\?\s*\("issuer-fee" as const\)/,
  "The live-models eyebrow must not claim to be live while a hand-set fee is in force",
);
assert.match(
  summary,
  /feeSource: feeOverridden\s*\?\s*`Issuer-set pool swap fee/,
  "The fee's provenance must name the issuer, never a template or product policy",
);
assert.doesNotMatch(
  quoteAsset,
  /"live-template"|"product-policy"|"source-fact"/,
  "The fee field must not label a hand-set fee as a template or policy fact",
);
assert.match(
  quoteAsset,
  /swapFeeBps === null \? "model-assumption" : "manual-override"/,
  "A fee the reader typed reads as a manual override",
);
assert.match(
  quoteAsset,
  /max=\{1000\}\s*min=\{0\.01\}/,
  "The fee field's bounds are what keep previewSecondarySell from throwing",
);
assert.doesNotMatch(
  `${summary}\n${goals}\n${quoteAsset}`,
  /swapFeeBps\s*[)\s]*\/\s*10_?000/,
  "Fee economics stay in the shared engine; the UI must not compute fee income",
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

// Two regressions that shipped, both invisible on the custom draft and broken
// on all 12 registry markets that declare an E-CLP curve. They live in how this
// file calls the shared builders, so they are pinned here rather than in a unit
// test that can reproduce the correct construction inline and pass either way.

// `buildDayMarketConfig` keeps a declared `eclpParams` only while the requested
// band still equals the declared one, and reads both off its `defaults`
// argument. Setting the band on that object made it compare the request against
// itself, so the guard never fired and the payout floor never reached the curve.
const structuralStart = summary.indexOf("const structuralModel = useMemo(");
const structuralEnd = summary.indexOf("const baseReturnTerms", structuralStart);
const structural = summary.slice(structuralStart, structuralEnd);
assert.ok(structuralStart >= 0 && structuralEnd > structuralStart);
assert.doesNotMatch(
  structural.slice(0, structural.indexOf("const terms:")),
  /eclpBandWidth:/,
  "The requested band must not sit on the object passed to buildDayMarketConfig as defaults, or its curve guard compares the band against a copy of itself",
);
assert.match(
  structural,
  /const terms: DayEditableTerms = \{[\s\S]*eclpBandWidth: inputs\.bandPct \/ 100/,
  "The requested band belongs in terms, which is the side the guard compares",
);

// `dayCapitalAtUtilization` inverts liquidity against the raw deposit while
// `newMarket` re-values it through the E-CLP; solving both legs at 100% gives a
// stack the engine rejects by ~14ppm on every market that declares a curve.
assert.match(
  summary,
  /dayCapitalAtUtilization\(sized, terms, 1\)[\s\S]{0,220}lt: balances\.lt/,
  "The loss waterfall takes Junior to the boundary and leaves the pool on its admissible opening size",
);

// The canonical curve must not silently outrank a curve the reader set. Both
// halves of the guard matter: the override list has to be consulted, and the
// spread has to drop `eclpParams` when it fires. Without this, dragging
// "maximum discount" from 1% to 20% left every quote on the page unchanged.
assert.match(
  summary,
  /const hasCurveOverride\s*=\s*\n?\s*activeManualOverrides\.maximumDiscountPct !== null/,
  "a reader-set curve must be detected before the canonical one is applied",
);
assert.match(
  summary,
  /\.\.\.\(hasCurveOverride \? canonicalPolicy : canonical\)/,
  "a reader-set curve must drop the canonical eclpParams from the engine overrides",
);

// The band the page names has to be the band the engine priced. A hand-set fee
// withholds the canonical recommendation but keeps the canonical curve, so
// reading `effectiveBandPct` there named the payout floor's band beside quotes
// taken off the template's curve.
assert.match(
  summary,
  /maximumDiscountPct: pricedBand\.pct,\s*\n\s*maximumDiscountSource: pricedBand\.source,/,
  "the restock card must be given the band that actually priced, and its source",
);
assert.doesNotMatch(
  summary,
  /maximumDiscountPct: inputs\.bandPct,/,
  "the requested band is not always the priced band, so it must not be reported as one",
);

// A sale larger than the pool is quoted for the slice that fills. Calling that
// "the exit you promised" claimed an arbitrage on volume that never traded.
assert.match(
  summary,
  /selectedUnfilledPer100:[\s\S]{0,320}?quote\.unfilledNAV/,
  "the restock card must be told how much of the selected sale went unfilled",
);

// The engine is byte-locked template code, so a pool assumption it cannot
// integrate is caught at the caller.
assert.match(
  backtest,
  /try \{\s*\n\s*return \[runDayHistoricalBacktest\(\{/,
  "the historical backtest must not be able to take the page down",
);

// A market with a dated path has two answers, and the scenario cards showed
// only the forward one. jbbb projects Junior at +10.2% a year while the same
// terms over its real 2022 path give −71.2%, four sections further down.
assert.match(
  summary,
  /const realized = useMemo\(\s*\n?\s*\(\) =>\s*\n?\s*dayV3RealizedReturns\(market, historicalTerms, backtestConfigOverrides\)/,
  "the scenario cards must be given what these terms did over the market's own history",
);
assert.match(
  summary,
  /realizedApy: realized\?\.seniorApy[\s\S]{0,900}?realizedApy: realized\?\.juniorApy[\s\S]{0,900}?realizedApy: realized\?\.liquidityApy/,
  "all three tranches carry their realized figure, not just the protected one",
);
// It must be the shared runner's own number. A second derivation of a return
// is the one thing this architecture does not permit.
assert.match(
  historicalReturns,
  /runDayHistoricalBacktest\(\{/,
  "realized returns come from the shared backtest runner",
);
assert.doesNotMatch(
  historicalReturns,
  /Math\.pow|\*\* \(1 ?\/|dayAnnualizedReturn\(/,
  "realized returns must not be re-annualized here; the runner already did it",
);

// Observation Periods are drawn on the path, not left as a count. The root
// simulator has always shaded them; V3 rendered "8" and nothing else.
assert.match(
  backtest,
  /bands=\{observationBands\}/,
  "the backtest chart must be given the Observation Periods it is plotting",
);
assert.match(
  backtestChart,
  /<ReferenceArea/,
  "Observation Periods must be shaded on the chart",
);
assert.match(
  backtestChart,
  /\.filter\(\(band\) => band\.end > band\.start\)/,
  "a zero-width period draws nothing and must not be emitted as a band",
);

// Coverage restoration follows the market's own manifest. Held at a hardcoded
// `false`, every market opened contradicting its own declared design and
// reported "Coverage restoration is off" for a market that restores it. Read
// rather than pinned to `true`, so a market that declares otherwise is drawn
// as it declares itself.
assert.match(
  summary,
  /useState\(\s*\n?\s*initialMarket\.defaults\.maintainCoverage,?\s*\n?\s*\)/,
  "coverage restoration must be seeded from the market, not hardcoded",
);
assert.match(
  summary,
  /setMaintainCoverage\(next\.defaults\.maintainCoverage\);/,
  "switching market must adopt that market's coverage-restoration answer too",
);
assert.doesNotMatch(
  summary,
  /useState\(false\);\s*\n\s*\/\/ The merged simulator exposes only target yield shares/,
  "the hardcoded coverage-restoration default must not come back",
);

console.log(
  `Day V3 unified model architecture: PASS (${modelFamilies.length}/${modelFamilies.length} shared model families)`,
);
