import assert from "node:assert/strict";
import {
  buildDayConfigExport,
  DAY_DEPLOYMENT_INPUT_IDS,
  DAY_DEPLOYMENT_TERM_BOUNDS,
  DAY_DEPLOYMENT_TERM_IDS,
  dayConfigExportFilename,
  dayConfigExportSlug,
  EMPTY_DAY_DEPLOYMENT_FIELDS,
  parseDayDeploymentTerm,
  type DayConfigExportInput,
} from "./config-export";
import { DAY_ISSUER_PRESETS, matchDayIssuerPreset } from "./issuer-presets";

const stability = DAY_ISSUER_PRESETS[0];

const input: DayConfigExportInput = {
  exportedAt: "2026-08-06T12:34:56.000Z",
  market: {
    id: "pareto-falconx",
    name: "Pareto FalconX",
    asset: "AA_FalconXUSDC",
    variant: "guided",
  },
  presetId: null,
  terms: {
    coveragePct: 3,
    minLiquidityPct: 15,
    eclpBandWidthPct: 10,
    riskSharePct: 5.6,
    liqSharePct: 21.1,
    riskY0Pct: 2,
    riskY100Pct: 18,
    liqY0Pct: 1,
    liqY100Pct: 30,
    observationDays: 7,
    sourceApyPct: 11.4,
    maintainCoverage: true,
    y100SharePct: 18,
    exitBufferPct: 1,
    selfLiquidationBonusPct: 1,
    fixedTermGracePeriodDays: 7,
    poolConcentration: 1,
    maxJTYieldSharePct: 50,
    maxLTYieldSharePct: 50,
  },
  scenario: { hasHistoricalSeries: true, sourceStressPct: 0 },
  modeled: {
    seniorApy: 0.0725,
    juniorApy: 0.2676,
    liquidityApy: 0.1741,
    coverageLossLimit: 0.0345,
    referenceSellShareOfSenior: 0.041,
    boundarySellShareOfSenior: 0.118,
  },
};

const payload = buildDayConfigExport(input);
assert.equal(payload.schemaVersion, 5);
// A shock must travel with the export, or `modeled` misattributes shocked
// outcomes to unshocked terms.
assert.equal(payload.scenario.sourceStressApplied, false);
assert.equal(payload.scenario.hasHistoricalSeries, true);
assert.equal(payload.scenario.sourceStressPct, 0);
assert.equal(payload.scenario.coverageRestoration, true);
assert.match(payload.scenario.note, /no hypothetical shock/);

// The protected exit threshold has two units and they are not interchangeable.
// The engine's `exitBufferPct` is a percentage OF the coverage requirement and
// the deploy flow's field of the same name is an absolute coverage level, so a
// payload carrying only one of them is a payload a reader can transcribe into
// the wrong box. At 3% coverage and a 1% buffer the flow's field is 0.03%.
assert.equal(payload.protectedExit.remainingAsShareOfRequirementPct, 1);
assert.ok(
  Math.abs(payload.protectedExit.remainingCoveragePct - 0.03) < 1e-12,
  `absolute threshold: ${payload.protectedExit.remainingCoveragePct}`,
);
// Both express the same on-chain liquidation multiple.
assert.ok(
  Math.abs(
    100 / payload.protectedExit.remainingAsShareOfRequirementPct -
      payload.termsPct.coveragePct / payload.protectedExit.remainingCoveragePct,
  ) < 1e-9,
);
// The absolute level must sit below the requirement or the flow refuses it.
assert.ok(payload.protectedExit.remainingCoveragePct < payload.termsPct.coveragePct);
const stressed = buildDayConfigExport({
  ...input,
  scenario: { ...input.scenario, sourceStressPct: 12 },
});
assert.equal(stressed.scenario.sourceStressApplied, true);
assert.equal(stressed.scenario.sourceStressPct, 12);
assert.match(stressed.scenario.note, /hypothetical 12% source drawdown/);
assert.ok(!("sourceStressPct" in stressed.terms), "a shock is not a market term");
assert.equal(payload.source, "day-simulator");
assert.equal(payload.exportedAt, "2026-08-06T12:34:56.000Z");
assert.deepEqual(payload.market, input.market);
assert.deepEqual(payload.preset, { id: null, label: "Custom" });

