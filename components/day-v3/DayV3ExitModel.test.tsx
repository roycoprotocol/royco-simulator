import assert from "node:assert/strict";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3ExitCost from "@/components/day-v3/DayV3ExitCost";
import DayV3ExitModel from "@/components/day-v3/DayV3ExitModel";
import DayV3Goals, { type DayV3ExitView } from "@/components/day-v3/DayV3Goals";
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
    policyProvenance="Balancer V3 ECLP · Ethereum · block 123 · refreshed today"
    promisedExitSharePct={10}
  />,
);

assert.match(resolvedMarkup, /data-model-state="recommended"/);
assert.match(resolvedMarkup, /data-model-source="canonical-rwa-eclp-service"/);
assert.match(resolvedMarkup, /Sell-now goal \/ \$100/);
assert.match(resolvedMarkup, /Modeled capacity \/ \$100/);
assert.match(resolvedMarkup, /Minimum payout \/ \$100/);
assert.match(resolvedMarkup, /Lowest modeled payout \/ \$100/);
assert.match(resolvedMarkup, />\$9\.62</);
assert.match(resolvedMarkup, />\$12\.40</);
assert.match(resolvedMarkup, />71\.0%?</);
assert.match(resolvedMarkup, /Swap fee: 10 bps/);
assert.match(resolvedMarkup, /Minimum liquidity: 10\.90%/);
assert.match(
  resolvedMarkup,
  /Live policy: Balancer V3 ECLP · Ethereum · block 123 · refreshed today/,
);

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
assert.match(illustrativeMarkup, /illustrative starter pool/);
assert.match(illustrativeMarkup, /Modeled capacity/);
assert.match(illustrativeMarkup, /after the modeled swap fee/);
assert.match(illustrativeMarkup, />\$9\.62</);
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
  /Refreshing the live template and recalculating this model/,
);
assert.doesNotMatch(unresolvedMarkup, />\$9\.62</);
assert.doesNotMatch(unresolvedMarkup, />\$12\.40</);

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
assert.match(disabledMarkup, /no SLP or pool execution promise/);
assert.match(disabledMarkup, /Sell-now promise/);
assert.match(disabledMarkup, />\$0\.00</);
assert.match(disabledMarkup, />0\.00%?</);
assert.doesNotMatch(disabledMarkup, /Swap fee:/);

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
assert.match(exitCostMarkup, /Every quote is all-in/);
assert.match(exitCostMarkup, /deducted before E-CLP pricing/);
assert.match(exitCostMarkup, /retained by SLP/);
assert.match(exitCostMarkup, /no secondary pool route/);
assert.match(exitCostMarkup, /primary in-kind redemption queue/);
assert.doesNotMatch(exitCostMarkup, /early exit is unavailable/);

