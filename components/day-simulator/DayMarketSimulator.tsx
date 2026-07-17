'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Sim, defaultConfig } from '@/lib/day/engine/runner';
import { MarketState } from '@/lib/day/engine/types';
import { DAY_LOCKED_COPY } from '@/lib/day-simulator-template/locked-copy';
import { LOCKED_COPY } from '@/lib/simulator-template/locked-copy';
import { isFullRange, normalizeRange, type IndexRange } from '@/lib/hybond/timeframe';
import type {
  DayMarket,
  DayMarketManifest,
  DaySeriesPoint,
} from '@/lib/day-simulator-template/market';
import { DayTimeframeBrush } from '@/components/day-simulator/DayTimeframeBrush';

const ResponsiveContainerNoSSR = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);

// Exact Dawn / Tenbin visual contract. Keep synchronized with MarketSimulator.
const C = {
  pageBg: '#FBFAF7',
  cardBg: '#FFFDF9',
  border: '#E8E2D8',
  text: '#171511',
  muted: '#6D6860',
  eyebrow: '#967756',
  kpiLabel: '#A49B90',
  accent: '#967756',
  olive: '#319C61',
  danger: '#8F4D42',
  faint: '#B9B1A5',
  seniorLine: '#8E7355',
  juniorLine: '#1B1A17',
  strategyLine: '#A7A39A',
  obsFill: '#F4C77B',
};

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = '"SFMono-Regular", Consolas, monospace';
const DAY = 86_400;

const FALLBACK_MANIFEST: DayMarketManifest = {
  id: 'day',
  route: '/day-sim',
  copy: {
    eyebrow: DAY_LOCKED_COPY.eyebrow,
    title: DAY_LOCKED_COPY.title,
    description: DAY_LOCKED_COPY.description,
    disclosure: DAY_LOCKED_COPY.disclosure,
  },
  defaults: {
    sourceApy: 0.12,
    coverage: 0.2,
    minLiquidity: 0.12,
    liquidationUtilization: 1.5,
    observationDays: 30,
    exitBufferPct: 66.67,
    linkJuniorToFirstLoss: true,
    riskYDM: { mode: 'static', y0: 0.25, yTarget: 0.35, y100: 0.55 },
    liqYDM: { mode: 'static', y0: 0.08, yTarget: 0.12, y100: 0.2 },
    selfLiquidationBonus: 0.02,
    initialST: 40_000_000,
    initialJT: 10_000_000,
    initialLT: 6_000_000,
  },
  provenance: {
    source: 'Deterministic one-year template path',
    sourceUrl: 'https://github.com/roycoprotocol/dawn-simulator',
    priceType: 'nav',
    feesIncluded: true,
    observationCount: 13,
    firstDate: '2025-01-01',
    lastDate: '2026-01-01',
  },
};

const FALLBACK_SERIES: DaySeriesPoint[] = Array.from({ length: 13 }, (_, index) => ({
  date: new Date(Date.UTC(2025, index, 1)).toISOString().slice(0, 10),
  price: Math.pow(1.12, index / 12),
}));

const FALLBACK_MARKET: DayMarket = {
  ...FALLBACK_MANIFEST,
  series: FALLBACK_SERIES,
};

const cardStyle = {
  background: C.cardBg,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: 14,
  boxShadow: '0 34px 70px rgba(60,45,28,.045)',
} as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: C.eyebrow,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

