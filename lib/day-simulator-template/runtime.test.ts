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
};
assert.deepEqual(validateDayMarketCustomization(authorizedCustomization), []);
assert.deepEqual(describeDayMarketCustomizations(authorizedCustomization), [
  "hide section: backtest",
  "replace copy: heroTitle",
  "vault tab: Test vault in test-vaults",
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

console.log("Strict Day market copy factory: PASS");
console.log("Authorized Day presentation deviations: PASS");
console.log("Strict Day shared runtime wiring: PASS");
console.log("Pareto FalconX accountant outputs: PASS");
console.log("Published APY forward-series adapter: PASS");
