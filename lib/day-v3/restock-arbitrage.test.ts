import assert from "node:assert/strict";

import {
  dayV3DiscountBps,
  dayV3QuoteDiscountBps,
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

// A payout is a discount stated the other way round. Both figures come from the
// exit design, so nothing here reprices a pool.
assert.equal(
  dayV3DiscountBps(95)?.toFixed(4),
  "500.0000",
  "a $95 floor is a 5% discount",
);
assert.equal(dayV3DiscountBps(96.2)?.toFixed(0), "380");
assert.equal(
  dayV3DiscountBps(9.94, 10)?.toFixed(0),
  "60",
  "proceeds are measured against what was sold, not against 100",
);
assert.equal(dayV3DiscountBps(100), 0, "a payout at NAV is no discount");
assert.equal(
  dayV3DiscountBps(101),
  0,
  "a payout above NAV is not a negative discount anyone can bank",
);
assert.equal(dayV3DiscountBps(null), null);
assert.equal(dayV3DiscountBps(95, 0), null, "nothing sold, nothing to discount");

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
// hurdle then falls to zero rather than going negative.
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

// A quote's discount is the curve's own move, excluding the fee the seller
// already paid — that fee stays in the pool rather than sitting there as a
// mispricing anyone can buy, and the fee the arbitrageur pays to trade back in
// is on the cost side of the hurdle.
assert.equal(
  dayV3QuoteDiscountBps({ effectiveInputNAV: 9.99, stableOutNAV: 9.94 })?.toFixed(0),
  "50",
);
assert.equal(dayV3QuoteDiscountBps(null), null);
assert.equal(
  dayV3QuoteDiscountBps({ effectiveInputNAV: 0, stableOutNAV: 0 }),
  null,
  "an unfillable quote has no discount to report",
);

const hurdleAt = (costOfCapitalPct: number, redemptionDays: number) =>
  dayV3RestockHurdle({
    costOfCapitalPct,
    redemptionDays,
    seniorApyPct: 6,
    swapFeeBps: 10,
  });

// Both discounts arrive already priced off one pool, so the check can never
// mix a figure from one market with a figure from another.
const shallow = dayV3RestockCheck({
  hurdle: hurdleAt(12, 7),
  selectedDiscountBps: 50,
  worstCaseDiscountBps: 60,
});
assert.equal(shallow.status, "profitable");
assert.equal(shallow.worstCaseMarginBps?.toFixed(2), "38.49");
assert.equal(shallow.selectedMarginBps?.toFixed(2), "28.49");

// A long queue breaks the refill loop: same pool, same discounts, nobody home.
const slow = dayV3RestockCheck({
  hurdle: hurdleAt(30, 90),
  selectedDiscountBps: 50,
  worstCaseDiscountBps: 60,
});
assert.equal(slow.status, "unprofitable");
assert.ok((slow.worstCaseMarginBps ?? 0) < 0);
assert.equal(
  slow.worstCaseDiscountBps,
  shallow.worstCaseDiscountBps,
  "the pool is unchanged; only the arbitrageur's hurdle moved",
);

// The selected sale can fall short while the deepest fill clears.
const partial = dayV3RestockCheck({
  hurdle: hurdleAt(20, 30),
  selectedDiscountBps: 50,
  worstCaseDiscountBps: 900,
});
assert.ok((partial.worstCaseMarginBps ?? 0) > 0);
assert.ok((partial.selectedMarginBps ?? 0) < 0);
assert.equal(partial.status, "unprofitable");

// No pool, no discount, no verdict invented.
assert.equal(
  dayV3RestockCheck({
    hurdle: hurdleAt(12, 7),
    selectedDiscountBps: null,
    worstCaseDiscountBps: null,
  }).status,
  "unavailable",
);
assert.equal(
  dayV3RestockCheck({
    hurdle: hurdleAt(12, 7),
    selectedDiscountBps: null,
    worstCaseDiscountBps: 60,
  }).status,
  "no-selected-sale",
);

// The payout floor has to move the arbitrage economics, because it is the
// pool's maximum discount. Against the shared engine, not a restatement of it.
const market = buildDayYieldDraftMarket({ label: "Custom", sourceApy: 0.08 });
const defaults = normalizeDayV3Defaults(market.defaults);
const deepestDiscountAtFloor = (floorPer100: number) => {
  const terms = {
    coverage: 0.2,
    minLiquidity: defaults.minLiquidity,
    eclpBandWidth: (100 - floorPer100) / 100,
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
  let probe = sim.last().stEffectiveNAV;
  for (let step = 0; step < 64; step += 1) {
    if (sim.previewSecondarySell(probe).unfilledNAV <= 1e-9) probe *= 2;
    else break;
  }
  return dayV3QuoteDiscountBps(
    sim.previewSecondarySell(sim.previewSecondarySell(probe).filledNAV),
  ) as number;
};
const tight = deepestDiscountAtFloor(99);
const loose = deepestDiscountAtFloor(80);
const wide = deepestDiscountAtFloor(50);
assert.ok(
  tight < loose && loose < wide,
  `a deeper payout floor must let the pool price deeper: ${tight} / ${loose} / ${wide}`,
);
assert.ok(
  wide > tight * 10,
  "dragging the floor from $99 to $50 must move the discount by more than rounding",
);
const wait = hurdleAt(20, 30);
assert.ok(
  dayV3RestockCheck({
    hurdle: wait,
    selectedDiscountBps: tight,
    worstCaseDiscountBps: tight,
  }).status === "unprofitable" &&
    dayV3RestockCheck({
      hurdle: wait,
      selectedDiscountBps: wide,
      worstCaseDiscountBps: wide,
    }).status === "profitable",
  "and it must flip the verdict, which is the whole point of the control",
);

console.log("Day V3 restock arbitrage check: PASS");