function Kpi({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0, padding: '12px 14px', minHeight: 76 }}>
      <p
        style={{
          color: C.kpiLabel,
          fontSize: 8.8,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </p>
      <p
        className="mt-2"
        style={{
          color,
          fontFamily: MONO,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.05em',
        }}
      >
        {value}
      </p>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  display,
  description,
  disabled = false,
  onChange,
  children,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  description: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  children?: React.ReactNode;
}) {
  const handle = (raw: string) => {
    const next = Number(raw);
    if (Number.isFinite(next)) onChange(next);
  };
  return (
    <div style={{ opacity: disabled ? 0.55 : 1 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <label style={{ color: C.eyebrow, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          {label}
        </label>
        <span style={{ color: C.accent, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => handle(event.target.value)}
        className="w-full"
        style={{ accentColor: C.accent }}
      />
      <p className="mt-1" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4 }}>
        {description}
      </p>
      {children}
    </div>
  );
}

const annualized = (end: number, start: number, days: number) =>
  days > 0 && start > 0 && end > 0 ? Math.pow(end / start, 365 / days) - 1 : 0;
const pct = (value: number, digits = 1) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
const usd0 = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;

export default function DayMarketSimulator({ market }: { market?: DayMarket }) {
  const activeMarket = market ?? FALLBACK_MARKET;
  const defaults = activeMarket.defaults;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReview, setShowReview] = useState(true);
  const [showDeploy, setShowDeploy] = useState(false);
  const [coveragePct, setCoveragePct] = useState(defaults.coverage * 100);
  const [minLiquidityPct, setMinLiquidityPct] = useState(defaults.minLiquidity * 100);
  const [riskSharePct, setRiskSharePct] = useState(defaults.riskYDM.yTarget * 100);
  const [riskFullPct, setRiskFullPct] = useState(defaults.riskYDM.y100 * 100);
  const [liqSharePct, setLiqSharePct] = useState(defaults.liqYDM.yTarget * 100);
  const [observationDays, setObservationDays] = useState(defaults.observationDays);
  const [exitBufferPct, setExitBufferPct] = useState(defaults.exitBufferPct);
  const [selfLiquidationBonusPct, setSelfLiquidationBonusPct] = useState(
    defaults.selfLiquidationBonus * 100,
  );
  const [seniorDeposit, setSeniorDeposit] = useState(defaults.initialST);
  const [manualJuniorDeposit, setManualJuniorDeposit] = useState(defaults.initialJT);
  const [linkJuniorToFirstLoss, setLinkJuniorToFirstLoss] = useState(
    defaults.linkJuniorToFirstLoss,
  );
  const [maintainCoverage, setMaintainCoverage] = useState(true);
  const [range, setRange] = useState<IndexRange>({
    a: 0,
    b: activeMarket.series.length - 1,
  });
  const [copyLabel, setCopyLabel] = useState('Copy link');
  const [copyDeployLabel, setCopyDeployLabel] = useState('Copy');
  const deployRef = useRef<HTMLTextAreaElement>(null);

  const maxIndex = Math.max(0, activeMarket.series.length - 1);
  const viewRange = useMemo(
    () => normalizeRange(range.a, range.b, maxIndex),
    [maxIndex, range],
  );
  const view = useMemo(
    () => activeMarket.series.slice(viewRange.a, viewRange.b + 1),
    [activeMarket.series, viewRange],
  );

  const { result, fullResult } = useMemo(() => {
    const run = (series: DaySeriesPoint[]) => {
    const coverage = coveragePct / 100;
    const minLiquidity = minLiquidityPct / 100;
    const ltRatio = minLiquidity / 0.9;
    const jtRatio = (coverage * (1 + 0.1 * ltRatio)) / Math.max(0.9 - coverage, 0.001);
    const initial = {
      st: seniorDeposit,
      jt: linkJuniorToFirstLoss ? seniorDeposit * jtRatio : manualJuniorDeposit,
      lt: seniorDeposit * ltRatio,
    };
    const riskTarget = riskSharePct / 100;
    const liqTarget = liqSharePct / 100;
    const cfg = defaultConfig({
      coverage,
      beta: 1,
      minLiquidity,
      riskYDM: {
        ...defaults.riskYDM,
        y0: Math.min(defaults.riskYDM.y0, riskTarget),
        yTarget: riskTarget,
        y100: Math.max(riskFullPct / 100, riskTarget),
      },
      liqYDM: {
        ...defaults.liqYDM,
        y0: Math.min(defaults.liqYDM.y0, liqTarget),
        yTarget: liqTarget,
        y100: Math.max(defaults.liqYDM.y100, liqTarget),
      },
      fixedTermDurationSec: observationDays * DAY,
      liquidationUtilization: 100 / Math.max(exitBufferPct, 0.01),
      stSelfLiquidationBonus: selfLiquidationBonusPct / 100,
    });
    const sim = new Sim(cfg, initial);
    const snapshots = [sim.last()];
    let juniorCapitalInjected = 0;
    for (let index = 1; index < series.length; index += 1) {
      const previous = series[index - 1];
      const current = series[index];
      const elapsedDays = Math.max(
        1,
        Math.round((Date.parse(current.date) - Date.parse(previous.date)) / 86_400_000),
      );
      const sourceReturn = current.price / previous.price - 1;
      sim.step({ dtSec: elapsedDays * DAY, stReturn: sourceReturn, jtReturn: sourceReturn });
      const postReturn = sim.last();
      if (maintainCoverage && postReturn.state === MarketState.PERPETUAL) {
        const numerator =
          coverage * (sim.state.stRawNAV + sim.state.jtRawNAV * cfg.beta) -
          cfg.targetUtilization * sim.state.jtEffectiveNAV;
        const denominator = cfg.targetUtilization - coverage * cfg.beta;
        const refill = denominator > 0 ? numerator / denominator : 0;
        if (refill > cfg.dustTolerance) {
          sim.step({
            dtSec: 0,
            stReturn: 0,
            jtReturn: 0,
            op: { type: 'jtDeposit', amount: refill },
          });
          juniorCapitalInjected += refill;
        }
      }
      snapshots.push(sim.last());
    }
    const firstSnapshot = snapshots[0];
    const chart = series.map((point, index) => {
      const snapshot = snapshots[index];
      return {
        date: point.date,
        senior: (snapshot.stPrice / firstSnapshot.stPrice) * 100,
        junior: (snapshot.jtPrice / firstSnapshot.jtPrice) * 100,
        liquidity: (snapshot.ltPrice / firstSnapshot.ltPrice) * 100,
        strategy: (point.price / series[0].price) * 100,
        state: snapshot.state,
        stIL: snapshot.stIL,
      };
    });
    const first = chart[0];
    const last = chart[chart.length - 1];
    const days = Math.max(
      1,
      (Date.parse(series[series.length - 1].date) - Date.parse(series[0].date)) / 86_400_000,
    );
    const observationBands: Array<{ start: string; end: string }> = [];
    let observationStart: string | null = null;
    let observationEvents = 0;
    let maxObservedObservationDays = 0;
    for (let index = 0; index < chart.length; index += 1) {
      const inObservation = chart[index].state === MarketState.FIXED_TERM;
      if (inObservation && observationStart === null) {
        observationStart = chart[index].date;
        observationEvents += 1;
      }
      const closes = observationStart !== null && (!inObservation || index === chart.length - 1);
      if (closes && observationStart !== null) {
        const start = observationStart;
        const end = inObservation ? chart[index].date : chart[Math.max(0, index - 1)].date;
        observationBands.push({ start, end });
        maxObservedObservationDays = Math.max(
          maxObservedObservationDays,
          (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1,
        );
        observationStart = null;
      }
    }
    const maxDrawdown = (key: 'senior' | 'junior' | 'liquidity') => {
      let peak = chart[0][key];
      let worst = 0;
      for (const point of chart) {
        peak = Math.max(peak, point[key]);
        worst = Math.max(worst, peak > 0 ? 1 - point[key] / peak : 0);
      }
      return worst;
    };
    const erasedRecoveryClaims = sim.events.filter(
      (event) => event.kind === 'exit-fixed-term' && event.level === 'danger',
    ).length;
    const seniorLossEvents = chart.filter(
      (point, index) => index > 0 && point.stIL > chart[index - 1].stIL + 1e-9,
    ).length;
    const calendar = Array.from(new Set(chart.map((point) => point.date.slice(0, 4)))).map((year) => {
      const yearPoints = chart.filter((point) => point.date.startsWith(year));
      const yearFirst = yearPoints[0];
      const yearLast = yearPoints[yearPoints.length - 1];
      const observationPointCount = yearPoints.filter(
        (point) => point.state === MarketState.FIXED_TERM,
      ).length;
      const observationTriggers = yearPoints.filter((point) => {
        if (point.state !== MarketState.FIXED_TERM) return false;
        const globalIndex = chart.indexOf(point);
        return globalIndex === 0 || chart[globalIndex - 1].state !== MarketState.FIXED_TERM;
      }).length;
      return {
        year,
        strategyReturn: yearLast.strategy / yearFirst.strategy - 1,
        juniorReturn: yearLast.junior / yearFirst.junior - 1,
        seniorReturn: yearLast.senior / yearFirst.senior - 1,
        liquidityReturn: yearLast.liquidity / yearFirst.liquidity - 1,
        nonObservationPct: yearPoints.length
          ? ((yearPoints.length - observationPointCount) / yearPoints.length) * 100
          : 0,
        observationTriggers,
      };
    });
    return {
      cfg,
      initial,
      sim,
      chart,
      seniorApy: annualized(last.senior, first.senior, days),
      juniorApy: annualized(last.junior, first.junior, days),
      liquidityApy: annualized(last.liquidity, first.liquidity, days),
      strategyApy: annualized(last.strategy, first.strategy, days),
      final: sim.last(),
      observationBands,
      observationEvents,
      maxObservedObservationDays,
      erasedRecoveryClaims,
      seniorLossEvents,
      juniorCapitalInjected,
      seniorMaxDrawdown: maxDrawdown('senior'),
      juniorMaxDrawdown: maxDrawdown('junior'),
      liquidityMaxDrawdown: maxDrawdown('liquidity'),
      calendar,
    };
    };
    const result = run(view);
    const fullResult = isFullRange(viewRange, maxIndex) ? result : run(activeMarket.series);
    return { result, fullResult };
  }, [
    activeMarket.series,
    coveragePct,
    defaults,
    exitBufferPct,
    linkJuniorToFirstLoss,
    liqSharePct,
    manualJuniorDeposit,
    maintainCoverage,
    minLiquidityPct,
    observationDays,
    riskFullPct,
    riskSharePct,
    selfLiquidationBonusPct,
    seniorDeposit,
    view,
    viewRange,
    maxIndex,
  ]);

  const allDates = useMemo(
    () => activeMarket.series.map((point) => point.date),
    [activeMarket.series],
  );
  const brushBands = useMemo(() => {
    const indexByDate = new Map(allDates.map((date, index) => [date, index]));
    return fullResult.observationBands.map((band) => ({
      a: indexByDate.get(band.start) ?? 0,
      b: indexByDate.get(band.end) ?? 0,
    }));
  }, [allDates, fullResult.observationBands]);
  const brushSeries = useMemo(
    () => ({
      strategy: fullResult.chart.map((point) => point.strategy),
      senior: fullResult.chart.map((point) => point.senior),
      junior: fullResult.chart.map((point) => point.junior),
      liquidity: fullResult.chart.map((point) => point.liquidity),
    }),
    [fullResult.chart],
  );

  const activePreset = activeMarket.presets?.find(
    (preset) =>
      linkJuniorToFirstLoss &&
      Math.abs(preset.coverage * 100 - coveragePct) < 1e-9 &&
      preset.observationDays === observationDays &&
      Math.abs(preset.exitBufferPct - exitBufferPct) < 1e-9 &&
      Math.abs(preset.riskYDM.yTarget * 100 - riskSharePct) < 1e-9 &&
      Math.abs(preset.riskYDM.y100 * 100 - riskFullPct) < 1e-9 &&
      Math.abs(preset.minLiquidity * 100 - minLiquidityPct) < 1e-9 &&
      Math.abs(preset.liqYDM.yTarget * 100 - liqSharePct) < 1e-9 &&
      Math.abs(preset.selfLiquidationBonus * 100 - selfLiquidationBonusPct) < 1e-9,
  );

  const applyPreset = (preset: NonNullable<DayMarket['presets']>[number]) => {
    setCoveragePct(preset.coverage * 100);
    setObservationDays(preset.observationDays);
    setExitBufferPct(preset.exitBufferPct);
    setRiskSharePct(preset.riskYDM.yTarget * 100);
    setRiskFullPct(preset.riskYDM.y100 * 100);
    setMinLiquidityPct(preset.minLiquidity * 100);
    setLiqSharePct(preset.liqYDM.yTarget * 100);
    setSelfLiquidationBonusPct(preset.selfLiquidationBonus * 100);
    setLinkJuniorToFirstLoss(true);
  };

  const deployText = useMemo(
    () =>
      [
        `market: ${activeMarket.copy.title}`,
        `underlying: ${activeMarket.provenance.source}`,
        `minimumCoverage: ${(result.cfg.coverage * 100).toFixed(2)}%`,
        `minimumLP: ${(result.cfg.minLiquidity * 100).toFixed(2)}%`,
        `observationDuration: ${observationDays} days`,
        `protectedExitCoverageRemaining: ${exitBufferPct.toFixed(2)}%`,
        `targetUtilization: ${(result.cfg.targetUtilization * 100).toFixed(0)}%`,
        `lpTargetUtilization: ${(result.cfg.liqTargetUtilization * 100).toFixed(0)}%`,
        `riskYieldShareAtTarget: ${(result.cfg.riskYDM.yTarget * 100).toFixed(2)}%`,
        `riskYieldShareAtFullUtilization: ${(result.cfg.riskYDM.y100 * 100).toFixed(2)}%`,
        `lpYieldShareAtTarget: ${(result.cfg.liqYDM.yTarget * 100).toFixed(2)}%`,
        `lpYieldShareAtFullUtilization: ${(result.cfg.liqYDM.y100 * 100).toFixed(2)}%`,
        `seniorDeposit: ${result.initial.st.toFixed(0)}`,
        `juniorDeposit: ${result.initial.jt.toFixed(0)}`,
        `juniorLinkedToCoverage: ${linkJuniorToFirstLoss}`,
        `maintainJuniorCoverage: ${maintainCoverage}`,
        `lpDeposit: ${result.initial.lt.toFixed(0)}`,
        `selfLiquidationBonus: ${(result.cfg.stSelfLiquidationBonus * 100).toFixed(2)}%`,
        `source: ${activeMarket.provenance.sourceUrl}`,
      ].join('\n'),
    [activeMarket, exitBufferPct, linkJuniorToFirstLoss, maintainCoverage, observationDays, result],
  );

  const copyText = async (
    text: string,
    setLabel: (label: string) => void,
    done: string,
    reset: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setLabel(done);
      window.setTimeout(() => setLabel(reset), 1200);
    } catch {
      deployRef.current?.select();
      setLabel('Select text');
    }
  };

  const startDate = view[0]?.date ?? '—';
  const endDate = view[view.length - 1]?.date ?? '—';

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <section>
        <div className="flex items-center gap-2">
          <span style={{ background: C.olive, borderRadius: 9999, display: 'inline-block', height: 6, width: 6 }} />
          <span
            style={{
              color: C.eyebrow,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
            }}
          >
            {activeMarket.copy.eyebrow}
          </span>
        </div>
        <h1
          style={{
            color: C.text,
            fontFamily: SERIF,
            fontSize: 'clamp(32px,3.4vw,44px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            margin: '12px 0 6px',
            maxWidth: 760,
          }}
        >
          {activeMarket.copy.title}
        </h1>
        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, margin: '0 0 12px', maxWidth: 760 }}>
          {activeMarket.copy.description}
        </p>
      </section>

      <section className="flex items-end justify-end">
        <button
          type="button"
          onClick={() => copyText(window.location.href, setCopyLabel, 'Copied', 'Copy link')}
          style={{
            background: C.text,
            border: `1px solid ${C.text}`,
            borderRadius: 0,
            color: C.cardBg,
            fontSize: 10,
            letterSpacing: 1,
            padding: '9px 12px',
            textTransform: 'uppercase',
          }}
        >
          {copyLabel}
        </button>
      </section>

      <section style={{ ...cardStyle, padding: 16 }}>
        <div className="grid grid-cols-1 min-[981px]:grid-cols-[minmax(0,1fr)_repeat(3,minmax(160px,205px))]" style={{ gap: 10 }}>
          <div>
            <Eyebrow>Overview · {startDate} → {endDate}</Eyebrow>
            <h2 style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08, marginTop: 8 }}>
              Current projections
            </h2>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, marginTop: 8 }}>
              Current outputs based on the loaded market data and selected terms.
            </p>
          </div>
          <Kpi label="Senior avg/yr" value={`${pct(result.seniorApy)}/yr`} color={C.accent} />
          <Kpi label="Junior avg/yr" value={`${pct(result.juniorApy)}/yr`} />
          <Kpi label="LP avg/yr" value={`${pct(result.liquidityApy)}/yr`} color={C.olive} />
        </div>
      </section>

      <section style={cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Customize terms</Eyebrow>
            <h2 style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08, marginTop: 8 }}>
              Adjust the current market terms.
            </h2>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, marginTop: 4 }}>
              {LOCKED_COPY.customizeDescription} Day adds the two LP controls below.
            </p>
          </div>
          <button
            type="button"
            aria-label={showAdvanced ? 'Collapse' : 'Expand'}
            onClick={() => setShowAdvanced((value) => !value)}
            style={{
              background: 'transparent',
              border: `1px solid ${C.border}`,
              borderRadius: 0,
              color: C.accent,
              flexShrink: 0,
              fontFamily: MONO,
              fontSize: 18,
              height: 28,
              lineHeight: 1,
              width: 28,
            }}
          >
            {showAdvanced ? '−' : '+'}
          </button>
        </div>
        {result.seniorLossEvents > 0 && (
          <div
            className="mt-3"
            role="alert"
            style={{
              background: 'rgba(143,77,66,.06)',
              border: '1px solid rgba(143,77,66,.35)',
              color: C.danger,
              fontSize: 11,
              lineHeight: 1.4,
              padding: '8px 10px',
            }}
          >
            <strong>Heads up — these terms would lead to Senior losses.</strong>{' '}
            {result.seniorLossEvents} Senior loss event
            {result.seniorLossEvents === 1 ? '' : 's'} across the selected window ({pct(-result.seniorMaxDrawdown)} worst Senior drawdown).
          </div>
        )}
        {showAdvanced && (
          <div className="mt-4 flex flex-col gap-4">
            {activeMarket.presets && activeMarket.presets.length > 0 && (
              <div>
                <Eyebrow>Scenario</Eyebrow>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3" style={{ gap: 8 }}>
                  {activeMarket.presets.map((preset) => {
                    const active = activePreset?.id === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        style={{
                          background: C.cardBg,
                          border: `1px solid ${active ? C.accent : C.border}`,
                          borderRadius: 0,
                          boxShadow: active ? `inset 0 -2px 0 ${C.accent}` : undefined,
                          padding: '8px 11px',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{preset.label}</span>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                          {(preset.coverage * 100).toFixed(0)}% minimum coverage · {preset.observationDays}d obs · {(preset.riskYDM.yTarget * 100).toFixed(0)}% to Junior · {(preset.minLiquidity * 100).toFixed(0)}% LP
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.4 }}>
                  Risk rises down the ladder through the Dawn terms. The Day LP requirement remains explicit on every rung.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <SliderControl
                label="Minimum coverage ratio (%)"
                value={coveragePct}
                min={3}
                max={65}
                step={1}
                display={`${coveragePct.toFixed(0)}%`}
                description={linkJuniorToFirstLoss
                  ? `Junior deposit derived at 90% target utilization: ${usd0(result.initial.jt)}.`
                  : 'Junior is set by hand, so this sets the coverage floor rebuilt when deposits reopen.'}
                onChange={setCoveragePct}
              />
              <SliderControl
                label="Senior deposit ($)"
                value={seniorDeposit}
                min={100}
                max={10_000}
                step={100}
                display={usd0(seniorDeposit)}
                description="Market size. Protected capital that Junior shields from losses."
                onChange={setSeniorDeposit}
              />
              <SliderControl
                label="Senior yield share to Junior (%)"
                value={riskSharePct}
                min={0}
                max={80}
                step={1}
                display={`${riskSharePct.toFixed(0)}%`}
                description="Projection assumption: Junior receives this share of Senior yield at the 90% target."
                onChange={(value) => {
                  setRiskSharePct(value);
                  if (value + liqSharePct > 100) setLiqSharePct(100 - value);
                }}
              >
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                  The full-utilization endpoint remains {riskFullPct.toFixed(0)}%, carried by the market configuration.
                </p>
              </SliderControl>
              <SliderControl
                label="Observation period (days)"
                value={observationDays}
                min={7}
                max={194}
                step={1}
                display={`${observationDays} days`}
                description={`Junior has ${observationDays} days to recover before the recovery claim is erased. Longer helps Junior, but keeps Senior waiting longer.`}
                onChange={setObservationDays}
              >
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                  Daily NAV means every 7–194 day term is distinct. The 194-day ceiling preserves the Dawn accountant limit.
                </p>
              </SliderControl>
              <SliderControl
                label="Junior buffer remaining for Senior exit (%)"
                value={exitBufferPct}
                min={1}
                max={99.91}
                step={0.01}
                display={`${exitBufferPct.toFixed(2)}% buffer`}
                description={`Senior's protected exit opens at ${(100 / Math.max(exitBufferPct, 0.01)).toFixed(2)}× coverage utilization.`}
                onChange={setExitBufferPct}
              />
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <Eyebrow>Day LP additions</Eyebrow>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <SliderControl
                  label="Minimum LP ratio (%)"
                  value={minLiquidityPct}
                  min={1}
                  max={50}
                  step={1}
                  display={`${minLiquidityPct.toFixed(0)}%`}
                  description={`LP capital derived at 90% target utilization: ${usd0(result.initial.lt)}.`}
                  onChange={setMinLiquidityPct}
                />
                <SliderControl
                  label="Senior yield share to LP (%)"
                  value={liqSharePct}
                  min={0}
                  max={80}
                  step={1}
                  display={`${liqSharePct.toFixed(0)}%`}
                  description="LP premium paid to the LP tranche at 90% utilization."
                  onChange={(value) => {
                    setLiqSharePct(value);
                    if (value + riskSharePct > 100) setRiskSharePct(100 - value);
                  }}
                />
              </div>
            </div>

            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: '14px 16px' }}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <Eyebrow>Advanced override</Eyebrow>
                  <p className="mt-1.5" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                    {linkJuniorToFirstLoss
                      ? 'Junior deposit is derived from the minimum coverage ratio above, which holds genesis utilization at the curve target. Unlink to set it directly.'
                      : 'Junior deposit is set directly. The minimum coverage slider no longer sizes it.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (linkJuniorToFirstLoss) {
                      setManualJuniorDeposit(
                        Math.max(50, Math.round(result.initial.jt / 50) * 50),
                      );
                    }
                    setLinkJuniorToFirstLoss((linked) => !linked);
                  }}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: 0,
                    color: C.accent,
                    flexShrink: 0,
                    fontSize: 10,
                    letterSpacing: 1,
                    padding: '7px 12px',
                    textTransform: 'uppercase',
                  }}
                >
                  {linkJuniorToFirstLoss ? 'Unlink Junior' : 'Relink to coverage ratio'}
                </button>
              </div>
              <div className="mt-4">
                <SliderControl
                  label="Junior deposit ($)"
                  value={linkJuniorToFirstLoss ? Math.max(50, result.initial.jt) : manualJuniorDeposit}
                  min={50}
                  max={10_000}
                  step={50}
                  disabled={linkJuniorToFirstLoss}
                  display={usd0(result.initial.jt)}
                  description="First-loss buffer that absorbs drawdowns for Senior."
                  onChange={setManualJuniorDeposit}
                >
                  <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                    When observation ends and deposits reopen, Junior is replenished to the contractual 90% coverage-utilization target.
                  </p>
                </SliderControl>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
              {[
                ['Premium budget', `${(riskSharePct + liqSharePct).toFixed(0)}% / 100%`],
                ['Observation term', `${observationDays}d / 7–194d`],
                ['Protected exit', `${exitBufferPct.toFixed(2)}% remaining`],
                ['Minimum LP', `${minLiquidityPct.toFixed(0)}%`],
              ].map(([label, value]) => (
                <div key={label}>
                  <span style={{ color: C.kpiLabel, display: 'block', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
                  <b style={{ color: C.text, display: 'block', fontFamily: MONO, fontSize: 15, fontWeight: 600, marginTop: 3 }}>{value}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <details
          open={showReview}
          onToggle={(event) => setShowReview((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex items-start justify-between gap-4 cursor-pointer" style={{ listStyle: 'none' }}>
            <div>
              <Eyebrow>Review history</Eyebrow>
              <h2 style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08, marginTop: 8 }}>
                Chart, metrics, and mechanics.
              </h2>
              <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, marginTop: 4 }}>
                {LOCKED_COPY.reviewDescription}
              </p>
            </div>
            <button
              type="button"
              aria-label={showReview ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowReview((value) => !value);
              }}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 0,
                color: C.accent,
                width: 28,
                height: 28,
                fontFamily: MONO,
                fontSize: 18,
                lineHeight: 1,
                background: 'transparent',
                flexShrink: 0,
              }}
            >
              {showReview ? '−' : '+'}
            </button>
          </summary>

          <div className="mt-4" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <div className="flex flex-wrap gap-4" style={{ color: C.text, fontSize: 11.5, marginBottom: 7 }}>
              {[
                ['Senior share price', C.seniorLine],
                ['Junior share price', C.juniorLine],
                ['LP share price', C.olive],
                ['Base strategy', C.strategyLine],
                ['Observation period', C.obsFill],
              ].map(([label, color]) => (
                <span key={label} className="inline-flex items-center gap-2">
                  <i style={{ background: color, display: 'inline-block', height: 2, width: 16 }} />
                  {label}
                </span>
              ))}
            </div>
            <div style={{ height: 340, width: '100%' }}>
              <ResponsiveContainerNoSSR width="100%" height="100%">
                <LineChart data={result.chart} margin={{ top: 12, right: 20, bottom: 8, left: 4 }}>
                  <CartesianGrid stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" stroke={C.faint} tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} minTickGap={70} />
                  <YAxis stroke={C.faint} tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} width={44} />
                  <Tooltip
                    contentStyle={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0, color: C.text, fontFamily: MONO, fontSize: 11 }}
                    labelFormatter={(label) => String(label)}
                    formatter={(value, name) => [`$${Number(value).toFixed(2)}`, String(name)]}
                  />
                  {result.observationBands.map((band, index) => (
                    <ReferenceArea
                      key={`${band.start}-${band.end}-${index}`}
                      x1={band.start}
                      x2={band.end}
                      fill={C.obsFill}
                      fillOpacity={0.28}
                      strokeOpacity={0}
                    />
                  ))}
                  <Line type="monotone" dataKey="senior" name="Senior" stroke={C.seniorLine} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="junior" name="Junior" stroke={C.juniorLine} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="liquidity" name="LP" stroke={C.olive} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="strategy" name="Base strategy" stroke={C.strategyLine} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainerNoSSR>
            </div>

            <DayTimeframeBrush
              dates={allDates}
              series={brushSeries}
              bands={brushBands}
              view={viewRange}
              isFull={isFullRange(viewRange, maxIndex)}
              onChange={setRange}
            />

            <div className="mt-6 overflow-x-auto">
              <table style={{ borderCollapse: 'collapse', color: C.text, fontFamily: MONO, fontSize: 10.5, minWidth: 560, width: '100%' }}>
                <thead>
                  <tr style={{ color: C.kpiLabel, textTransform: 'uppercase' }}>
                    <th style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', textAlign: 'left' }}>Calendar return</th>
                    {result.calendar.map((row) => (
                      <th key={row.year} style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', textAlign: 'right' }}>{row.year}</th>
                    ))}
                    <th style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', textAlign: 'right' }}>End $100 → avg/yr</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Base strategy', result.calendar.map((row) => pct(row.strategyReturn)), `$${result.chart[result.chart.length - 1].strategy.toFixed(2)} → ${pct(result.strategyApy)}/yr`],
                    ['Junior return', result.calendar.map((row) => pct(row.juniorReturn)), `$${result.chart[result.chart.length - 1].junior.toFixed(2)} → ${pct(result.juniorApy)}/yr`],
                    ['Senior return', result.calendar.map((row) => pct(row.seniorReturn)), `$${result.chart[result.chart.length - 1].senior.toFixed(2)} → ${pct(result.seniorApy)}/yr`],
                    ['LP return', result.calendar.map((row) => pct(row.liquidityReturn)), `$${result.chart[result.chart.length - 1].liquidity.toFixed(2)} → ${pct(result.liquidityApy)}/yr`],
                    ['Non-observation %', result.calendar.map((row) => `${row.nonObservationPct.toFixed(1)}%`), '—'],
                    ['Observation periods triggered', result.calendar.map((row) => String(row.observationTriggers)), `${result.observationEvents} total`],
                  ].map(([label, cells, end]) => (
                    <tr key={String(label)}>
                      <th style={{ borderBottom: `1px solid ${C.border}`, fontFamily: 'inherit', fontWeight: 500, padding: '6px 7px', textAlign: 'left' }}>{String(label)}</th>
                      {(cells as string[]).map((cell, index) => (
                        <td key={`${label}-${index}`} style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', textAlign: 'right' }}>{cell}</td>
                      ))}
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', textAlign: 'right' }}>{String(end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <Eyebrow>Additional outcome metrics</Eyebrow>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
                {[
                  ['Senior worst drop', pct(-result.seniorMaxDrawdown)],
                  ['Junior worst drop', pct(-result.juniorMaxDrawdown)],
                  ['LP worst drop', pct(-result.liquidityMaxDrawdown)],
                  ['Max observed observation period', `${result.maxObservedObservationDays}d (${observationDays}d target)`],
                  ['Claims erased', String(result.erasedRecoveryClaims)],
                  ['Senior loss events', String(result.seniorLossEvents)],
                  ['Observation periods', String(result.observationEvents)],
                  ['Junior capital injected', usd0(result.juniorCapitalInjected)],
                  ['Strategy avg/yr', `${pct(result.strategyApy)}/yr`],
                  ['Coverage utilization', `${(result.final.utilization * 100).toFixed(1)}%`],
                  ['LP utilization', `${(result.final.liquidityUtilization * 100).toFixed(1)}%`],
                  ['NAV conservation residual', result.final.conservationResidual.toExponential(2)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span style={{ color: C.kpiLabel, display: 'block', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
                    <b style={{ color: C.text, display: 'block', fontFamily: MONO, fontSize: 17, fontWeight: 600, marginTop: 3 }}>{value}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div style={{ border: `1px solid ${C.border}`, padding: '12px 14px' }}>
                <p style={{ color: C.text, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Protocol mechanics</p>
                <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>Senior is protected first by Junior. Junior earns the risk premium for taking first losses.</p>
                <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45, marginTop: 6 }}>Junior has {observationDays} days to recover after the Dawn observation state opens; unrecovered claims are erased when the term expires.</p>
                <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45, marginTop: 6 }}>When deposits reopen, fresh Junior capital rebuilds the coverage requirement at the 90% target. Senior&apos;s protected exit threshold remains {exitBufferPct.toFixed(2)}% Junior buffer.</p>
                <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45, marginTop: 6 }}>Day is additive: the LP tranche backs secondary exits through the E-CLP pool and earns the LP premium, stable carry, and modeled swap fees.</p>
              </div>
              <div style={{ border: `1px solid ${C.border}`, padding: '12px 14px' }}>
                <p style={{ color: C.text, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Data provenance</p>
                <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>{activeMarket.copy.disclosure}</p>
                <p style={{ color: C.kpiLabel, fontFamily: MONO, fontSize: 9.5, lineHeight: 1.35, marginTop: 8 }}>{activeMarket.provenance.sourceUrl}</p>
              </div>
            </div>
          </div>
        </details>
      </section>

      <section style={cardStyle}>
        <details
          open={showDeploy}
          onToggle={(event) => setShowDeploy((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex items-start justify-between gap-4 cursor-pointer" style={{ listStyle: 'none' }}>
            <div>
              <Eyebrow>Deploy handoff</Eyebrow>
              <h2 style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08, marginTop: 8 }}>
                Copy final market-design parameters.
              </h2>
              <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, marginTop: 4 }}>
                This is the finalized parameter handoff, not the full integration package.
              </p>
            </div>
            <button
              type="button"
              aria-label={showDeploy ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowDeploy((value) => !value);
              }}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 0,
                color: C.accent,
                width: 28,
                height: 28,
                fontFamily: MONO,
                fontSize: 18,
                lineHeight: 1,
                background: 'transparent',
                flexShrink: 0,
              }}
            >
              {showDeploy ? '−' : '+'}
            </button>
          </summary>
          <div className="mt-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.4 }}>Includes Day accountant terms, tranche sizing, curve anchors, and source provenance.</p>
              <button
                type="button"
                onClick={() => copyText(deployText, setCopyDeployLabel, 'Copied', 'Copy')}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 0, color: C.accent, fontSize: 10, letterSpacing: 1, padding: '9px 12px', textTransform: 'uppercase' }}
              >
                {copyDeployLabel}
              </button>
            </div>
            <textarea
              ref={deployRef}
              readOnly
              spellCheck={false}
              aria-label="Deploy handoff"
              value={deployText}
              className="mt-3 w-full"
              style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 0, color: C.text, fontFamily: MONO, fontSize: 11.5, height: 265, lineHeight: 1.6, padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
        </details>
      </section>

      <section
        style={{
          ...cardStyle,
          borderLeft: `3px solid ${C.accent}`,
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <span style={{ color: C.eyebrow, fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Key modeling assumption
          </span>
          <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: C.muted, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={maintainCoverage}
              onChange={(event) => setMaintainCoverage(event.target.checked)}
              style={{ accentColor: C.accent }}
            />
            Assume Junior is replenished to hold the buffer
          </label>
        </div>
        <p className="mt-2" style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
          {maintainCoverage ? (
            <>
              These results assume <strong>maintained Junior coverage</strong>: whenever an observation period ends and deposits reopen, fresh Junior capital rebuilds the buffer to the {coveragePct.toFixed(0)}% minimum at the 90% target. This run injects <span style={{ fontFamily: MONO, fontWeight: 600 }}>{usd0(result.juniorCapitalInjected)}</span> over the selected horizon. Uncheck the box to inspect the fixed-Junior accountant path.
            </>
          ) : (
            <>
              <strong>Fixed Junior capital, no replenishment.</strong> Once losses consume Junior, no fresh buffer is added when deposits reopen. This exposes the raw fixed-capital path while leaving every other Dawn and Day term unchanged.
            </>
          )}
        </p>
        <p className="mt-3" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.45 }}>
          Parameters are illustrative and pending accountant sign-off. Projections, not promises. This is not an offer or investment advice.
        </p>
      </section>
    </div>
  );
}
