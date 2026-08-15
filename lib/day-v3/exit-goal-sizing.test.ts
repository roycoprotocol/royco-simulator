import assert from "node:assert/strict";

import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { buildDayInitialBalances } from "@/lib/day-simulator-template/runtime";
import { dayV3MinimumLiquidityForExitGoal } from "@/lib/day-v3/exit-goal-sizing";

const defaults = DAY_MARKETS.find((m) => m.id === "susdai")!.defaults;
const base = {
  defaults,
  coveragePct: 15,
  bandPct: 5,
  minimumProceedsPer100: 95,
};

/**
 * The exit goal has to move the SLP.
 *
 * This is the regression for the defect that made it: the protection goal sized
 * Junior through `coverage`, and the exit goal sized nothing, because
 * `liquidityPct` was the market's declared constant. An issuer could ask for 50
 * of every 100 Senior to be sellable and the SLP stayed at the size it has at a
 * goal of 5.
 */
const slpPer100 = (minimumLiquidityPct: number) => {
  const balances = buildDayInitialBalances(defaults, {
    coverage: base.coveragePct / 100,
    minLiquidity: minimumLiquidityPct / 100,
  } as never);
  return (balances.lt / balances.st) * 100;
};

// A bigger goal costs strictly more pool, and the pool it costs actually
// delivers the goal. Both halves matter: a number that rises without delivering
// would be just as wrong as one that never moves.
let previousLiquidity = 0;
let previousSlp = 0;
for (const exitSharePct of [5, 10, 25, 50, 80]) {
  const sized = dayV3MinimumLiquidityForExitGoal({ ...base, exitSharePct });
  assert.equal(
    sized.status,
    "recommended",
    `${exitSharePct} of every 100 must be sizeable at a 95 floor: ${sized.reason}`,
  );
  const liquidity = sized.minimumLiquidityPct as number;
  const slp = slpPer100(liquidity);
  assert.ok(
    liquidity > previousLiquidity && slp > previousSlp,
    `goal ${exitSharePct}: liquidity ${liquidity.toFixed(2)}% and SLP ${slp.toFixed(2)} must both exceed the previous goal's ${previousLiquidity.toFixed(2)}% / ${previousSlp.toFixed(2)}`,
  );
  assert.ok(
    Math.abs((sized.sellablePer100 as number) - exitSharePct) < 0.05,
    `goal ${exitSharePct}: the sized pool sells ${(sized.sellablePer100 as number).toFixed(3)}`,
  );
  previousLiquidity = liquidity;
  previousSlp = slp;
}

// The measured anchors, so a change to the inversion is deliberate. These are
// what the capital stack renders: a goal of 10 costs about $11 of SLP and a
// goal of 50 costs about $54.
{
  const ten = dayV3MinimumLiquidityForExitGoal({ ...base, exitSharePct: 10 });
  const fifty = dayV3MinimumLiquidityForExitGoal({ ...base, exitSharePct: 50 });
  assert.ok(Math.abs((ten.minimumLiquidityPct as number) - 9.74) < 0.05);
  assert.ok(Math.abs(slpPer100(ten.minimumLiquidityPct as number) - 10.82) < 0.05);
  assert.ok(Math.abs((fifty.minimumLiquidityPct as number) - 48.69) < 0.05);
  assert.ok(Math.abs(slpPer100(fifty.minimumLiquidityPct as number) - 54.1) < 0.05);
  assert.ok(
    slpPer100(fifty.minimumLiquidityPct as number) >
      slpPer100(ten.minimumLiquidityPct as number) * 4,
    "five times the goal costs roughly five times the pool, not the same pool",
  );
}

// A goal no pool can meet is `infeasible`, not a clamped number presented as
// though it met the goal. A 99 floor leaves a 1% band, which cannot absorb half
// the Senior in one trade at any pool size.
{
  const impossible = dayV3MinimumLiquidityForExitGoal({
    ...base,
    exitSharePct: 50,
    minimumProceedsPer100: 99,
  });
  assert.equal(impossible.status, "infeasible");
  assert.equal(impossible.minimumLiquidityPct, null);
  assert.match(impossible.reason, /only makes/);
}

// Inputs that describe no goal are rejected rather than sized.
for (const bad of [
  { exitSharePct: 0, minimumProceedsPer100: 95 },
  { exitSharePct: 101, minimumProceedsPer100: 95 },
  { exitSharePct: 10, minimumProceedsPer100: 0 },
]) {
  assert.equal(
    dayV3MinimumLiquidityForExitGoal({ ...base, ...bad }).status,
    "invalid-input",
  );
}

console.log("Day V3 exit goal sizes the SLP: PASS");
