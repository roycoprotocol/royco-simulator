import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3DesignOutcome from "@/components/day-v3/DayV3DesignOutcome";

const markup = renderToStaticMarkup(
  <DayV3DesignOutcome
    current={{
      sourceApyPct: 5.8,
      protectedDrawdownPct: 10,
      coveragePct: 9,
      juniorPer100: 11.1,
      immediateExitSharePct: 5,
      minimumProceedsPer100: 99,
      slpPer100: null,
      proceeds: null,
      seniorApyPct: null,
      juniorApyPct: null,
      slpApyPct: null,
      basis: "blocked",
      message: "No feasible pool satisfies this promise.",
    }}
  />,
);

assert.match(markup, /Protection/);
assert.match(markup, /10\.0% drawdown/);
assert.match(markup, /9\.0% minimum coverage · \$11\.1 Junior/);
assert.match(markup, /Immediate exit/);
assert.match(markup, /\$5\.0 at once/);
assert.match(markup, /Payout floor/);
assert.match(markup, /\$99/);
assert.match(markup, /Needs changes/);
assert.match(markup, /reducing exit size/);
assert.match(markup, /lowering the payout floor/);
assert.match(markup, /shortening or lowering conversion costs/);
assert.doesNotMatch(markup, /Design outcome/);
assert.doesNotMatch(markup, /Saved designs/);
assert.doesNotMatch(markup, /Save for comparison/);

console.log("Day V3 design outcome presentation: PASS");
