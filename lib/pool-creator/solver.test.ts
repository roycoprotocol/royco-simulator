// Run: npx tsx lib/pool-creator/solver.test.ts
// (package.json is SHA-locked, so this cannot be wired into `npm test`.)

import {
  createPoolBase,
  runPoolScenario,
  shapeYdmAnchors,
  buildPoolConfig,
  buildPoolBalances,
  type PoolTerms,
} from "@/lib/pool-creator/config";
import {
  solvePool,
  solveCoverage,
  solveMinLiquidity,
  solveRiskShare,
  solveLiquidityShare,
  seniorApyBand,
  exitShareBand,
  coverageLossLimit,
  exitShareAtReferenceSlippage,
  describeTerms,
  isFeasible,
} from "@/lib/pool-creator/solver";
import { createEmptyDraft } from "@/lib/pool-creator/draft";

let failures = 0;
let checks = 0;

function ok(condition: boolean, label: string, detail = ""): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(actual: number, expected: number, tol: number, label: string): void {
  ok(
    Math.abs(actual - expected) <= tol,
    label,
    `got ${actual.toFixed(6)}, want ${expected.toFixed(6)} ±${tol}`,
  );
}

const BASE_TERMS: PoolTerms = {
  coverage: 0.1,
  minLiquidity: 0.15,
  recoveryDays: 7,
  riskYieldShare: 0.1,
  liquidityYieldShare: 0.13,
};

// ---------------------------------------------------------------------------
console.log("\n1. YDM anchor shaping respects the engine's share caps");
// ---------------------------------------------------------------------------
{
  const { riskYDM, liqYDM } = shapeYdmAnchors(0.1, 0.13, "adaptive", 0.2);
  ok(riskYDM.y0 <= riskYDM.yTarget && riskYDM.yTarget <= riskYDM.y100, "risk anchors ordered");
  ok(liqYDM.y0 <= liqYDM.yTarget && liqYDM.yTarget <= liqYDM.y100, "liq anchors ordered");
  ok(riskYDM.mode === "adaptive", "adaptive mode threaded through");
  near(riskYDM.y100, 0.3, 1e-9, "risk y100 = yTarget + spread");

  // The pathological case: shares so large the default spreads would breach 1.
  const tight = shapeYdmAnchors(0.45, 0.45, "static", 0.2);
  ok(
    tight.riskYDM.y100 + tight.liqYDM.y100 <= 1 + 1e-12,
    "spreads shrink so y100 sum stays within 100%",
    `${tight.riskYDM.y100} + ${tight.liqYDM.y100}`,
  );

  // And the engine must accept it rather than throwing INVALID_YIELD_SHARE_CONFIG.
  const cfg = buildPoolConfig(createPoolBase(), {
    ...BASE_TERMS,
    riskYieldShare: 0.45,
    liquidityYieldShare: 0.45,
  });
  ok(cfg.maxJTYieldShare + cfg.maxLTYieldShare <= 1 + 1e-12, "engine caps hold at the extreme");
}

// ---------------------------------------------------------------------------
console.log("2. Perpetual markets (recoveryDays = 0) are expressible");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.0828 });
  const cfg = buildPoolConfig(base, { ...BASE_TERMS, recoveryDays: 0 });
  ok(cfg.fixedTermDurationSec === 0, "fixedTermDurationSec is 0 for a perpetual market");

  const perpetual = runPoolScenario(base, { ...BASE_TERMS, recoveryDays: 0 });
  ok(Number.isFinite(perpetual.seniorApy), "perpetual market simulates", String(perpetual.seniorApy));
  ok(perpetual.seniorApy > 0, "perpetual Senior APY is positive");
}

