// ---------------------------------------------------------------------------
// scenarios.ts — TRY/wiTRY market presets, config builder, and historical
// price-series fixtures for the backtest. Config values mirror the validated
// parity harness (lib/try/parity.ts freshConfig) exactly, so the UI defaults
// are the proven ones. UI params (percentages, days, dollars) are converted to
// the engine's WAD/seconds representation here — the UI never touches WAD math.
// ---------------------------------------------------------------------------
import type { MarketConfig, YDMCurve } from "./engine";
import { WAD } from "./engine";
import type { PricePoint } from "./backtest";

import stress2021 from "./data/series-2021stress.json";
import since2024 from "./data/series-since2024.json";
import realsim from "./data/series-realsim.json";

// --- YDM curves -------------------------------------------------------------

/** A flat StaticCurveYDM: same JT yield-share at every utilization. */
export function flatCurve(shareWAD: bigint): YDMCurve {
  return {
    yieldShareAtZeroUtilWAD: shareWAD,
    yieldShareAtTargetWAD: shareWAD,
    yieldShareAtFullUtilWAD: shareWAD,
    targetUtilizationWAD: 900000000000000000n, // 0.9e18
  };
}

const DUMMY_LT_YDM: YDMCurve = flatCurve(1n); // LT disabled (maxLTYieldShare = 0); must be a valid non-zero curve

/** Senior keeps 47% of its gain ⇒ Junior yield share = 53%. */
export const TRY_DEFAULT_JT_SHARE_WAD = 530000000000000000n; // 0.53e18

// --- UI-facing parameters ---------------------------------------------------

export interface TryParams {
  depositST: number; // $ Senior
  depositJT: number; // $ Junior
  seniorShareToJuniorPct: number; // % of Senior's gain routed to Junior (0.53 default → 53)
  observationDays: number; // fixed-term duration
  minCoveragePct: number; // min coverage ratio (30 default)
}

export const TRY_DEFAULT_PARAMS: TryParams = {
  depositST: 1000,
  depositJT: 500, // Junior = 33% of the 1500 pool → starts at U = 90% (target)
  seniorShareToJuniorPct: 53,
  observationDays: 30,
  minCoveragePct: 30,
};

const pctToWad = (pct: number): bigint => BigInt(Math.round((pct / 100) * 1e6)) * WAD / 1_000_000n;

/** Build a validated MarketConfig from UI params. */
export function buildConfig(p: TryParams): MarketConfig {
  return {
    minCoverageWAD: pctToWad(p.minCoveragePct),
    coverageLiquidationUtilizationWAD: 2000000000000000000n, // 2e18 (see OPEN-QUESTIONS coverageLiquidation)
    minLiquidityWAD: 0n,
    jtCoinvested: true,
    jtYDM: flatCurve(pctToWad(p.seniorShareToJuniorPct)),
    ltYDM: DUMMY_LT_YDM,
    maxJTYieldShareWAD: WAD,
    maxLTYieldShareWAD: 0n,
    fixedTermDurationSeconds: BigInt(Math.round(p.observationDays * 24 * 60 * 60)),
    stNAVDustTolerance: 0n,
    jtNAVDustTolerance: 0n,
    stProtocolFeeWAD: 0n,
    jtProtocolFeeWAD: 0n,
    jtYieldShareProtocolFeeWAD: 0n,
    ltYieldShareProtocolFeeWAD: 0n,
    startTimestamp: 1000000n,
  };
}

// --- Presets (tenbin-style ladder) ------------------------------------------

export interface Preset {
  id: "conservative" | "balanced" | "aggressive";
  label: string;
  note: string;
  params: TryParams;
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
    params: { ...TRY_DEFAULT_PARAMS },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    note: "Smaller Junior cushion, shorter 15-day observation.",
    params: { depositST: 1000, depositJT: 300, seniorShareToJuniorPct: 53, observationDays: 15, minCoveragePct: 30 },
  },
];

// --- Historical price-series fixtures ---------------------------------------

interface RawSeries {
  sheet: string;
  columns: string[];
  rows: (string | number)[][];
}

/** Map a raw {columns, rows} fixture to PricePoint[] using the wiTRY column as the strategy price. */
function toPricePoints(raw: RawSeries, dateKey = "period", priceKey = "wiTRY"): PricePoint[] {
  const di = raw.columns.indexOf(dateKey);
  const pi = raw.columns.indexOf(priceKey);
  const out: PricePoint[] = [];
  for (const row of raw.rows) {
    const date = String(row[di]);
    const price = Number(row[pi]);
    if (!date || !Number.isFinite(price) || price <= 0) continue;
    out.push({ date, price });
  }
  return out;
}

export interface HistoricalScenario {
  id: "since2024" | "stress2021" | "realsim";
  label: string;
  note: string;
  cadence: "monthly" | "daily";
  points: PricePoint[];
}

export const SCENARIOS: HistoricalScenario[] = [
  {
    id: "since2024",
    label: "Since 2024",
    note: "wiTRY +88% from Jan 2024 to Jun 2026; the post-pivot recovery regime.",
    cadence: "monthly",
    points: toPricePoints(since2024 as RawSeries),
  },
  {
    id: "stress2021",
    label: "2021 stress test",
    note: "Includes the Nov-2021 Lira crash — the deepest historical drawdown.",
    cadence: "monthly",
    points: toPricePoints(stress2021 as RawSeries),
  },
  {
    id: "realsim",
    label: "Live backtest (Apr–Jun 2026)",
    note: "Daily brix data, 60 days.",
    cadence: "daily",
    points: toPricePoints(realsim as RawSeries),
  },
];

export function getScenario(id: HistoricalScenario["id"]): HistoricalScenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
