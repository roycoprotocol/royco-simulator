// =============================================================================
// Pool creator — outcome-first solver
// -----------------------------------------------------------------------------
// The wizard asks for outcomes ("protect Senior from the first 4% drawdown",
// "Senior should earn 7%") and this file inverts them into accountant
// parameters by bisecting over the real engine. It contains no accounting
// formulas — only search control flow — which is the same thing
// `lib/day-simulator-template/explainer.ts` already does when it bisects for
// the coverage loss limit and the pool boundary.
//
// `scripts/day-simulator/calibrate.ts` does a comparable job for two of these
// knobs, but it is SHA-locked and node-only (it reads `process.argv` and the
// filesystem), so it cannot be imported into the browser. This is a
// client-safe rewrite over the same objective function.
//
// WHY THIS IS CHEAP -----------------------------------------------------------
// The parameter system is triangular. Measured against the engine on the
// susdai market (sourceApy 8.28%, cov 0.09, minLiq 0.15):
//
//   knob ↑                     Senior          Junior          LP
//   riskYieldShare  0→0.4      7.17 → 4.12     8.28 → 36.05    ~flat
//   liquidityShare  0→0.3      7.57 → 5.25     exactly flat    5.52 → 19.18
//   coverage     0.03→0.5      6.595 → 6.590   25.26 → 8.75    exactly flat
//   minLiquidity 0.05→0.4      ~flat           exactly flat    24.00 → 7.18
//
// So coverage and minLiquidity are pure *sizing* knobs, and only the two yield
// shares move Senior. That means one forward pass with no outer fixed point:
// size the cushion, size the exit pool, then price the two premiums.
// =============================================================================

import { buildDayExplainerMetrics } from "@/lib/day-simulator-template/explainer";
import {
  buildPoolBalances,
  buildPoolConfig,
  runPoolScenario,
  MAX_TOTAL_YIELD_SHARE,
  type PoolBase,
  type PoolTerms,
} from "@/lib/pool-creator/config";
import type { PoolGoals } from "@/lib/pool-creator/draft";

// ---------------------------------------------------------------------------
// Bisection
// ---------------------------------------------------------------------------

type BisectResult = {
  x: number;
  achieved: number;
  /** True when the target sat outside the reachable range and we returned a bound. */
  clamped: boolean;
  evaluations: number;
};

/**
 * Invert a monotone scalar function by bisection.
 * `direction` is +1 when `f` increases in `x`, -1 when it decreases.
 *
 * INFEASIBLE PROBES ------------------------------------------------------------
 * The accountant legitimately throws on configurations it cannot account for
 * (`PREMIUMS_EXCEED_SENIOR_YIELD`, `INVALID_YIELD_SHARE_CONFIG`, coverage and
 * liquidity gate violations). Those regions always sit at the *high* end of
 * every knob we search, so a throw is treated as "past the goal" — which
 * makes bisection retreat into the feasible region on the next step.
 *
 * This is what keeps a slider drag from ever white-screening the page: no
 * engine exception escapes the solver.
 */
