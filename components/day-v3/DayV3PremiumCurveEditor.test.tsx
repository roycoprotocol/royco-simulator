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
    slpCapitalPer100={11.1}
    slpMinimumLiquidityPct={10}
    slpModeledApy={0.024}
    targetUtilization={0.9}
  />,
);

assert.match(markup, /Yield split/);
assert.match(markup, /aria-expanded="false"/);
assert.match(markup, /Jr 13\.0% · SLP 5\.0% at 90\.0% utilization/);
assert.match(markup, /Section status: Set/);
assert.doesNotMatch(markup, /See .*impact/i);
assert.match(markup, /Junior yield share/);
assert.match(markup, /SLP yield share/);
assert.match(markup, /Jr share at 90% utilization/);
assert.match(markup, /SLP share at 90% utilization/);
assert.match(markup, /Projected Jr APY/);
assert.match(markup, /Projected SLP APY/);
assert.match(markup, /SLP APY basis:/);
assert.match(markup, /10\.0% illustrative Minimum Liquidity/);
assert.doesNotMatch(markup, /Exact E-CLP sizing/);
assert.match(markup, /\$11\.1 SLP per \$100 Senior/);
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
    slpCapitalPer100={11.1}
    slpMinimumLiquidityPct={10}
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
    slpCapitalPer100={11.1}
    slpMinimumLiquidityPct={10}
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
    slpCapitalPer100={0}
    slpMinimumLiquidityPct={0}
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
    slpCapitalPer100={0}
    slpMinimumLiquidityPct={0}
    slpEnabled={false}
    slpModeledApy={0}
    targetUtilization={0.9}
  />,
);
assert.equal(bothOffMarkup, "");

const unresolvedPoolSlpMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
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
    slpCapitalPer100={11.1}
    slpMinimumLiquidityPct={10}
    slpModeledApy={0.024}
    targetUtilization={0.9}
  />,
);
assert.match(unresolvedPoolSlpMarkup, /Jr 13\.0% · SLP 5\.0%/);
assert.match(unresolvedPoolSlpMarkup, /Section status: Set/);
assert.match(unresolvedPoolSlpMarkup, /SLP APY basis:/);
assert.doesNotMatch(unresolvedPoolSlpMarkup, /awaiting exit validation/);
assert.equal(unresolvedPoolSlpMarkup.match(/type="range"/g)?.length, 2);

console.log("Day V3 unified premium-curve editor: PASS");
