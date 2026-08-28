import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3PricingModelExplorer, {
  dayV3PricingModelDisplayCurves,
} from "@/components/day-v3/DayV3PricingModelExplorer";

const curve = { y0: 0.02, yTarget: 0.13, y100: 0.16 };
const scaling = dayV3PricingModelDisplayCurves(
  "ADAPTIVE_CURVE_V1",
  curve,
  "above",
);
assert.equal(scaling.before[0], 0);
assert.equal(scaling.after[0], 0);
assert.equal(
  scaling.after[1] / scaling.before[1],
  scaling.after[2] / scaling.before[2],
);

const shifting = dayV3PricingModelDisplayCurves(
  "ADAPTIVE_CURVE_V2",
  curve,
  "above",
);
const shifts = shifting.after.map(
  (value, index) => value - shifting.before[index],
);
assert.ok(shifts[0] > 0);
assert.ok(Math.abs(shifts[0] - shifts[1]) < 1e-12);
assert.ok(Math.abs(shifts[1] - shifts[2]) < 1e-12);

const markup = renderToStaticMarkup(
  <DayV3PricingModelExplorer
    liquidity={{ y0: 0.01, yTarget: 0.05, y100: 0.15 }}
    risk={{ y0: 0.02, yTarget: 0.13, y100: 0.16 }}
  />,
);

for (const label of [
  "Static Curve",
  "Scaling Adaptive Curve",
  "Shifting Adaptive Curve",
  "Fixed Yield Share",
]) {
  assert.match(markup, new RegExp(label));
}

assert.match(markup, /Junior risk/);
assert.match(markup, /SLP liquidity/);
assert.match(markup, /Above target/);
assert.match(markup, /Below target/);
assert.match(markup, /Y₀/);
assert.match(markup, /Y₉₀/);
assert.match(markup, /Y₁₀₀/);
assert.match(markup, /2\.0%/);
assert.match(markup, /13\.0%/);
assert.match(markup, /16\.0%/);
assert.match(markup, /Directional illustration, not a forecast/);
assert.match(markup, /Step 4 remains the source/);
assert.match(markup, /Later under sustained pressure/);
assert.match(markup, /Utilization/);
assert.match(markup, /directional curve illustration over time/);
assert.match(markup, /move by the same amount/);
assert.match(markup, /slopes stay parallel/);
assert.match(markup, /Whole curve moves up/);
assert.doesNotMatch(markup, /same shift/);
assert.equal(markup.match(/aria-pressed=/g)?.length, 8);
assert.doesNotMatch(markup, /type="range"/);
