// =============================================================================
// Backtest-window brush invariant tests.
//
// Run: npx tsx lib/hybond/timeframe.test.ts
//
// The brush RESTARTS the market over the window it selects (the slice start is a new
// genesis), so these index rules are load-bearing for the accounting and not just for
// a viewport: section 9 pins the restart contract itself.
//
// These pin the rule that a dragged handle CLAMPS against the stationary one and
// never swaps ownership with it. The distinction matters because a swapped range
// is still "valid" (a <= b, in bounds, min-window met), so an invariant-only sweep
// passes straight over the bug — the assertions below are on exact ranges, not on
// legality, for exactly that reason.
//
// Note on arithmetic: MIN_WINDOW_MONTHS is 3 and the range is INCLUSIVE, so the
// minimum distance between handles is 2 (a 3-point window is {n, n+1, n+2}).
// Clamping start against an end at 34 therefore yields 32, not 31.
// =============================================================================

import { runBacktest } from "@/lib/try/backtest";
import {
  HYBOND_DEFAULT_PARAMS,
  HYBOND_NAV_SERIES,
  buildHybondConfig,
} from "./scenarios";
import {
  MIN_WINDOW_MONTHS,
  indexFromFraction,
  isFullRange,
  moveHandle,
  nearestSide,
  normalizeRange,
  panRange,
  pctOf,
  type IndexRange,
} from "./timeframe";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m ${detail}`);
  }
}

const eq = (got: IndexRange, want: IndexRange) => got.a === want.a && got.b === want.b;
const show = (r: IndexRange) => `{a:${r.a},b:${r.b}}`;

function checkRange(name: string, got: IndexRange, want: IndexRange) {
  check(name, eq(got, want), `got ${show(got)}, want ${show(want)}`);
}

const MAX = 60; // a 61-point series, matching HYBOND_NAV_SERIES
const MIN_SPAN = MIN_WINDOW_MONTHS - 1;

// ---------------------------------------------------------------------------
console.log("\n1. Dragging START past END clamps the start; the end does NOT move");
{
  // The audit's exact repro: start dragged to 46 while the end sits at 34.
  const r = moveHandle({ a: 0, b: 34 }, "start", 46, MAX);
  checkRange("start dragged past end clamps to end - MIN_SPAN", r, { a: 34 - MIN_SPAN, b: 34 });
  check("the end handle did not move", r.b === 34, `b=${r.b}`);
  check("the start did not take the end's old value (no swap)", r.a !== 34 || MIN_SPAN === 0);

  const r2 = moveHandle({ a: 20, b: 50 }, "start", 60, MAX);
  checkRange("start dragged to the far right clamps against the end", r2, { a: 48, b: 50 });
  check("end stays at 50 rather than being pushed to 60", r2.b === 50, `b=${r2.b}`);
}

// ---------------------------------------------------------------------------
console.log("\n2. Dragging END past START clamps the end; the start does NOT move");
{
  const r = moveHandle({ a: 20, b: 50 }, "end", 0, MAX);
  checkRange("end dragged past start clamps to start + MIN_SPAN", r, { a: 20, b: 20 + MIN_SPAN });
  check("the start handle did not move", r.a === 20, `a=${r.a}`);

  const r2 = moveHandle({ a: 34, b: 40 }, "end", 10, MAX);
  checkRange("end dragged well left of the start clamps", r2, { a: 34, b: 36 });
}

// ---------------------------------------------------------------------------
console.log("\n3. Handles clamp to the series bounds");
{
  checkRange("start below 0 clamps to 0", moveHandle({ a: 10, b: 40 }, "start", -25, MAX), { a: 0, b: 40 });
  checkRange("end beyond max clamps to max", moveHandle({ a: 10, b: 40 }, "end", 999, MAX), { a: 10, b: MAX });
  checkRange("start beyond max clamps against the end, not to max", moveHandle({ a: 10, b: MAX }, "start", 999, MAX), {
    a: MAX - MIN_SPAN,
    b: MAX,
  });
  const r = moveHandle({ a: 0, b: 40 }, "start", 12.6, MAX);
  checkRange("a fractional drag index rounds", r, { a: 13, b: 40 });
}

// ---------------------------------------------------------------------------
console.log("\n4. The minimum window is never violated by a handle drag");
{
  let worst = Infinity;
  for (let b = 0; b <= MAX; b++) {
    for (let want = -5; want <= MAX + 5; want++) {
      const base = normalizeRange(0, b, MAX); // only ever drag from a LEGAL range
      const r = moveHandle(base, "start", want, MAX);
      worst = Math.min(worst, r.b - r.a);
      if (r.a > r.b || r.a < 0 || r.b > MAX) {
        check(`sweep produced an illegal range at b=${b} want=${want}`, false, show(r));
        b = MAX + 1;
        break;
      }
    }
  }
  check(`every start drag keeps at least MIN_SPAN between handles (worst ${worst})`, worst >= MIN_SPAN, `worst=${worst}`);

  let worstEnd = Infinity;
  for (let a = 0; a <= MAX; a++) {
    for (let want = -5; want <= MAX + 5; want++) {
      const base = normalizeRange(a, MAX, MAX);
      const r = moveHandle(base, "end", want, MAX);
      worstEnd = Math.min(worstEnd, r.b - r.a);
    }
  }
  check(`every end drag keeps at least MIN_SPAN between handles (worst ${worstEnd})`, worstEnd >= MIN_SPAN, `worst=${worstEnd}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. A drag moves exactly one handle, always");
{
  let violations = 0;
  const base: IndexRange = { a: 18, b: 41 };
  for (let want = -5; want <= MAX + 5; want++) {
    if (moveHandle(base, "start", want, MAX).b !== base.b) violations++;
    if (moveHandle(base, "end", want, MAX).a !== base.a) violations++;
  }
  check("the stationary handle never moves, at any drag target", violations === 0, `${violations} violations`);
}

