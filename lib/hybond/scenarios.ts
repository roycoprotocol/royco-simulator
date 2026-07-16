// ---------------------------------------------------------------------------
// scenarios.ts — srHYBond market presets, config builder, and historical
// NAV-series fixtures for the backtest. The senior/junior tranche accounting
// (lib/try/engine.ts, lib/try/backtest.ts) is fund-agnostic, so this module
// reuses it as-is via import: only the underlying fund data and UI copy
// differ from lib/try/scenarios.ts. Config semantics (deposits, yield share,
// observation window, min coverage) are IDENTICAL to TRY.
// ---------------------------------------------------------------------------
import { runBacktest, type PricePoint } from "@/lib/try/backtest";
import type { MarketConfig } from "@/lib/try/engine";
import { WAD } from "@/lib/try/engine";
import { buildConfig, TRY_DEFAULT_PARAMS, type TryParams } from "@/lib/try/scenarios";

export { buildConfig };
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
 * At minCov 30 / ST 1000 this gives exactly 500 (Junior = 33.3% of a 1500 pool, U = 0.9).
 */
const GENESIS_TARGET_UTIL_PCT = 90; // 0.9e18, as a percent (exact in binary float; 0.9 is not)

/**
 * Junior deposit implied by a first-loss-protection %, given the Senior deposit.
 *
 * Algebraically identical to depositST * jr/(1-jr) with jr = minCoveragePct/100/0.9, but
 * folded to a single ratio: jr/(1-jr) = minCov/(90-minCov). The unfolded form rounds
 * (30/100/0.9 is not representable) and returns 499.99999999999994 at the defaults; this
 * form returns exactly 500.
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

export interface HybondParams extends TryParams {
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
  ...TRY_DEFAULT_PARAMS,
  exitBufferPct: 5, // Tenbin's default → 20e18
  linkJuniorToFirstLoss: true,
  minCoveragePct: 30,
  observationDays: 45,
  seniorShareToJuniorPct: 62,
  depositJT: juniorFromFirstLossPct(TRY_DEFAULT_PARAMS.depositST, 30),
};

/** TRY's config plus HYBond's exit-buffer-derived liquidation threshold. */
export function buildHybondConfig(p: HybondParams): MarketConfig {
  return {
    ...buildConfig(p),
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
 * Known resolution limit, and why the rungs still differ: this series is sampled MONTHLY, so
 * an observation term under ~30 days cannot resolve before the next month end (obs 1/15/29/30
 * are byte-identical here). Aggressive's 16d therefore BEHAVES as ~30d. That is expected and
 * is not a collapse: cov (34/30/18 → Junior 607.14/500/250) and ys (61/62/75) still separate
 * the three runs, which were verified distinct through the accountant.
 */
export const PRESETS: Preset[] = [
  rung("conservative", "Conservative", 34, 60, 61),
  rung("balanced", "Balanced", 30, 45, 62),
  rung("aggressive", "Aggressive", 18, 16, 75),
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
      juniorEnd: last ? last.jtIndex : 100,
      seniorEnd: last ? last.stIndex : 100,
      juniorAvgYr: maintained.juniorAvgYr,
      seniorAvgYr: maintained.seniorAvgYr,
      erasedRecoveryClaims: maintained.erasureEvents.length,
    };
  });
}

// --- HYBond monthly "underlying" NAV series (composite proxy) ------------------
//
// This is NOT HYBOND's own NAV, and NOT the NAV of any BNY Mellon / Insight
// share class (e.g. IE00BD5CVM01). It is a proxy built from Insight's
// "Global short dated high yield bond composite" published rolling 12-month
// (Jun→Jun) total returns, income reinvested, GROSS OF FEES, per Insight as
// at 30 June 2025. A composite aggregates accounts following the strategy;
// it is not any single fund's or share class's track record, and gross of
// fees is not what a holder receives (HYBOND's management fee and the
// underlying fund's own charges are not reflected here).
//
// No specific management-fee figure is quoted anywhere in this repo: the "1.00%"
// this comment and the UI footer used to assert was single-sourced from OpenEden
// docs and could not be corroborated, so it was removed rather than cited. The
// qualitative claim (fees reduce these returns) stands on its own.
//
// SOURCE for the five checkpoints below (+9.69, -5.68, +12.22, +12.03, +9.33):
//   BNY "Global Short-Dated High Yield Bond" strategy overview PDF,
//   https://www.bny.com/assets/investments/imemea/pdfs/bny-mellon-global-short-dated-high-yield-bond-strategy-overview-sept-2026.pdf
//   Table "12-month returns (%)", row "Global short dated high yield bond composite".
//   Footnote: "Source: Insight as at 30 June 2025. Performance calculated as total
//   return, income reinvested, gross of fees, in USD."
// All five come from that single row; none are computed or inferred here.
//
// Only the five annual Jun→Jun checkpoints below are real, published data.
// Method: for each Jul→Jun window, take invented raw monthly returns, then
// apply a geometric correction factor f = (target / prod(1+r_i))^(1/12) to
// every month in the window so the window compounds to EXACTLY the published
// 12-month return, while preserving each month's shape/sign (f ≈ 1). The
// resulting monthly path, and every drawdown date, observation period, and
// Junior loss lock-in derived from it, is therefore SYNTHETIC, an artifact
// of this sequencing choice, not observed history.

