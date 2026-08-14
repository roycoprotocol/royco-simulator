import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3PremiumCurveEditor from "@/components/day-v3/DayV3PremiumCurveEditor";

const ignore = () => undefined;
const markup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden
    ready
    startingCurveBasis="Junior YT starts at the capital-parity floor."
    liqCapPct={20}
    liqY0Pct={1}
    liqY100Pct={15}
    liqYtPct={5}
    juniorModeledApy={0.085}
    onLiqY0Pct={ignore}
    onLiqY100Pct={ignore}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskY100Pct={ignore}
    onRiskYtPct={ignore}
    riskCapPct={80}
    riskY0Pct={2}
    riskY100Pct={16}
    riskYtPct={13}
    slpModeledApy={0.024}
    seniorShareOfCapital={0.8}
    sourceApy={0.06}
    targetUtilization={0.9}
  />,
);

assert.match(markup, /Yield split/);
assert.match(markup, /aria-expanded="false"/);
assert.match(markup, /Custom curves · Jr 13\.0% · SLP 5\.0% at 90\.0%/);
assert.match(markup, /Section status: Complete/);
assert.match(markup, /Junior premium curve/);
assert.match(markup, /SLP premium curve/);
assert.match(markup, /Curve shape anchors/);
assert.match(markup, /Set the shares paid at zero and full utilization/);
assert.doesNotMatch(markup, /Customize curve shape/);
assert.doesNotMatch(markup, /<details/);
assert.match(markup, /Reset to suggested curves/);
assert.match(markup, /Y100 is a full-utilization anchor/);
assert.match(markup, /not a deployment hard cap/);
assert.match(markup, /Slider maximum: 80.0% of Senior yield/);
assert.match(markup, /Source APY changes modeled returns/);
assert.match(markup, /not these yield-share percentages/);
assert.match(markup, /Junior YT starts at the capital-parity floor/);
assert.match(markup, /capital-parity floor/);
assert.doesNotMatch(markup, /modeled cap passed to deployment/);
assert.doesNotMatch(markup, /Reset both curves/);
assert.equal(markup.match(/type="range"/g)?.length, 6);
assert.equal(markup.match(/step="0.0001"/g)?.length, 6);
assert.match(markup, /At 90% coverage utilization \(YT\)/);
assert.match(markup, /At 90% liquidity utilization \(YT\)/);
assert.match(markup, /Modeled Jr return/);
assert.match(markup, /Modeled SLP return/);
assert.doesNotMatch(markup, /Observation period/);
assert.doesNotMatch(markup, /Maximum discount/);

const invalidMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden
    ready={false}
    liqCapPct={20}
    liqY0Pct={1}
    liqY100Pct={15}
    liqYtPct={5}
    juniorModeledApy={0.085}
    onLiqY0Pct={ignore}
    onLiqY100Pct={ignore}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskY100Pct={ignore}
    onRiskYtPct={ignore}
    riskCapPct={80}
    riskY0Pct={2}
    riskY100Pct={16}
    riskYtPct={13}
    slpModeledApy={0.024}
    seniorShareOfCapital={0.8}
    sourceApy={0.06}
    targetUtilization={0.9}
    validationIssues={[
      "This uncapped simulation requires the Junior and SLP full-utilization anchors to total 100% or less. Deployment hard caps are configured separately.",
    ]}
  />,
);
assert.match(invalidMarkup, /anchors to total 100% or less/);
assert.match(invalidMarkup, /hard caps are configured separately/);
assert.match(invalidMarkup, /Waiting for the exit-pool result/);
assert.match(invalidMarkup, /SLP pending/);
assert.match(invalidMarkup, /Section status: Incomplete/);

const starterMarkup = renderToStaticMarkup(
  <DayV3PremiumCurveEditor
    curveOverridden={false}
    ready={false}
    starterDefaultsLoaded
    liqCapPct={73}
    liqY0Pct={4}
    liqY100Pct={42.5}
    liqYtPct={20}
    juniorModeledApy={0.202}
    onLiqY0Pct={ignore}
    onLiqY100Pct={ignore}
    onLiqYtPct={ignore}
    onResetCurve={ignore}
    onRiskY0Pct={ignore}
    onRiskY100Pct={ignore}
    onRiskYtPct={ignore}
    riskCapPct={80}
    riskY0Pct={10.8}
    riskY100Pct={57.5}
    riskYtPct={27}
    slpModeledApy={0.145}
    seniorShareOfCapital={0.78}
    sourceApy={0.08}
    targetUtilization={0.9}
  />,
);
// `ready={false}` represents unresolved live exit validation. Six valid YDM
// anchors are still a complete issuer input; handoff validation is separate.
assert.match(
  starterMarkup,
  /Suggested curves · Jr 27\.0% · SLP 20\.0% at 90\.0%/,
);
assert.match(starterMarkup, /Section status: Complete/);
assert.match(starterMarkup, /Your six YDM anchors are complete/);
assert.match(starterMarkup, /Live pool validation is handled separately/);
assert.doesNotMatch(starterMarkup, /SLP pending/);

console.log("Day V3 premium-curve editor presentation: PASS");
