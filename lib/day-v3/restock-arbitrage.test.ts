import assert from "node:assert/strict";

import {
  dayV3DiscountBps,
  dayV3QuoteDiscountBps,
  dayV3RestockCheck,
  dayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";
import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { buildDayExplainerMetrics } from "@/lib/day-simulator-template/explainer";
import { dayCapitalAtUtilization } from "@/lib/day-simulator-template/capital-sizing";
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
assert.ok(
  funded.hurdleBps < 0,
  "the hurdle follows net carry below zero rather than being floored: the wait more than pays for itself, and the waterfall's bars must sum to the total it prints",
);
assert.equal(
  funded.hurdleBps.toFixed(4),
  (funded.netCarryBps + funded.swapFeeBps).toFixed(4),
  "the hurdle is exactly the components the card draws",
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

// The bars a reader adds up must equal the total printed beneath them, in every
// sign combination. This is the invariant that a floored hurdle broke.
for (const [cost, days, senior, fee] of [
  [8, 90, 12, 10],
  [30, 90, 4, 100],
  [12, 7, 6, 10],
  [4, 365, 20, 1],
] as [number, number, number, number][]) {
  const h = dayV3RestockHurdle({
    costOfCapitalPct: cost,
    redemptionDays: days,
    seniorApyPct: senior,
    swapFeeBps: fee,
  });
  const discount = 57.7;
  const drawn = discount - h.financingBps + h.seniorCarryBps - h.swapFeeBps;
  const stated = dayV3RestockCheck({
    hurdle: h,
    selectedDiscountBps: discount,
    worstCaseDiscountBps: discount,
  }).selectedMarginBps as number;
  assert.equal(
    drawn.toFixed(4),
    stated.toFixed(4),
    `bars must sum to the total at ${cost}% / ${days}d / ${senior}% Sr / ${fee}bps`,
  );
}

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

// A design can be legal at the 90% opening target and unbuildable at the 100%
// contract boundary. The page must survive that rather than throw: a $100
// payout floor asks the pool for zero price impact, and the boundary stack is
// then rejected for failing its own liquidity requirement.
const boundaryBuilds = (floorPer100: number) => {
  const terms = {
    coverage: 0.2,
    minLiquidity: defaults.minLiquidity,
    eclpBandWidth: Math.max(0.0001, (100 - floorPer100) / 100),
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
  const cfg = buildDayMarketConfig(effective, terms);
  const opening = () => new Sim(cfg, buildDayInitialBalances(effective, terms));
  const boundary = () =>
    new Sim(cfg, dayCapitalAtUtilization(effective, terms, 1));
  let openingOk = true;
  let boundaryOk = true;
  try { opening(); } catch { openingOk = false; }
  try { boundary(); } catch { boundaryOk = false; }
  return { boundaryOk, openingOk };
};
assert.deepEqual(boundaryBuilds(95), { boundaryOk: true, openingOk: true });
assert.deepEqual(boundaryBuilds(99.9), { boundaryOk: true, openingOk: true });
assert.deepEqual(
  boundaryBuilds(100),
  { boundaryOk: false, openingOk: true },
  "a $100 floor is legal at the opening target and unbuildable at the boundary, which the page must report rather than crash on",
);

// Against the real registry, not the custom draft. The draft declares no
// E-CLP curve, which is the one market shape where both of these behave — so a
// test written only against it pins the happy path and misses every listed
// market. Both regressions below shipped and were caught by review, not here.
const asSummaryBuilds = (market: (typeof DAY_MARKETS)[number], floorPer100: number) => {
  const d = normalizeDayV3Defaults(market.defaults);
  const bandPct = Math.min(99, Math.max(0.01, 100 - floorPer100));
  const terms = {
    coverage: 0.2,
    minLiquidity: d.minLiquidity,
    eclpBandWidth: bandPct / 100,
    observationDays: 0,
    riskYieldShare: d.riskYDM.yTarget,
    liquidityYieldShare: d.liqYDM.yTarget,
  };
  // The band lives only in `terms`, never on the object passed as `defaults`,
  // or `buildDayMarketConfig` compares the request against a copy of itself.
  const effective = {
    ...d,
    ...terms,
    eclpBandWidth: d.eclpBandWidth,
    sourceApy: 0.08,
    stableYield: 0,
    poolTurnoverPerYear: 0,
  };
  const sized = { ...effective, eclpBandWidth: terms.eclpBandWidth };
  return {
    cfg: buildDayMarketConfig(effective, terms),
    opening: buildDayInitialBalances(sized, terms),
    sized,
    terms,
  };
};

for (const market of DAY_MARKETS) {
  const { cfg, opening, sized, terms } = asSummaryBuilds(market, 95);
  // Junior at the boundary, the pool on its admissible opening size. Solving
  // both legs at 100% produces a stack the engine rejects by ~14ppm on every
  // market that declares a curve, which cost 12 of 13 their loss waterfall.
  const boundary = dayCapitalAtUtilization(sized, terms, 1);
  buildDayExplainerMetrics(cfg, {
    st: boundary.st,
    jt: boundary.jt,
    lt: opening.lt,
  });
}

// And the payout floor has to reach the curve on a market that ships one.
const discountAtFloor = (marketId: string, floorPer100: number) => {
  const market = DAY_MARKETS.find((candidate) => candidate.id === marketId);
  if (!market) throw new Error(`${marketId} is not in the registry`);
  const { cfg, opening } = asSummaryBuilds(market, floorPer100);
  const sim = new Sim(cfg, opening);
  const quote = sim.previewSecondarySell(sim.last().stEffectiveNAV * 0.1);
  return dayV3QuoteDiscountBps(quote) as number;
};
for (const marketId of ["susdai", "muga", "acred"]) {
  const tightFloor = discountAtFloor(marketId, 99);
  const wideFloor = discountAtFloor(marketId, 50);
  assert.ok(
    wideFloor > tightFloor * 10,
    `${marketId}: the payout floor must reach the curve on a market that declares one (${tightFloor} vs ${wideFloor})`,
  );
}

console.log("Day V3 restock arbitrage check: PASS");
