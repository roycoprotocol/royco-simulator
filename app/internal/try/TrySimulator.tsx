'use client';

// ---------------------------------------------------------------------------
// TrySimulator — tenbin-style vertical market simulator for the TRY/wiTRY
// senior/junior tranche market. Every tranche-accounting number rendered here
// comes from runBacktest() (which bridges to the validated engine). This
// component performs NO tranche accounting itself; the only local computation
// is presentational (indexing already-computed values, contiguous observation
// runs for chart shading, formatting, and derived display strings).
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceDot,
  Brush,
} from 'recharts';

import { runBacktest } from '@/lib/try/backtest';
import {
  TRY_DEFAULT_PARAMS,
  PRESETS,
  SCENARIOS,
  buildConfig,
  getScenario,
  paramsToDeposits,
  type TryParams,
  type HistoricalScenario,
} from '@/lib/try/scenarios';

const ResponsiveContainerNoSSR = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);

// --- formatting helpers (presentational only) ------------------------------
const fmtPct = (frac: number, digits = 2): string => {
  if (!Number.isFinite(frac)) return '—';
  return `${(frac * 100).toFixed(digits)}%`;
};
const fmtSignedPct = (frac: number, digits = 2): string => {
  if (!Number.isFinite(frac)) return '—';
  const sign = frac > 0 ? '+' : '';
  return `${sign}${(frac * 100).toFixed(digits)}%`;
};
const fmtUsd = (n: number, digits = 2): string => {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};
const fmtUsd0 = (n: number): string => fmtUsd(n, 0);

// --- tenbin design tokens ---------------------------------------------------
const C = {
  pageBg: '#FBFAF7',
  cardBg: '#FFFDF9',
  border: '#E8E2D8',
  text: '#171511',
  muted: '#6B6459',
  eyebrow: '#967756',
  kpiLabel: '#A49B90',
  accent: '#8E7355',
  olive: '#5F7A3E',
  danger: '#A6483C',
  seniorLine: '#8E7355',
  juniorLine: '#1B1A17',
  strategyLine: '#A7A39A',
  obsFill: '#F4C77B',
};

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, monospace";

// Sign-aware color for returns/drawdowns.
const signColor = (frac: number): string => (frac < 0 ? C.danger : C.text);

