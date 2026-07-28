"use client";

// =============================================================================
// The wizard's derived model.
// -----------------------------------------------------------------------------
// draft → base + series → solved terms → backtest + explainer metrics.
//
// A full solve is ~245ms and ~200 engine runs, so the expensive half runs
// against a deferred copy of the inputs: slider labels update on every tick
// (steps read the raw draft), while charts and APYs settle a beat later.
// `useDeferredValue` rather than a hand-rolled timeout — React can abandon an
// in-progress render when the next input arrives, which a setTimeout cannot.
// The caller dims on `settling` instead of blanking, so nothing flickers empty.
// =============================================================================

import { useDeferredValue, useMemo } from "react";
import { buildDayExplainerMetrics } from "@/lib/day-simulator-template/explainer";
import type { DaySeriesPoint } from "@/lib/day-simulator-template/market";
import {
  buildPoolBalances,
  buildPoolConfig,
  createPoolBase,
  type PoolBase,
  type PoolTerms,
} from "@/lib/pool-creator/config";
import type { PoolDraft, PoolGoals, PoolOverrides, YieldSource } from "@/lib/pool-creator/draft";
import { runPreview, seriesApy, seriesDrawdown, type PreviewResult } from "@/lib/pool-creator/preview";
import { applyOverrides, solvePool, type SolvedTerms } from "@/lib/pool-creator/solver";
import { buildSyntheticSeries } from "@/lib/pool-creator/synthetic";

/** Exactly the slices of the draft the model depends on. */
type ModelInputs = {
  source: YieldSource | null;
  goals: PoolGoals;
  overrides: PoolOverrides;
};

/** The strategy series, whichever way the user supplied it. */
export function draftSeries(source: YieldSource | null): DaySeriesPoint[] {
  if (!source) return [];
  if (source.kind === "series") return source.series;
  return buildSyntheticSeries({
    expectedApy: source.expectedApy,
    risk: source.risk,
    anchorDate: source.anchorDate,
  });
}

export function draftToBase(inputs: ModelInputs, series: DaySeriesPoint[]): PoolBase {
  const measured = series.length >= 2 ? seriesApy(series) : NaN;
  const sourceApy = Number.isFinite(measured)
    ? measured
    : inputs.source?.kind === "described"
      ? inputs.source.expectedApy
      : 0.09;

  const o = inputs.overrides;
  return createPoolBase({
    sourceApy,
    exitBufferPct: inputs.goals.exitBufferPct,
    initialSeniorSize: inputs.goals.initialSeniorSize,
    ...(o.ydmMode !== undefined ? { ydmMode: o.ydmMode } : null),
    ...(o.ydmSpread !== undefined ? { ydmSpread: o.ydmSpread } : null),
    ...(o.selfLiquidationBonus !== undefined ? { selfLiquidationBonus: o.selfLiquidationBonus } : null),
    ...(o.maintainCoverage !== undefined ? { maintainCoverage: o.maintainCoverage } : null),
    ...(o.stProtocolFee !== undefined ? { stProtocolFee: o.stProtocolFee } : null),
    ...(o.jtProtocolFee !== undefined ? { jtProtocolFee: o.jtProtocolFee } : null),
    ...(o.jtYieldShareProtocolFee !== undefined ? { jtYieldShareProtocolFee: o.jtYieldShareProtocolFee } : null),
    ...(o.ltYieldShareProtocolFee !== undefined ? { ltYieldShareProtocolFee: o.ltYieldShareProtocolFee } : null),
    ...(o.stableYield !== undefined ? { stableYield: o.stableYield } : null),
    ...(o.swapFeeBps !== undefined ? { swapFeeBps: o.swapFeeBps } : null),
    ...(o.poolTurnoverPerYear !== undefined ? { poolTurnoverPerYear: o.poolTurnoverPerYear } : null),
    ...(o.eclpBandWidth !== undefined ? { eclpBandWidth: o.eclpBandWidth } : null),
    ...(o.reinvestLiquidityPremium !== undefined ? { reinvestLiquidityPremium: o.reinvestLiquidityPremium } : null),
  });
}

