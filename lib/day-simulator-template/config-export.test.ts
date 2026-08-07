import assert from "node:assert/strict";
import {
  buildDayConfigExport,
  DAY_DEPLOYMENT_INPUT_IDS,
  DAY_DEPLOYMENT_TERM_BOUNDS,
  DAY_DEPLOYMENT_TERM_IDS,
  dayConfigExportFilename,
  dayConfigExportSlug,
  EMPTY_DAY_DEPLOYMENT_FIELDS,
  EMPTY_DAY_DEPLOYMENT_INPUTS,
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
    observationDays: 7,
    sourceApyPct: 11.4,
    maintainCoverage: true,
    y100SharePct: 18,
    exitBufferPct: 1,
    selfLiquidationBonusPct: 1,
  },
  modeled: {
    seniorApy: 0.0725,
    juniorApy: 0.2676,
    liquidityApy: 0.1741,
    coverageLossLimit: 0.0345,
    referenceSellShareOfSenior: 0.041,
    boundarySellShareOfSenior: 0.118,
  },
  deploymentInputs: {
    tokenContractSource: "https://example.com/token",
    tokenContractAddress: "0x0000000000000000000000000000000000000001",
    chain: "Ethereum",
    adaptationSpeed: "",
  },
};

const payload = buildDayConfigExport(input);
assert.equal(payload.schemaVersion, 1);
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
assert.ok(Math.abs(payload.terms.sourceApy - 0.114) < 1e-12);
assert.equal(payload.terms.maintainCoverage, true);
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
  sourceApyPct: 11.4,
  y100SharePct: 18,
  exitBufferPct: 1,
  selfLiquidationBonusPct: 1,
});
assert.deepEqual(payload.modeled, input.modeled);
assert.deepEqual(payload.deploymentInputs, input.deploymentInputs);
assert.deepEqual(Object.keys(payload.deploymentInputs).sort(), [...DAY_DEPLOYMENT_INPUT_IDS].sort());
assert.deepEqual(
  buildDayConfigExport({ ...input, deploymentInputs: EMPTY_DAY_DEPLOYMENT_INPUTS }).deploymentInputs,
  { tokenContractSource: "", tokenContractAddress: "", chain: "", adaptationSpeed: "" },
);

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