// ---------------------------------------------------------------------------
console.log("\n6. panRange slides the window and preserves its width");
{
  const r = panRange({ a: 10, b: 30 }, 5, MAX);
  checkRange("pan right by 5", r, { a: 15, b: 35 });
  check("width preserved on a right pan", r.b - r.a === 20, `width=${r.b - r.a}`);

  const l = panRange({ a: 10, b: 30 }, -5, MAX);
  checkRange("pan left by 5", l, { a: 5, b: 25 });

  const stopL = panRange({ a: 10, b: 30 }, -999, MAX);
  checkRange("pan hard left stops at 0 without squashing", stopL, { a: 0, b: 20 });
  check("width preserved when stopped at the left bound", stopL.b - stopL.a === 20);

  const stopR = panRange({ a: 10, b: 30 }, 999, MAX);
  checkRange("pan hard right stops at max without squashing", stopR, { a: 40, b: MAX });
  check("width preserved when stopped at the right bound", stopR.b - stopR.a === 20);

  let widthViolations = 0;
  for (let d = -80; d <= 80; d++) {
    const p = panRange({ a: 10, b: 30 }, d, MAX);
    if (p.b - p.a !== 20 || p.a < 0 || p.b > MAX) widthViolations++;
  }
  check("pan preserves width and stays in bounds across every delta", widthViolations === 0, `${widthViolations} violations`);
}

// ---------------------------------------------------------------------------
console.log("\n7. normalizeRange still coerces arbitrary input into a legal range");
{
  checkRange("crossed input is un-crossed", normalizeRange(40, 10, MAX), { a: 10, b: 40 });
  checkRange("a collapsed range is widened to the minimum window", normalizeRange(34, 34, MAX), { a: 34, b: 36 });
  checkRange("a collapsed range at the right edge widens leftwards", normalizeRange(MAX, MAX, MAX), {
    a: MAX - MIN_SPAN,
    b: MAX,
  });
  checkRange("out-of-bounds input clamps", normalizeRange(-10, 999, MAX), { a: 0, b: MAX });
  checkRange("a series shorter than the minimum window selects all of it", normalizeRange(0, 0, 1), { a: 0, b: 1 });
  checkRange("a single-point series is degenerate but legal", normalizeRange(0, 0, 0), { a: 0, b: 0 });
}

// ---------------------------------------------------------------------------
console.log("\n8. Track helpers");
{
  check("indexFromFraction maps 0 to the first point", indexFromFraction(0, MAX) === 0);
  check("indexFromFraction maps 1 to the last point", indexFromFraction(1, MAX) === MAX);
  check("indexFromFraction rounds to the nearest point", indexFromFraction(0.5, MAX) === 30);
  check("indexFromFraction clamps out-of-range fractions", indexFromFraction(-2, MAX) === 0 && indexFromFraction(9, MAX) === MAX);
  check("nearestSide grabs the closer handle", nearestSide({ a: 10, b: 40 }, 12) === "start");
  check("nearestSide grabs the end when closer", nearestSide({ a: 10, b: 40 }, 38) === "end");
  check("isFullRange is true only for the whole series", isFullRange({ a: 0, b: MAX }, MAX) && !isFullRange({ a: 1, b: MAX }, MAX));
  check("pctOf spans 0..100", pctOf(0, MAX) === 0 && pctOf(MAX, MAX) === 100);
  check("pctOf is safe on a zero-length track", pctOf(0, 0) === 0);
}

