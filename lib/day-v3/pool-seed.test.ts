import assert from "node:assert/strict";

import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { dayPoolSeniorWeight } from "@/lib/day-simulator-template/capital-sizing";
import { buildDayExplainerMetrics } from "@/lib/day-simulator-template/explainer";
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
} from "@/lib/day-simulator-template/runtime";
import { poolSeniorWeightAtPeg } from "@/lib/day/engine/engine";
import { Sim } from "@/lib/day/engine/runner";

/**
 * The pool opens where its own curve rests.
 *
 * This is the regression the seed change needed and did not have. `v2-output-
 * regression.test.ts` pins JBBB, and JBBB is the one market with no declared
 * curve — so it runs the fallback, was unaffected, and passed throughout while
 * the other eleven markets moved.
 *
 * Those eleven are what `/`, `/v2` and every standalone market page render at
 * the market's own band, which is the path where `buildDayMarketConfig` keeps
 * the declared curve. Their exit numbers changed, correctly, and nothing was
 * watching.
 */

const termsFor = (defaults: (typeof DAY_MARKETS)[number]["defaults"]) => ({
  coverage: defaults.coverage,
  minLiquidity: defaults.minLiquidity,
  eclpBandWidth: defaults.eclpBandWidth,
  observationDays: defaults.observationDays,
  riskYieldShare: defaults.riskYDM.yTarget,
  liquidityYieldShare: defaults.liqYDM.yTarget,
});

// Every market seeds exactly where its curve rests. This is the whole claim,
// and it holds for the declared-curve markets and the fallback alike.
for (const market of DAY_MARKETS) {
  const cfg = buildDayMarketConfig(market.defaults, termsFor(market.defaults));
  const seeded = dayPoolSeniorWeight(cfg);
  const resting = poolSeniorWeightAtPeg(cfg);
  assert.ok(
    Math.abs(seeded - resting) < 1e-9,
    `${market.id}: seeded ${(seeded * 100).toFixed(4)}% but rests at ${(resting * 100).toFixed(4)}%`,
  );
}

// The declared curve rests at 3.884% Senior — beta 1.0003, a 3 bp premium — and
// the fallback is solved for 10%. Pinned so a change to either is deliberate.
{
  const declared = DAY_MARKETS.filter((m) => m.defaults.eclpParams);
  assert.equal(declared.length, 11, "eleven markets declare a curve");
  for (const market of declared) {
    const cfg = buildDayMarketConfig(market.defaults, termsFor(market.defaults));
    assert.ok(
      Math.abs(poolSeniorWeightAtPeg(cfg) - 0.038843) < 1e-5,
      `${market.id} rests at ${(poolSeniorWeightAtPeg(cfg) * 100).toFixed(4)}%`,
    );
  }
  const fallback = DAY_MARKETS.find((m) => !m.defaults.eclpParams);
  assert.ok(fallback, "jbbb declares no curve and runs the fallback");
  const cfg = buildDayMarketConfig(fallback.defaults, termsFor(fallback.defaults));
  assert.equal(
    poolSeniorWeightAtPeg(cfg),
    0.1,
    "the fallback weight is returned exactly, not re-derived by bisection",
  );
}

/**
 * The exit numbers the standalone market pages actually render.
 *
 * Measured against the previous 10% seed, these were: susdai 56.8 bps and
 * 100.68 of fill, acred 19.4 and 251.70. Opening at the curve's own peg instead
 * of 2.6x its Senior inventory made exits ~19% cheaper and capacity ~7% larger.
 * That is the change being claimed, so it is the change that is pinned.
 */
for (const [id, discountBps, boundaryFill] of [
  ["susdai", 46.0, 107.49],
  ["acred", 14.3, 268.71],
] as [string, number, number][]) {
  const market = DAY_MARKETS.find((m) => m.id === id);
  assert.ok(market, `${id} is in the registry`);
  const terms = termsFor(market.defaults);
  const cfg = buildDayMarketConfig(market.defaults, terms);
  const balances = buildDayInitialBalances(market.defaults, terms);
  const sim = new Sim(cfg, balances);
  const quote = sim.previewSecondarySell(sim.last().stEffectiveNAV * 0.1);
  const discount = (1 - quote.stableOutNAV / quote.effectiveInputNAV) * 10_000;
  assert.ok(
    Math.abs(discount - discountBps) < 0.1,
    `${id}: 10% sale discount ${discount.toFixed(1)} bps, expected ${discountBps}`,
  );
  const explainer = buildDayExplainerMetrics(cfg, balances);
  const fill = explainer.liquidity.boundaryQuote?.filledNAV ?? 0;
  assert.ok(
    Math.abs(fill - boundaryFill) < 0.01,
    `${id}: boundary fill ${fill.toFixed(2)}, expected ${boundaryFill}`,
  );
}

console.log("Day V3 pool seeds at its curve's peg: PASS");
