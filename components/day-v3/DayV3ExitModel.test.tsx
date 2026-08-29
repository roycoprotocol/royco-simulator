import assert from "node:assert/strict";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3ExitCost from "@/components/day-v3/DayV3ExitCost";
import DayV3ExitModel from "@/components/day-v3/DayV3ExitModel";
import DayV3Goals, { type DayV3ExitView } from "@/components/day-v3/DayV3Goals";
import DayV3RestockCheck from "@/components/day-v3/DayV3RestockCheck";
import {
  dayV3RestockCheck,
  dayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";
import type { DayExplainerMetrics } from "@/lib/day-simulator-template/explainer";

const resolved: DayV3ExitView = {
  status: "recommended",
  message: "Resolved from the live template.",
  sellablePer100: 10,
  proceeds: 9.62,
  lowestPayoutPer100: 96.2,
  slpPer100: 12.4,
  restockPoint: 71,
  restockOperationalHurdleBps: 40,
  restockHurdleBps: 50,
  restockMarginBps: 54,
  minimumLiquidityPct: 10.9,
  maximumDiscountPct: 4.25,
  lambda: 100,
  maximumPremiumBps: 20,
  restingExitAssetPct: 90,
  restingSeniorPct: 10,
  swapFeeBps: 10,
  feeSource: "Ethereum template at a live block.",
};

const resolvedMarkup = renderToStaticMarkup(
  <DayV3ExitModel
    exit={resolved}
    minimumProceedsPer100={95}
    promisedExitSharePct={10}
  />,
);

assert.match(resolvedMarkup, /data-model-state="recommended"/);
assert.match(resolvedMarkup, /data-model-source="canonical-rwa-eclp-service"/);
// Issuer goals and modeled results use the same bps units on both comparisons.
assert.match(resolvedMarkup, /Depth at NAV you set/);
assert.match(resolvedMarkup, /Depth the pool has/);
assert.match(resolvedMarkup, /Maximum discount you set/);
assert.match(resolvedMarkup, /Maximum discount the pool has/);
assert.match(resolvedMarkup, /1000 bps/);
assert.match(resolvedMarkup, /500 bps/);
assert.match(resolvedMarkup, /380 bps/);
assert.match(resolvedMarkup, /Proceeds: \$9\.62 after the canonical pool swap fee/);
// The swap fee, minimum liquidity and maximum discount are pool terms, not
// results of this comparison, and the cards that depend on them state them.
assert.doesNotMatch(resolvedMarkup, /Swap fee: /);
assert.doesNotMatch(resolvedMarkup, /Minimum liquidity: /);
assert.doesNotMatch(resolvedMarkup, /Maximum discount: /);
assert.doesNotMatch(resolvedMarkup, /Live policy:/);
// SLP funding and the refill point are stated once each, in the exit result
// band and in the arbitrage test. This card does not repeat them.
assert.doesNotMatch(resolvedMarkup, /SLP required/);
assert.doesNotMatch(resolvedMarkup, /Refill point|Deploy only/);

const illustrative: DayV3ExitView = {
  ...resolved,
  status: "illustrative",
  message:
    "Illustrative simulation default: 10% minimum liquidity, 1% maximum discount, and 10 bps swap-fee assumption.",
  restockPoint: null,
  feeSource: null,
};
const illustrativeMarkup = renderToStaticMarkup(
  <DayV3ExitModel
    exit={illustrative}
    minimumProceedsPer100={95}
    promisedExitSharePct={10}
  />,
);

assert.match(illustrativeMarkup, /data-model-state="illustrative"/);
assert.match(
  illustrativeMarkup,
  /data-model-source="shared-day-engine-illustrative-default"/,
);
assert.match(
  illustrativeMarkup,
  /Shows how the selected depth and maximum discount affect one trade/,
);
assert.match(illustrativeMarkup, /Depth the pool has/);
assert.match(illustrativeMarkup, /Proceeds: \$9\.62 after the modeled swap fee/);
assert.doesNotMatch(illustrativeMarkup, />—</);

const unresolved: DayV3ExitView = {
  ...resolved,
  status: "resolving",
  message: "Refreshing the canonical result.",
};
const unresolvedMarkup = renderToStaticMarkup(
  <DayV3ExitModel
    exit={unresolved}
    minimumProceedsPer100={95}
    promisedExitSharePct={10}
  />,
);

assert.match(unresolvedMarkup, /data-model-state="resolving"/);
assert.match(
  unresolvedMarkup,
  /Refreshing the canonical pool and recalculating this model/,
);
assert.doesNotMatch(unresolvedMarkup, /Proceeds:/);

const disabled: DayV3ExitView = {
  ...resolved,
  status: "disabled",
  message: "Immediate Senior exit is off.",
  sellablePer100: 0,
  proceeds: 0,
  lowestPayoutPer100: 0,
  slpPer100: 0,
  minimumLiquidityPct: 0,
  maximumDiscountPct: null,
  lambda: null,
  maximumPremiumBps: null,
  restingExitAssetPct: null,
  restingSeniorPct: null,
  swapFeeBps: null,
  feeSource: null,
};
const disabledMarkup = renderToStaticMarkup(
  <DayV3ExitModel
    exit={disabled}
    minimumProceedsPer100={0}
    promisedExitSharePct={0}
  />,
);
assert.match(disabledMarkup, /data-model-state="disabled"/);
assert.match(
  disabledMarkup,
  /data-model-source="issuer-goal-no-immediate-exit"/,
);
assert.match(disabledMarkup, /no SLP or pool execution/);
assert.match(disabledMarkup, /Depth at NAV/);
assert.match(disabledMarkup, />0 bps</);
assert.match(disabledMarkup, />\$0\.00</);
assert.match(disabledMarkup, />0\.00%?</);
assert.doesNotMatch(disabledMarkup, /Swap fee:/);
assert.doesNotMatch(
  [resolvedMarkup, illustrativeMarkup, unresolvedMarkup, disabledMarkup].join(
    "\n",
  ),
  /\bpromis(?:e|ed|es|ing)\b/i,
);

const emptyQuote = {
  requestedNAV: 0,
  filledNAV: 0,
  effectiveInputNAV: 0,
  swapFeeNAV: 0,
  stableOutNAV: 0,
  unfilledNAV: 0,
  executionPrice: 0,
  slippage: 1,
  poolPctSTAfter: 0.1,
};
const noSlpMetrics: DayExplainerMetrics["liquidity"] = {
  arbitrageReference: 0.01,
  referenceSellNAV: 0,
  referenceSellShareOfSenior: 0,
  referenceQuote: emptyQuote,
  boundarySellNAV: 0,
  boundarySellShareOfSenior: 0,
  boundaryQuote: emptyQuote,
  curve: [{
    sellNAV: 0,
    effectiveInputNAV: 0,
    swapFeeNAV: 0,
    executionPrice: 0,
    slippage: 1,
  }],
};
const exitCostMarkup = renderToStaticMarkup(
  <DayV3ExitCost
    assumptions={{
      bandPct: 4.3,
      concentration: 100,
      stableYield: 0,
      swapFeeBps: 10,
      turnoverPerYear: 0,
    }}
    metrics={noSlpMetrics}
    unit="USD"
  />,
);
assert.match(exitCostMarkup, /seller&#x27;s payout changes/);
assert.match(exitCostMarkup, /includes the pool&#x27;s/);
assert.match(exitCostMarkup, /no secondary pool route/);
assert.match(exitCostMarkup, /primary in-kind redemption queue/);
assert.doesNotMatch(exitCostMarkup, /early exit is unavailable/);

const fundedQuote = {
  requestedNAV: 10,
  filledNAV: 10,
  effectiveInputNAV: 9.99,
  swapFeeNAV: 0.01,
  stableOutNAV: 9.94,
  unfilledNAV: 0,
  executionPrice: 0.994,
  slippage: 0.006,
  poolPctSTAfter: 1,
};
const fundedExitCostMarkup = renderToStaticMarkup(
  <DayV3ExitCost
    assumptions={{
      bandPct: 1,
      concentration: 100,
      stableYield: 0,
      swapFeeBps: 10,
      turnoverPerYear: 0,
    }}
    metrics={{
      arbitrageReference: 0.01,
      referenceSellNAV: 10,
      referenceSellShareOfSenior: 0.1,
      referenceQuote: fundedQuote,
      boundarySellNAV: 10,
      boundarySellShareOfSenior: 0.1,
      boundaryQuote: fundedQuote,
      curve: [
        {
          sellNAV: 10,
          effectiveInputNAV: 9.99,
          swapFeeNAV: 0.01,
          executionPrice: 0.994,
          slippage: 0.006,
        },
      ],
    }}
    unit="USD"
  />,
);
assert.match(fundedExitCostMarkup, />\$0\.06</);
assert.match(
  fundedExitCostMarkup,
  /\$0\.01 fee \+ \$0\.05 price impact/,
  "small swap costs stay visible instead of rounding to $0",
);

const noop = () => undefined;
const goalsProps = {
  drawdownPct: 15,
  exitSharePct: 10,
  minimumProceedsPer100: 95,
  onDrawdownPct: noop,
  onExitSharePct: noop,
  onMinimumProceedsPer100: noop,
  onPoolTurnoverPerYear: noop,
  onQuoteAssetLabel: noop,
  onQuoteAssetYieldPct: noop,
  onRecoveryDays: noop,
  onRecoveryMode: noop,
  onResetExit: noop,
  onResetProtection: noop,
  onSwapFeeBps: noop,
  protection: {
    coveragePct: 15,
    juniorPer100: 20,
    juniorApy: 9,
    status: "recommended",
    message: "Senior remains whole.",
  },
  poolTurnoverPerYear: 0,
  quoteAssetLabel: "USDC",
  quoteAssetYieldPct: 0,
  recoveryDays: 7,
  recoveryMode: "window",
  swapFeeBps: null,
  defaultPremiumBps: 7.06,
  onPoolPremiumBps: () => undefined,
  poolPremiumBps: null,
  restingSeniorWeight: 0.1,
} satisfies Omit<ComponentProps<typeof DayV3Goals>, "exit">;

const goalsMarkup = renderToStaticMarkup(
  <DayV3Goals {...goalsProps} exit={resolved} />,
);
assert.match(goalsMarkup, /Senior protection/);
assert.match(
  goalsMarkup,
  /Choose whether Senior needs protection and the loss it should survive/,
);
assert.match(goalsMarkup, /Senior exit/);
assert.match(
  goalsMarkup,
  /Choose whether Senior needs an immediate exit and how it should perform/,
);
assert.match(goalsMarkup, /aria-expanded="false"/);
assert.equal(
  (goalsMarkup.match(/data-collapsible="true"/g) ?? []).length,
  2,
  "the unified goal editor exposes only the protection and exit groups",
);
assert.doesNotMatch(goalsMarkup, /Deployment mapping/);
assert.match(
  goalsMarkup,
  /Goal: 15\.0% source drawdown · Contract: 15\.0% Minimum Coverage · \$20\.0 Junior at 90% target · 7-day observation period/,
);
assert.doesNotMatch(goalsMarkup, /drop → .*coverage/i);
assert.match(
  goalsMarkup,
  /1000 bps depth at NAV → \$12\.4 SLP · \$9\.6 proceeds · 500 bps maximum discount/,
);
assert.equal(
  (goalsMarkup.match(/Section status: Set/g) ?? []).length,
  2,
  "both goal groups are complete when every modeled input is present",
);
assert.match(goalsMarkup, /aria-required="true"/);
assert.match(goalsMarkup, /aria-labelledby="day-v3-number-/);
assert.doesNotMatch(goalsMarkup, /aria-label="Required"/);
assert.match(goalsMarkup, /Should Senior have first-loss protection/);
assert.match(goalsMarkup, /How should temporary losses be observed/);
assert.match(goalsMarkup, /aria-label="Observation mode"/);
assert.match(goalsMarkup, /Allow recovery/);
assert.match(goalsMarkup, /How long should a temporary loss have to recover/);
assert.match(goalsMarkup, /Observation Period Duration/);
assert.match(goalsMarkup, /Should Senior have an immediate pool exit/);
assert.doesNotMatch(goalsMarkup, /Refill feasibility assumptions/);
assert.doesNotMatch(goalsMarkup, /Senior redemption wait/);
assert.doesNotMatch(goalsMarkup, /Underlying-to-exit conversion time/);
assert.doesNotMatch(goalsMarkup, /Stressed conversion cost per \$100/);
assert.doesNotMatch(goalsMarkup, /<details/);
assert.doesNotMatch(goalsMarkup, /solver/i);
assert.doesNotMatch(goalsMarkup, /Recovery timing/);
assert.doesNotMatch(goalsMarkup, /Protected Exit/);
assert.doesNotMatch(goalsMarkup, /Restock hurdle/);
assert.doesNotMatch(goalsMarkup, /day-v3-deployment-setup-inputs/);
assert.doesNotMatch(goalsMarkup, /day-v3-premium-inputs/);
assert.doesNotMatch(goalsMarkup, /day-v3-protected-exit-inputs/);
assert.match(goalsMarkup, /How much Senior depth should be available at NAV/);
assert.match(goalsMarkup, /What is the maximum discount to NAV/);
assert.match(goalsMarkup, /value="1000"/);
assert.match(goalsMarkup, /value="500"/);
// The input sections no longer restate results. SLP funding and Minimum
// Liquidity belong to the capital stack, the payout floor and proceeds to the
// exit model; repeating them beside the controls made a reader check two
// places for one number and cost roughly 300px of the questionnaire.
for (const moved of [
  /SLP required/,
  /Minimum Liquidity/,
  /Lowest payout/,
  /Expected proceeds/,
  />\$12\.4</,
  />10\.90%</,
  />\$96\.2</,
]) {
  assert.doesNotMatch(goalsMarkup, moved);
}
// The collapsed section header still carries the headline result, so the
// numbers have not simply vanished from this surface.
assert.match(
  goalsMarkup,
  /1000 bps depth at NAV → \$12\.4 SLP · \$9\.6 proceeds · 500 bps maximum discount/,
);
assert.doesNotMatch(goalsMarkup, /of \$100/);
assert.doesNotMatch(goalsMarkup, /See .*impact/i);

// The pool's swap fee is the issuer's to set, with a market-declared default. An
// empty field is labelled for what it is — the fee the model is assuming — and
// a typed one is never presented as the template's own policy.
assert.match(
  goalsMarkup,
  /What swap fee should the pool charge on a sale\?/,
);
assert.match(goalsMarkup, /Use the market fee/);
assert.match(goalsMarkup, /Model assumption/);
assert.doesNotMatch(goalsMarkup, /Manual override/);

const handSetFeeMarkup = renderToStaticMarkup(
  <DayV3Goals {...goalsProps} exit={resolved} swapFeeBps={30} />,
);
assert.match(handSetFeeMarkup, /Manual override/);
assert.doesNotMatch(handSetFeeMarkup, /Live template|Product policy/);
// The field mirrors Gyro's inclusive contract bounds; render-time engine errors
// remain surfaced by the model/backtest error paths.
assert.match(handSetFeeMarkup, /min="0\.01"/);
assert.match(handSetFeeMarkup, /max="10000"/);

const protectionStart = goalsMarkup.indexOf('id="day-v3-protection-inputs"');
const observationMode = goalsMarkup.indexOf('aria-label="Observation mode"');
const exitStart = goalsMarkup.indexOf('id="day-v3-exit-inputs"');
assert.ok(
  protectionStart >= 0 &&
    observationMode > protectionStart &&
    exitStart > observationMode,
  "observation-mode configuration remains inside Senior protection",
);

const missingObservationMarkup = renderToStaticMarkup(
  <DayV3Goals {...goalsProps} exit={resolved} recoveryDays={null} />,
);
assert.match(missingObservationMarkup, /Section status: Missing/);
assert.match(
  missingObservationMarkup,
  /data-section-status="incomplete">Missing/,
);

const checkingMarkup = renderToStaticMarkup(
  <DayV3Goals
    {...goalsProps}
    exit={{
      ...resolved,
      status: "resolving",
      message: "Refreshing the canonical result.",
    }}
  />,
);
assert.match(checkingMarkup, /Section status: Set/);
assert.match(checkingMarkup, /data-section-status="complete">Set/);
// A refreshing pool no longer draws its own illustrative tiles beside the
// inputs; the section header keeps carrying the last valid figures.
assert.doesNotMatch(checkingMarkup, /Illustrative SLP|Illustrative liquidity/);

const infeasibleMarkup = renderToStaticMarkup(
  <DayV3Goals
    {...goalsProps}
    exit={{
      ...resolved,
      status: "infeasible",
      message:
        "No deployable pool can meet these exit terms. Reduce the immediate exit amount, accept a lower payout, or shorten settlement and conversion time.",
      sellablePer100: null,
      proceeds: null,
      lowestPayoutPer100: null,
      slpPer100: null,
      restockPoint: null,
    }}
  />,
);
assert.match(infeasibleMarkup, /Section status: Needs changes/);
assert.match(infeasibleMarkup, /data-section-status="blocked">Needs changes/);
assert.doesNotMatch(infeasibleMarkup, /\bpromis(?:e|ed|es|ing)\b/i);
assert.match(infeasibleMarkup, /no feasible pool/);
assert.match(infeasibleMarkup, /do not produce a viable immediate exit/);
assert.doesNotMatch(infeasibleMarkup, /Try \$/);

const unavailableMarkup = renderToStaticMarkup(
  <DayV3Goals
    {...goalsProps}
    exit={{
      ...resolved,
      status: "unresolved",
      message: "The canonical service could not be reached.",
    }}
  />,
);
assert.match(unavailableMarkup, /Section status: Set/);
assert.match(unavailableMarkup, /data-section-status="complete">Set/);
assert.doesNotMatch(unavailableMarkup, /Exact E-CLP sizing/);
assert.doesNotMatch(unavailableMarkup, /Scenario APYs continue/);
assert.doesNotMatch(unavailableMarkup, /Finalize in Royco Deploy/);
assert.doesNotMatch(unavailableMarkup, /Retry validation/);

// The arbitrage panel prices one pool: the deepest fill it can do, and the
// fill the promised exit takes. Nothing is stitched from two sources.
const restockHurdle = dayV3RestockHurdle({
  costOfCapitalPct: 20,
  redemptionDays: 30,
  seniorApyPct: 4,
  swapFeeBps: 10,
});
const restockView = {
  check: dayV3RestockCheck({
    hurdle: restockHurdle,
    selectedDiscountBps: 260,
    worstCaseDiscountBps: 263,
  }),
  hurdle: restockHurdle,
  maximumDiscountPct: 5,
  maximumDiscountSource: "payout-floor" as const,
  policyBasis: "unresolved" as const,
  selectedCurveInputPer100: 9.995,
  selectedProceedsPer100: 9.735,
  selectedSalePer100: 10,
  selectedFilledPer100: 10,
  selectedUnfilledPer100: 0,
  unit: "USD",
};

const restockMarkup = renderToStaticMarkup(
  <DayV3RestockCheck
    costOfCapitalPct={20}
    onCostOfCapitalPct={noop}
    onRedemptionDays={noop}
    redemptionDays={30}
    view={restockView}
  />,
);
assert.match(restockMarkup, /data-model-source="shared-day-engine-illustrative-default"/);
assert.match(restockMarkup, /illustrative pool/);
// The band the payout floor set is named, because it is the reason the
// discount is what it is.
assert.match(restockMarkup, /500 bps maximum discount/);
assert.match(restockMarkup, /is set by your maximum discount/);
assert.match(restockMarkup, /Buys Senior below NAV/);
assert.match(restockMarkup, /annual restock hurdle rate/);
assert.match(restockMarkup, /Restock hurdle cleared/);
assert.match(restockMarkup, /Margin above restock hurdle/);
assert.doesNotMatch(restockMarkup, /cost of capital/i);
assert.doesNotMatch(restockMarkup, /break[- ]even/i);

// A canonical pool solved its own band; saying the payout floor set it named the
// wrong pool, and it was named beside quotes taken off the canonical curve.
assert.match(
  renderToStaticMarkup(
    <DayV3RestockCheck
      costOfCapitalPct={20}
      onCostOfCapitalPct={noop}
      onRedemptionDays={noop}
      redemptionDays={30}
      view={{ ...restockView, maximumDiscountSource: "live-template" }}
    />,
  ),
  /the canonical pool solved for/,
);

// A sale the pool cannot absorb is shown at its capacity boundary, while the
// copy makes clear that the requested exact-input trade would revert atomically.
const partialMarkup = renderToStaticMarkup(
  <DayV3RestockCheck
    costOfCapitalPct={20}
    onCostOfCapitalPct={noop}
    onRedemptionDays={noop}
    redemptionDays={30}
    view={{
      ...restockView,
      selectedFilledPer100: 4,
      selectedUnfilledPer100: 6,
    }}
  />,
);
assert.match(partialMarkup, /maximum atomic order below NAV/);
assert.match(partialMarkup, /requested \$10\.00 exit is too large/);
assert.match(partialMarkup, /largest order this pool can accept is \$4\.00/);
assert.match(partialMarkup, /not partially filled/);

// A market quoted in ETH never gets a dollar sign in front of a number of ETH.
const ethMarkup = renderToStaticMarkup(
  <DayV3RestockCheck
    costOfCapitalPct={20}
    onCostOfCapitalPct={noop}
    onRedemptionDays={noop}
    redemptionDays={30}
    view={{ ...restockView, unit: "ETH" }}
  />,
);
assert.doesNotMatch(ethMarkup, /\$/);
assert.match(ethMarkup, /per 100 of Senior/);

// An exit with no quote has no margin. Substituting zero rendered a green
// "+0 bps" under the words "They lose ... below zero".
const unpricedMarkup = renderToStaticMarkup(
  <DayV3RestockCheck
    costOfCapitalPct={20}
    onCostOfCapitalPct={noop}
    onRedemptionDays={noop}
    redemptionDays={30}
    view={{
      ...restockView,
      check: dayV3RestockCheck({
        hurdle: restockHurdle,
        selectedDiscountBps: null,
        worstCaseDiscountBps: 500,
      }),
    }}
  />,
);
assert.doesNotMatch(unpricedMarkup, /They lose/);
assert.doesNotMatch(unpricedMarkup, /\+0\.0 bps/);

const liveMarkup = renderToStaticMarkup(
  <DayV3RestockCheck
    costOfCapitalPct={20}
    onCostOfCapitalPct={noop}
    onRedemptionDays={noop}
    redemptionDays={30}
    view={{ ...restockView, policyBasis: "live" }}
  />,
);
assert.match(liveMarkup, /data-model-source="canonical-rwa-eclp-service"/);
assert.doesNotMatch(liveMarkup, /illustrative pool/);

console.log("Day V3 exit-model presentation: PASS");
