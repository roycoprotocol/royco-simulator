import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3ProtectedExitModel from "@/components/day-v3/DayV3ProtectedExitModel";
import type { DayV3ProtectedExitView } from "@/components/day-v3/DayV3Goals";

const ready: DayV3ProtectedExitView = {
  thresholdPct: 5,
  bonusPct: 1,
  activationStressPct: 15,
  status: "scenario-ready",
  message: "Exact accountant scenarios.",
  comparisons: [],
  scenarios: [25, 50, 100].map((redeemedPct) => ({
    redeemedPct,
    payoutPer100: redeemedPct * 1.01,
    bonusPaidPer100: redeemedPct * 0.01,
    onChainBonusCapPer100: redeemedPct * 0.02,
    juniorUsedPer100: redeemedPct * 0.01,
    remainingCoveragePct: 5 - redeemedPct * 0.01,
    capped: redeemedPct === 100,
  })),
};

const markup = renderToStaticMarkup(
  <DayV3ProtectedExitModel protectedExit={ready} />,
);
assert.match(markup, /data-model-source="runDayV3ProtectedExitScenarios"/);
assert.match(markup, /25%/);
assert.match(markup, /50%/);
assert.match(markup, /100%/);
assert.match(markup, /Actual payout/);
assert.match(markup, /On-chain cap/);
assert.match(markup, /Junior used/);
assert.match(markup, /Coverage left/);
assert.match(markup, /\(capped\)/);
assert.match(markup, /\$25\.25/);
assert.match(markup, /\$0\.25/);

const unresolved: DayV3ProtectedExitView = {
  ...ready,
  thresholdPct: null,
  status: "unresolved",
  message: "Resolve a trigger first.",
  scenarios: [],
};
const unresolvedMarkup = renderToStaticMarkup(
  <DayV3ProtectedExitModel protectedExit={unresolved} />,
);
assert.match(unresolvedMarkup, /Resolve a trigger first/);
assert.doesNotMatch(unresolvedMarkup, /Senior redeemed<\/th>/);

console.log("Day V3 Protected Exit model: PASS");
