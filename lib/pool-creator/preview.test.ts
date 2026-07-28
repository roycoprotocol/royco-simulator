// Run: npx tsx lib/pool-creator/preview.test.ts

import { createPoolBase, type PoolTerms } from "@/lib/pool-creator/config";
import { runPreview, seriesApy, seriesDrawdown, annualize } from "@/lib/pool-creator/preview";
import { buildSyntheticSeries } from "@/lib/pool-creator/synthetic";
import { archetypeToGoals, ARCHETYPES, REFERENCE_MARKETS } from "@/lib/pool-creator/presets";
import { solvePool } from "@/lib/pool-creator/solver";
import susdaiSeries from "@/lib/day-markets/susdai/series.json";
import type { DaySeriesPoint } from "@/lib/day-simulator-template/market";

let failures = 0;
let checks = 0;
const ok = (c: boolean, label: string, detail = "") => {
  checks += 1;
  if (!c) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const near = (a: number, e: number, tol: number, label: string) =>
  ok(Math.abs(a - e) <= tol, label, `got ${a.toFixed(6)}, want ${e.toFixed(6)} ±${tol}`);

const TERMS: PoolTerms = {
  coverage: 0.09,
  minLiquidity: 0.15,
  recoveryDays: 7,
  riskYieldShare: 0.069,
  liquidityYieldShare: 0.13,
};

// ---------------------------------------------------------------------------
console.log("\n1. Synthetic series hit their requested APY exactly");
// ---------------------------------------------------------------------------
{
  for (const risk of ["steady", "mild", "choppy", "credit"] as const) {
    for (const apy of [0.03, 0.09, 0.17]) {
      const series = buildSyntheticSeries({ expectedApy: apy, risk, anchorDate: "2026-07-01" });
      near(seriesApy(series), apy, 5e-4, `${risk} @ ${apy}: realised APY matches the input`);
      ok(series.every((p) => p.price > 0), `${risk} @ ${apy}: all prices positive`);
      ok(series.length > 300, `${risk} @ ${apy}: a year of daily points`);
    }
  }

  // Determinism — a shared link must reproduce the same chart.
  const a = buildSyntheticSeries({ expectedApy: 0.09, risk: "credit", anchorDate: "2026-07-01" });
  const b = buildSyntheticSeries({ expectedApy: 0.09, risk: "credit", anchorDate: "2026-07-01" });
  ok(a.every((p, i) => p.price === b[i].price && p.date === b[i].date), "generation is deterministic");
}

// ---------------------------------------------------------------------------
console.log("2. Risk profiles actually differ in drawdown");
// ---------------------------------------------------------------------------
{
  const depth = (risk: "steady" | "mild" | "choppy" | "credit") =>
    seriesDrawdown(buildSyntheticSeries({ expectedApy: 0.09, risk, anchorDate: "2026-07-01" })).depth;

  const steady = depth("steady");
  const choppy = depth("choppy");
  const credit = depth("credit");
  console.log(
    `     steady ${(steady * 100).toFixed(2)}%  choppy ${(choppy * 100).toFixed(2)}%  credit ${(credit * 100).toFixed(2)}%`,
  );
  ok(Math.abs(steady) < 0.01, "steady barely falls", `${steady}`);
  ok(credit < -0.03, "credit shows a real drawdown", `${credit}`);
  ok(credit < choppy, "credit falls deeper than choppy");
}

// ---------------------------------------------------------------------------
console.log("3. Backtest against a real market series");
// ---------------------------------------------------------------------------
{
  const series = susdaiSeries as DaySeriesPoint[];
  const base = createPoolBase({ sourceApy: seriesApy(series) });
  const t0 = performance.now();
  const result = runPreview(base, TERMS, series);
  const ms = performance.now() - t0;

  ok(result.error === null, "no engine error over the real series", result.error ?? "");
  ok(result.rows.length === series.length, "one row per observation");
  ok(result.rows[0].senior === 100, "rebased to 100 at the open");
  ok(Number.isFinite(result.seniorApy), "Senior APY computed");
  ok(result.seniorApy < result.strategyApy, "Senior earns less than the raw strategy");
  ok(result.juniorApy > result.seniorApy, "Junior earns more than Senior");
  ok(ms < 200, "backtest is fast enough for a live preview", `${ms.toFixed(1)}ms`);
  console.log(
    `     ${series.length} points in ${ms.toFixed(1)}ms · strategy ${(result.strategyApy * 100).toFixed(2)}%` +
    ` · senior ${(result.seniorApy * 100).toFixed(2)}% · junior ${(result.juniorApy * 100).toFixed(2)}%` +
    ` · lp ${(result.liquidityApy * 100).toFixed(2)}%`,
  );
  console.log(
    `     strategy max drawdown ${(result.strategyMaxDrawdown * 100).toFixed(2)}%` +
    ` · senior ${(result.seniorMaxDrawdown * 100).toFixed(2)}%` +
    ` · recovery windows: ${result.recoveryWindows.length}`,
  );

  // The whole point of the product: Senior falls less than the thing it tracks.
  ok(
    result.seniorMaxDrawdown >= result.strategyMaxDrawdown - 1e-9,
    "Senior's drawdown is never deeper than the strategy's",
  );
}

// ---------------------------------------------------------------------------
console.log("4. Shocks land on Junior first, and the cushion has a real edge");
// ---------------------------------------------------------------------------
{
  // A flat 6%/yr path with one discrete fall dropped in the middle.
  const shockPath = (depth: number): DaySeriesPoint[] => {
    const series: DaySeriesPoint[] = [];
    let price = 1;
    for (let day = 0; day <= 200; day += 1) {
      if (day === 100) price *= 1 - depth;
      else if (day > 0) price *= 1 + 0.06 / 365;
      series.push({
        date: new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10),
        price,
      });
    }
    return series;
  };

  const base = createPoolBase({ sourceApy: 0.06 });
  // TERMS carries coverage 0.09, which the accountant turns into a ~10% cushion.

  // (a) Inside the cushion: Junior absorbs it, Senior is untouched, and the
  //     market enters its recovery window.
  const inside = runPreview(base, TERMS, shockPath(0.05));
  ok(inside.error === null, "5% shock simulates cleanly", inside.error ?? "");
  ok(inside.recoveryWindows.length > 0, "a shock inside the cushion opens a recovery window");
  ok(inside.rows.some((r) => r.inRecoveryWindow), "rows carry the flag for chart shading");

  const jtTrough = inside.rows.reduce((lo, r) => Math.min(lo, r.junior), Infinity);
  const stTrough = inside.rows.reduce((lo, r) => Math.min(lo, r.senior), Infinity);
  ok(jtTrough < stTrough, "Junior takes the hit first", `jt=${jtTrough} st=${stTrough}`);
  ok(stTrough >= 99.999, "Senior is untouched inside the cushion", `st=${stTrough}`);
  console.log(
    `     5% shock  → junior trough ${jtTrough.toFixed(1)}, senior trough ${stTrough.toFixed(2)},` +
    ` ${inside.recoveryWindows.length} window(s)`,
  );

  // (b) Beyond the cushion: Junior is co-invested, so it eats its own fall AND
  //     Senior's. A 12% fall against a ~10% cushion wipes it out and Senior
  //     starts taking the excess. That edge is exactly what step 2 is choosing.
  const beyond = runPreview(base, TERMS, shockPath(0.12));
  ok(beyond.error === null, "12% shock simulates cleanly", beyond.error ?? "");
  const jtWiped = beyond.rows.reduce((lo, r) => Math.min(lo, r.junior), Infinity);
  const stHit = beyond.rows.reduce((lo, r) => Math.min(lo, r.senior), Infinity);
  ok(jtWiped <= 0.01, "Junior is wiped out past the cushion", `jt=${jtWiped}`);
  ok(stHit < 100, "Senior takes the excess past the cushion", `st=${stHit}`);
  ok(stHit > 90, "Senior still keeps most of its balance", `st=${stHit}`);
  console.log(
    `     12% shock → junior trough ${jtWiped.toFixed(1)}, senior trough ${stHit.toFixed(2)}` +
    ` (cushion edge is where Senior starts to feel it)`,
  );
}

