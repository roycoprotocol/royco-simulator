import assert from "node:assert/strict";

import { DAY_MARKETS } from "@/lib/day-markets/registry";
import {
  DAY_V3_POOL_DEFAULT_SENIOR_WEIGHT,
  DAY_V3_POOL_LAMBDA,
  DAY_V3_POOL_LAMBDA_RANGE,
  DAY_V3_POOL_PREMIUM_BPS_RANGE,
  dayV3PoolCurveFromPremium,
  dayV3PremiumBpsOf,
  dayV3PremiumForRestingWeight,
  dayV3RestingSeniorWeight,
} from "@/lib/day-v3/pool-curve";

// The construction has to reproduce the curve every listed market declares,
// because that curve is what the deployment interface builds from a 3 bp
// premium. If these drift apart the simulator is modelling a pool nobody can
// deploy.
{
  const declared = DAY_MARKETS.map((m) => m.defaults.eclpParams).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );
  assert.ok(declared.length >= 11, "the listed markets declare a curve");
  const first = declared[0];
  for (const params of declared) {
    assert.deepEqual(
      params,
      first,
      "every listed market ships the same shape, so one check covers them",
    );
  }

  const built = dayV3PoolCurveFromPremium({
    bandPct: (1 - first.alpha) * 100,
    premiumBps: (first.beta - 1) * 10_000,
    lambda: first.lambda,
  });
  assert.ok(built);
  for (const key of ["alpha", "beta", "c", "s", "lambda"] as const) {
    assert.ok(
      Math.abs(built[key] - first[key]) < 1e-12,
      `${key}: built ${built[key]} vs declared ${first[key]}`,
    );
  }
}

// The premium is the balance point, and it moves it monotonically. These are
// the measured values quoted in the module header; if the relationship changes,
// the copy that cites it is wrong too.
{
  const at = (premiumBps: number) =>
    dayV3RestingSeniorWeight(
      dayV3PoolCurveFromPremium({ bandPct: 2, premiumBps, lambda: 250 }),
    );
  const points = [1, 3, 10, 30, 100].map((bp) => ({ bp, w: at(bp) }));
  for (const { bp, w } of points) {
    assert.ok(w !== null, `${bp} bp must resolve to a composition`);
  }
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(
      (points[i].w as number) > (points[i - 1].w as number),
      `a wider premium band must rest on more Senior (${points[i - 1].bp} -> ${points[i].bp} bp)`,
    );
  }
  const threeBp = points[1].w as number;
  assert.ok(
    Math.abs(threeBp - 0.03884) < 5e-5,
    `3 bp rests at 3.884% Senior, got ${(threeBp * 100).toFixed(3)}%`,
  );
}

// Round trip: a curve built from a premium reports that premium back.
for (const bp of [1, 3, 10, 30, 100]) {
  const params = dayV3PoolCurveFromPremium({ bandPct: 2, premiumBps: bp, lambda: 250 });
  const read = dayV3PremiumBpsOf(params);
  assert.ok(read !== null);
  assert.ok(
    Math.abs(read - bp) < 1e-6,
    `premium round trip at ${bp} bp, got ${read}`,
  );
}

// Inputs that describe no curve are null, not a curve with a silent default.
assert.equal(dayV3PoolCurveFromPremium({ bandPct: 2, premiumBps: 0, lambda: 250 }), null);
assert.equal(dayV3PoolCurveFromPremium({ bandPct: 0, premiumBps: 3, lambda: 250 }), null);
assert.equal(dayV3PoolCurveFromPremium({ bandPct: 100, premiumBps: 3, lambda: 250 }), null);
assert.equal(dayV3PoolCurveFromPremium({ bandPct: 2, premiumBps: 3, lambda: 0 }), null);
assert.equal(dayV3RestingSeniorWeight(null), null);
assert.equal(dayV3PremiumBpsOf(null), null);

// The bounds are the deploy step's bounds. A simulator that lets an issuer
// model a premium the deploy step would reject is not modelling their market.
assert.deepEqual(DAY_V3_POOL_PREMIUM_BPS_RANGE, { min: 0, max: 50 });
assert.deepEqual(DAY_V3_POOL_LAMBDA_RANGE, { min: 100, max: 1000 });
assert.equal(DAY_V3_POOL_LAMBDA, 300);
assert.ok(
  DAY_V3_POOL_LAMBDA >= DAY_V3_POOL_LAMBDA_RANGE.min &&
    DAY_V3_POOL_LAMBDA <= DAY_V3_POOL_LAMBDA_RANGE.max,
  "the default concentration has to be one the deploy step accepts",
);

// The inverse, which is this module's `solveBeta`. Deployment derives its
// default premium by solving for a 90/10 quote/Senior rest, so the same solve
// has to land on exactly that here — this is where the "90/10 across the board"
// actually comes from, and it is a default rather than a fixed split.
for (const [bandPct, lambda] of [
  [2, 250],
  [2, 300],
  [5, 250],
  [5, 300],
  [1, 300],
] as [number, number][]) {
  const bps = dayV3PremiumForRestingWeight({
    bandPct,
    lambda,
    seniorWeight: DAY_V3_POOL_DEFAULT_SENIOR_WEIGHT,
  });
  assert.ok(bps !== null, `${bandPct}% / ${lambda} must solve for 90/10`);
  assert.ok(
    bps > 0 && bps <= DAY_V3_POOL_PREMIUM_BPS_RANGE.max,
    `the 90/10 premium must be one the deploy step accepts, got ${bps}`,
  );
  const rests = dayV3RestingSeniorWeight(
    dayV3PoolCurveFromPremium({ bandPct, premiumBps: bps, lambda }),
  );
  assert.ok(rests !== null);
  assert.ok(
    Math.abs(rests - DAY_V3_POOL_DEFAULT_SENIOR_WEIGHT) < 1e-6,
    `${bandPct}% / ${lambda}: solved ${bps.toFixed(2)} bps rests at ${(rests * 100).toFixed(4)}%`,
  );
}

// A weight no premium in range can reach is null, not a silently clamped one.
assert.equal(
  dayV3PremiumForRestingWeight({ bandPct: 2, lambda: 300, seniorWeight: 0.999 }),
  null,
);
assert.equal(
  dayV3PremiumForRestingWeight({ bandPct: 2, lambda: 300, seniorWeight: 0 }),
  null,
);

console.log("Day V3 pool curve from premium: PASS");
