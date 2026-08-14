import assert from "node:assert/strict";

import {
  nextDayV3AccordionOpenId,
} from "@/components/day-v3/DayV3Group";

assert.equal(
  nextDayV3AccordionOpenId(null, "source"),
  "source",
  "a closed accordion opens the requested section",
);
assert.equal(
  nextDayV3AccordionOpenId("source", "protection"),
  "protection",
  "opening a different section replaces the currently open section",
);
assert.equal(
  nextDayV3AccordionOpenId("protection", "protection"),
  null,
  "clicking the open section closes it",
);

console.log("Day V3 input accordion: PASS");
