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

export const HYBOND_DEFAULT_PARAMS: HybondParams = {
  ...TRY_DEFAULT_PARAMS,
  exitBufferPct: 5, // Tenbin's default → 20e18
  linkJuniorToFirstLoss: true,
};

/** TRY's config plus HYBond's exit-buffer-derived liquidation threshold. */
export function buildHybondConfig(p: HybondParams): MarketConfig {
  return {
    ...buildConfig(p),
    coverageLiquidationUtilizationWAD: utilWadFromBufferPct(p.exitBufferPct),
  };
}

// --- Presets (identical mechanism params to TRY's ladder) -------------------

export interface Preset {
  id: "conservative" | "balanced" | "aggressive";
  label: string;
  note: string;
  params: HybondParams;
}

export const PRESETS: Preset[] = [
  {
    id: "conservative",
    label: "Conservative",
    note: "Larger Junior cushion, longer 60-day observation.",
    params: {
      ...HYBOND_DEFAULT_PARAMS,
      depositST: 1000,
      depositJT: 750,
      observationDays: 60,
      linkJuniorToFirstLoss: false,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    note: "Junior ≈ 33% of the pool, 30-day observation. (matches the brief)",
    params: { ...HYBOND_DEFAULT_PARAMS },
  },
  {
    id: "aggressive",
    // 15 days was a fiction on this monthly series: obs of 1/15/29/30 all resolve to
    // byte-identical output, so the preset was indistinguishable from Balanced. 120 is
    // a genuinely distinct breakpoint AND is directionally aggressive: a longer term
    // keeps Junior's capital committed across more of the horizon.
    label: "Aggressive",
    note: "Smaller Junior cushion, longer 120-day observation.",
    params: {
      ...HYBOND_DEFAULT_PARAMS,
      depositST: 1000,
      depositJT: 300,
      observationDays: 120,
      linkJuniorToFirstLoss: false,
    },
  },
];

/**
 * Run every preset through the real engine and check the claim the UI makes about them:
 * Senior is never marked down. This makes the assertion falsifiable rather than prose.
 */
export interface PresetScreenRow {
  id: Preset["id"];
  label: string;
  pass: boolean;
  seniorMarkdownEvents: number;
  seniorMaxDrawdown: number;
}

export function screenPresets(series: PricePoint[] = HYBOND_NAV_SERIES): PresetScreenRow[] {
  return PRESETS.map((p) => {
    const r = runBacktest({
      config: buildHybondConfig(p.params),
      depositST: p.params.depositST,
      depositJT: p.params.depositJT,
      series,
    });
    return {
      id: p.id,
      label: p.label,
      pass: r.seniorMarkdownEvents === 0 && r.seniorMaxDrawdown < 0.0005,
      seniorMarkdownEvents: r.seniorMarkdownEvents,
      seniorMaxDrawdown: r.seniorMaxDrawdown,
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
// fees is not what a holder receives (HYBOND's 1.00% management fee and the
// underlying fund's own charges are not reflected here).
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
 * There are no history windows, the UI's "Chart timeframe" brush zooms this
 * series for display while every metric stays computed over the full range.
 */
export const HYBOND_NAV_SERIES: PricePoint[] = buildHybondNavSeries();
