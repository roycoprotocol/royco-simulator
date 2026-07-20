import assert from "node:assert/strict";
import manifest from "../day-markets/pareto-falconx/market.json";
import { buildDayMarketCopy, type DayMarketManifest } from "./market";
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
  runDayTargetScenario,
} from "./runtime";

const market = manifest as DayMarketManifest;
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

console.log("Strict Day market copy factory: PASS");
console.log("Strict Day shared runtime wiring: PASS");
console.log("Pareto FalconX accountant outputs: PASS");