// ---------------------------------------------------------------------------
console.log("3. Production defaults (adaptive YDM + non-zero fees) simulate");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.0828 });
  ok(base.ydmMode === "adaptive", "adaptive is the default mode");
  ok(base.stProtocolFee === 0.1, "10% Senior protocol fee by default");
  ok(base.jtYieldShareProtocolFee === 0.45, "45% risk-premium protocol fee by default");

  const r = runPoolScenario(base, BASE_TERMS);
  ok(Number.isFinite(r.seniorApy) && Number.isFinite(r.juniorApy) && Number.isFinite(r.liquidityApy),
    "all three APYs finite under production shape",
    JSON.stringify(r));
  ok(r.seniorApy > 0 && r.seniorApy < base.sourceApy, "Senior sits below the base strategy");
}

// ---------------------------------------------------------------------------
console.log("4. Monotonicity the bisections depend on");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.0828 });

  let prev = -Infinity;
  for (const coverage of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5]) {
    const v = coverageLossLimit(base, { ...BASE_TERMS, coverage });
    ok(v > prev, "coverageLossLimit increases with coverage", `at cov=${coverage}`);
    prev = v;
  }

  prev = -Infinity;
  for (const minLiquidity of [0.03, 0.08, 0.15, 0.3, 0.5]) {
    const v = exitShareAtReferenceSlippage(base, { ...BASE_TERMS, minLiquidity });
    ok(v > prev, "exit share increases with minLiquidity", `at minLiq=${minLiquidity}`);
    prev = v;
  }

  prev = Infinity;
  for (const riskYieldShare of [0, 0.1, 0.2, 0.3, 0.4]) {
    const v = runPoolScenario(base, { ...BASE_TERMS, riskYieldShare }).seniorApy;
    ok(v < prev, "Senior APY decreases as the risk share rises", `at risk=${riskYieldShare}`);
    prev = v;
  }

  prev = -Infinity;
  for (const liquidityYieldShare of [0, 0.08, 0.15, 0.25, 0.35]) {
    const v = runPoolScenario(base, { ...BASE_TERMS, liquidityYieldShare }).liquidityApy;
    ok(v > prev, "LP APY increases as the liquidity share rises", `at liq=${liquidityYieldShare}`);
    prev = v;
  }
}

// ---------------------------------------------------------------------------
console.log("5. Individual inversions land on their targets");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.0828 });

  for (const target of [0.02, 0.04, 0.08, 0.15]) {
    const r = solveCoverage(base, BASE_TERMS, target);
    ok(!r.clamped, `coverage reachable for a ${target * 100}% cushion`);
    near(r.achieved, target, 5e-4, `coverage inversion hits ${target * 100}%`);
  }

  for (const target of [0.02, 0.035, 0.06]) {
    const r = solveMinLiquidity(base, BASE_TERMS, target);
    ok(!r.clamped, `exit share reachable at ${target * 100}%`);
    near(r.achieved, target, 5e-4, `minLiquidity inversion hits ${target * 100}%`);
  }

  const band = seniorApyBand(base, BASE_TERMS);
  ok(band.min < band.max, "senior band is ordered", JSON.stringify(band));
  const mid = (band.min + band.max) / 2;
  const risk = solveRiskShare(base, BASE_TERMS, mid);
  ok(!risk.clamped, "mid-band Senior APY is reachable");
  near(risk.achieved, mid, 5e-4, "risk-share inversion hits mid-band Senior APY");

  const lband = { min: 0.04, max: 0.18 };
  const lTarget = (lband.min + lband.max) / 2;
  const lq = solveLiquidityShare(base, BASE_TERMS, lTarget);
  near(lq.achieved, lTarget, 5e-3, "liquidity-share inversion hits its target");
}

