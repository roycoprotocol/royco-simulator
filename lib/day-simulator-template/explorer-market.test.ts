import assert from "node:assert/strict";

import {
  buildDayDraftMarket,
  DAY_EXPLORER_TEMPLATE_MARKET,
} from "@/lib/day-simulator-template/explorer-market";
import { runDayTargetScenario } from "@/lib/day-simulator-template/runtime";

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
  feesIncluded: "unknown",
});

assert.equal(draft.id, "day-explorer-draft");
assert.equal(draft.certification.intakeConfirmed, false);
assert.equal(draft.provenance.observationCount, 3);
assert.equal(draft.provenance.priceType, "unknown");
assert.ok(draft.defaults.sourceApy > 0);

const outputs = runDayTargetScenario(draft.defaults);
assert.ok(Number.isFinite(outputs.seniorApy));
assert.ok(Number.isFinite(outputs.juniorApy));
assert.ok(Number.isFinite(outputs.liquidityApy));

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
    feesIncluded: "unknown",
  }),
  /at least three dated observations/,
);

console.log("Day Explorer draft market PASS");
