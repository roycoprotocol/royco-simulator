// ---------------------------------------------------------------------------
// scenarios.ts — srHYBond market presets, config builder, and the historical
// NAV series for the backtest. The senior/junior tranche accounting
// (lib/try/engine.ts, lib/try/backtest.ts) is fund-agnostic, so this module
// reuses it as-is via import: only the underlying fund data and UI copy
// differ from lib/try/scenarios.ts. Config semantics (deposits, yield share,
// observation window, min coverage) are IDENTICAL to TRY.
//
// Data provenance (HYBOND_NAV_SERIES): the underlying is the REAL daily NAV
// history of the BNY Global Short-Dated High Yield Bond Fund, 2,394 business-day
// points from inception 2016-11-30 (rebased to 1.0000) through 2026-07-02, loaded
// verbatim from lib/hybond/data/nav-daily.json. It reconciles with Insight's
// published composite June-to-June total returns to within 0.3%, so the path IS
// this fund's observed daily NAV. Every drawdown date, observation period, and
// Junior loss lock-in derived from it is therefore driven by real history: the
// COVID Feb-Mar 2020 selloff (real max drawdown -17.45%, 2020-02-20 to 2020-03-24)
// and the 2022 rate/high-yield selloff are events the mechanism actually sees.
//
// Caveats that remain true: HYBOND the token launched 1 April 2026 and has no
// multi-year history of its own, so applying a multi-year backtest to it is
// illustrative; no Royco market over HYBOND has been announced, so this is a
// mechanism illustration, not a product; and HYBOND's own management fee and the
// fund's charges would reduce these returns (no specific fee figure is asserted).
// ---------------------------------------------------------------------------
import { runBacktest, type PricePoint } from "@/lib/try/backtest";
import type { MarketConfig } from "@/lib/try/engine";
import { WAD } from "@/lib/try/engine";
import { buildConfig } from "@/lib/try/scenarios";
import navDaily from "./data/nav-daily.json";
export type { PricePoint };

// --- Exit buffer (HYBond-local) ---------------------------------------------
//
// Tenbin exposes the coverage liquidation threshold as an "exit buffer %" — the
// headroom Junior has before coverage is force-liquidated — rather than as a raw
// utilization. Port of tenbin-sims/index.html:737
// (utilizationPctFromBufferPct(v) = 10000 / max(v, 0.01)), then / 100 into WAD.
//
// Deliberately NOT added to TryParams/buildConfig: that would change the config
// /internal/try and lib/try/parity.ts are pinned to. HYBond layers it on top.

/** Exit buffer % → coverageLiquidationUtilizationWAD. 5% → 20e18. */
export const utilWadFromBufferPct = (b: number): bigint =>
  (BigInt(Math.round((100 / Math.max(b, 0.01)) * 1e6)) * WAD) / 1_000_000n;

/** Inverse of utilWadFromBufferPct. */
export const bufferPctFromUtilWad = (w: bigint): number => 100 / (Number(w) / 1e18);

/**
 * 0.9 = flatCurve's hardcoded targetUtilizationWAD (lib/try/scenarios.ts:24). At genesis
 * the market sits exactly at target utilization, so first-loss % and Junior's share of the
 * pool are locked together by: jr = minCoverage / target; depositJT = depositST * jr/(1-jr).
 * At the Balanced minCov 20 / ST 1000 this gives 285.714286 after NAV input rounding
 * (Junior = 22.22% of the pool, U = 0.9).
 */
const GENESIS_TARGET_UTIL_PCT = 90; // 0.9e18, as a percent (exact in binary float; 0.9 is not)

/**
 * Junior deposit implied by a first-loss-protection %, given the Senior deposit.
 *
 * Algebraically identical to depositST * jr/(1-jr) with jr = minCoveragePct/100/0.9, but
 * folded to a single ratio: jr/(1-jr) = minCov/(90-minCov). The folded form avoids an
 * avoidable intermediate floating-point rounding before NAV inputs are rounded to 6 decimals.
 */
export function juniorFromFirstLossPct(depositST: number, minCoveragePct: number): number {
  const denom = GENESIS_TARGET_UTIL_PCT - minCoveragePct;
  if (denom <= 0) return Infinity; // first loss >= target utilization: no finite Junior satisfies it
  return (depositST * minCoveragePct) / denom;
}

/**
 * `fixedTermDurationSeconds` is a uint24 in the real accountant, so the hard ceiling is
 * 16,777,215s = 194.18 days. Min mirrors Tenbin's 7.
 */
export const OBSERVATION_DAYS_MIN = 7;
export const OBSERVATION_DAYS_MAX = 194;

export interface HybondParams {
  depositST: number;
  depositJT: number;
  seniorShareToJuniorPct: number;
  observationDays: number;
  minCoveragePct: number;
  /** Junior's headroom before coverage is force-liquidated, %. */
  exitBufferPct: number;
  /** When true, depositJT is derived from minCoveragePct via juniorFromFirstLossPct. */
  linkJuniorToFirstLoss: boolean;
}

