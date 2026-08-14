import assert from "node:assert/strict";

import { eclpSellValue, eclpParamsForWeight } from "./eclp";
import { Sim, defaultConfig } from "./runner";
import { buildDayExplainerMetrics } from "../../day-simulator-template/explainer";

const INITIAL = { st: 1_000, jt: 250, lt: 150 };
const FEES_BPS = [0, 0.01, 1, 10, 100] as const;
const SALE_NAV = 10;
const EPSILON = 1e-12;

const approx = (actual: number, expected: number, epsilon = EPSILON) =>
  Math.abs(actual - expected) <= epsilon;

const simulator = (swapFeeBps: number) =>
  new Sim(
    defaultConfig({
      minLiquidity: 0.1,
      poolTurnoverPerYear: 0,
      swapFeeBps,
    }),
    INITIAL,
  );

console.log("\nSecondary-exit exact-input swap fees");

{
  const quotes = FEES_BPS.map((swapFeeBps) => ({
    swapFeeBps,
    quote: simulator(swapFeeBps).previewSecondarySell(SALE_NAV),
  }));

  quotes.forEach(({ swapFeeBps, quote }, index) => {
    assert.ok(
      approx(quote.filledNAV, SALE_NAV),
      `${swapFeeBps} bps should fill the requested gross sale`,
    );
    assert.ok(
      approx(quote.filledNAV, quote.effectiveInputNAV + quote.swapFeeNAV),
      `${swapFeeBps} bps should split gross input into fee plus effective input`,
    );
    assert.ok(
      approx(quote.stableOutNAV, quote.filledNAV * quote.executionPrice),
      `${swapFeeBps} bps proceeds identity`,
    );
    assert.ok(
      approx(quote.slippage, 1 - quote.executionPrice),
      `${swapFeeBps} bps all-in cost identity`,
    );
    if (index === 0) return;
    const previous = quotes[index - 1].quote;
    assert.ok(
      quote.swapFeeNAV > previous.swapFeeNAV,
      `fee retained should rise from ${quotes[index - 1].swapFeeBps} to ${swapFeeBps} bps`,
    );
    assert.ok(
      quote.stableOutNAV < previous.stableOutNAV,
      `seller proceeds should fall from ${quotes[index - 1].swapFeeBps} to ${swapFeeBps} bps`,
    );
    assert.ok(
      quote.slippage > previous.slippage,
      `all-in cost should rise from ${quotes[index - 1].swapFeeBps} to ${swapFeeBps} bps`,
    );
  });
}

{
  const sim = simulator(0);
  const opening = sim.state;
  const quote = sim.previewSecondarySell(SALE_NAV);
  const params = eclpParamsForWeight(0.1, 1, sim.cfg.eclpBandWidth);
  const pure = eclpSellValue(
    params,
    opening.pool.stShares,
    opening.pool.stable,
    SALE_NAV,
  );

  assert.equal(quote.swapFeeNAV, 0, "zero fee should retain no Senior input");
  assert.ok(
    approx(quote.effectiveInputNAV, SALE_NAV),
    "zero fee should send the full gross input through the E-CLP",
  );
  assert.ok(
    approx(quote.filledNAV, pure.filled),
    "zero-fee gross fill should equal the pure E-CLP fill",
  );
  assert.ok(
    approx(quote.stableOutNAV, pure.stableOut),
    "zero-fee proceeds should equal the pure E-CLP proceeds",
  );
}

{
  const sim = simulator(10);
  const before = sim.state;
  const quote = sim.previewSecondarySell(SALE_NAV);
  const afterPreview = sim.state;

  assert.deepEqual(afterPreview.pool, before.pool, "preview must remain read-only");
  assert.ok(
    approx(quote.filledNAV, quote.effectiveInputNAV + quote.swapFeeNAV),
    "gross accepted input must equal curve input plus the retained fee",
  );
  assert.ok(
    approx(quote.swapFeeNAV, 0.01),
    "10 bps should retain 0.01 of a 10-unit gross sale",
  );

  sim.step({
    dtSec: 0,
    stReturn: 0,
    jtReturn: 0,
    op: { type: "secondarySell", amount: SALE_NAV },
  });
  const after = sim.state;
  const seniorAddedNAV =
    (after.pool.stShares - before.pool.stShares) * sim.last().stPrice;
  const stableRemoved = before.pool.stable - after.pool.stable;

  assert.ok(
    approx(seniorAddedNAV, quote.filledNAV, 1e-9),
    "execution should add the gross Senior fill, including the retained fee",
  );
  assert.ok(
    approx(stableRemoved, quote.stableOutNAV, 1e-9),
    "execution should remove exactly the previewed exit-asset proceeds",
  );
  assert.ok(
    sim.events.some(
      (event) =>
        event.kind === "secondary-sell" &&
        event.msg.includes("all-in cost") &&
        event.msg.includes("swap fee"),
    ),
    "the execution event should disclose fee-inclusive cost",
  );
}

