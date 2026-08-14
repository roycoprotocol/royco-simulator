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
assert.match(resolvedMarkup, /Selected sale \/ \$100/);
assert.match(resolvedMarkup, /Modeled capacity \/ \$100/);
assert.match(resolvedMarkup, /Minimum payout \/ \$100/);
assert.match(resolvedMarkup, /Lowest modeled payout \/ \$100/);
assert.match(resolvedMarkup, /Proceeds: \$9\.62 after the live swap fee/);
assert.match(resolvedMarkup, /Swap fee: 10 bps/);
assert.match(resolvedMarkup, /Minimum liquidity: 10\.90%/);
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
  /Shows how the selected exit size and payout affect one trade/,
);
assert.match(illustrativeMarkup, /Modeled capacity/);
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
  /Refreshing the live template and recalculating this model/,
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
assert.match(disabledMarkup, /Immediate exit/);
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
  /\$10\.0 immediate exit → \$12\.4 SLP · \$9\.6 proceeds · \$95\.0 floor/,
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
assert.match(goalsMarkup, /Out of every \$100 Senior, how much should be sellable/);
assert.match(goalsMarkup, /least a seller should receive for \$100 Senior/);
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
  /\$10\.0 immediate exit → \$12\.4 SLP · \$9\.6 proceeds · \$95\.0 floor/,
);
assert.doesNotMatch(goalsMarkup, /Maximum discount/);
assert.doesNotMatch(goalsMarkup, /See .*impact/i);

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

// Both halves of the arbitrage discount must come from one response. Dividing
// canonical proceeds by the live exit input mixed a figure priced for the
// previous goal with the number on screen: $10 of proceeds over a $50 sale
// reported an 8,000 bps discount in a panel whose banner read 60 bps.
const restockView = {
  check: dayV3RestockCheck({
    hurdle: dayV3RestockHurdle({
      costOfCapitalPct: 20,
      redemptionDays: 30,
      seniorApyPct: 4,
      swapFeeBps: 10,
    }),
    // The canonical response's own sale size, not the input being edited.
    selectedSalePer100: 10,
    selectedSaleProceeds: 9.94,
    worstPayoutPer100: 99.4,
  }),
  hurdle: dayV3RestockHurdle({
    costOfCapitalPct: 20,
    redemptionDays: 30,
    seniorApyPct: 4,
    swapFeeBps: 10,
  }),
  selectedSalePer100: 10,
  stale: true,
  worstCaseBasis: "modeled" as const,
  worstPayoutPer100: 99.4,
};
assert.equal(
  restockView.check.selectedDiscountBps?.toFixed(0),
  "60",
  "proceeds are measured against the sale they were priced for",
);
assert.ok(
  (restockView.check.worstCaseDiscountBps ?? 0) < 100,
  "the worst case and the selected sale agree because they share a response",
);

const staleMarkup = renderToStaticMarkup(
  <DayV3RestockCheck
    costOfCapitalPct={20}
    onCostOfCapitalPct={noop}
    onRedemptionDays={noop}
    redemptionDays={30}
    view={restockView}
  />,
);
assert.match(staleMarkup, /data-restock-stale="true"/);
assert.match(staleMarkup, /re-pricing/);
// Mid-reprice the panel falls back to the live payout floor rather than
// showing the previous design's numbers, so changing the floor still moves the
// answer instead of appearing frozen.
assert.match(staleMarkup, /payout floor you set/);
assert.match(staleMarkup, /It moves as you change the floor/);

const freshMarkup = renderToStaticMarkup(
  <DayV3RestockCheck
    costOfCapitalPct={20}
    onCostOfCapitalPct={noop}
    onRedemptionDays={noop}
    redemptionDays={30}
    view={{ ...restockView, stale: false }}
  />,
);
assert.doesNotMatch(freshMarkup, /data-restock-stale/);
assert.doesNotMatch(freshMarkup, /has not sized this exact pool yet/);

console.log("Day V3 exit-model presentation: PASS");
