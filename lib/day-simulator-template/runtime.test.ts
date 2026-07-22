import assert from "node:assert/strict";
import manifest from "../day-markets/pareto-falconx/market.json";
import {
  buildDayMarketCopy,
  describeDayMarketCustomizations,
  isDaySectionVisible,
  type DayMarketManifest,
  validateDayMarketCustomization,
} from "./market";
import {
  buildDayFiniteForwardSeries,
  buildDayForwardSeries,
  buildDayInitialBalances,
  buildDayMarketConfig,
  runDayTargetScenario,
} from "./runtime";
import { annualizedSeriesApy } from "./series";

const market = manifest as DayMarketManifest;
assert.deepEqual(validateDayMarketCustomization(market.customization), []);
assert.deepEqual(describeDayMarketCustomizations(market.customization), []);

const authorizedCustomization = {
  explicitlyAuthorized: true,
  authorizationNote: "User explicitly authorized hiding Backtest for this market.",
  hiddenSections: ["backtest" as const],
  copyOverrides: { heroTitle: "A market-specific factual headline." },
  vaultTabs: { group: "test-vaults", label: "Test vault" },
  backtestDisplay: {
    returnUnit: "ETH" as const,
    footnote: "The historical path excludes a transient oracle mark. A same-block sync belongs in a separate stress scenario.",
  },
};
assert.deepEqual(validateDayMarketCustomization(authorizedCustomization), []);
assert.deepEqual(describeDayMarketCustomizations(authorizedCustomization), [
  "hide section: backtest",
  "replace copy: heroTitle",
  "vault tab: Test vault in test-vaults",
  "backtest return unit: ETH",
  "backtest footnote",
]);
assert.equal(isDaySectionVisible(authorizedCustomization, "backtest"), false);
assert.equal(isDaySectionVisible(authorizedCustomization, "roles"), true);
assert.ok(validateDayMarketCustomization({
  ...authorizedCustomization,
  explicitlyAuthorized: false,
}).some((issue) => issue.includes("explicit authorization")));
assert.ok(validateDayMarketCustomization({
  ...authorizedCustomization,
  hiddenSections: ["accounting" as never],
}).some((issue) => issue.includes("unsupported hidden section")));
assert.ok(validateDayMarketCustomization({
  ...authorizedCustomization,
  vaultTabs: { group: "", label: "Test vault" },
}).some((issue) => issue.includes("vaultTabs.group")));
assert.ok(validateDayMarketCustomization({
  ...authorizedCustomization,
  backtestDisplay: { returnUnit: "EUR" as never },
}).some((issue) => issue.includes("returnUnit")));
assert.ok(validateDayMarketCustomization({
  ...authorizedCustomization,
  backtestDisplay: {
    returnUnit: "USD",
    footnote: "First sentence. Second sentence. Third sentence.",
  },
}).some((issue) => issue.includes("two sentences")));