const noop = () => undefined;
const goalsMarkup = renderToStaticMarkup(
  <DayV3Goals
    deploying
    drawdownPct={15}
    exit={resolved}
    exitSharePct={10}
    incentiveBudgetPer100={0}
    minimumProceedsPer100={95}
    onDrawdownPct={noop}
    onExitSharePct={noop}
    onIncentiveBudgetPer100={noop}
    onMinimumProceedsPer100={noop}
    onProtectedExitThreshold={noop}
    onRecoveryDays={noop}
    onRecoveryMode={noop}
    onResetExit={noop}
    onResetProtection={noop}
    protectedExit={{
      thresholdPct: null,
      bonusPct: 0,
      status: "unresolved",
      message: "History required.",
      scenarios: [],
    }}
    protectedExitThresholdOverride={null}
    protection={{
      coveragePct: 13.5,
      juniorPer100: 17,
      juniorApy: 9,
      status: "recommended",
      message: "Senior remains whole.",
    }}
    recovery={{
      status: "no-history",
      suggestedDays: null,
      recoveredEpisodeCount: 0,
      observedDays: [],
      message: "No history.",
    }}
    recoveryDays={20}
    recoveryMode="window"
  />,
);
assert.match(goalsMarkup, /Senior protection/);
assert.match(
  goalsMarkup,
  /Choose the source loss Senior should survive and its recovery window/,
);
assert.match(goalsMarkup, /Senior exit/);
assert.match(
  goalsMarkup,
  /Choose how much Senior can sell immediately and the minimum payout/,
);
assert.match(goalsMarkup, /aria-expanded="false"/);
assert.equal(
  (goalsMarkup.match(/<details[^>]*open=""/g) ?? []).length,
  1,
  "the nested Recovery timing disclosure starts open",
);
assert.doesNotMatch(goalsMarkup, /Deployment mapping/);
assert.match(
  goalsMarkup,
  /15\.0% drop → 13\.5% minimum coverage · \$17\.0 Junior · 20-day recovery window/,
);
assert.match(
  goalsMarkup,
  /\$10\.0 immediate exit → \$12\.4 SLP · \$9\.6 proceeds · \$95\.0 floor/,
);
assert.match(goalsMarkup, /Section status: Complete/);
assert.doesNotMatch(
  goalsMarkup,
  /Missing: Protected Exit trigger/,
  "collapsed groups keep the detailed missing-field list out of the summary row",
);
assert.match(goalsMarkup, /aria-label="Required"/);
assert.match(goalsMarkup, /Trigger missing · 0\.0% bonus/);
assert.match(goalsMarkup, /Section status: Incomplete/);
assert.match(goalsMarkup, />3A</);
assert.match(goalsMarkup, /Size the exit pool/);
assert.match(goalsMarkup, />3B</);
assert.match(goalsMarkup, /Choose the minimum payout/);
assert.match(goalsMarkup, /smallest pool that can do it/);
assert.match(goalsMarkup, /Restock hurdle:/);
assert.match(goalsMarkup, /50 bps/);
assert.match(goalsMarkup, /40 bps operations/);
assert.match(goalsMarkup, /10 bps live fee/);
assert.match(goalsMarkup, /Net refill margin after the promised sale: 54 bps/);
assert.match(goalsMarkup, /Out of every \$100 Senior/);
assert.match(goalsMarkup, /least a seller should receive for \$100 Senior/);
assert.match(goalsMarkup, />\$10\.0</);
assert.match(goalsMarkup, />\$12\.4</);

const exitStatusProps = {
  deploying: true,
  drawdownPct: 10,
  exitSharePct: 5,
  incentiveBudgetPer100: 0,
  minimumProceedsPer100: 99,
  onDrawdownPct: noop,
  onExitSharePct: noop,
  onIncentiveBudgetPer100: noop,
  onMinimumProceedsPer100: noop,
  onProtectedExitThreshold: noop,
  onRecoveryDays: noop,
  onRecoveryMode: noop,
  onResetExit: noop,
  onResetProtection: noop,
  onRetryPoolDesign: noop,
  protectedExit: {
    thresholdPct: null,
    bonusPct: 0,
    status: "unresolved",
    message: "History required.",
    scenarios: [],
  },
  protectedExitThresholdOverride: null,
  protection: {
    coveragePct: 9,
    juniorPer100: 12,
    juniorApy: 8,
    status: "recommended",
    message: "Senior remains whole.",
  },
  recovery: {
    status: "no-history",
    suggestedDays: null,
    recoveredEpisodeCount: 0,
    observedDays: [],
    message: "No history.",
  },
  recoveryDays: 0,
  recoveryMode: "none",
} satisfies Omit<ComponentProps<typeof DayV3Goals>, "exit">;

const checkingMarkup = renderToStaticMarkup(
  <DayV3Goals
    {...exitStatusProps}
    exit={{
      ...resolved,
      status: "resolving",
      message: "Refreshing the canonical result.",
    }}
  />,
);
assert.match(checkingMarkup, /Section status: Checking/);
assert.match(checkingMarkup, /data-section-status="checking">Checking/);

const infeasibleMarkup = renderToStaticMarkup(
  <DayV3Goals
    {...exitStatusProps}
    exit={{
      ...resolved,
      status: "infeasible",
      message:
        "No deployable pool can meet this exit promise. Reduce the immediate exit amount, accept a lower payout, or shorten settlement and conversion time.",
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
assert.match(infeasibleMarkup, /no feasible pool/);
assert.match(infeasibleMarkup, /completed solver result/);
assert.doesNotMatch(infeasibleMarkup, /Try \$/);

const unavailableMarkup = renderToStaticMarkup(
  <DayV3Goals
    {...exitStatusProps}
    exit={{
      ...resolved,
      status: "unresolved",
      message: "The canonical service could not be reached.",
    }}
  />,
);
assert.match(unavailableMarkup, /Section status: Answered/);
assert.match(unavailableMarkup, /data-section-status="review">Answered/);
assert.match(unavailableMarkup, /live validation unavailable/);
assert.match(unavailableMarkup, /Retry live validation/);

console.log("Day V3 exit-model presentation: PASS");
