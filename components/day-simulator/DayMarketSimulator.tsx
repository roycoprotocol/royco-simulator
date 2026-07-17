'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Sim, defaultConfig } from '@/lib/day/engine/runner';
import { DAY_LOCKED_COPY } from '@/lib/day-simulator-template/locked-copy';
import type {
  DayMarket,
  DayMarketManifest,
  DaySeriesPoint,
} from '@/lib/day-simulator-template/market';

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
    <div
      style={{
        color: C.eyebrow,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function Kpi({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, padding: '12px 14px', minHeight: 76 }}>
      <span
        style={{
          color: C.kpiLabel,
          display: 'block',
          fontSize: 9.2,
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <b
        style={{
          color,
          display: 'block',
          fontFamily: MONO,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.05em',
          lineHeight: 1,
          marginTop: 7,
        }}
      >
        {value}
      </b>
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
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  description: string;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          color: C.text,
          display: 'flex',
          fontSize: 10.5,
          fontWeight: 500,
          justifyContent: 'space-between',
          letterSpacing: '0.12em',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}
      >
        {label}
        <b style={{ color: C.accent, fontFamily: MONO, letterSpacing: 0 }}>{display}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ accentColor: C.seniorLine, width: '100%' }}
      />
      <span style={{ color: C.muted, display: 'block', fontSize: 10, lineHeight: 1.35, marginTop: 2 }}>
        {description}
      </span>
    </label>
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
  const [coveragePct, setCoveragePct] = useState(defaults.coverage * 100);
  const [minLiquidityPct, setMinLiquidityPct] = useState(defaults.minLiquidity * 100);
  const [riskSharePct, setRiskSharePct] = useState(defaults.riskYDM.yTarget * 100);
  const [liqSharePct, setLiqSharePct] = useState(defaults.liqYDM.yTarget * 100);
  const [seniorDeposit, setSeniorDeposit] = useState(defaults.initialST);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(activeMarket.series.length - 1);
  const [copyLabel, setCopyLabel] = useState('Copy link');
  const [copyDeployLabel, setCopyDeployLabel] = useState('Copy');
  const deployRef = useRef<HTMLTextAreaElement>(null);

  const view = useMemo(
    () => activeMarket.series.slice(startIndex, endIndex + 1),
    [activeMarket.series, startIndex, endIndex],
  );

  const result = useMemo(() => {
    const coverage = coveragePct / 100;
    const minLiquidity = minLiquidityPct / 100;
    const ltRatio = minLiquidity / 0.9;
    const jtRatio = (coverage * (1 + 0.1 * ltRatio)) / Math.max(0.9 - coverage, 0.001);
    const initial = {
      st: seniorDeposit,
      jt: seniorDeposit * jtRatio,
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
        y100: Math.max(defaults.riskYDM.y100, riskTarget),
      },
      liqYDM: {
        ...defaults.liqYDM,
        y0: Math.min(defaults.liqYDM.y0, liqTarget),
        yTarget: liqTarget,
        y100: Math.max(defaults.liqYDM.y100, liqTarget),
      },
      stSelfLiquidationBonus: defaults.selfLiquidationBonus,
    });
    const sim = new Sim(cfg, initial);
    for (let index = 1; index < view.length; index += 1) {
      const previous = view[index - 1];
      const current = view[index];
      const elapsedDays = Math.max(
        1,
        Math.round((Date.parse(current.date) - Date.parse(previous.date)) / 86_400_000),
      );
      const sourceReturn = current.price / previous.price - 1;
      sim.step({ dtSec: elapsedDays * DAY, stReturn: sourceReturn, jtReturn: sourceReturn });
    }
    const firstSnapshot = sim.history[0];
    const chart = view.map((point, index) => {
      const snapshot = sim.history[index];
      return {
        date: point.date,
        senior: (snapshot.stPrice / firstSnapshot.stPrice) * 100,
        junior: (snapshot.jtPrice / firstSnapshot.jtPrice) * 100,
        liquidity: (snapshot.ltPrice / firstSnapshot.ltPrice) * 100,
        strategy: (point.price / view[0].price) * 100,
      };
    });
    const first = chart[0];
    const last = chart[chart.length - 1];
    const days = Math.max(
      1,
      (Date.parse(view[view.length - 1].date) - Date.parse(view[0].date)) / 86_400_000,
    );
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
    };
  }, [coveragePct, defaults, liqSharePct, minLiquidityPct, riskSharePct, seniorDeposit, view]);

  const deployText = useMemo(
    () =>
      [
        `market: ${activeMarket.copy.title}`,
        `underlying: ${activeMarket.provenance.source}`,
        `minimumCoverage: ${(result.cfg.coverage * 100).toFixed(2)}%`,
        `minimumLiquidity: ${(result.cfg.minLiquidity * 100).toFixed(2)}%`,
        `targetUtilization: ${(result.cfg.targetUtilization * 100).toFixed(0)}%`,
        `liquidityTargetUtilization: ${(result.cfg.liqTargetUtilization * 100).toFixed(0)}%`,
        `riskYieldShareAtTarget: ${(result.cfg.riskYDM.yTarget * 100).toFixed(2)}%`,
        `riskYieldShareAtFullUtilization: ${(result.cfg.riskYDM.y100 * 100).toFixed(2)}%`,
        `liquidityYieldShareAtTarget: ${(result.cfg.liqYDM.yTarget * 100).toFixed(2)}%`,
        `liquidityYieldShareAtFullUtilization: ${(result.cfg.liqYDM.y100 * 100).toFixed(2)}%`,
        `seniorDeposit: ${result.initial.st.toFixed(0)}`,
        `juniorDeposit: ${result.initial.jt.toFixed(0)}`,
        `liquidityDeposit: ${result.initial.lt.toFixed(0)}`,
        `selfLiquidationBonus: ${(result.cfg.stSelfLiquidationBonus * 100).toFixed(2)}%`,
        `source: ${activeMarket.provenance.sourceUrl}`,
      ].join('\n'),
    [activeMarket, result],
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
        <div className="flex items-center gap-3">
          <span style={{ background: C.text, borderRadius: 999, height: 7, width: 7 }} />
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
          <Kpi label="Liquidity avg/yr" value={`${pct(result.liquidityApy)}/yr`} color={C.olive} />
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
              The loaded strategy path is already set. These five controls change the market terms.
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
        {showAdvanced && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <SliderControl
              label="Minimum coverage ratio (%)"
              value={coveragePct}
              min={3}
              max={65}
              step={1}
              display={`${coveragePct.toFixed(0)}%`}
              description={`Junior deposit derived at 90% target utilization: ${usd0(result.initial.jt)}.`}
              onChange={setCoveragePct}
            />
            <SliderControl
              label="Senior deposit ($)"
              value={seniorDeposit}
              min={1_000_000}
              max={100_000_000}
              step={1_000_000}
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
              description="Risk premium paid to Junior at 90% coverage utilization."
              onChange={(value) => {
                setRiskSharePct(value);
                if (value + liqSharePct > 100) setLiqSharePct(100 - value);
              }}
            />
            <SliderControl
              label="Minimum liquidity ratio (%)"
              value={minLiquidityPct}
              min={1}
              max={50}
              step={1}
              display={`${minLiquidityPct.toFixed(0)}%`}
              description={`Liquidity capital derived at 90% target utilization: ${usd0(result.initial.lt)}.`}
              onChange={setMinLiquidityPct}
            />
            <SliderControl
              label="Senior yield share to Liquidity (%)"
              value={liqSharePct}
              min={0}
              max={80}
              step={1}
              display={`${liqSharePct.toFixed(0)}%`}
              description="Liquidity premium paid to the Liquidity Tranche at 90% utilization."
              onChange={(value) => {
                setLiqSharePct(value);
                if (value + riskSharePct > 100) setRiskSharePct(100 - value);
              }}
            />
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <details open>
          <summary className="cursor-pointer" style={{ listStyle: 'none' }}>
            <Eyebrow>Review history</Eyebrow>
            <h2 style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08, marginTop: 8 }}>
              Chart, metrics, and mechanics.
            </h2>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, marginTop: 4 }}>
              Use this to sanity-check historical tranche behavior and protocol mechanics.
            </p>
          </summary>

          <div className="mt-4" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <div className="flex flex-wrap gap-4" style={{ color: C.text, fontSize: 11.5, marginBottom: 7 }}>
              {[
                ['Senior share price', C.seniorLine],
                ['Junior share price', C.juniorLine],
                ['Liquidity share price', C.olive],
                ['Base strategy', C.strategyLine],
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
                  <Line type="monotone" dataKey="senior" name="Senior" stroke={C.seniorLine} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="junior" name="Junior" stroke={C.juniorLine} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="liquidity" name="Liquidity" stroke={C.olive} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="strategy" name="Base strategy" stroke={C.strategyLine} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainerNoSSR>
            </div>

            <div style={{ borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, marginTop: 7, padding: '10px 0 11px' }}>
              <div className="flex items-center justify-between gap-4" style={{ color: C.kpiLabel, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                <span>Chart timeframe</span>
                <b style={{ color: C.text, fontFamily: MONO, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>{startDate} → {endDate}</b>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-3">
                <SliderControl
                  label="Start date"
                  value={startIndex}
                  min={0}
                  max={Math.max(0, endIndex - 2)}
                  step={1}
                  display={activeMarket.series[startIndex]?.date ?? '—'}
                  description="Full YYYY-MM-DD date for daily source data."
                  onChange={(value) => setStartIndex(Math.min(value, endIndex - 2))}
                />
                <SliderControl
                  label="End date"
                  value={endIndex}
                  min={Math.min(activeMarket.series.length - 1, startIndex + 2)}
                  max={activeMarket.series.length - 1}
                  step={1}
                  display={activeMarket.series[endIndex]?.date ?? '—'}
                  description="The selected window restarts the market at its own first date."
                  onChange={(value) => setEndIndex(Math.max(value, startIndex + 2))}
                />
              </div>
            </div>

            <div className="mt-6">
              <Eyebrow>Additional outcome metrics</Eyebrow>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
                {[
                  ['Strategy avg/yr', `${pct(result.strategyApy)}/yr`],
                  ['Coverage utilization', `${(result.final.utilization * 100).toFixed(1)}%`],
                  ['Liquidity utilization', `${(result.final.liquidityUtilization * 100).toFixed(1)}%`],
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
                <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45, marginTop: 6 }}>Liquidity backs secondary exits through the Day E-CLP pool and earns the liquidity premium, stable carry, and modeled swap fees.</p>
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
        <details>
          <summary className="cursor-pointer" style={{ listStyle: 'none' }}>
            <Eyebrow>Deploy handoff</Eyebrow>
            <h2 style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08, marginTop: 8 }}>
              Copy final market-design parameters.
            </h2>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, marginTop: 4 }}>
              This is the finalized parameter handoff, not the full integration package.
            </p>
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
    </div>
  );
}