function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  target: number,
  direction: 1 | -1,
  iterations = 26,
): BisectResult {
  let evaluations = 0;
  /** Returns +Infinity for an infeasible probe, so the search steers away. */
  const g = (x: number): number => {
    evaluations += 1;
    try {
      const value = direction * f(x);
      return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  const goal = direction * target;

  const gLo = g(lo);
  // The bottom of the range is already past the goal — or is itself infeasible,
  // which means nothing in this range works.
  if (gLo >= goal) {
    return {
      x: lo,
      achieved: Number.isFinite(gLo) ? direction * gLo : Number.NaN,
      clamped: true,
      evaluations,
    };
  }
  const gHi = g(hi);
  if (gHi <= goal) return { x: hi, achieved: direction * gHi, clamped: true, evaluations };

  let a = lo;
  let b = hi;
  let mid = (a + b) / 2;
  let gMid = gLo;
  for (let i = 0; i < iterations; i += 1) {
    mid = (a + b) / 2;
    gMid = g(mid);
    if (gMid < goal) a = mid;
    else b = mid;
  }
  // `a` is the last probe known to be feasible and below goal; `mid` may have
  // landed on an infeasible probe, so report the feasible side.
  if (!Number.isFinite(gMid)) {
    const gA = g(a);
    return { x: a, achieved: Number.isFinite(gA) ? direction * gA : Number.NaN, clamped: false, evaluations };
  }
  return { x: mid, achieved: direction * gMid, clamped: false, evaluations };
}

// ---------------------------------------------------------------------------
// Objective functions
// ---------------------------------------------------------------------------

const withTerms = (terms: PoolTerms, over: Partial<PoolTerms>): PoolTerms => ({
  ...terms,
  ...over,
});

/**
 * The largest strategy drawdown that leaves Senior's balance untouched, as the
 * accountant computes it. Increasing in `coverage`.
 */
export function coverageLossLimit(base: PoolBase, terms: PoolTerms): number {
  const cfg = buildPoolConfig(base, terms);
  const initial = buildPoolBalances(base, terms);
  return buildDayExplainerMetrics(cfg, initial).coverage.coverageLossLimit;
}

/**
 * The share of a Senior position sellable into the exit pool at the 1%
 * reference slippage. Increasing in `minLiquidity`.
 */
export function exitShareAtReferenceSlippage(base: PoolBase, terms: PoolTerms): number {
  const cfg = buildPoolConfig(base, terms);
  const initial = buildPoolBalances(base, terms);
  return buildDayExplainerMetrics(cfg, initial).liquidity.referenceSellShareOfSenior;
}

// ---------------------------------------------------------------------------
// Reachable ranges — so the UI can bound its sliders and never offer the impossible
// ---------------------------------------------------------------------------

export const COVERAGE_BOUNDS = { lo: 0.005, hi: 0.6 } as const;
export const MIN_LIQUIDITY_BOUNDS = { lo: 0.02, hi: 0.6 } as const;
export const SHARE_BOUNDS = { lo: 0, hi: 0.8 } as const;

/**
 * The most one premium may take, given what the other already takes.
 * Keeps the pair inside `MAX_TOTAL_YIELD_SHARE`, which is what stops the
 * accountant throwing on the `r + l = 1` diagonal.
 */
const shareCeiling = (otherShare: number): number =>
  Math.max(SHARE_BOUNDS.lo, Math.min(SHARE_BOUNDS.hi, MAX_TOTAL_YIELD_SHARE - otherShare));

export type Band = { min: number; max: number };

/** What Senior can be made to earn, holding everything else fixed. */
export function seniorApyBand(base: PoolBase, terms: PoolTerms): Band {
  const max = runPoolScenario(base, withTerms(terms, { riskYieldShare: SHARE_BOUNDS.lo })).seniorApy;
  const capped = shareCeiling(terms.liquidityYieldShare);
  const min = runPoolScenario(base, withTerms(terms, { riskYieldShare: capped })).seniorApy;
  return { min, max };
}

/** How deep a cushion is reachable. */
export function protectedDrawdownBand(base: PoolBase, terms: PoolTerms): Band {
  return {
    min: coverageLossLimit(base, withTerms(terms, { coverage: COVERAGE_BOUNDS.lo })),
    max: coverageLossLimit(base, withTerms(terms, { coverage: COVERAGE_BOUNDS.hi })),
  };
}

/**
 * How much of a Senior position can be made instantly sellable.
 * Worth calling before rendering the step-3 slider: at a typical
 * `minLiquidity` of 15% this is only ~3%, so a naive 0–50% slider would spend
 * most of its travel in unreachable territory.
 */
export function exitShareBand(base: PoolBase, terms: PoolTerms): Band {
  return {
    min: exitShareAtReferenceSlippage(base, withTerms(terms, { minLiquidity: MIN_LIQUIDITY_BOUNDS.lo })),
    max: exitShareAtReferenceSlippage(base, withTerms(terms, { minLiquidity: MIN_LIQUIDITY_BOUNDS.hi })),
  };
}

// ---------------------------------------------------------------------------
// Individual inversions
// ---------------------------------------------------------------------------

export type SolverNoteCode =
  | "coverage-clamped"
  | "exit-share-clamped"
  | "senior-apy-clamped"
  | "liquidity-apy-clamped";

export type SolverNote = {
  code: SolverNoteCode;
  /** Plain-English, with the achievable value in it. Shown verbatim in the UI. */
  message: string;
  /** The value the user asked for. */
  requested: number;
  /** The closest value the engine can actually produce. */
  achievable: number;
};

const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * How far a solve has to miss before it is worth telling the user about.
 *
 * A bisection that lands within a few basis points of the goal has, for every
 * practical purpose, hit it — and a note reading "cannot earn 7.0%, the
 * reachable figure is 7.0%" is worse than no note at all. 15bp is comfortably
 * above the bisection residual and below anything a user would notice.
 */
const NOTE_TOLERANCE = 0.0015;

/** True when a bound was hit AND the miss is large enough to matter. */
const missed = (result: { clamped: boolean; achieved: number }, requested: number): boolean =>
  result.clamped &&
  (!Number.isFinite(result.achieved) || Math.abs(result.achieved - requested) > NOTE_TOLERANCE);

/** Size the cushion so Senior is untouched by `protectedDrawdown`. */
export function solveCoverage(
  base: PoolBase,
  terms: PoolTerms,
  protectedDrawdown: number,
): BisectResult {
  return bisect(
    (coverage) => coverageLossLimit(base, withTerms(terms, { coverage })),
    COVERAGE_BOUNDS.lo,
    COVERAGE_BOUNDS.hi,
    protectedDrawdown,
    1,
    22,
  );
}

/** Size the exit pool so `exitShare` of a Senior position clears at ≤1% discount. */
export function solveMinLiquidity(
  base: PoolBase,
  terms: PoolTerms,
  exitShare: number,
): BisectResult {
  return bisect(
    (minLiquidity) => exitShareAtReferenceSlippage(base, withTerms(terms, { minLiquidity })),
    MIN_LIQUIDITY_BOUNDS.lo,
    MIN_LIQUIDITY_BOUNDS.hi,
    exitShare,
    1,
    20,
  );
}

/** Price the liquidity premium to hit an LP APY. Junior is invariant to this. */
export function solveLiquidityShare(
  base: PoolBase,
  terms: PoolTerms,
  targetLiquidityApy: number,
): BisectResult {
  return bisect(
    (liquidityYieldShare) =>
      runPoolScenario(base, withTerms(terms, { liquidityYieldShare })).liquidityApy,
    SHARE_BOUNDS.lo,
    shareCeiling(terms.riskYieldShare),
    targetLiquidityApy,
    1,
    24,
  );
}

/** Price the risk premium to hit a Senior APY. Senior falls as this rises. */
export function solveRiskShare(
  base: PoolBase,
  terms: PoolTerms,
  targetSeniorApy: number,
): BisectResult {
  return bisect(
    (riskYieldShare) => runPoolScenario(base, withTerms(terms, { riskYieldShare })).seniorApy,
    SHARE_BOUNDS.lo,
    shareCeiling(terms.liquidityYieldShare),
    targetSeniorApy,
    -1,
    24,
  );
}

// ---------------------------------------------------------------------------
// The full pass
// ---------------------------------------------------------------------------

export type SolvedTerms = PoolTerms & {
  seniorApy: number;
  juniorApy: number;
  liquidityApy: number;
  /** What the cushion actually buys, per the accountant. */
  coverageLossLimit: number;
  /** What the exit pool actually buys, per the accountant. */
  exitShareOfSenior: number;
  notes: SolverNote[];
  evaluations: number;
};

/**
 * Solve every knob from the user's goals.
 *
 * Order matters and follows the sensitivity table: cushion and exit pool first
 * (they do not move Senior), then the two premiums. The premium pair is
 * repeated because solving the risk share nudges LP by a few tenths of a point;
 * two extra rounds settle it well inside display precision.
 */
export function solvePool(base: PoolBase, goals: PoolGoals): SolvedTerms {
  const notes: SolverNote[] = [];
  let evaluations = 0;

  let terms: PoolTerms = {
    coverage: 0.1,
    minLiquidity: 0.15,
    recoveryDays: goals.recoveryDays,
    riskYieldShare: 0.1,
    liquidityYieldShare: 0.13,
  };

  // 1. Cushion.
  const cov = solveCoverage(base, terms, goals.protectedDrawdown);
  evaluations += cov.evaluations;
  terms = { ...terms, coverage: cov.x };
  if (missed(cov, goals.protectedDrawdown)) {
    notes.push({
      code: "coverage-clamped",
      requested: goals.protectedDrawdown,
      achievable: cov.achieved,
      message:
        `A ${pctText(goals.protectedDrawdown)} cushion is outside what this market can size. ` +
        `The deepest drawdown Senior can be protected from here is ${pctText(cov.achieved)}.`,
    });
  }

  // 2. Exit pool.
  const liq = solveMinLiquidity(base, terms, goals.exitShareOfSenior);
  evaluations += liq.evaluations;
  terms = { ...terms, minLiquidity: liq.x };
  if (missed(liq, goals.exitShareOfSenior)) {
    notes.push({
      code: "exit-share-clamped",
      requested: goals.exitShareOfSenior,
      achievable: liq.achieved,
      message:
        `Selling ${pctText(goals.exitShareOfSenior)} of a position under a 1% discount is outside ` +
        `what the exit pool can support. The most it can clear is ${pctText(liq.achieved)}.`,
    });
  }

  // 3 & 4. Price the two premiums, then settle the coupling.
  let lastLiq: BisectResult | null = null;
  let lastRisk: BisectResult | null = null;
  for (let round = 0; round < 3; round += 1) {
    lastLiq = solveLiquidityShare(base, terms, goals.liquidityApy);
    evaluations += lastLiq.evaluations;
    terms = { ...terms, liquidityYieldShare: lastLiq.x };

    lastRisk = solveRiskShare(base, terms, goals.seniorApy);
    evaluations += lastRisk.evaluations;
    terms = { ...terms, riskYieldShare: lastRisk.x };
  }

  if (lastRisk && missed(lastRisk, goals.seniorApy)) {
    notes.push({
      code: "senior-apy-clamped",
      requested: goals.seniorApy,
      achievable: lastRisk.achieved,
      message:
        `Senior cannot earn ${pctText(goals.seniorApy)} here. ` +
        `With this cushion and exit pool the reachable figure is ${pctText(lastRisk.achieved)}.`,
    });
  }
  if (lastLiq && missed(lastLiq, goals.liquidityApy)) {
    notes.push({
      code: "liquidity-apy-clamped",
      requested: goals.liquidityApy,
      achievable: lastLiq.achieved,
      message:
        `The exit pool cannot earn ${pctText(goals.liquidityApy)} here. ` +
        `The reachable figure is ${pctText(lastLiq.achieved)}.`,
    });
  }

  return { ...describeTerms(base, terms), notes, evaluations: evaluations + 1 };
}

/**
 * Evaluate a finished set of terms into everything the UI displays.
 * Never throws: an infeasible combination (only reachable through the Advanced
 * drawer, since the solver's own bounds exclude it) reports NaN outcomes, which
 * the summary rail renders as "—" rather than crashing the page.
 */
export function describeTerms(
  base: PoolBase,
  terms: PoolTerms,
): Omit<SolvedTerms, "notes" | "evaluations"> {
  const blank = { seniorApy: NaN, juniorApy: NaN, liquidityApy: NaN };
  let scenario: typeof blank;
  try {
    scenario = runPoolScenario(base, terms);
  } catch {
    scenario = blank;
  }
  let lossLimit = NaN;
  let exitShare = NaN;
  try {
    lossLimit = coverageLossLimit(base, terms);
    exitShare = exitShareAtReferenceSlippage(base, terms);
  } catch {
    /* leave as NaN */
  }
  return {
    ...terms,
    ...scenario,
    coverageLossLimit: lossLimit,
    exitShareOfSenior: exitShare,
  };
}

/** True when the accountant can account for these terms at all. */
export function isFeasible(base: PoolBase, terms: PoolTerms): boolean {
  try {
    runPoolScenario(base, terms);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply the Advanced drawer's raw overrides on top of a solved result, and
 * recompute the outcomes so the summary rail never shows a stale APY.
 */
export function applyOverrides(
  base: PoolBase,
  solved: SolvedTerms,
  overrides: Partial<PoolTerms>,
): SolvedTerms {
  const keys = Object.keys(overrides) as Array<keyof PoolTerms>;
  if (keys.length === 0) return solved;

  const terms: PoolTerms = {
    coverage: overrides.coverage ?? solved.coverage,
    minLiquidity: overrides.minLiquidity ?? solved.minLiquidity,
    recoveryDays: overrides.recoveryDays ?? solved.recoveryDays,
    riskYieldShare: overrides.riskYieldShare ?? solved.riskYieldShare,
    liquidityYieldShare: overrides.liquidityYieldShare ?? solved.liquidityYieldShare,
  };

  return {
    ...describeTerms(base, terms),
    notes: solved.notes,
    evaluations: solved.evaluations,
  };
}