interface ReturnWindow {
  targetPct: number; // published Jun→Jun total return, %
  rawMonthlyPct: number[]; // 12 raw monthly returns, %, Jul..Jun order
}

const RETURN_WINDOWS: ReturnWindow[] = [
  // Jul 2020 – Jun 2021 (target +9.69%)
  { targetPct: 9.69, rawMonthlyPct: [1.5, 1.2, 0.4, 0.3, 2.0, 1.2, 0.6, 0.5, 0.4, 0.8, 0.5, 0.4] },
  // Jul 2021 – Jun 2022 (target -5.68%) — the 2022 rate + HY-spread selloff
  { targetPct: -5.68, rawMonthlyPct: [0.4, 0.5, 0.2, 0.3, -0.4, 0.6, -1.2, -1.5, -0.8, -1.8, -1.0, -2.5] },
  // Jul 2022 – Jun 2023 (target +12.22%)
  { targetPct: 12.22, rawMonthlyPct: [2.5, 0.3, -1.5, 1.2, 1.5, 0.4, 2.0, 0.2, 0.5, 1.0, 0.6, 1.2] },
  // Jul 2023 – Jun 2024 (target +12.03%)
  { targetPct: 12.03, rawMonthlyPct: [1.2, 0.6, 0.2, 0.3, 1.8, 1.5, 0.8, 0.7, 0.9, 0.4, 0.9, 0.7] },
  // Jul 2024 – Jun 2025 (target +9.33%)
  { targetPct: 9.33, rawMonthlyPct: [1.0, 0.9, 0.9, 0.5, 0.7, 0.4, 0.9, 0.6, 0.3, -0.5, 1.0, 0.8] },
];

/** Month-end dates 2020-07 .. 2025-06, "YYYY-MM", matching RETURN_WINDOWS order. */
function buildDates(): string[] {
  const dates: string[] = [];
  let year = 2020;
  let month = 7; // July
  for (let i = 0; i < 60; i++) {
    dates.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return dates;
}

/**
 * Build the deterministic monthly HYBond NAV index (base 100 at 2020-06), by
 * geometrically correcting each Jul→Jun window's raw monthly returns so it
 * compounds exactly to the window's published 12-month total return.
 */
export function buildHybondNavSeries(): PricePoint[] {
  const dates = buildDates();
  const points: PricePoint[] = [{ date: "2020-06", price: 100 }];

  let nav = 100;
  let dateIdx = 0;
  for (const w of RETURN_WINDOWS) {
    const grossMonthly = w.rawMonthlyPct.map((r) => 1 + r / 100);
    const windowGrossProduct = grossMonthly.reduce((a, b) => a * b, 1);
    const targetGross = 1 + w.targetPct / 100;
    const f = Math.pow(targetGross / windowGrossProduct, 1 / 12);
    for (const g of grossMonthly) {
      nav = nav * g * f;
      points.push({ date: dates[dateIdx], price: nav });
      dateIdx++;
    }
  }
  return points;
}

/**
 * The single full-history series: 61 monthly points, 2020-06 through 2025-06.
 * The UI's "Backtest window" brush SLICES this series and re-runs the market over
 * the slice, so the window start is a real new genesis (deposits happen there, and
 * every metric on the page recomputes over the window). This array is the full
 * history the brush selects from, and the brush's own preview always shows all of it.
 */
export const HYBOND_NAV_SERIES: PricePoint[] = buildHybondNavSeries();