// ---------------------------------------------------------------------------
console.log("6. Clamping reports honestly instead of silently missing");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.0828 });
  const impossible = solveRiskShare(base, BASE_TERMS, 5.0); // 500% Senior
  ok(impossible.clamped, "an unreachable Senior APY is flagged clamped");
  ok(impossible.achieved < 1, "clamped result reports the achievable value");

  // Regression: asking for a target that sits a few basis points above the
  // reachable maximum used to emit "cannot earn 7.0% ... reachable is 7.0%",
  // which reads as nonsense. A miss smaller than display precision is not news.
  const band = seniorApyBand(base, BASE_TERMS);
  const solved = solvePool(base, {
    ...createEmptyDraft().goals,
    seniorApy: band.max + 0.0003, // 3bp past the edge
    liquidityApy: 0.11,
  });
  const seniorNotes = solved.notes.filter((n) => n.code === "senior-apy-clamped");
  ok(seniorNotes.length === 0, "a sub-basis-point miss produces no note", JSON.stringify(seniorNotes));

  // But a miss the user would actually notice still reports.
  const wayOff = solvePool(base, {
    ...createEmptyDraft().goals,
    seniorApy: band.max + 0.05, // 5 whole points past the edge
    liquidityApy: 0.11,
  });
  const loudNotes = wayOff.notes.filter((n) => n.code === "senior-apy-clamped");
  ok(loudNotes.length === 1, "a material miss still reports");
  ok(
    loudNotes.length === 1 && Math.abs(loudNotes[0].achievable - loudNotes[0].requested) > 0.0015,
    "a reported note always names two genuinely different numbers",
  );
}

// ---------------------------------------------------------------------------
console.log("6b. Engine-infeasible regions never escape the solver");
// ---------------------------------------------------------------------------
{
  // Regression: a grid scan over (risk, liquidity) throws PREMIUMS_EXCEED_SENIOR_YIELD
  // exactly on the r + l = 1 diagonal and INVALID_YIELD_SHARE_CONFIG beyond it.
  // Bisection used to probe straight into that region and crash the page.
  const base = createPoolBase({ sourceApy: 0.14 });
  const terms: PoolTerms = {
    coverage: 0.072,
    minLiquidity: 0.1267,
    recoveryDays: 7,
    riskYieldShare: 0.1,
    liquidityYieldShare: 0.13,
  };

  for (const r of [0.1, 0.3, 0.5, 0.7, 0.8]) {
    let threw = false;
    try {
      solveLiquidityShare(base, { ...terms, riskYieldShare: r }, 0.13);
    } catch {
      threw = true;
    }
    ok(!threw, `solveLiquidityShare survives riskYieldShare=${r}`);
  }
  for (const l of [0.1, 0.3, 0.5, 0.7, 0.8]) {
    let threw = false;
    try {
      solveRiskShare(base, { ...terms, liquidityYieldShare: l }, 0.05);
    } catch {
      threw = true;
    }
    ok(!threw, `solveRiskShare survives liquidityYieldShare=${l}`);
  }

  // The solver's own bounds must keep the pair off the unsafe diagonal.
  const solved = solvePool(base, {
    ...createEmptyDraft().goals,
    seniorApy: 0.001, // absurdly low: pushes the risk share as high as it will go
    liquidityApy: 5.0, // absurdly high: pushes the liquidity share as high as it will go
  });
  ok(
    solved.riskYieldShare + solved.liquidityYieldShare <= 0.95 + 1e-9,
    "extreme goals still respect the combined-share ceiling",
    `${solved.riskYieldShare} + ${solved.liquidityYieldShare}`,
  );
  ok(solved.notes.length > 0, "extreme goals are reported as clamped, not silently missed");

  // And an infeasible hand-override reports NaN rather than throwing.
  const wild = describeTerms(base, { ...terms, riskYieldShare: 0.6, liquidityYieldShare: 0.6 });
  ok(Number.isNaN(wild.seniorApy), "an infeasible override degrades to NaN, not an exception");
  ok(!isFeasible(base, { ...terms, riskYieldShare: 0.6, liquidityYieldShare: 0.6 }),
    "isFeasible reports the infeasible pair");
  ok(isFeasible(base, terms), "isFeasible accepts a normal pair");
}