// Engine units: fractions and seconds, keyed like DayEditableTerms.
assert.ok(Math.abs(payload.terms.coverage - 0.03) < 1e-12);
assert.ok(Math.abs(payload.terms.minLiquidity - 0.15) < 1e-12);
assert.ok(Math.abs(payload.terms.eclpBandWidth - 0.1) < 1e-12);
assert.ok(Math.abs(payload.terms.riskYieldShare - 0.056) < 1e-12);
assert.ok(Math.abs(payload.terms.liquidityYieldShare - 0.211) < 1e-12);
assert.equal(payload.terms.observationDays, 7);
assert.equal(payload.terms.fixedTermDurationSec, 7 * 86_400);
assert.equal(payload.terms.fixedTermGracePeriodSec, 7 * 86_400);
assert.ok(Math.abs(payload.terms.sourceApy - 0.114) < 1e-12);
assert.ok(!("maintainCoverage" in payload.terms), "backtest restoration is not a deploy term");
assert.ok(Math.abs(payload.terms.riskYieldShareAtFullUtilization - 0.18) < 1e-12);
assert.equal(payload.terms.exitBufferPct, 1);
assert.ok(Math.abs(payload.terms.selfLiquidationBonus - 0.01) < 1e-12);

// UI units are preserved verbatim.
assert.deepEqual(payload.termsPct, {
  coveragePct: 3,
  minLiquidityPct: 15,
  eclpBandWidthPct: 10,
  riskSharePct: 5.6,
  liqSharePct: 21.1,
  observationDays: 7,
  fixedTermGracePeriodDays: 7,
  sourceApyPct: 11.4,
  y100SharePct: 18,
  exitBufferPct: 1,
  selfLiquidationBonusPct: 1,
});
assert.deepEqual(payload.modeled, input.modeled);
assert.ok(!("deploymentInputs" in payload), "the handoff must not export an empty duplicate form");
assert.deepEqual(payload.deploymentBrief.coverage, {
  enabled: true,
  minimumCoveragePct: 3,
  observationPeriodSeconds: 7 * 86_400,
  gracePeriodSeconds: 7 * 86_400,
  protectedExitRemainingCoveragePct: 0.03,
  selfLiquidationBonusPct: 1,
});
assert.deepEqual(payload.deploymentBrief.liquidity, {
  enabled: true,
  minimumLiquidityPct: 15,
});
assert.deepEqual(payload.deploymentBrief.yieldModels.junior, {
  model: "STATIC_CURVE",
  y0Pct: 2,
  yTargetPct: 5.6,
  y100Pct: 18,
  capPct: 50,
});
assert.deepEqual(payload.deploymentBrief.yieldModels.seniorLp, {
  model: "STATIC_CURVE",
  y0Pct: 1,
  yTargetPct: 21.1,
  y100Pct: 30,
  capPct: 50,
});
assert.equal(payload.deploymentBrief.exitPool.maximumDiscountBps, 1_000);
assert.equal(payload.deploymentBrief.exitPool.maximumDiscountWithinDeployRange, false);
assert.equal(payload.deploymentBrief.exitPool.simulationConcentration, 1);
assert.equal(payload.deploymentBrief.exitPool.deploymentDefaultConcentration, 250);
assert.equal(payload.deploymentBrief.compatibility.modeledTermsCompatible, false);
assert.ok(payload.deploymentBrief.compatibility.issues.length > 0);
assert.equal(payload.deploymentBrief.settlementDefaults.depositDelaySeconds, 300);
assert.equal(payload.deploymentBrief.settlementDefaults.withdrawalDelaySeconds, 86_400);
assert.ok(payload.deploymentBrief.stillRequiredInFlow.some((item) => /oracle/i.test(item)));
const serializedBrief = JSON.stringify(payload.deploymentBrief);
assert.doesNotMatch(serializedBrief, /restockHurdle|redemptionDelay|navUpdateCadence|exitLiquidity/);
const deployCompatibleBand = buildDayConfigExport({
  ...input,
  terms: { ...input.terms, eclpBandWidthPct: 3.5, exitBufferPct: 80 },
});
assert.equal(deployCompatibleBand.deploymentBrief.exitPool.maximumDiscountBps, 350);
assert.equal(deployCompatibleBand.deploymentBrief.exitPool.maximumDiscountWithinDeployRange, true);
assert.equal(deployCompatibleBand.deploymentBrief.compatibility.modeledTermsCompatible, true);

