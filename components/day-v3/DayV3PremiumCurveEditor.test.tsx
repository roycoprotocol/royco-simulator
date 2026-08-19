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
    onLiqY0Pct={ignore}
    onLiqYtPct={ignore}
    onLiqY100Pct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskYtPct={ignore}
    onRiskY100Pct={ignore}
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
assert.match(
  markup,
  /Jr 2\.0% \/ 13\.0% \/ 16\.0% · SLP 1\.0% \/ 5\.0% \/ 15\.0% · Y0 \/ YT \/ Y100/,
);
assert.match(markup, /Section status: Set/);
assert.doesNotMatch(markup, /See .*impact/i);
assert.match(markup, /Junior risk yield curve/);
assert.match(markup, /SLP liquidity yield curve/);
for (const label of [
  "Jr Y0 · 0% utilization",
  "Jr YT · 90% utilization",
  "Jr Y100 · 100% utilization",
  "SLP Y0 · 0% utilization",
  "SLP YT · 90% utilization",
  "SLP Y100 · 100% utilization",
]) {
  assert.match(markup, new RegExp(label));
}
assert.match(markup, /Projected Jr APY/);
assert.match(markup, /Projected SLP APY/);
assert.doesNotMatch(markup, /Exact E-CLP sizing/);
// The "Why the SLP rate is what it is" note and its three assertions are gone
// with the paragraph, removed at the issuer's request. Nothing replaced it: the
// SLP rate's basis is still disclosed by the exit model, and the editor is now
// the two curves and their projected APYs.
assert.doesNotMatch(markup, /Why the SLP rate is what it is/);
assert.match(markup, /8\.5%/);
assert.match(markup, /2\.4%/);
assert.match(markup, /Updates from the shared accountant/);
assert.match(markup, /Reset yield split/);
assert.equal(markup.match(/type="range"/g)?.length, 6);
assert.equal(markup.match(/aria-valuetext=/g)?.length, 6);
assert.equal(markup.match(/step="0.1"/g)?.length, 6);

// The unified editor exposes the same three anchors consumed by each contract
// YDM, while the parent owns validation and accountant routing.
assert.doesNotMatch(markup, /Simple/);
assert.doesNotMatch(markup, /Advanced/);
assert.doesNotMatch(markup, /Curve shape anchors/);
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
    onLiqY0Pct={ignore}
    onLiqYtPct={ignore}
    onLiqY100Pct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskYtPct={ignore}
    onRiskY100Pct={ignore}
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
    onLiqY0Pct={ignore}
    onLiqYtPct={ignore}
    onLiqY100Pct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskYtPct={ignore}
    onRiskY100Pct={ignore}
    riskCapPct={0}
    riskY0Pct={0}
    riskY100Pct={0}
    riskYtPct={0}
    slpModeledApy={0.024}
    targetUtilization={0.9}
  />,
);
assert.match(slpOnlyMarkup, /Compare how source yield is shared with SLP/);
assert.match(slpOnlyMarkup, /SLP liquidity yield curve/);
assert.doesNotMatch(slpOnlyMarkup, /Junior risk yield curve/);
assert.equal(slpOnlyMarkup.match(/type="range"/g)?.length, 3);

const juniorOnlyMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    liqCapPct={0}
    liqY0Pct={0}
    liqY100Pct={0}
    liqYtPct={0}
    juniorModeledApy={0.085}
    onLiqY0Pct={ignore}
    onLiqYtPct={ignore}
    onLiqY100Pct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskYtPct={ignore}
    onRiskY100Pct={ignore}
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
assert.match(juniorOnlyMarkup, /Junior risk yield curve/);
assert.doesNotMatch(juniorOnlyMarkup, /SLP liquidity yield curve/);
assert.equal(juniorOnlyMarkup.match(/type="range"/g)?.length, 3);

const bothOffMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    juniorEnabled={false}
    liqCapPct={0}
    liqY0Pct={0}
    liqY100Pct={0}
    liqYtPct={0}
    juniorModeledApy={0}
    onLiqY0Pct={ignore}
    onLiqYtPct={ignore}
    onLiqY100Pct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskYtPct={ignore}
    onRiskY100Pct={ignore}
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

const unresolvedPoolSlpMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    liqCapPct={20}
    liqY0Pct={1}
    liqY100Pct={15}
    liqYtPct={5}
    juniorModeledApy={0.085}
    onLiqY0Pct={ignore}
    onLiqYtPct={ignore}
    onLiqY100Pct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskYtPct={ignore}
    onRiskY100Pct={ignore}
    riskCapPct={80}
    riskY0Pct={2}
    riskY100Pct={16}
    riskYtPct={13}
    slpModeledApy={0.024}
    targetUtilization={0.9}
  />,
);
assert.match(
  unresolvedPoolSlpMarkup,
  /Jr 2\.0% \/ 13\.0% \/ 16\.0% · SLP 1\.0% \/ 5\.0% \/ 15\.0%/,
);
assert.match(unresolvedPoolSlpMarkup, /Section status: Set/);
assert.doesNotMatch(unresolvedPoolSlpMarkup, /awaiting exit validation/);
assert.equal(unresolvedPoolSlpMarkup.match(/type="range"/g)?.length, 6);

console.log("Day V3 unified premium-curve editor: PASS");
