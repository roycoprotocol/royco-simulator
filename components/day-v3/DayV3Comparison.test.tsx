import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { DayV3PoolCarryLines } from "@/components/day-v3/DayV3Comparison";

const markup = renderToStaticMarkup(
  <DayV3PoolCarryLines
    breakdown={{
      seniorShareCarry: 0.008,
      exitAssetCarry: 0,
      swapFeeIncome: 0,
    }}
    poolEconomics={{
      seniorWeight: 0.1,
      stableYield: 0,
      swapFeeBps: 10,
      turnoverPerYear: 0,
    }}
    source={0.08}
    total={0.008}
  />,
);

assert.match(markup, /Pool carry/);
assert.match(markup, /Senior shares/);
assert.match(markup, /10\.0% of pool · 8\.0% source APY/);
assert.match(markup, /Exit asset/);
assert.match(markup, /90\.0% of pool · 0\.0% modeled yield/);
assert.match(markup, /Swap fees/);
assert.match(markup, /10 bps execution · no annual volume forecast/);
assert.match(markup, /\+0\.80%/);
assert.equal((markup.match(/\+0\.00%/g) ?? []).length, 2);
assert.match(markup, /Pool carry subtotal/);

console.log("Day V3 position carry breakdown: PASS");