/**
 * The page lands on the Balanced rung, so the ladder shows a named preset rather than
 * "Custom" on first paint (tenbin likewise boots onto a preset). These three knobs are
 * Balanced's, kept in sync with the `rung` call below; Junior derives from first-loss,
 * so it is computed here rather than hand-set.
 */
export const HYBOND_DEFAULT_PARAMS: HybondParams = {
  depositST: 1000,
  exitBufferPct: 5, // Tenbin's default → 20e18
  linkJuniorToFirstLoss: true,
  minCoveragePct: 20,
  observationDays: 45,
  seniorShareToJuniorPct: 47,
  depositJT: juniorFromFirstLossPct(1000, 20),
};

/** TRY's config plus HYBond's exit-buffer-derived liquidation threshold. */
export function buildHybondConfig(p: HybondParams): MarketConfig {
  return {
    ...buildConfig({
      firstLossPct: (p.depositJT / (p.depositST + p.depositJT)) * 100,
      observationDays: p.observationDays,
      seniorShareToJuniorPct: p.seniorShareToJuniorPct,
      juniorBufferRemainingPct: p.minCoveragePct,
      seniorExitBonusPct: 0.25,
    }),
    coverageLiquidationUtilizationWAD: utilWadFromBufferPct(p.exitBufferPct),
  };
}

// --- Presets (identical mechanism params to TRY's ladder) -------------------

/**
 * `note` was deliberately REMOVED rather than repopulated: it was never rendered (the ladder
 * builds its copy from the live screen rows), so it was a second, silently-diverging
 * description of each preset. The ladder's prose is derived from screenPresets() instead, so
 * there is exactly one source of truth for what a preset is and what it does.
 */
export interface Preset {
  id: "conservative" | "balanced" | "aggressive";
  label: string;
  params: HybondParams;
}

/** Senior deposit every preset is sized against. Junior is derived from it, never hand-set. */
const PRESET_DEPOSIT_ST = 1000;

/**
 * A rung of the ladder, in Tenbin's own three knobs (tenbin-sims/index.html:302-303):
 * first-loss %, observation days, and the % of Senior yield paid to Junior.
 *
 * Junior is DERIVED from the first-loss % (never hand-set), which is the Tenbin model:
 * first-loss is the risk dial and the deposit follows from it. So every preset carries
 * linkJuniorToFirstLoss:true, and selecting one leaves that link ON.
 */
const rung = (
  id: Preset["id"],
  label: string,
  cov: number,
  obs: number,
  ys: number,
): Preset => ({
  id,
  label,
  params: {
    ...HYBOND_DEFAULT_PARAMS,
    depositST: PRESET_DEPOSIT_ST,
    depositJT: juniorFromFirstLossPct(PRESET_DEPOSIT_ST, cov),
    minCoveragePct: cov,
    observationDays: obs,
    seniorShareToJuniorPct: ys,
    linkJuniorToFirstLoss: true,
  },
});

/**
 * The ladder follows Tenbin's REAL direction (stMXN, tenbin-sims/index.html:302), strictly
 * monotonic on all three knobs as risk increases:
 *   first-loss DECREASES, observation DECREASES, yield-share-to-Junior INCREASES.
 *
 * The previous ladder was backwards on two of the three: yield share was FLAT at 53 across
 * all rungs (so it did not differentiate them at all), and Aggressive carried the LONGEST
 * observation (120d) rather than the shortest.
 *
 * The series is now REAL daily NAV, so observation terms resolve at daily resolution: 7 to
 * 194 days are all distinct, and Aggressive's 16-day observation is a genuine 16-day term
 * (no longer rounded up to the next month end). The new ladder is centered on the calibrated
 * Balanced target: cov (24/20/18 → Junior 363.64/285.71/250), obs (60/45/16), and ys
 * (34/47/59). The wider yield-share ladder offsets the smaller Junior cushion and shorter
 * recovery term so Junior's historical average return rises with risk (6.35%/7.10%/7.97%)
 * instead of falling. Balanced still gives Senior about 5.05%/yr, and every historical
 * restart remains Senior-loss-free at both replenishment settings on all three rungs.
 */
export const PRESETS: Preset[] = [
  rung("conservative", "Conservative", 24, 60, 34),
  rung("balanced", "Balanced", 20, 45, 47),
  rung("aggressive", "Aggressive", 18, 16, 59),
];