{
  const sim = simulator(10);
  const requestedNAV = 1_000;
  const quote = sim.previewSecondarySell(requestedNAV);

  assert.ok(quote.filledNAV > 0, "the boundary quote should partially fill");
  assert.ok(
    quote.unfilledNAV > 0,
    "an oversized boundary request should expose an unfilled gross amount",
  );
  assert.ok(
    approx(quote.filledNAV + quote.unfilledNAV, requestedNAV, 1e-9),
    "gross fill plus gross unfilled amount should equal the request",
  );
  assert.ok(
    approx(quote.filledNAV, quote.effectiveInputNAV + quote.swapFeeNAV, 1e-9),
    "partial fills must preserve the gross/net/fee identity",
  );
  assert.ok(
    quote.stableOutNAV <= sim.state.pool.stable,
    "a boundary quote must never pay more exit asset than the pool owns",
  );

  const boundaryReplay = sim.previewSecondarySell(quote.filledNAV);
  assert.ok(
    boundaryReplay.unfilledNAV < 1e-9,
    "replaying the reported gross boundary should be fully fillable",
  );
  assert.ok(
    approx(boundaryReplay.stableOutNAV, quote.stableOutNAV, 1e-9),
    "the reported gross boundary should reproduce the same exit-asset output",
  );

  const beforeExecution = sim.state;
  sim.step({
    dtSec: 0,
    stReturn: 0,
    jtReturn: 0,
    op: { type: "secondarySell", amount: requestedNAV },
  });
  assert.deepEqual(
    sim.state.pool,
    beforeExecution.pool,
    "an oversized exact-input sale must be rejected atomically",
  );
  assert.ok(
    sim.events.some(
      (event) => event.kind === "blocked" && event.msg.includes("one atomic trade"),
    ),
    "an oversized sale should explain the atomic capacity limit",
  );
}

{
  const quote = simulator(10_000).previewSecondarySell(SALE_NAV);
  assert.deepEqual(
    {
      filledNAV: quote.filledNAV,
      effectiveInputNAV: quote.effectiveInputNAV,
      swapFeeNAV: quote.swapFeeNAV,
      stableOutNAV: quote.stableOutNAV,
      unfilledNAV: quote.unfilledNAV,
      executionPrice: quote.executionPrice,
      slippage: quote.slippage,
    },
    {
      filledNAV: 0,
      effectiveInputNAV: 0,
      swapFeeNAV: 0,
      stableOutNAV: 0,
      unfilledNAV: SALE_NAV,
      executionPrice: 0,
      slippage: 1,
    },
    "a 100% fee must fail safely as a zero-fill quote",
  );
}

for (const invalidFee of [-0.01, 10_000.01, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(
    () => simulator(invalidFee).previewSecondarySell(SALE_NAV),
    /INVALID_SWAP_FEE|cannot convert non-finite number to WAD/,
    `invalid fee ${String(invalidFee)} should be rejected`,
  );
}

{
  const below = buildDayExplainerMetrics(
    defaultConfig({ minLiquidity: 0.1, poolTurnoverPerYear: 0, swapFeeBps: 99.9 }),
    INITIAL,
  ).liquidity;
  const at = buildDayExplainerMetrics(
    defaultConfig({ minLiquidity: 0.1, poolTurnoverPerYear: 0, swapFeeBps: 100 }),
    INITIAL,
  ).liquidity;
  const above = buildDayExplainerMetrics(
    defaultConfig({ minLiquidity: 0.1, poolTurnoverPerYear: 0, swapFeeBps: 101 }),
    INITIAL,
  ).liquidity;

  assert.ok(
    below.referenceSellNAV > 0 && approx(below.referenceQuote.slippage, 0.01, 1e-12),
    "a fee below 1% should retain a positive all-in 1% reference quote",
  );
  for (const [label, metrics] of [
    ["at", at],
    ["above", above],
  ] as const) {
    assert.equal(metrics.referenceSellNAV, 0, `${label} 1% fee has no positive 1% reference`);
    assert.equal(metrics.referenceQuote.filledNAV, 0, `${label} 1% fee reference should not fill`);
    assert.equal(metrics.referenceQuote.stableOutNAV, 0, `${label} 1% fee reference should pay nothing`);
    assert.equal(metrics.referenceQuote.slippage, 0, `${label} 1% fee zero quote should have zero cost`);
  }
}

console.log("Secondary-exit exact-input swap fees: PASS");
