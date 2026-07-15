// ---------------------------------------------------------------------------
// scenarios.ts — srHYBond market presets, config builder, and historical
// NAV-series fixtures for the backtest. The senior/junior tranche accounting
// (lib/try/engine.ts, lib/try/backtest.ts) is fund-agnostic, so this module
// reuses it as-is via import: only the underlying fund data and UI copy
// differ from lib/try/scenarios.ts. Config semantics (deposits, yield share,
// observation window, min coverage) are IDENTICAL to TRY.
// ---------------------------------------------------------------------------
import type { PricePoint } from "@/lib/try/backtest";
import { buildConfig, TRY_DEFAULT_PARAMS, type TryParams } from "@/lib/try/scenarios";

export { buildConfig };
export type { PricePoint };

// HYBond reuses the exact same params/config shape as TRY (buildConfig and
// runBacktest work unchanged on this alias).
export type HybondParams = TryParams;

export const HYBOND_DEFAULT_PARAMS: HybondParams = { ...TRY_DEFAULT_PARAMS };

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
    params: { depositST: 1000, depositJT: 750, seniorShareToJuniorPct: 53, observationDays: 60, minCoveragePct: 30 },
  },
  {
    id: "balanced",
    label: "Balanced",
    note: "Junior ≈ 33% of the pool, 30-day observation. (matches the brief)",
    params: { ...HYBOND_DEFAULT_PARAMS },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    note: "Smaller Junior cushion, shorter 15-day observation.",
    params: { depositST: 1000, depositJT: 300, seniorShareToJuniorPct: 53, observationDays: 15, minCoveragePct: 30 },
  },
];

// --- HYBond monthly total-return NAV series ------------------------------------
//
// BNY Mellon Global Short-Dated High Yield Bond Fund, USD X (Acc.), ISIN
// IE00BD5CVM01. Built from published rolling 12-month (Jun→Jun) returns.
// Method: for each Jul→Jun window, take realistic raw monthly returns, then
// apply a geometric correction factor f = (target / prod(1+r_i))^(1/12) to
// every month in the window so the window compounds to EXACTLY the published
// 12-month return, while preserving each month's shape/sign (f ≈ 1).

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

export const HYBOND_NAV_SERIES: PricePoint[] = buildHybondNavSeries();

// --- Historical scenarios -----------------------------------------------------

export interface HistoricalScenario {
  id: "since2020" | "stress2022" | "recent";
  label: string;
  note: string;
  cadence: "monthly" | "daily";
  points: PricePoint[];
}

function slice(fromDate: string, toDate: string): PricePoint[] {
  return HYBOND_NAV_SERIES.filter((p) => p.date >= fromDate && p.date <= toDate);
}

export const SCENARIOS: HistoricalScenario[] = [
  {
    id: "since2020",
    label: "Since 2020",
    note: "HYBond compounds about 42% from Jun 2020 to Jun 2025, through the 2022 high-yield drawdown.",
    cadence: "monthly",
    points: HYBOND_NAV_SERIES,
  },
  {
    id: "stress2022",
    label: "2022 drawdown",
    note: "The 2022 rate and spread selloff, the fund's deepest short-dated high-yield drawdown.",
    cadence: "monthly",
    points: slice("2021-06", "2023-12"),
  },
  {
    id: "recent",
    label: "Recent (2023 to 2025)",
    note: "The calm, high-carry regime after the 2022 reset.",
    cadence: "monthly",
    points: slice("2023-06", "2025-06"),
  },
];

export function getScenario(id: HistoricalScenario["id"]): HistoricalScenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
