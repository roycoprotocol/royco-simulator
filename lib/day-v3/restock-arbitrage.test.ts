import assert from "node:assert/strict";

import {
  dayV3PoolDiscountBps,
  dayV3RestockCheck,
  dayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";
import { normalizeDayV3Defaults } from "@/lib/day-v3/normalization";
import { buildDayYieldDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
} from "@/lib/day-simulator-template/runtime";
import { Sim } from "@/lib/day/engine/runner";

// The discount is the curve's own move, not the seller's all-in cost. A quote
// whose fee has already been taken out of `effectiveInputNAV` must report only
// what a refilling desk could actually capture.
assert.equal(
  dayV3PoolDiscountBps({
    filledNAV: 10,
    effectiveInputNAV: 9.99,
    stableOutNAV: 9.94,
    unfilledNAV: 0,
  })?.toFixed(2),
  "50.05",
);
assert.equal(
  dayV3PoolDiscountBps({
    filledNAV: 0,
    effectiveInputNAV: 0,
    stableOutNAV: 0,
    unfilledNAV: 5,
  }),
  null,
  "an unfillable quote has no discount to report",
);

// A wait costs the desk its own money and pays it Senior's yield. Both legs are
// stated so neither can be quietly assumed away.
const week = dayV3RestockHurdle({
  costOfCapitalPct: 12,
  redemptionDays: 7,
  seniorApyPct: 6,
  swapFeeBps: 10,
});
assert.equal(week.financingBps.toFixed(2), "23.01");
assert.equal(week.seniorCarryBps.toFixed(2), "11.51");
assert.equal(week.netCarryBps.toFixed(2), "11.51");
assert.equal(week.hurdleBps.toFixed(2), "21.51");

// Senior out-earning the desk's cost of capital is a real outcome, and the
// hurdle then falls to the fee alone rather than going negative.
const funded = dayV3RestockHurdle({
  costOfCapitalPct: 4,
  redemptionDays: 90,
  seniorApyPct: 9,
  swapFeeBps: 10,
});
assert.ok(funded.netCarryBps < 0, "a well-paid wait shows negative net carry");
assert.equal(
  funded.hurdleBps,
  0,
  "excess Senior carry covers the fee, so any discount at all is enough",
);

// Zero wait removes both time legs and leaves the fee.
assert.equal(
  dayV3RestockHurdle({
    costOfCapitalPct: 25,
    redemptionDays: 0,
    seniorApyPct: 6,
    swapFeeBps: 10,
  }).hurdleBps,
  10,
);

// Against the shared engine's own pool, not a reconstructed curve.
const market = buildDayYieldDraftMarket({ label: "Custom", sourceApy: 0.08 });
const defaults = normalizeDayV3Defaults(market.defaults);
const terms = {
  coverage: 0.135,
  minLiquidity: defaults.minLiquidity,
  eclpBandWidth: defaults.eclpBandWidth,
  observationDays: 0,
  riskYieldShare: defaults.riskYDM.yTarget,
  liquidityYieldShare: defaults.liqYDM.yTarget,
};
const effective = {
  ...defaults,
  ...terms,
  sourceApy: 0.08,
  stableYield: 0,
  poolTurnoverPerYear: 0,
};
const sim = new Sim(
  buildDayMarketConfig(effective, terms),
  buildDayInitialBalances(effective, terms),
);
const openingSeniorNAV = sim.last().stEffectiveNAV;
const quoteSell = (nav: number) => sim.previewSecondarySell(nav);
// The pool fills until its quote leg is gone; that boundary is the deepest
// discount the design can reach.
let capacityNAV = openingSeniorNAV;
for (let step = 0; step < 64; step += 1) {
  if (quoteSell(capacityNAV).unfilledNAV <= 1e-9) capacityNAV *= 2;
  else break;
}
capacityNAV = quoteSell(capacityNAV).filledNAV;
assert.ok(capacityNAV > 0, "the illustrative pool can absorb a sale");

const short = dayV3RestockCheck({
  quoteSell,
  openingSeniorNAV,
  capacityNAV,
  promisedSalePer100: 10,
  hurdle: dayV3RestockHurdle({
    costOfCapitalPct: 12,
    redemptionDays: 7,
    seniorApyPct: 6,
    swapFeeBps: 10,
  }),
});
assert.equal(short.status, "profitable");
assert.ok(
  (short.promisedDiscountBps ?? 0) > 40,
  "a $10 sale into the illustrative pool moves the curve tens of bps",
);
assert.ok((short.promisedMarginBps ?? 0) > 0);
assert.ok(
  (short.breakEvenSalePer100 ?? Infinity) < 10,
  "a one-week wait is covered before the promised sale is complete",
);

// A long redemption queue is what actually breaks the refill loop: the same
// pool, the same discount, and no desk willing to fund the wait.
const slow = dayV3RestockCheck({
  quoteSell,
  openingSeniorNAV,
  capacityNAV,
  promisedSalePer100: 10,
  hurdle: dayV3RestockHurdle({
    costOfCapitalPct: 12,
    redemptionDays: 90,
    seniorApyPct: 6,
    swapFeeBps: 10,
  }),
});
assert.equal(slow.status, "unprofitable");
assert.equal(
  slow.breakEvenSalePer100,
  null,
  "no sale the pool can absorb pays for a 90-day wait",
);
assert.ok((slow.worstCaseMarginBps ?? 0) < 0);
assert.equal(
  slow.worstCaseDiscountBps,
  short.worstCaseDiscountBps,
  "the pool is unchanged; only the desk's hurdle moved",
);

// The break-even sale is the crossing point, so the discount there matches the
// hurdle rather than merely clearing it.
const crossing = dayV3RestockCheck({
  quoteSell,
  openingSeniorNAV,
  capacityNAV,
  promisedSalePer100: 10,
  hurdle: dayV3RestockHurdle({
    costOfCapitalPct: 12,
    redemptionDays: 4,
    seniorApyPct: 6,
    swapFeeBps: 10,
  }),
});
const crossingNAV =
  ((crossing.breakEvenSalePer100 as number) / 100) * openingSeniorNAV;
const crossingDiscount = dayV3PoolDiscountBps(quoteSell(crossingNAV)) as number;
const crossingHurdle = dayV3RestockHurdle({
  costOfCapitalPct: 12,
  redemptionDays: 4,
  seniorApyPct: 6,
  swapFeeBps: 10,
}).hurdleBps;
assert.ok(
  Math.abs(crossingDiscount - crossingHurdle) < 0.5,
  `break-even discount ${crossingDiscount} should meet the ${crossingHurdle} bps hurdle`,
);

// An unfunded pool has nothing to arbitrage and must not invent a verdict.
assert.equal(
  dayV3RestockCheck({
    quoteSell,
    openingSeniorNAV,
    capacityNAV: 0,
    promisedSalePer100: 10,
    hurdle: dayV3RestockHurdle({
      costOfCapitalPct: 12,
      redemptionDays: 7,
      seniorApyPct: 6,
      swapFeeBps: 10,
    }),
  }).status,
  "unavailable",
);

// With no exit amount chosen there is no trade to price. Reporting that as an
// unprofitable refill would answer a question the reader has not asked yet.
const unpriced = dayV3RestockCheck({
  quoteSell,
  openingSeniorNAV,
  capacityNAV,
  promisedSalePer100: null,
  hurdle: dayV3RestockHurdle({
    costOfCapitalPct: 12,
    redemptionDays: 7,
    seniorApyPct: 6,
    swapFeeBps: 10,
  }),
});
assert.equal(unpriced.status, "no-promised-sale");
assert.equal(unpriced.promisedDiscountBps, null);
assert.equal(unpriced.promisedMarginBps, null);
assert.ok(
  (unpriced.breakEvenSalePer100 ?? 0) > 0,
  "the depth a refill needs is still answerable without a chosen exit",
);
assert.equal(unpriced.worstCaseDiscountBps, short.worstCaseDiscountBps);

console.log("Day V3 restock arbitrage check: PASS");
