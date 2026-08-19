import assert from "node:assert/strict";

import {
  buildDayDraftMarket,
  buildDayYieldDraftMarket,
  DAY_EXPLORER_TEMPLATE_MARKET,
} from "@/lib/day-simulator-template/explorer-market";
import { runDayTargetScenario } from "@/lib/day-simulator-template/runtime";
import { annualizedSeriesApy } from "@/lib/day-simulator-template/series";
import { JBBB_SAMPLE_MARKET } from "@/lib/day-sample-sources/jbbb/market";
import { DAY_MARKETS } from "@/lib/day-markets/registry";

const YIELD_PREMIUM_PROTOCOL_FEE = 0.05;

for (const market of DAY_MARKETS) {
  assert.equal(
    market.defaults.jtYieldShareProtocolFee,
    YIELD_PREMIUM_PROTOCOL_FEE,
    `${market.id} Junior yield-premium protocol fee`,
  );
  assert.equal(
    market.defaults.ltYieldShareProtocolFee,
    YIELD_PREMIUM_PROTOCOL_FEE,
    `${market.id} SLP yield-premium protocol fee`,
  );
}

assert.equal(DAY_EXPLORER_TEMPLATE_MARKET.route, "/day-sim");
assert.equal(DAY_EXPLORER_TEMPLATE_MARKET.series.length, 13);

const draft = buildDayDraftMarket({
  label: "Example upload",
  provider: "User upload",
  sourceUrl: "",
  series: [
    { date: "2024-01-01", price: 1 },
    { date: "2024-02-01", price: 1.01 },
    { date: "2024-03-01", price: 1.02 },
  ],
  cadence: "monthly",
  priceType: "unknown",
});

assert.equal(draft.id, "day-explorer-draft");
assert.equal(draft.certification.intakeConfirmed, false);
assert.equal(draft.provenance.observationCount, 3);
assert.equal(draft.provenance.priceType, "unknown");
assert.ok(draft.defaults.sourceApy > 0);
assert.equal(
  draft.defaults.jtYieldShareProtocolFee,
  YIELD_PREMIUM_PROTOCOL_FEE,
);
assert.equal(
  draft.defaults.ltYieldShareProtocolFee,
  YIELD_PREMIUM_PROTOCOL_FEE,
);

const outputs = runDayTargetScenario(draft.defaults);
assert.ok(Number.isFinite(outputs.seniorApy));
assert.ok(Number.isFinite(outputs.juniorApy));
assert.ok(Number.isFinite(outputs.liquidityApy));

assert.equal(JBBB_SAMPLE_MARKET.id, "jbbb");
assert.equal(JBBB_SAMPLE_MARKET.certification.intakeConfirmed, false);
assert.equal(JBBB_SAMPLE_MARKET.provenance.priceType, "total-return-index");
assert.equal(JBBB_SAMPLE_MARKET.provenance.observationCount, 1144);
assert.equal(JBBB_SAMPLE_MARKET.provenance.firstDate, "2022-01-12");
assert.equal(JBBB_SAMPLE_MARKET.provenance.lastDate, "2026-08-05");
assert.equal(
  JBBB_SAMPLE_MARKET.provenance.dataMode,
  "historical-series-with-published-apy",
);
assert.equal(JBBB_SAMPLE_MARKET.provenance.publishedApy, 0.0597);
assert.equal(JBBB_SAMPLE_MARKET.defaults.sourceApy, 0.0597);
assert.equal(JBBB_SAMPLE_MARKET.series[0].price, 100);
assert.equal(
  JBBB_SAMPLE_MARKET.defaults.jtYieldShareProtocolFee,
  YIELD_PREMIUM_PROTOCOL_FEE,
);
assert.equal(
  JBBB_SAMPLE_MARKET.defaults.ltYieldShareProtocolFee,
  YIELD_PREMIUM_PROTOCOL_FEE,
);
assert.ok(Math.abs(annualizedSeriesApy(JBBB_SAMPLE_MARKET.series) - 0.05825) < 0.00001);

const publishedForwardWithHistory = buildDayDraftMarket({
  label: "Published forward with observed history",
  provider: "Official publisher",
  sourceUrl: "https://example.com/official",
  publishedApy: 0.0597,
  series: [
    { date: "2024-01-01", price: 100 },
    { date: "2024-02-01", price: 101 },
    { date: "2024-03-01", price: 102 },
  ],
  cadence: "monthly",
  priceType: "total-return-index",
});
assert.equal(
  publishedForwardWithHistory.provenance.dataMode,
  "historical-series-with-published-apy",
);
assert.equal(publishedForwardWithHistory.provenance.publishedApy, 0.0597);
assert.equal(publishedForwardWithHistory.defaults.sourceApy, 0.0597);
assert.deepEqual(publishedForwardWithHistory.series, [
  { date: "2024-01-01", price: 100 },
  { date: "2024-02-01", price: 101 },
  { date: "2024-03-01", price: 102 },
]);

const yieldDraft = buildDayYieldDraftMarket({
  label: "Expected yield source",
  sourceApy: 0.08,
});

assert.equal(yieldDraft.id, "day-explorer-yield-draft");
assert.equal(yieldDraft.defaults.sourceApy, 0.08);
assert.equal(yieldDraft.provenance.dataMode, "published-apy-forward");
assert.equal(yieldDraft.provenance.observationCount, 0);
assert.equal(yieldDraft.provenance.feesIncluded, true);
assert.equal(yieldDraft.customization.hiddenSections.includes("backtest"), true);
assert.equal(yieldDraft.series.length, 0);
assert.equal(
  yieldDraft.defaults.jtYieldShareProtocolFee,
  YIELD_PREMIUM_PROTOCOL_FEE,
);
assert.equal(
  yieldDraft.defaults.ltYieldShareProtocolFee,
  YIELD_PREMIUM_PROTOCOL_FEE,
);

const yieldOutputs = runDayTargetScenario(yieldDraft.defaults);
assert.ok(Number.isFinite(yieldOutputs.seniorApy));
assert.ok(Number.isFinite(yieldOutputs.juniorApy));
assert.ok(Number.isFinite(yieldOutputs.liquidityApy));

assert.throws(
  () => buildDayYieldDraftMarket({
    label: "Invalid expected yield",
    sourceApy: Number.NaN,
  }),
  /Net source APY/,
);

assert.throws(
  () => buildDayDraftMarket({
    label: "Too short",
    provider: "User upload",
    sourceUrl: "",
    series: [
      { date: "2024-01-01", price: 1 },
      { date: "2024-02-01", price: 1.01 },
    ],
    cadence: "monthly",
    priceType: "unknown",
  }),
  /at least three dated observations/,
);

console.log("Day Explorer draft market PASS");