// ---------------------------------------------------------------------------
console.log("7. Full solve hits every goal simultaneously");
// ---------------------------------------------------------------------------
{
  const cases = [
    { apy: 0.0828, drawdown: 0.04, exit: 0.03, senior: 0.062, lp: 0.11 },
    { apy: 0.14, drawdown: 0.08, exit: 0.025, senior: 0.09, lp: 0.13 },
    { apy: 0.05, drawdown: 0.02, exit: 0.02, senior: 0.038, lp: 0.09 },
    { apy: 0.1, drawdown: 0.12, exit: 0.04, senior: 0.07, lp: 0.12 },
  ];

  for (const c of cases) {
    const base = createPoolBase({ sourceApy: c.apy });
    const goals = {
      ...createEmptyDraft().goals,
      protectedDrawdown: c.drawdown,
      exitShareOfSenior: c.exit,
      seniorApy: c.senior,
      liquidityApy: c.lp,
    };
    const t0 = performance.now();
    const solved = solvePool(base, goals);
    const ms = performance.now() - t0;

    const label = `apy=${c.apy} cushion=${c.drawdown}`;
    ok(solved.notes.length === 0, `${label}: no clamping notes`, JSON.stringify(solved.notes));
    near(solved.coverageLossLimit, c.drawdown, 1e-3, `${label}: cushion met`);
    near(solved.exitShareOfSenior, c.exit, 1e-3, `${label}: exit depth met`);
    near(solved.seniorApy, c.senior, 2e-3, `${label}: Senior APY met`);
    near(solved.liquidityApy, c.lp, 5e-3, `${label}: LP APY met`);
    ok(solved.riskYieldShare + solved.liquidityYieldShare <= 1, `${label}: shares within 100%`);
    ok(ms < 1500, `${label}: solved in under 1.5s`, `${ms.toFixed(0)}ms / ${solved.evaluations} evals`);
    console.log(
      `     ${label.padEnd(30)} ${ms.toFixed(0).padStart(5)}ms  ${String(solved.evaluations).padStart(4)} evals` +
      `  cov=${solved.coverage.toFixed(4)} minLiq=${solved.minLiquidity.toFixed(4)}` +
      `  r=${solved.riskYieldShare.toFixed(4)} l=${solved.liquidityYieldShare.toFixed(4)}`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("8. Balances follow the certified sizing ratios");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.0828, initialSeniorSize: 1_000_000 });
  const terms = { ...BASE_TERMS, coverage: 0.1, minLiquidity: 0.15 };
  const b = buildPoolBalances(base, terms);
  // The same relations scripts/day-simulator/verify.mjs asserts on a manifest.
  near(b.jt, (1_000_000 * 0.1) / (0.9 - 0.1), 1e-6, "Junior = ST·cov/(0.9−cov)");
  near(b.lt, (1_000_000 * 0.15) / 0.9, 1e-6, "LP = ST·minLiq/0.9");
  ok(b.st === 1_000_000, "Senior is the size the user chose");
}

// ---------------------------------------------------------------------------
console.log("9. Reachable bands are sane (drives slider bounds)");
// ---------------------------------------------------------------------------
{
  const base = createPoolBase({ sourceApy: 0.0828 });
  const eb = exitShareBand(base, BASE_TERMS);
  console.log(`     exit-share band: ${(eb.min * 100).toFixed(2)}% – ${(eb.max * 100).toFixed(2)}%`);
  ok(eb.min < eb.max && eb.max < 0.5, "exit-share band is narrow and ordered");

  const sb = seniorApyBand(base, BASE_TERMS);
  console.log(`     senior-apy band: ${(sb.min * 100).toFixed(2)}% – ${(sb.max * 100).toFixed(2)}%`);
  ok(sb.max <= base.sourceApy + 1e-9, "Senior never exceeds the base strategy");
}

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`,
);
process.exit(failures === 0 ? 0 : 1);