// ---------------------------------------------------------------------------
console.log("5. Degenerate input degrades instead of throwing");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.06 });
  ok(runPreview(base, TERMS, []).error !== null, "empty series reports an error");
  ok(runPreview(base, TERMS, [{ date: "2026-01-01", price: 1 }]).error !== null,
    "single point reports an error");

  // An infeasible config must not throw out of the preview either.
  let threw = false;
  try {
    runPreview(base, { ...TERMS, riskYieldShare: 0.6, liquidityYieldShare: 0.6 },
      susdaiSeries as DaySeriesPoint[]);
  } catch {
    threw = true;
  }
  ok(!threw, "an infeasible config returns an error rather than throwing");
}

// ---------------------------------------------------------------------------
console.log("6. Archetypes solve end to end on a synthesized strategy");
// ---------------------------------------------------------------------------
{
  for (const archetype of ARCHETYPES) {
    const sourceApy = 0.09;
    const series = buildSyntheticSeries({ expectedApy: sourceApy, risk: "choppy", anchorDate: "2026-07-01" });
    const base = createPoolBase({ sourceApy });
    const goals = archetypeToGoals(archetype, sourceApy, 1_000_000);
    const solved = solvePool(base, goals);
    const preview = runPreview(base, solved, series);

    ok(preview.error === null, `${archetype.label}: backtests cleanly`, preview.error ?? "");
    ok(Number.isFinite(solved.seniorApy), `${archetype.label}: Senior APY solves`);
    console.log(
      `     ${archetype.label.padEnd(12)} cushion ${(solved.coverageLossLimit * 100).toFixed(1)}%` +
      ` · senior ${(solved.seniorApy * 100).toFixed(2)}%` +
      ` · junior ${(solved.juniorApy * 100).toFixed(2)}%` +
      ` · lp ${(solved.liquidityApy * 100).toFixed(2)}%` +
      ` · ${solved.notes.length} note(s)`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("7. Reference markets load from the real manifests");
// ---------------------------------------------------------------------------
{
  ok(REFERENCE_MARKETS.length >= 5, "reference markets present");
  for (const m of REFERENCE_MARKETS) {
    ok(m.coverage > 0 && m.coverage < 1, `${m.id}: coverage sane`, String(m.coverage));
    ok(m.sourceApy > -1, `${m.id}: sourceApy sane`);
    ok(m.name.length > 0, `${m.id}: has a display name`);
  }
  near(annualize(110, 100, 365), 0.1, 1e-9, "annualize is the plain price ratio");
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
