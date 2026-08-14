import assert from "node:assert/strict";

import {
  dayV3DiscountBps,
  dayV3RestockCheck,
  dayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";

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

const hurdleAt = (costOfCapitalPct: number, redemptionDays: number) =>
  dayV3RestockHurdle({
    costOfCapitalPct,
    redemptionDays,
    seniorApyPct: 6,
    swapFeeBps: 10,
  });

// The worst case is the design's own promise. A $95 floor is 500 bps, which is
// what a desk can expect at the deepest point — not the ~50 bps the shared
// engine's shallow fallback pool used to report here.
const week95 = dayV3RestockCheck({
  hurdle: hurdleAt(12, 7),
  selectedSalePer100: 10,
  selectedSaleProceeds: 9.94,
  worstPayoutPer100: 95,
});
assert.equal(week95.worstCaseDiscountBps?.toFixed(4), "500.0000");
assert.equal(week95.worstCaseMarginBps?.toFixed(2), "478.49");
assert.equal(week95.selectedDiscountBps?.toFixed(0), "60");
assert.equal(week95.status, "profitable");
assert.ok((week95.selectedMarginBps ?? 0) > 0);

// A long queue is what breaks the refill loop: the same design, the same
// discount, and no desk willing to fund the wait.
const slow = dayV3RestockCheck({
  hurdle: hurdleAt(30, 365),
  selectedSalePer100: 10,
  selectedSaleProceeds: 9.94,
  worstPayoutPer100: 95,
});
assert.equal(slow.status, "unprofitable");
assert.ok(
  (slow.worstCaseMarginBps ?? 0) < 0,
  "a 2,410 bps hurdle is not covered by a 500 bps floor",
);
assert.equal(
  slow.worstCaseDiscountBps,
  week95.worstCaseDiscountBps,
  "the design is unchanged; only the desk's hurdle moved",
);

// The selected sale can fall short while the worst case clears, because a
// smaller sale prices nearer to NAV. That is the case worth naming separately.
const shallowSale = dayV3RestockCheck({
  hurdle: hurdleAt(20, 30),
  selectedSalePer100: 10,
  selectedSaleProceeds: 9.94,
  worstPayoutPer100: 95,
});
assert.ok(
  (shallowSale.worstCaseMarginBps ?? 0) > 0,
  "a 500 bps floor still clears a one-month wait at 20% cost of capital",
);
assert.ok(
  (shallowSale.selectedMarginBps ?? 0) < 0,
  "but the 60 bps a $10 sale reaches does not",
);
assert.equal(shallowSale.status, "unprofitable");

// Until the pool is sized there are no proceeds for the selected sale, and
// reporting that as a failed refill would answer a question nobody asked.
const unpriced = dayV3RestockCheck({
  hurdle: hurdleAt(12, 7),
  selectedSalePer100: 10,
  selectedSaleProceeds: null,
  worstPayoutPer100: 95,
});
assert.equal(unpriced.status, "no-selected-sale");
assert.equal(unpriced.selectedDiscountBps, null);
assert.equal(unpriced.selectedMarginBps, null);
assert.equal(
  unpriced.worstCaseDiscountBps?.toFixed(4),
  "500.0000",
  "the deepest point is still answerable from the floor alone",
);

// No exit design, no discount to arbitrage, and no verdict invented.
assert.equal(
  dayV3RestockCheck({
    hurdle: hurdleAt(12, 7),
    selectedSalePer100: null,
    selectedSaleProceeds: null,
    worstPayoutPer100: null,
  }).status,
  "unavailable",
);

console.log("Day V3 restock arbitrage check: PASS");