export type PoolModel = {
  base: PoolBase;
  series: DaySeriesPoint[];
  sourceApy: number;
  /** Deepest fall in the user's own strategy — the stress check reads this. */
  worstDrawdown: number;
  worstDrawdownDate: string | null;
  solved: SolvedTerms;
  balances: { st: number; jt: number; lt: number };
  preview: PreviewResult;
  /** The accountant's own view of what the cushion and the exit pool buy. */
  cushionPoints: Array<{ loss: number; seniorBalancePer100: number }>;
  liquidityCurve: Array<{ sellNAV: number; executionPrice: number; slippage: number }>;
  /** True while a solve is pending, so the caller can dim rather than blank. */
  settling: boolean;
  hasSource: boolean;
};

const FALLBACK_TERMS: PoolTerms = {
  coverage: 0.1,
  minLiquidity: 0.15,
  recoveryDays: 7,
  riskYieldShare: 0.1,
  liquidityYieldShare: 0.13,
};

const BLANK_SOLVED: SolvedTerms = {
  ...FALLBACK_TERMS,
  seniorApy: NaN,
  juniorApy: NaN,
  liquidityApy: NaN,
  coverageLossLimit: NaN,
  exitShareOfSenior: NaN,
  notes: [],
  evaluations: 0,
};

export function usePoolModel(draft: PoolDraft): PoolModel {
  const inputs = useMemo<ModelInputs>(
    () => ({ source: draft.source, goals: draft.goals, overrides: draft.overrides }),
    [draft.source, draft.goals, draft.overrides],
  );

  // Everything below runs against the deferred copy.
  const settled = useDeferredValue(inputs);
  const settling = settled !== inputs;

  const series = useMemo(() => draftSeries(settled.source), [settled.source]);
  const base = useMemo(() => draftToBase(settled, series), [settled, series]);

  const solved = useMemo<SolvedTerms>(() => {
    if (series.length < 2) return BLANK_SOLVED;
    const raw = solvePool(base, settled.goals);
    const o = settled.overrides;
    return applyOverrides(base, raw, {
      ...(o.coverage !== undefined ? { coverage: o.coverage } : null),
      ...(o.minLiquidity !== undefined ? { minLiquidity: o.minLiquidity } : null),
      ...(o.riskYieldShare !== undefined ? { riskYieldShare: o.riskYieldShare } : null),
      ...(o.liquidityYieldShare !== undefined ? { liquidityYieldShare: o.liquidityYieldShare } : null),
    });
  }, [base, settled, series]);

  const balances = useMemo(() => {
    let sized: { st: number; jt: number; lt: number };
    try {
      sized = buildPoolBalances(base, solved);
    } catch {
      sized = { st: base.initialSeniorSize, jt: 0, lt: 0 };
    }
    // The Advanced drawer can size Junior and the exit pool by hand. Doing so
    // breaks the accountant's own sizing relations, which `validate.ts` then
    // reports — it is allowed, but never silent.
    const o = settled.overrides;
    return {
      st: sized.st,
      jt: o.initialJT ?? sized.jt,
      lt: o.initialLT ?? sized.lt,
    };
  }, [base, solved, settled.overrides]);

  const preview = useMemo(() => runPreview(base, solved, series), [base, solved, series]);

  const explainer = useMemo(() => {
    try {
      const cfg = buildPoolConfig(base, solved);
      const initial = buildPoolBalances(base, solved);
      const metrics = buildDayExplainerMetrics(cfg, initial);
      return { cushionPoints: metrics.coverage.points, liquidityCurve: metrics.liquidity.curve };
    } catch {
      return { cushionPoints: [], liquidityCurve: [] };
    }
  }, [base, solved]);

  const drawdown = useMemo(() => seriesDrawdown(series), [series]);

  return {
    base,
    series,
    sourceApy: base.sourceApy,
    worstDrawdown: drawdown.depth,
    worstDrawdownDate: drawdown.date,
    solved,
    balances,
    preview,
    cushionPoints: explainer.cushionPoints,
    liquidityCurve: explainer.liquidityCurve,
    settling,
    hasSource: series.length >= 2,
  };
}