const forwardOnly = buildDayConfigExport({
  ...input,
  scenario: { hasHistoricalSeries: false, sourceStressPct: 0 },
});
assert.match(forwardOnly.scenario.note, /forward projections/);

const coverageOff = buildDayConfigExport({
  ...input,
  terms: { ...input.terms, coveragePct: 0 },
});
assert.equal(coverageOff.deploymentBrief.coverage.enabled, false);
assert.equal(coverageOff.deploymentBrief.coverage.observationPeriodSeconds, 0);
assert.equal(coverageOff.deploymentBrief.coverage.protectedExitRemainingCoveragePct, 0);
assert.equal(coverageOff.deploymentBrief.coverage.selfLiquidationBonusPct, 0);
assert.equal(coverageOff.terms.fixedTermDurationSec, 0);
assert.equal(coverageOff.scenario.coverageRestoration, false);

// The payload is JSON-serializable without loss.
assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);

const presetPayload = buildDayConfigExport({
  ...input,
  presetId: stability.id,
  terms: { ...input.terms, ...stability.values, sourceApyPct: input.terms.sourceApyPct },
});
assert.deepEqual(presetPayload.preset, { id: stability.id, label: stability.label });
assert.ok(Math.abs(presetPayload.terms.coverage - stability.values.coveragePct / 100) < 1e-12);

// Preset matching is exact, derived, and tolerant only of band-width float drift.
for (const preset of DAY_ISSUER_PRESETS) {
  assert.equal(matchDayIssuerPreset(preset.values), preset.id);
  assert.equal(
    matchDayIssuerPreset({
      ...preset.values,
      eclpBandWidthPct: preset.values.eclpBandWidthPct + 1e-12,
    }),
    preset.id,
  );
  assert.equal(
    matchDayIssuerPreset({ ...preset.values, coveragePct: preset.values.coveragePct + 1 }),
    null,
  );
  assert.equal(
    matchDayIssuerPreset({ ...preset.values, maintainCoverage: !preset.values.maintainCoverage }),
    null,
  );
  assert.ok(preset.values.riskSharePct + preset.values.liqSharePct <= 100);
}

// Deployment-checklist terms parse leniently and clamp into engine-safe ranges.
assert.deepEqual(Object.keys(EMPTY_DAY_DEPLOYMENT_FIELDS).sort(), [
  ...DAY_DEPLOYMENT_INPUT_IDS,
  ...DAY_DEPLOYMENT_TERM_IDS,
].sort());
for (const id of DAY_DEPLOYMENT_TERM_IDS) {
  assert.equal(EMPTY_DAY_DEPLOYMENT_FIELDS[id], "");
  const bounds = DAY_DEPLOYMENT_TERM_BOUNDS[id];
  assert.equal(parseDayDeploymentTerm("", 12.5, bounds), 12.5);
  assert.equal(parseDayDeploymentTerm("   ", 12.5, bounds), 12.5);
  assert.equal(parseDayDeploymentTerm("abc", 12.5, bounds), 12.5);
  assert.equal(parseDayDeploymentTerm("1e999", 12.5, bounds), 12.5);
  assert.equal(parseDayDeploymentTerm("-999", 12.5, bounds), bounds.min);
  assert.equal(parseDayDeploymentTerm("999", 12.5, bounds), bounds.max);
  assert.ok(Number.isFinite(parseDayDeploymentTerm("7.5", 12.5, bounds)));
}
assert.equal(
  parseDayDeploymentTerm("7.5", 18, DAY_DEPLOYMENT_TERM_BOUNDS.yieldShareAtFullUtilization),
  7.5,
);
assert.equal(
  parseDayDeploymentTerm("0.5", 1, DAY_DEPLOYMENT_TERM_BOUNDS.protectedExitThreshold),
  1,
);

assert.equal(dayConfigExportSlug("Pareto FalconX · v3"), "pareto-falconx-v3");
assert.equal(dayConfigExportSlug("---"), "");
assert.equal(
  dayConfigExportFilename("Pareto FalconX", "2026-08-06T12:34:56.000Z"),
  "day-market-config_pareto-falconx_2026-08-06.json",
);
assert.equal(
  dayConfigExportFilename("", "2026-08-06T12:34:56.000Z"),
  "day-market-config_day-market_2026-08-06.json",
);

console.log("Day configuration export payload: PASS");
console.log("Day deployment term parsing and clamping: PASS");
console.log("Day issuer preset matching: PASS");
console.log("Day configuration export filename: PASS");