/**
 * Run every preset through the real engine and check the claim the UI makes about them:
 * Senior is never marked down. This makes the assertion falsifiable rather than prose.
 *
 * The screen runs each preset at BOTH maintainJuniorCoverage settings and passes only if
 * Senior is untouched in both. The replenishment assumption is the optimistic one, so
 * screening it alone would let a preset that only protects Senior WITH fresh Junior capital
 * show a Pass badge. The hard requirement is that even the most aggressive rung never marks
 * Senior down, replenished or not.
 *
 * The row also carries the inputs and outcomes the ladder's PROSE describes, so that prose can
 * be derived from the same runs instead of hand-written. Hand-written prose drifts: it claimed
 * Aggressive had the "shorter recovery time" and "more erased recovery claims" when the preset
 * in fact had the LONGEST term (120d) and the FEWEST erasures.
 */
export interface PresetScreenRow {
  id: Preset["id"];
  label: string;
  pass: boolean;
  /** Worst case across BOTH maintain settings, which is what `pass` is decided on. */
  seniorMarkdownEvents: number;
  seniorMaxDrawdown: number;
  /** Inputs, echoed so prose never has to reach back into PRESETS and desynchronise. */
  depositJT: number;
  observationDays: number;
  minCoveragePct: number;
  seniorShareToJuniorPct: number;
  /** Actual Junior share of total genesis capital; distinct from the minimum coverage input. */
  genesisFirstLossPct: number;
  /** Outcomes on this series, as run with the product's maintained-coverage assumption. */
  juniorEnd: number; // Junior index at the end of the run (100 = genesis)
  seniorEnd: number;
  juniorAvgYr: number;
  seniorAvgYr: number;
  erasedRecoveryClaims: number;
}

/**
 * Screens the ladder over `series`. The caller passes the ACTIVE backtest window, so the
 * badges and the ladder prose describe what selecting a preset would do to the market the
 * user is actually looking at, rather than to a full history they may have windowed away.
 */
export function screenPresets(series: PricePoint[] = HYBOND_NAV_SERIES): PresetScreenRow[] {
  return PRESETS.map((p) => {
    const run = (maintainJuniorCoverage: boolean) =>
      runBacktest({
        config: buildHybondConfig(p.params),
        depositST: p.params.depositST,
        depositJT: p.params.depositJT,
        series,
        maintainJuniorCoverage,
      });
    const maintained = run(true);
    const exposed = run(false);
    const first = maintained.steps[0];
    const last = maintained.steps[maintained.steps.length - 1];
    const seniorMarkdownEvents = Math.max(
      maintained.seniorMarkdownEvents,
      exposed.seniorMarkdownEvents,
    );
    const seniorMaxDrawdown = Math.max(maintained.seniorMaxDrawdown, exposed.seniorMaxDrawdown);
    return {
      id: p.id,
      label: p.label,
      pass: seniorMarkdownEvents === 0 && seniorMaxDrawdown < 0.0005,
      seniorMarkdownEvents,
      seniorMaxDrawdown,
      depositJT: p.params.depositJT,
      observationDays: p.params.observationDays,
      minCoveragePct: p.params.minCoveragePct,
      seniorShareToJuniorPct: p.params.seniorShareToJuniorPct,
      genesisFirstLossPct:
        ((first ? Number(first.jtEff) / 1e18 : p.params.depositJT) /
          (p.params.depositST + p.params.depositJT)) *
        100,
      juniorEnd: last ? last.jtIndex : 100,
      seniorEnd: last ? last.stIndex : 100,
      juniorAvgYr: maintained.juniorAvgYr,
      seniorAvgYr: maintained.seniorAvgYr,
      erasedRecoveryClaims: maintained.erasureEvents.length,
    };
  });
}

// --- HYBond underlying NAV series (REAL daily NAV) -----------------------------
//
// The REAL daily NAV history of the BNY Global Short-Dated High Yield Bond Fund,
// loaded verbatim from lib/hybond/data/nav-daily.json: 2,394 business-day points,
// {date:"YYYY-MM-DD", price:number}, ascending, from inception 2016-11-30 (rebased
// to 1.0000) through 2026-07-02 (1.7318). Weekdays only; weekend/holiday gaps are
// handled by the engine and backtest.ts (variable dt between points), exactly as
// /internal/try runs on real daily data. The path reconciles with Insight's
// published composite June-to-June total returns to within 0.3%, so it genuinely
// IS this fund's observed daily NAV, not a reconstruction (see the header comment
// for provenance and remaining caveats).

interface NavDailyFile {
  points: { date: string; price: number }[];
}

/**
 * The single full-history series: 2,394 real daily NAV points, 2016-11-30 through
 * 2026-07-02. The UI's "Backtest window" brush SLICES this series and re-runs the
 * market over the slice, so the window start is a real new genesis (deposits happen
 * there, and every metric on the page recomputes over the window). This array is the
 * full history the brush selects from, and the brush's own preview always shows all
 * of it.
 */
export const HYBOND_NAV_SERIES: PricePoint[] = (navDaily as NavDailyFile).points.map(
  (p): PricePoint => ({ date: p.date, price: p.price }),
);
