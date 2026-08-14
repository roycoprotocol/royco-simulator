import assert from "node:assert/strict";

import { nextDayV3ModelOpenId } from "@/components/day-v3/DayV3ModelGroup";

assert.equal(nextDayV3ModelOpenId(null, "capital"), "capital");
assert.equal(
  nextDayV3ModelOpenId("capital", "risk"),
  "risk",
  "opening one model group closes the previous group",
);
assert.equal(nextDayV3ModelOpenId("risk", "risk"), null);

console.log("Day V3 model accordion: PASS");