const reverseMarket = {
  strategyCap: 1_500_000,
  seniorCap: 1_400_000,
  juniorCap: 100_000,
  issuerName: "Muga",
  juniorFunding: "issuer-funded" as const,
  juniorDeposits: "closed" as const,
  seniorSupportLabel: "minimum distribution receivable",
  seniorSupportAmount: 1_400_000,
};
const forwardTest = {
  termDays: 90,
  grossInterestRate: 0.18,
  defaultScenario: "normal" as const,
  omitInitialZeroReturnPeriod: true,
  scenarios: [
    {
      id: "good" as const,
      label: "Good",
      description: "Full principal and interest are paid at maturity.",
      paymentDelayDays: 0,
      terminalRecovery: { kind: "full" as const },
    },
    {
      id: "normal" as const,
      label: "Normal",
      description: "Full principal and interest are paid after a 60-day delay.",
      paymentDelayDays: 60,
      terminalRecovery: { kind: "full" as const },
    },
    {
      id: "bad" as const,
      label: "Bad",
      description: "Only the minimum distribution receivable is recovered after a 60-day delay.",
      paymentDelayDays: 60,
      terminalRecovery: { kind: "amount" as const, amount: 1_400_000 },
    },
  ],
  tailRiskDisclosure: "Force majeure or obligor default could impair the support receivable.",
};
const forwardCustomization = {
  explicitlyAuthorized: true,
  authorizationNote: "User approved a finite forward test for this reverse market.",
  hiddenSections: ["junior-funding" as const],
  copyOverrides: {},
  forwardTest,
  reverseMarket,
};
assert.deepEqual(validateDayMarketCustomization(forwardCustomization), []);
assert.deepEqual(describeDayMarketCustomizations(forwardCustomization), [
  "hide section: junior-funding",
  "finite forward test: 90 days with good/normal/bad scenarios",
  "omit initial zero-return period from forward chart and monthly table",
  "reverse market: Muga-funded Junior capped at 100000",
  "Senior cap: 1400000",
]);
assert.ok(validateDayMarketCustomization({
  ...forwardCustomization,
  forwardTest: { ...forwardTest, omitInitialZeroReturnPeriod: "yes" as never },
}).some((issue) => issue.includes("omitInitialZeroReturnPeriod must be boolean")));
assert.ok(validateDayMarketCustomization({
  ...forwardCustomization,
  reverseMarket: undefined,
}).some((issue) => issue.includes("requires customization.reverseMarket")));
const twoOutcomeForwardTest = {
  ...forwardTest,
  termDays: 120,
  defaultScenario: "expected" as const,
  scenarios: [
    {
      id: "expected" as const,
      label: "Expected",
      description: "Full principal and contractual interest are paid at maturity.",
      paymentDelayDays: 0,
      terminalRecovery: { kind: "full" as const },
    },
    {
      id: "bad" as const,
      label: "Bad",
      description: "Only the minimum distribution receivable is recovered after a 60-day delay.",
      paymentDelayDays: 60,
      terminalRecovery: { kind: "amount" as const, amount: 1_400_000 },
    },
  ],
};
assert.deepEqual(validateDayMarketCustomization({
  ...forwardCustomization,
  forwardTest: twoOutcomeForwardTest,
}), []);
assert.ok(validateDayMarketCustomization({
  ...forwardCustomization,
  forwardTest: {
    ...twoOutcomeForwardTest,
    scenarios: twoOutcomeForwardTest.scenarios.slice(0, 1),
  },
}).some((issue) => issue.includes("either expected and bad, or good, normal, and bad")));
const terms = {
  coverage: market.defaults.coverage,
  minLiquidity: market.defaults.minLiquidity,
  observationDays: market.defaults.observationDays,
  riskYieldShare: market.defaults.riskYDM.yTarget,
  liquidityYieldShare: market.defaults.liqYDM.yTarget,
};

const copy = buildDayMarketCopy(market);
assert.equal(copy.eyebrow, "ROYCO DAY · PARETO FALCONX MARKET");
assert.equal(copy.title, "Pareto FalconX Day Simulator");
assert.equal(
  copy.description,
  "Explore a hypothetical three-tranche Royco Day market over AA_FalconXUSDC. Senior receives first-loss coverage from Junior, while a 15% minimum liquidity requirement supports secondary-market exits.",
);
assert.equal(
  copy.disclosure,
  "The source APY is derived from 371 fee-inclusive daily NAV observations supplied by RWA.xyz. Simulator outputs are mechanism simulations, not historical backtests, forecasts, or an announced product.",
);

const historicalPublishedApyMarket = {
  ...market,
  defaults: { ...market.defaults, sourceApy: 0.0996 },
  provenance: {
    ...market.provenance,
    dataMode: "historical-series-with-published-apy" as const,
    sourceProvider: "Makina onchain Machine accounting",
    observationCount: 26,
    dataCadence: "irregular" as const,
    publishedApy: 0.0996,
  },
};
assert.equal(
  buildDayMarketCopy(historicalPublishedApyMarket).disclosure,
  "The chart preserves the path of 26 fee-inclusive irregular NAV observations supplied by Makina onchain Machine accounting, with its trend calibrated to the published 9.96% APY input. Simulator outputs are mechanism simulations, not historical backtests, forecasts, or an announced product.",
);

const initial = buildDayInitialBalances(market.defaults, terms);
assert.equal(initial.st, 1000);
assert.ok(Math.abs(initial.jt - 34.48275862068966) < 1e-12);
assert.ok(Math.abs(initial.lt - 166.66666666666666) < 1e-12);