export default function TrySimulator() {
  const [params, setParams] = useState<TryParams>(TRY_DEFAULT_PARAMS);
  const [scenarioId, setScenarioId] = useState<HistoricalScenario['id']>('since2024');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maintainCoverage, setMaintainCoverage] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [showDeploy, setShowDeploy] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const scenario = getScenario(scenarioId);

  const result = useMemo(() => {
    const dep = paramsToDeposits(params);
    return runBacktest({
      config: buildConfig(params),
      depositST: dep.depositST,
      depositJT: dep.depositJT,
      series: getScenario(scenarioId).points,
      maintainJuniorCoverage: maintainCoverage,
    });
  }, [params, scenarioId, maintainCoverage]);

  // Which preset (if any) exactly matches current params — for active styling.
  const activePreset = useMemo(
    () =>
      PRESETS.find(
        (p) =>
          p.params.firstLossPct === params.firstLossPct &&
          p.params.observationDays === params.observationDays &&
          p.params.seniorShareToJuniorPct === params.seniorShareToJuniorPct &&
          p.params.juniorBufferRemainingPct === params.juniorBufferRemainingPct &&
          p.params.seniorExitBonusPct === params.seniorExitBonusPct,
      ),
    [params],
  );

  const activeRun = useMemo(
    () =>
      hoverDate
        ? result.observationRuns.find((r) => hoverDate >= r.startDate && hoverDate <= r.endDate) ?? null
        : null,
    [hoverDate, result.observationRuns],
  );

  // Length in days of the hovered observation period (same calc as
  // maxObservationPeriodDays, so the two agree).
  const activeRunDays = activeRun
    ? Math.max(1, Math.round((Date.parse(activeRun.endDate) - Date.parse(activeRun.startDate)) / 86400000))
    : null;

  const representedYears = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of result.steps) {
      const y = s.date.slice(0, 4);
      counts[y] = (counts[y] ?? 0) + 1;
    }
    return new Set(Object.keys(counts).filter((y) => counts[y] >= 5));
  }, [result.steps]);

  const perYearRows = useMemo(
    () => result.perYear.filter((r) => representedYears.has(r.year)),
    [result.perYear, representedYears],
  );

  const chartData = useMemo(
    () =>
      result.steps.map((s, i) => ({
        date: s.date,
        strategy: s.priceIndex,
        juniorKept: result.juniorIfKept[i],
        senior: s.stIndex,
        junior: s.jtIndex,
        marketState: s.marketState,
      })),
    [result.steps, result.juniorIfKept],
  );

  const erasedMarkers = useMemo(
    () =>
      result.steps
        .filter((s) => Number(s.ilErased) > 0)
        .map((s) => {
          const denom = Number(s.jtEff) + Number(s.ilErased);
          const pct = denom > 0 ? Math.round((Number(s.ilErased) / denom) * 100) : 0;
          return { date: s.date, jtIndex: s.jtIndex, pct };
        }),
    [result.steps],
  );

  const seniorLossMarkers = useMemo(
    () => result.steps.filter((s) => s.seniorMarkedDown),
    [result.steps],
  );

  const seniorEnd = result.steps.length ? result.steps[result.steps.length - 1].stIndex : 100;
  const juniorEnd = result.steps.length ? result.steps[result.steps.length - 1].jtIndex : 100;
  const strategyEnd = result.steps.length ? result.steps[result.steps.length - 1].priceIndex : 100;
  const firstDate = result.steps.length ? result.steps[0].date : '—';
  const lastDate = result.steps.length ? result.steps[result.steps.length - 1].date : '—';

  const updateParam = (patch: Partial<TryParams>) =>
    setParams((p) => ({ ...p, ...patch }));

  const copyLink = () => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  };

  const deployString = `${params.firstLossPct.toFixed(0)}% first-loss · ${params.observationDays}d observation · ${params.seniorShareToJuniorPct}% to Junior · ${params.juniorBufferRemainingPct.toFixed(2)}% buffer remaining · ${params.seniorExitBonusPct.toFixed(2)}% Senior exit bonus`;

  const copyDeployString = () => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(deployString).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* ================= 1. HEADER ================= */}
      <section>
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: C.olive,
              display: 'inline-block',
            }}
          />
          <span
            style={{
              color: C.eyebrow,
              textTransform: 'uppercase',
              fontSize: 9.5,
              letterSpacing: 2,
              fontWeight: 600,
            }}
          >
            ROYCO · srwiTRY MARKET DESIGN
          </span>
        </div>
        <h1
          className="mt-3"
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 42,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            color: C.text,
          }}
        >
          srwiTRY Market Builder
        </h1>
        <p className="mt-3 max-w-3xl" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
          A fast path for market creators to choose Senior/Junior terms, check the historical
          tradeoff, and copy the market-design inputs.
        </p>
      </section>

      {/* ================= 2. LOADED MARKET ROW ================= */}
      <section className="flex items-end justify-between flex-wrap gap-4">
        <div className="flex items-end gap-6">
          <span
            style={{
              color: C.kpiLabel,
              textTransform: 'uppercase',
              fontSize: 10,
              letterSpacing: 1,
              paddingBottom: 10,
            }}
          >
            Loaded market
          </span>
          <div className="flex items-center gap-6" style={{ borderBottom: `1px solid ${C.border}` }}>
            {SCENARIOS.map((s) => {
              const active = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenarioId(s.id)}
                  style={{
                    padding: '0 0 10px',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? C.text : C.muted,
                    borderBottom: `2px solid ${active ? C.accent : 'transparent'}`,
                    marginBottom: -1,
                    background: 'transparent',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={copyLink}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 0,
            color: C.accent,
            textTransform: 'uppercase',
            fontSize: 10,
            letterSpacing: 1,
            padding: '7px 12px',
            background: 'transparent',
          }}
        >
          Copy link
        </button>
      </section>

      {/* ================= 3. OVERVIEW ================= */}
      <section
        style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0 }}
        className="p-6"
      >
        <div className="flex flex-wrap items-start gap-8">
          <div style={{ flex: '1 1 320px' }}>
            <Eyebrow>Overview</Eyebrow>
            <h2 className="mt-2" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.text }}>
              {scenario.label} projection
            </h2>
            <p className="mt-3 max-w-2xl" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              Current {activePreset?.label ?? 'custom'} terms{' '}
              {result.seniorMarkdownEvents === 0
                ? 'pass the Senior hard guardrail: no historical Senior loss events'
                : `show ${result.seniorMarkdownEvents} Senior loss events`}{' '}
              with {params.firstLossPct.toFixed(0)}% first-loss protection, {params.observationDays}d
              observation period, and {params.seniorShareToJuniorPct}% of Senior yield paid to Junior.
            </p>
          </div>
          <div className="flex flex-wrap gap-4" style={{ flex: '0 0 auto' }}>
            <Kpi label="Senior avg/yr" value={`${fmtSignedPct(result.seniorAvgYr, 1)}/yr`} />
            <Kpi label="Junior avg/yr" value={`${fmtSignedPct(result.juniorAvgYr, 1)}/yr`} />
          </div>
        </div>
      </section>

      {/* ================= 4. CUSTOMIZE TERMS ================= */}
      <section
        style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0 }}
        className="p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Customize terms</Eyebrow>
            <h2 className="mt-2" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.text }}>
              Adjust the current market terms.
            </h2>
            <p className="mt-2" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              The loaded strategy path is already set. These five controls change the market terms.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-label={showAdvanced ? 'Collapse' : 'Expand'}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 0,
              color: C.accent,
              width: 32,
              height: 32,
              fontSize: 18,
              lineHeight: 1,
              background: 'transparent',
              flexShrink: 0,
            }}
          >
            {showAdvanced ? '−' : '+'}
          </button>
        </div>

        {showAdvanced && (
          <div className="mt-6 flex flex-col gap-6">
            {/* Preset ladder */}
            <div>
              <Eyebrow>Preset ladder</Eyebrow>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PRESETS.map((p) => {
                  const active = activePreset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setParams({ ...p.params })}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 0,
                        border: `1px solid ${active ? C.accent : C.border}`,
                        background: C.cardBg,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        {p.params.firstLossPct}% first-loss · {p.params.observationDays}d obs ·{' '}
                        {p.params.seniorShareToJuniorPct}% to Jr
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <SliderControl
                label="First-loss protection (%)"
                value={params.firstLossPct}
                min={8}
                max={65}
                step={1}
                display={`${params.firstLossPct.toFixed(0)}%`}
                desc="Junior's share of the pool that absorbs losses first."
                onChange={(v) => updateParam({ firstLossPct: v })}
              />
              <SliderControl
                label="Observation period (days)"
                value={params.observationDays}
                min={7}
                max={194}
                step={1}
                display={`${params.observationDays}d`}
                desc="Fixed-term window before an unrecovered loss locks in."
                onChange={(v) => updateParam({ observationDays: v })}
              />
              <SliderControl
                label="Senior yield to Junior (%)"
                value={params.seniorShareToJuniorPct}
                min={20}
                max={80}
                step={1}
                display={`${params.seniorShareToJuniorPct}%`}
                desc="Share of Senior's yield paid to Junior for taking first loss."
                onChange={(v) => updateParam({ seniorShareToJuniorPct: v })}
              />
              <SliderControl
                label="Junior buffer remaining (%)"
                value={params.juniorBufferRemainingPct}
                min={1}
                max={99.91}
                step={0.01}
                display={`${params.juniorBufferRemainingPct.toFixed(2)}%`}
                desc="Minimum Junior coverage before liquidation trips."
                onChange={(v) => updateParam({ juniorBufferRemainingPct: v })}
              />
              <SliderControl
                label="Senior exit bonus (%)"
                value={params.seniorExitBonusPct}
                min={0}
                max={5}
                step={0.05}
                display={`${params.seniorExitBonusPct.toFixed(2)}%`}
                desc="Bonus to Senior on a protected exit (stSelfLiquidationBonus). Deploy parameter — does not affect the historical curve."
                onChange={(v) => updateParam({ seniorExitBonusPct: v })}
              />
            </div>
          </div>
        )}
      </section>

      {/* ================= 5. REVIEW HISTORY ================= */}
      <section
        style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0 }}
        className="p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Review history</Eyebrow>
            <h2 className="mt-2" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.text }}>
              Chart, metrics, and mechanics.
            </h2>
            <p className="mt-2" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              Use this to sanity-check observation periods, erased claims, and protocol mechanics.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-label={showHistory ? 'Collapse' : 'Expand'}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 0,
              color: C.accent,
              width: 32,
              height: 32,
              fontSize: 18,
              lineHeight: 1,
              background: 'transparent',
              flexShrink: 0,
            }}
          >
            {showHistory ? '−' : '+'}
          </button>
        </div>

        {showHistory && (
          <div className="mt-6">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4" style={{ fontSize: 12, color: C.muted }}>
              <LegendSwatch color={C.seniorLine}>Senior share price</LegendSwatch>
              <LegendSwatch color={C.juniorLine}>Junior share price</LegendSwatch>
              <LegendSwatch color={`${C.strategyLine}90`} dashed>
                Junior if recoveries kept
              </LegendSwatch>
              <LegendSwatch color={C.strategyLine} dashed>
                Base strategy
              </LegendSwatch>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>▼</span> Junior recovery erased
              </span>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>●</span> Senior loss event
              </span>
              <span className="flex items-center gap-2">
                <span
                  style={{ width: 18, height: 10, background: C.obsFill, opacity: 0.32, display: 'inline-block' }}
                />
                observation period
              </span>
            </div>

            {/* Hover readout: observation period length in days */}
            <div className="mb-3" style={{ fontSize: 12, minHeight: 18 }}>
              {activeRun ? (
                <span style={{ color: C.muted }}>
                  Observation period:{' '}
                  <strong style={{ color: C.accent, fontFamily: MONO }}>{activeRunDays}d</strong>
                  {' · '}
                  {activeRun.startDate} → {activeRun.endDate}
                  {' · '}
                  {activeRun.strategyDrawdownPct.toFixed(1)}% strategy drawdown
                </span>
              ) : (
                <span style={{ color: C.kpiLabel }}>Hover a shaded band to see its observation-period length.</span>
              )}
            </div>

            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainerNoSSR>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                  onMouseMove={(s) =>
                    setHoverDate((s as { activeLabel?: string })?.activeLabel ?? null)
                  }
                  onMouseLeave={() => setHoverDate(null)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  {result.observationRuns.map((r, i) => (
                    <ReferenceArea
                      key={`obs-${i}`}
                      x1={r.startDate}
                      x2={r.endDate}
                      fill={C.obsFill}
                      fillOpacity={0.16}
                      stroke="none"
                    />
                  ))}
                  {activeRun && (
                    <ReferenceArea
                      x1={activeRun.startDate}
                      x2={activeRun.endDate}
                      fill={C.obsFill}
                      fillOpacity={0.3}
                      stroke="none"
                    />
                  )}
                  <XAxis
                    dataKey="date"
                    tick={{ fill: C.kpiLabel, fontSize: 11 }}
                    stroke={C.border}
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{ fill: C.kpiLabel, fontSize: 11 }}
                    stroke={C.border}
                    label={{
                      value: '$ per $100 deposited',
                      angle: -90,
                      position: 'insideLeft',
                      fill: C.kpiLabel,
                      fontSize: 11,
                    }}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      background: C.cardBg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 0,
                      color: C.text,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: C.muted }}
                    formatter={(value: number | string, name: string) => {
                      const v = typeof value === 'number' ? `$${value.toFixed(2)}` : value;
                      return [v, name];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    name="Strategy"
                    stroke={C.strategyLine}
                    strokeDasharray="5 4"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="juniorKept"
                    name="Junior (kept)"
                    stroke={`${C.strategyLine}90`}
                    strokeDasharray="2 3"
                    dot={false}
                    strokeWidth={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="senior"
                    name="Senior"
                    stroke={C.seniorLine}
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="junior"
                    name="Junior"
                    stroke={C.juniorLine}
                    dot={false}
                    strokeWidth={2}
                  />
                  {erasedMarkers.map((s, i) => (
                    <ReferenceDot
                      key={`erased-${i}`}
                      x={s.date}
                      y={s.jtIndex}
                      r={3}
                      fill={C.danger}
                      stroke={C.cardBg}
                      label={
                        s.pct >= 4
                          ? { value: `erased -${s.pct}%`, position: 'top', fontSize: 9, fill: C.danger }
                          : undefined
                      }
                    />
                  ))}
                  {seniorLossMarkers.map((s, i) => (
                    <ReferenceDot
                      key={`sloss-${i}`}
                      x={s.date}
                      y={s.stIndex}
                      r={3}
                      fill={C.danger}
                      stroke={C.cardBg}
                    />
                  ))}
                  {result.steps.length > 0 && (
                    <ReferenceDot
                      x={result.steps[result.steps.length - 1].date}
                      y={seniorEnd}
                      r={3}
                      fill={C.seniorLine}
                      stroke={C.cardBg}
                      label={{ value: `Sr ${seniorEnd.toFixed(0)}`, position: 'right', fontSize: 10, fill: C.seniorLine }}
                    />
                  )}
                  {result.steps.length > 0 && (
                    <ReferenceDot
                      x={result.steps[result.steps.length - 1].date}
                      y={juniorEnd}
                      r={3}
                      fill={C.juniorLine}
                      stroke={C.cardBg}
                      label={{ value: `Jr ${juniorEnd.toFixed(0)}`, position: 'right', fontSize: 10, fill: C.juniorLine }}
                    />
                  )}
                  <Brush dataKey="date" height={28} stroke={C.border} travellerWidth={8} />
                </LineChart>
              </ResponsiveContainerNoSSR>
            </div>

            {/* Chart timeframe */}
            <div className="mt-3 flex items-center justify-between" style={{ fontSize: 11, color: C.kpiLabel }}>
              <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Chart timeframe</span>
              <span>Full history</span>
            </div>
            <div className="mt-1 flex items-center justify-between" style={{ fontSize: 11, color: C.muted, fontFamily: MONO }}>
              <span>START {firstDate}</span>
              <span>END {lastDate}</span>
            </div>

            {/* Calendar-year return / observation stats table */}
            <div className="mt-6 overflow-x-auto">
              <p
                className="mb-2"
                style={{ color: C.eyebrow, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, fontWeight: 600 }}
              >
                Calendar-year return / observation stats
              </p>
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr
                    style={{
                      color: C.eyebrow,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontSize: 11,
                    }}
                    className="text-left"
                  >
                    <th className="py-2 pr-4 font-semibold">Metric</th>
                    {perYearRows.map((row) => (
                      <th key={row.year} className="py-2 pr-4 font-semibold text-right">
                        {row.year}
                      </th>
                    ))}
                    <th className="py-2 pr-4 font-semibold text-right">End $100 →</th>
                    <th className="py-2 font-semibold text-right">Avg/yr / total</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: MONO }}>
                  <tr style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2 pr-4" style={{ color: C.text }}>Base strategy</td>
                    {perYearRows.map((row) => (
                      <td key={row.year} className="py-2 pr-4 text-right" style={{ color: signColor(row.baseReturn) }}>
                        {fmtSignedPct(row.baseReturn)}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right" style={{ color: C.text }}>${strategyEnd.toFixed(0)}</td>
                    <td className="py-2 text-right" style={{ color: C.text }}>{fmtPct(result.strategyAvgYr, 1)} ann.</td>
                  </tr>
                  <tr style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2 pr-4" style={{ color: C.text }}>Junior return</td>
                    {perYearRows.map((row) => (
                      <td key={row.year} className="py-2 pr-4 text-right" style={{ color: signColor(row.juniorReturn) }}>
                        {fmtSignedPct(row.juniorReturn)}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right" style={{ color: C.text }}>${juniorEnd.toFixed(0)}</td>
                    <td className="py-2 text-right" style={{ color: C.text }}>{fmtSignedPct(result.juniorAvgYr, 1)} ann.</td>
                  </tr>
                  <tr style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2 pr-4" style={{ color: C.text }}>Senior return</td>
                    {perYearRows.map((row) => (
                      <td key={row.year} className="py-2 pr-4 text-right" style={{ color: signColor(row.seniorReturn) }}>
                        {fmtSignedPct(row.seniorReturn)}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right" style={{ color: C.text }}>${seniorEnd.toFixed(0)}</td>
                    <td className="py-2 text-right" style={{ color: C.text }}>{fmtSignedPct(result.seniorAvgYr, 1)} ann.</td>
                  </tr>
                  <tr style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2 pr-4" style={{ color: C.text }}>Non-observation %</td>
                    {perYearRows.map((row) => (
                      <td key={row.year} className="py-2 pr-4 text-right" style={{ color: C.text }}>
                        {fmtPct(row.nonObsPct / 100, 0)}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right" style={{ color: C.muted }}>—</td>
                    <td className="py-2 text-right" style={{ color: C.text }}>{fmtPct(result.nonObservationPct / 100, 0)}</td>
                  </tr>
                  <tr style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2 pr-4" style={{ color: C.text }}>Observation periods triggered</td>
                    {perYearRows.map((row) => (
                      <td key={row.year} className="py-2 pr-4 text-right" style={{ color: C.text }}>
                        {row.obsEvents}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right" style={{ color: C.muted }}>—</td>
                    <td className="py-2 text-right" style={{ color: C.text }}>{result.observationEvents} total</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Additional outcome metrics */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
              <SecondaryStat
                label="Senior worst drop"
                value={`-${fmtPct(result.seniorMaxDrawdown)}`}
                color={result.seniorMaxDrawdown > 0 ? C.danger : C.text}
              />
              <SecondaryStat
                label="Junior worst drop"
                value={`-${fmtPct(result.juniorMaxDrawdown)}`}
                color={result.juniorMaxDrawdown > 0 ? C.danger : C.text}
              />
              <SecondaryStat label="Max observed observation period" value={`${result.maxObservationPeriodDays}d`} />
              <SecondaryStat
                label="Claims erased"
                value={String(result.juniorLossRealizedEvents)}
                color={result.juniorLossRealizedEvents > 0 ? C.danger : C.text}
              />
              <SecondaryStat
                label="Claims value erased"
                value={fmtUsd0(result.juniorCapitalLost)}
                color={result.juniorCapitalLost > 0 ? C.danger : C.text}
              />
              <SecondaryStat
                label="Senior loss events"
                value={String(result.seniorMarkdownEvents)}
                color={result.seniorMarkdownEvents > 0 ? C.danger : C.text}
              />
            </div>
          </div>
        )}
      </section>

      {/* ================= 6. PROTOCOL MECHANICS + PRESET LADDER ================= */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 18, color: C.text }}>
            Protocol mechanics
          </h3>
          <ul className="mt-3 flex flex-col gap-3">
            <BulletItem color={C.seniorLine}>
              Senior is the protected side: losses reach Senior only after the Junior first-loss
              cushion is used first.
            </BulletItem>
            <BulletItem color={C.juniorLine}>
              Junior receives extra yield for taking first losses and can give up recoveries when
              the observation period expires before the strategy recovers.
            </BulletItem>
            <BulletItem color={C.olive}>
              Loaded model inputs: Senior and Junior follow the same wiTRY path, beta is 1.00, and
              Junior starts with a modest extra cushion.
            </BulletItem>
          </ul>
          <label
            className="mt-4 flex items-center gap-2 cursor-pointer select-none"
            style={{ color: C.muted, fontSize: 12 }}
          >
            <input
              type="checkbox"
              checked={maintainCoverage}
              onChange={(e) => setMaintainCoverage(e.target.checked)}
              style={{ accentColor: C.accent }}
            />
            Assume Junior is replenished each period
          </label>
          <p className="mt-3" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }}>
            Illustrative daily model, not a contract-exact implementation. wiTRY = Turkish-lira
            money-market index (FRED IRSTCI01TRM156N) valued in USD via Frankfurter/ECB USD/TRY.
            Engine is wei-exact to RoycoDayAccountant.sol.
          </p>
        </div>
        <div>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 18, color: C.text }}>
            Preset ladder
          </h3>
          <ul className="mt-3 flex flex-col gap-3">
            <BulletItem color={C.olive}>
              <strong>Conservative</strong> — larger Junior cushion and more recovery time. Lower
              Junior upside, fewer erased recovery claims.
            </BulletItem>
            <BulletItem color={C.accent}>
              <strong>Balanced</strong> — middle setting: Senior stays protected historically, while
              Junior still gets meaningful upside.
            </BulletItem>
            <BulletItem color={C.danger}>
              <strong>Aggressive</strong> — smaller Junior cushion and shorter recovery time. Higher
              Junior upside, more erased recovery claims.
            </BulletItem>
          </ul>
          <p className="mt-3" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }}>
            Scenarios keep Senior near target and vary how much risk Junior takes.
          </p>
        </div>
      </section>

      {/* ================= 7. DEPLOY HANDOFF ================= */}
      <section
        style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0 }}
        className="p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Deploy handoff</Eyebrow>
            <h2 className="mt-2" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.text }}>
              Copy final market-design parameters.
            </h2>
            <p className="mt-2" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              This is the finalized parameter handoff, not the full integration package.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeploy((v) => !v)}
            aria-label={showDeploy ? 'Collapse' : 'Expand'}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 0,
              color: C.accent,
              width: 32,
              height: 32,
              fontSize: 18,
              lineHeight: 1,
              background: 'transparent',
              flexShrink: 0,
            }}
          >
            {showDeploy ? '−' : '+'}
          </button>
        </div>

        {showDeploy && (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 0,
                padding: '12px 14px',
                background: C.cardBg,
                fontFamily: MONO,
                fontSize: 13,
                color: C.text,
                flex: 1,
                minWidth: 260,
              }}
            >
              {deployString}
            </div>
            <button
              type="button"
              onClick={copyDeployString}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 0,
                color: C.accent,
                textTransform: 'uppercase',
                fontSize: 10,
                letterSpacing: 1,
                padding: '10px 16px',
                background: 'transparent',
              }}
            >
              Copy
            </button>
          </div>
        )}
      </section>

      {/* ================= FOOTER ================= */}
      <footer style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }} className="pb-8">
        Backtest math is the Royco Day accountant, proven wei-exact (52/52
        vectors). Parameters illustrative pending accountant sign-off
        (OPEN-QUESTIONS). wiTRY series exported from the srwiTRY yield-flow workbook.
      </footer>
    </div>
  );
}