// ---------------------------------------------------------------------------
// The window is not a viewport: the simulator slices the INPUT series with it and
// re-runs the market, so the slice start becomes a real genesis. These assertions are
// what make MIN_WINDOW_MONTHS meaningful — a legal range must always slice a series the
// engine can actually run, including at the minimum width.
console.log("\n9. Every legal window restarts a runnable market");
{
  const N = HYBOND_NAV_SERIES.length;
  check("the fixture is the 61-point full history", N === 61, `N=${N}`);

  // No legal range, from any input, can slice fewer points than the minimum window.
  let tooShort = 0;
  for (let a = -5; a <= N + 5; a++) {
    for (let b = -5; b <= N + 5; b++) {
      const r = normalizeRange(a, b, N - 1);
      if (HYBOND_NAV_SERIES.slice(r.a, r.b + 1).length < MIN_WINDOW_MONTHS) tooShort++;
    }
  }
  check("no legal range ever slices fewer than MIN_WINDOW_MONTHS points", tooShort === 0, `${tooShort} violations`);

  const run = (a: number, b: number) =>
    runBacktest({
      config: buildHybondConfig(HYBOND_DEFAULT_PARAMS),
      depositST: HYBOND_DEFAULT_PARAMS.depositST,
      depositJT: HYBOND_DEFAULT_PARAMS.depositJT,
      series: HYBOND_NAV_SERIES.slice(a, b + 1),
    });

  // A minimum-width window, restarted mid-series (right before the 2022 drawdown).
  const minView = normalizeRange(24, 24, N - 1);
  const minRun = run(minView.a, minView.b);
  check("a minimum window runs and yields exactly MIN_WINDOW_MONTHS steps", minRun.steps.length === MIN_WINDOW_MONTHS, `steps=${minRun.steps.length}`);

  const s0 = minRun.steps[0];
  check(
    "the restarted run's first step is genesis: stIndex = jtIndex = priceIndex = 100",
    s0.stIndex === 100 && s0.jtIndex === 100 && s0.priceIndex === 100,
    `st=${s0.stIndex} jt=${s0.jtIndex} px=${s0.priceIndex}`,
  );
  check(
    "the restarted run starts at the genesis coverage utilization (0.9e18, the curve target)",
    s0.coverageUtilWad === 900000000000000000n,
    `util=${s0.coverageUtilWad}`,
  );
  check("a restarted run carries in no impairment (no loss locked at genesis)", s0.juniorLossLocked === false);

  // A 3-month CAGR is an extrapolation, but it must still be a NUMBER: an Infinity/NaN
  // here would render as garbage rather than as the "—" placeholder.
  const finite = [minRun.seniorAvgYr, minRun.juniorAvgYr, minRun.strategyAvgYr, minRun.years];
  check("a minimum window's annualized metrics are finite, never Infinity/NaN", finite.every(Number.isFinite), JSON.stringify(finite));
  check("a minimum window still spans a positive horizon", minRun.years > 0, `years=${minRun.years}`);

  // The restart must actually differ from the full history, otherwise the control does nothing.
  const full = run(0, N - 1);
  const restarted = run(HYBOND_NAV_SERIES.findIndex((p) => p.date === "2022-06"), N - 1);
  check(
    "a restarted window produces different headline numbers than the full history",
    full.seniorAvgYr !== restarted.seniorAvgYr && full.juniorAvgYr !== restarted.juniorAvgYr,
    `full sr=${full.seniorAvgYr} vs restarted sr=${restarted.seniorAvgYr}`,
  );
  check(
    "the restarted window's genesis is its OWN start date, not the series start",
    restarted.steps[0].date === "2022-06" && restarted.steps[0].jtIndex === 100,
    `date=${restarted.steps[0].date} jt=${restarted.steps[0].jtIndex}`,
  );
}

// ---------------------------------------------------------------------------
console.log(`\n\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m\n`);
if (failed > 0) process.exit(1);