const config = buildDayMarketConfig(market.defaults, terms);
assert.equal(config.targetUtilization, 0.9);
assert.equal(config.liqTargetUtilization, 0.9);
assert.equal(config.fixedTermDurationSec, 7 * 86_400);
assert.equal(config.liquidationUtilization, 100);
assert.equal(config.yieldShareProtocolFee, market.defaults.jtYieldShareProtocolFee);
assert.equal(config.ltYieldShareProtocolFee, market.defaults.ltYieldShareProtocolFee);
assert.equal(config.reinvestLiquidityPremium, true);

const yields = runDayTargetScenario(market.defaults);
assert.ok(Math.abs(yields.seniorApy - 0.07094948110446264) < 1e-12);
assert.ok(Math.abs(yields.juniorApy - 0.26029190861047224) < 1e-12);
assert.ok(Math.abs(yields.liquidityApy - 0.14334071663933146) < 1e-12);

const forwardSeries = buildDayForwardSeries(0.114, market.defaults.stableYield, "2026-07-20");
assert.equal(forwardSeries.length, 13);
assert.ok(Math.abs(annualizedSeriesApy(forwardSeries) - 0.114) < 1e-12);
assert.equal(forwardSeries[0].date, "2026-07-20");

const goodForwardSeries = buildDayFiniteForwardSeries(
  0.1709,
  "2026-07-21",
  forwardTest,
  reverseMarket,
  "good",
  7,
);
assert.deepEqual(goodForwardSeries.map((point) => point.date), [
  "2026-07-21",
  "2026-08-20",
  "2026-09-19",
  "2026-10-19",
]);
assert.ok(Math.abs(goodForwardSeries.at(-1)!.price - Math.pow(1.1709, 90 / 365)) < 1e-12);

const normalForwardSeries = buildDayFiniteForwardSeries(
  0.1709,
  "2026-07-21",
  forwardTest,
  reverseMarket,
  "normal",
  7,
);
assert.equal(normalForwardSeries.at(-1)!.date, "2026-12-18");
assert.equal(normalForwardSeries.at(-1)!.price, goodForwardSeries.at(-1)!.price);

const badForwardSeries = buildDayFiniteForwardSeries(
  0.1709,
  "2026-07-21",
  forwardTest,
  reverseMarket,
  "bad",
  7,
);
assert.equal(badForwardSeries.at(-2)!.date, "2026-12-18");
assert.equal(badForwardSeries.at(-1)!.date, "2026-12-25");
assert.ok(Math.abs(badForwardSeries.at(-1)!.price - 1_400_000 / 1_500_000) < 1e-12);

const expectedForwardSeries = buildDayFiniteForwardSeries(
  0.1709,
  "2026-07-21",
  twoOutcomeForwardTest,
  reverseMarket,
  "expected",
  7,
);
assert.deepEqual(expectedForwardSeries.map((point) => point.date), [
  "2026-07-21",
  "2026-08-20",
  "2026-09-19",
  "2026-10-19",
  "2026-11-18",
]);
assert.ok(Math.abs(expectedForwardSeries.at(-1)!.price - Math.pow(1.1709, 120 / 365)) < 1e-12);

const twoOutcomeBadForwardSeries = buildDayFiniteForwardSeries(
  0.1709,
  "2026-07-21",
  twoOutcomeForwardTest,
  reverseMarket,
  "bad",
  7,
);
assert.equal(twoOutcomeBadForwardSeries.at(-2)!.date, "2027-01-17");
assert.equal(twoOutcomeBadForwardSeries.at(-1)!.date, "2027-01-24");
assert.ok(Math.abs(twoOutcomeBadForwardSeries.at(-1)!.price - 1_400_000 / 1_500_000) < 1e-12);

console.log("Strict Day market copy factory: PASS");
console.log("Authorized Day presentation deviations: PASS");
console.log("Strict Day shared runtime wiring: PASS");
console.log("Pareto FalconX accountant outputs: PASS");
console.log("Published APY forward-series adapter: PASS");
console.log("Finite forward scenario adapter: PASS");
