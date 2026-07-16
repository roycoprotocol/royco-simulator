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

// --- UI-facing parameters (tenbin's 5-control model) ------------------------

/**
 * Senior deposit is FIXED internally (not a UI control, unlike the old model).
 * Junior deposit is derived from firstLossPct: depositJT = ST_DEPOSIT * p/(1-p),
 * where p = firstLossPct/100, so that Junior/(Senior+Junior) = firstLossPct%.
 */
export const ST_DEPOSIT = 1000;

/**
 * Default firstLossPct chosen so that paramsToDeposits(TRY_DEFAULT_PARAMS)
 * reproduces today's exact defaults: depositST=1000, depositJT=500
 * (Junior = 500 of the 1500 pool = 500/1500 = 33.333...%).
 * firstLossPct = (500 / 1500) * 100 = 33.333333333333336
 */
const FIRST_LOSS_DEFAULT_PCT = (500 / 1500) * 100; // 33.333333333333336

export interface TryParams {
  firstLossPct: number; // Junior first-loss protection, % of pool (Junior/(Senior+Junior)). Default ≈33.33 (= today's depositJT 500 of 1500 pool)
  observationDays: number; // fixed-term duration (unchanged). Default 30
  seniorShareToJuniorPct: number; // % of Senior's gain routed to Junior (unchanged). Default 53
  juniorBufferRemainingPct: number; // min coverage ratio (= today's minCoveragePct). Default 30
  seniorExitBonusPct: number; // Senior self-liquidation bonus for deploy-handoff display only; does NOT affect the backtest/engine. Default 0.25
}

export const TRY_DEFAULT_PARAMS: TryParams = {
  firstLossPct: FIRST_LOSS_DEFAULT_PCT,
  observationDays: 30,
  seniorShareToJuniorPct: 53,
  juniorBufferRemainingPct: 30,
  seniorExitBonusPct: 0.25,
};

/** Derive {depositST, depositJT} ($ amounts fed to the engine) from tenbin-style params. */
export function paramsToDeposits(p: TryParams): { depositST: number; depositJT: number } {
  const frac = p.firstLossPct / 100;
  const raw = ST_DEPOSIT * (frac / (1 - frac));
  // Round to cents to avoid float noise (e.g. the default must yield exactly 500).
  const depositJT = Math.round(raw * 100) / 100;
  return { depositST: ST_DEPOSIT, depositJT };
}

const pctToWad = (pct: number): bigint => BigInt(Math.round((pct / 100) * 1e6)) * WAD / 1_000_000n;

/** Build a validated MarketConfig from UI params. */
export function buildConfig(p: TryParams): MarketConfig {
  return {
    minCoverageWAD: pctToWad(p.juniorBufferRemainingPct),
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
    params: {
      firstLossPct: 34,
      observationDays: 60,
      seniorShareToJuniorPct: 40,
      juniorBufferRemainingPct: 30,
      seniorExitBonusPct: 0.1,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    note: "Junior ≈ 30% of the pool, 45-day observation.",
    params: {
      firstLossPct: 30,
      observationDays: 45,
      seniorShareToJuniorPct: 53,
      juniorBufferRemainingPct: 30,
      seniorExitBonusPct: 0.25,
    },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    note: "Smaller Junior cushion, shorter 15-day observation.",
    params: {
      firstLossPct: 18,
      observationDays: 16,
      seniorShareToJuniorPct: 75,
      juniorBufferRemainingPct: 5,
      seniorExitBonusPct: 0.25,
    },
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
    note: "Real daily wiTRY (CBRT money-market yield x ECB USD/TRY), Jan 2024 to Jul 2026. Positive USD carry regime.",
    cadence: "daily",
    points: toPricePoints(since2024 as RawSeries),
  },
  {
    id: "realsim",
    label: "Live backtest (Apr–Jun 2026)",
    note: "Daily brix data, 60 days.",
    cadence: "daily",
    points: toPricePoints(realsim as RawSeries),
  },
  {
    id: "stress2021",
    label: "2021 stress test",
    note: "Real daily wiTRY through the Nov-2021 lira crash (CBRT yield x ECB USD/TRY), Dec 2020 to Jul 2026.",
    cadence: "daily",
    points: toPricePoints(stress2021 as RawSeries),
  },
];

export function getScenario(id: HistoricalScenario["id"]): HistoricalScenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
