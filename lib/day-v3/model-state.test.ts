import assert from "node:assert/strict";

import {
  createDayV3ModelSnapshot,
  dayV3ReturnDisplayState,
} from "@/lib/day-v3/model-state";

const policy = { swapFeeBps: 10 };
const snapshot = createDayV3ModelSnapshot(
  { coveragePct: 13.5, liquidityPct: 9.87 },
  policy,
);

assert.deepEqual(snapshot, {
  coveragePct: 13.5,
  liquidityPct: 9.87,
  engineOverrides: policy,
});
assert.equal(snapshot.engineOverrides, policy);

// Pending wins even when the deferred snapshot still contains a complete old
// policy. The caller also sets this while the asynchronous canonical solver is
// resolving, so a selected template never flashes as "missing" between goals.
// This is the regression that previously exposed old/new hybrid APYs.
assert.equal(
  dayV3ReturnDisplayState({
    modelUpdating: true,
    sourceApyResolved: true,
    returnPolicyResolved: true,
  }),
  "updating",
);
assert.equal(
  dayV3ReturnDisplayState({
    modelUpdating: false,
    sourceApyResolved: false,
    returnPolicyResolved: true,
  }),
  "missing-source",
);
assert.equal(
  dayV3ReturnDisplayState({
    modelUpdating: false,
    sourceApyResolved: true,
    returnPolicyResolved: false,
  }),
  "missing-policy",
);
assert.equal(
  dayV3ReturnDisplayState({
    modelUpdating: false,
    sourceApyResolved: true,
    returnPolicyResolved: true,
  }),
  "ready",
);

console.log("Day V3 atomic model snapshot state: PASS");