// --- small presentational subcomponents ------------------------------------

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: C.eyebrow,
        textTransform: 'uppercase',
        fontSize: 9.5,
        letterSpacing: 2,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0, padding: '12px 14px' }}>
      <p style={{ color: C.kpiLabel, textTransform: 'uppercase', fontSize: 10, letterSpacing: 1 }}>
        {label}
      </p>
      <p
        className="mt-2"
        style={{ color: C.accent, fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.04em', fontSize: 26 }}
      >
        {value}
      </p>
    </div>
  );
}

function SecondaryStat({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ color: C.kpiLabel, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 1 }}>
        {label}
      </p>
      <p className="mt-1" style={{ color, fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.04em', fontSize: 15 }}>
        {value}
      </p>
    </div>
  );
}

function LegendSwatch({ color, dashed, children }: { color: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span
        style={{
          width: 18,
          height: 0,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
          display: 'inline-block',
        }}
      />
      {children}
    </span>
  );
}

function BulletItem({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        style={{
          marginTop: 6,
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>{children}</span>
    </li>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  display,
  desc,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  desc: string;
  onChange: (v: number) => void;
}) {
  const handle = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(n);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label
          style={{ color: C.eyebrow, textTransform: 'uppercase', fontSize: 10, letterSpacing: 1, fontWeight: 600 }}
        >
          {label}
        </label>
        <span style={{ color: C.accent, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{display}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => handle(e.target.value)}
        className="w-full"
        style={{ accentColor: C.accent }}
      />
      <p className="mt-1.5" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
        {desc}
      </p>
    </div>
  );
}
