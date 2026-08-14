import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3PremiumCurveEditor from "@/components/day-v3/DayV3PremiumCurveEditor";

const ignore = () => undefined;
const markup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden
    liqCapPct={20}
    liqY0Pct={1}
    liqY100Pct={15}
    liqYtPct={5}
    juniorModeledApy={0.085}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskYtPct={ignore}
    riskCapPct={80}
    riskY0Pct={2}
    riskY100Pct={16}
    riskYtPct={13}
    slpModeledApy={0.024}
    targetUtilization={0.9}
  />,
);

assert.match(markup, /Yield split/);
assert.match(markup, /aria-expanded="false"/);
assert.match(markup, /Jr 13\.0% · SLP 5\.0% at 90\.0% utilization/);
assert.match(markup, /Section status: Set/);
assert.match(markup, /See return impact/);
assert.match(markup, /Junior yield share/);
assert.match(markup, /SLP yield share/);
assert.match(markup, /Jr share at 90% utilization/);
assert.match(markup, /SLP share at 90% utilization/);
assert.match(markup, /Projected Jr APY/);
assert.match(markup, /Projected SLP APY/);
assert.match(markup, /8\.5%/);
assert.match(markup, /2\.4%/);
assert.match(markup, /Updates from the shared accountant/);
assert.match(markup, /Reset yield split/);
assert.equal(markup.match(/type="range"/g)?.length, 2);
assert.equal(markup.match(/aria-valuetext=/g)?.length, 2);
assert.equal(markup.match(/step="0.1"/g)?.length, 2);

// The unified editor exposes only the operating-target shares. The parent
// still supplies the derived zero/full anchors so they can bound each target
// slider without moving any curve or accountant math into this component.
assert.doesNotMatch(markup, /Simple/);
assert.doesNotMatch(markup, /Advanced/);
assert.doesNotMatch(markup, /Curve shape anchors/);
assert.doesNotMatch(markup, /No coverage used \(Y0\)/);
assert.doesNotMatch(markup, /All liquidity used \(Y100\)/);
assert.doesNotMatch(markup, /Confirm suggested curves/);
assert.doesNotMatch(markup, /Reset to suggested curves/);
assert.doesNotMatch(markup, /Live pool validation/);
assert.doesNotMatch(markup, /<details/);

const invalidMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden
    liqCapPct={20}
    liqY0Pct={1}
    liqY100Pct={15}
    liqYtPct={5}
    juniorModeledApy={0.085}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskYtPct={ignore}
    riskCapPct={80}
    riskY0Pct={2}
    riskY100Pct={16}
    riskYtPct={13}
    slpModeledApy={0.024}
    targetUtilization={0.9}
    validationIssues={["Junior and SLP target shares must total 100% or less."]}
  />,
);
assert.match(invalidMarkup, /target shares must total 100% or less/);
assert.match(invalidMarkup, /Adjust the highlighted yield shares/);
assert.match(invalidMarkup, /Section status: Needs input/);

const slpOnlyMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    juniorEnabled={false}
    liqCapPct={20}
    liqY0Pct={1}
    liqY100Pct={15}
    liqYtPct={5}
    juniorModeledApy={0}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskYtPct={ignore}
    riskCapPct={0}
    riskY0Pct={0}
    riskY100Pct={0}
    riskYtPct={0}
    slpModeledApy={0.024}
    targetUtilization={0.9}
  />,
);
assert.match(slpOnlyMarkup, /Compare how source yield is shared with SLP/);
assert.match(slpOnlyMarkup, /SLP yield share/);
assert.doesNotMatch(slpOnlyMarkup, /Junior yield share/);
assert.equal(slpOnlyMarkup.match(/type="range"/g)?.length, 1);

const juniorOnlyMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    liqCapPct={0}
    liqY0Pct={0}
    liqY100Pct={0}
    liqYtPct={0}
    juniorModeledApy={0.085}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskYtPct={ignore}
    riskCapPct={80}
    riskY0Pct={2}
    riskY100Pct={16}
    riskYtPct={13}
    slpEnabled={false}
    slpModeledApy={0}
    targetUtilization={0.9}
  />,
);
assert.match(juniorOnlyMarkup, /Compare how source yield is shared with Junior/);
assert.match(juniorOnlyMarkup, /Junior yield share/);
assert.doesNotMatch(juniorOnlyMarkup, /SLP yield share/);
assert.equal(juniorOnlyMarkup.match(/type="range"/g)?.length, 1);

const bothOffMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    juniorEnabled={false}
    liqCapPct={0}
    liqY0Pct={0}
    liqY100Pct={0}
    liqYtPct={0}
    juniorModeledApy={0}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskYtPct={ignore}
    riskCapPct={0}
    riskY0Pct={0}
    riskY100Pct={0}
    riskYtPct={0}
    slpEnabled={false}
    slpModeledApy={0}
    targetUtilization={0.9}
  />,
);
assert.equal(bothOffMarkup, "");

const pendingSlpMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    liqCapPct={0}
    liqY0Pct={0}
    liqY100Pct={0}
    liqYtPct={0}
    juniorModeledApy={0.085}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskYtPct={ignore}
    riskCapPct={80}
    riskY0Pct={2}
    riskY100Pct={16}
    riskYtPct={13}
    slpModeledApy={0}
    slpPending
    targetUtilization={0.9}
  />,
);
assert.match(pendingSlpMarkup, /Jr 13\.0% · SLP pending/);
assert.match(pendingSlpMarkup, /Section status: Review/);
assert.match(pendingSlpMarkup, /SLP yield share is awaiting exit validation/);
assert.equal(pendingSlpMarkup.match(/type="range"/g)?.length, 1);

console.log("Day V3 unified premium-curve editor: PASS");
