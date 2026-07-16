'use client';

// ---------------------------------------------------------------------------
// TrySimulator — tenbin-style vertical market simulator for the TRY/wiTRY
// senior/junior tranche market. Every tranche-accounting number rendered here
// comes from runBacktest() (which bridges to the validated engine). This
// component performs NO tranche accounting itself; the only local computation
// is presentational (indexing already-computed values, contiguous observation
// runs for chart shading, formatting, and the trivial Junior pool-share %).
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
} from 'recharts';

import { runBacktest, type BacktestResult } from '@/lib/try/backtest';
import {
  TRY_DEFAULT_PARAMS,
  PRESETS,
  SCENARIOS,
  buildConfig,
  getScenario,
  type TryParams,
  type HistoricalScenario,
} from '@/lib/try/scenarios';

// Neutral zero-step result. The engine rejects some configurations outright (e.g. a
// $0 Junior tranche throws INVALID_POST_OP_STATE JT_DEPOSIT), and runBacktest runs
// inside a render-time useMemo, so a throw takes the whole page down. safeBacktest
// falls back to this and surfaces the reason inline instead. Mirrors HYBond's guard.
const EMPTY_RESULT: BacktestResult = runBacktest({
  config: buildConfig(TRY_DEFAULT_PARAMS),
  depositST: TRY_DEFAULT_PARAMS.depositST,
  depositJT: TRY_DEFAULT_PARAMS.depositJT,
  series: [],
});

function safeBacktest(
  run: () => BacktestResult,
): { result: BacktestResult; error: string | null } {
  try {
    return { result: run(), error: null };
  } catch (e) {
    return { result: EMPTY_RESULT, error: e instanceof Error ? e.message : String(e) };
  }
}

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

  const scenario = getScenario(scenarioId);

  const run = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config: buildConfig(params),
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: getScenario(scenarioId).points,
          maintainJuniorCoverage: maintainCoverage,
        }),
      ),
    [params, scenarioId, maintainCoverage],
  );
  const result = run.result;

  // Counterfactual: the same path with FIXED Junior (no replenishment), used to
  // show — in the disclaimer — what Senior's exposure looks like without the
  // maintained-coverage assumption.
  const exposedResult = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config: buildConfig(params),
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: getScenario(scenarioId).points,
          maintainJuniorCoverage: false,
        }),
      ).result,
    [params, scenarioId],
  );
  const exposedSeniorEnd = exposedResult.steps.length
    ? exposedResult.steps[exposedResult.steps.length - 1].stIndex
    : 100;

  // Which preset (if any) exactly matches current params — for active styling.
  const activePreset = useMemo(
    () =>
      PRESETS.find(
        (p) =>
          p.params.depositST === params.depositST &&
          p.params.depositJT === params.depositJT &&
          p.params.seniorShareToJuniorPct === params.seniorShareToJuniorPct &&
          p.params.observationDays === params.observationDays &&
          p.params.minCoveragePct === params.minCoveragePct,
      ),
    [params],
  );

  const jtPct =
    params.depositST + params.depositJT > 0
      ? (params.depositJT / (params.depositST + params.depositJT)) * 100
      : 0;

  // Contiguous observation runs → ReferenceArea shading (presentational).
  const observationRuns = useMemo(() => {
    const runs: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    let prev: string | null = null;
    for (const s of result.steps) {
      if (s.inObservation) {
        if (start === null) start = s.date;
        prev = s.date;
      } else if (start !== null) {
        runs.push({ x1: start, x2: prev ?? start });
        start = null;
        prev = null;
      }
    }
    if (start !== null) runs.push({ x1: start, x2: prev ?? start });
    return runs;
  }, [result.steps]);

  const lossMarkers = useMemo(
    () => result.steps.filter((s) => s.juniorLossLocked),
    [result.steps],
  );

  const chartData = useMemo(
    () =>
      result.steps.map((s) => ({
        date: s.date,
        strategy: s.priceIndex,
        senior: s.stIndex,
        junior: s.jtIndex,
        marketState: s.marketState,
      })),
    [result.steps],
  );

  const seniorEnd = result.steps.length
    ? result.steps[result.steps.length - 1].stIndex
    : 100;

  const updateParam = (patch: Partial<TryParams>) =>
    setParams((p) => ({ ...p, ...patch }));

  const copyLink = () => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* ================= 1. HERO ================= */}
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
            ROYCO · srwiTRY MARKET
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
          wiTRY is a Turkish-lira money-market-fund plus FX strategy. This market
          splits it so Senior is shielded by Junior&apos;s first-loss buffer, and
          Junior earns a share of Senior&apos;s yield for absorbing that risk.
        </p>
      </section>

      {/* ================= 2. TABS ROW ================= */}
      <section className="flex items-end justify-between flex-wrap gap-4">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* left: description */}
          <div>
            <Eyebrow>Overview</Eyebrow>
            <h2 className="mt-2" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.text }}>
              {scenario.label} projection
            </h2>
            <p className="mt-3" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              Senior stays inside a {fmtSignedPct(result.seniorAvgYr, 1)}/yr band with{' '}
              {result.observationEvents} observation periods over {result.years.toFixed(1)} years.
            </p>

            {/* secondary stat row (keeps all six metrics visible) */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
              <SecondaryStat label="Strategy avg/yr" value={`${fmtSignedPct(result.strategyAvgYr, 1)}/yr`} />
              <SecondaryStat
                label="Senior max drawdown"
                value={fmtPct(result.seniorMaxDrawdown)}
                color={result.seniorMaxDrawdown > 0 ? C.danger : C.text}
              />
              <SecondaryStat label="Observation periods" value={String(result.observationEvents)} />
              <SecondaryStat
                label="Junior loss lock-ins"
                value={String(result.juniorLossEvents)}
                color={result.juniorLossEvents > 0 ? C.danger : C.text}
              />
            </div>
          </div>

          {/* right: two KPI cards */}
          <div className="grid grid-cols-2 gap-4">
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
              Adjust the market terms.
            </h2>
            <p className="mt-2" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              Change deposits, the yield share, and the observation cadence to reshape the tranches.
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
              <Eyebrow>Scenario</Eyebrow>
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
                        Junior {fmtUsd0(p.params.depositJT)}, {p.params.observationDays}-day
                        observation, {p.params.seniorShareToJuniorPct}% share
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <SliderControl
                label="Senior deposit ($)"
                value={params.depositST}
                min={100}
                max={10000}
                step={100}
                display={fmtUsd0(params.depositST)}
                desc="Protected capital that Junior shields from losses."
                onChange={(v) => updateParam({ depositST: v })}
              />
              {/* min is 50, not 0: a $0 Junior tranche is a state the accountant rejects
                  outright (INVALID_POST_OP_STATE JT_DEPOSIT), so it is not a configuration
                  this control should be able to express. safeBacktest above is the backstop. */}
              <SliderControl
                label="Junior deposit ($)"
                value={params.depositJT}
                min={50}
                max={10000}
                step={50}
                display={fmtUsd0(params.depositJT)}
                desc="First-loss buffer that absorbs drawdowns for Senior."
                onChange={(v) => updateParam({ depositJT: v })}
              />
              <SliderControl
                label="Senior yield share to Junior (%)"
                value={params.seniorShareToJuniorPct}
                min={0}
                max={100}
                step={1}
                display={`${params.seniorShareToJuniorPct}%`}
                desc="Portion of Senior yield paid to Junior for taking risk."
                onChange={(v) => updateParam({ seniorShareToJuniorPct: v })}
              />
              <SliderControl
                label="Observation period (days)"
                value={params.observationDays}
                min={1}
                max={120}
                step={1}
                display={`${params.observationDays} days`}
                desc="Window during which deposits and redemptions freeze."
                onChange={(v) => updateParam({ observationDays: v })}
              />
              <SliderControl
                label="Min coverage (%)"
                value={params.minCoveragePct}
                min={0}
                max={100}
                step={1}
                display={`${params.minCoveragePct}%`}
                desc="Minimum Junior buffer rebuilt when deposits reopen."
                onChange={(v) => updateParam({ minCoveragePct: v })}
              />
            </div>

            {/* Engine rejected this configuration — report it instead of crashing. */}
            {run.error && (
              <div
                style={{
                  border: `1px solid ${C.danger}`,
                  background: C.cardBg,
                  padding: '12px 14px',
                  fontSize: 12,
                  color: C.danger,
                  lineHeight: 1.5,
                  marginTop: 16,
                }}
              >
                <span style={{ fontWeight: 600 }}>This configuration is not valid.</span> The
                accountant rejected it ({run.error}), so no results are shown. Adjust the inputs
                above.
              </div>
            )}

            {/* Summary chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SummaryChip
                label="Senior protection"
                body={`${result.seniorMarkdownEvents} markdowns, ${fmtPct(result.seniorMaxDrawdown)} max drawdown`}
              />
              <SummaryChip
                label="Junior tradeoff"
                body={`${fmtSignedPct(result.juniorAvgYr)}/yr, ${result.juniorLossEvents} loss lock-ins`}
              />
              <SummaryChip
                label="Coverage"
                body={`Junior ≈ ${jtPct.toFixed(0)}% of pool, ${fmtUsd0(result.juniorCapitalInjected)} attracted`}
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
              How the tranches tracked the strategy across the selected history.
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
              <LegendSwatch color={C.strategyLine} dashed>
                Base strategy
              </LegendSwatch>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>▼</span> Junior loss locked
              </span>
              <span className="flex items-center gap-2">
                <span
                  style={{ width: 18, height: 10, background: C.obsFill, opacity: 0.32, display: 'inline-block' }}
                />
                observation period
              </span>
            </div>

            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainerNoSSR>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  {observationRuns.map((r, i) => (
                    <ReferenceArea
                      key={`obs-${i}`}
                      x1={r.x1}
                      x2={r.x2}
                      fill={C.obsFill}
                      fillOpacity={0.32}
                      stroke="none"
                    />
                  ))}
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
                  {lossMarkers.map((s, i) => (
                    <ReferenceDot
                      key={`loss-${i}`}
                      x={s.date}
                      y={s.jtIndex}
                      r={3.5}
                      fill={C.danger}
                      stroke={C.cardBg}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainerNoSSR>
            </div>

            {/* Calendar returns table */}
            <div className="mt-6 overflow-x-auto">
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
                    <th className="py-2 pr-4 font-semibold">Year</th>
                    <th className="py-2 pr-4 font-semibold text-right">Strategy</th>
                    <th className="py-2 pr-4 font-semibold text-right">Senior</th>
                    <th className="py-2 pr-4 font-semibold text-right">Junior</th>
                    <th className="py-2 font-semibold text-right">Senior end $100</th>
                  </tr>
                </thead>
                <tbody>
                  {result.calendar.map((row) => (
                    <tr key={row.year} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-4" style={{ color: C.text, fontFamily: MONO }}>
                        {row.year}
                      </td>
                      <td
                        className="py-2 pr-4 text-right"
                        style={{ color: signColor(row.strategyReturn), fontFamily: MONO }}
                      >
                        {fmtSignedPct(row.strategyReturn)}
                      </td>
                      <td
                        className="py-2 pr-4 text-right"
                        style={{ color: signColor(row.seniorReturn), fontFamily: MONO }}
                      >
                        {fmtSignedPct(row.seniorReturn)}
                      </td>
                      <td
                        className="py-2 pr-4 text-right"
                        style={{ color: signColor(row.juniorReturn), fontFamily: MONO }}
                      >
                        {fmtSignedPct(row.juniorReturn)}
                      </td>
                      <td className="py-2 text-right" style={{ color: C.text, fontFamily: MONO }}>
                        {fmtUsd(row.seniorEnd100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ================= 6. DISCLAIMER ================= */}
      <section
        style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${C.accent}`,
          borderRadius: 0,
        }}
        className="p-6"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <span
            style={{
              color: C.eyebrow,
              textTransform: 'uppercase',
              fontSize: 10,
              letterSpacing: 1.5,
              fontWeight: 600,
            }}
          >
            Key modeling assumption
          </span>
          <label
            className="flex items-center gap-2 cursor-pointer select-none"
            style={{ color: C.muted, fontSize: 12 }}
          >
            <input
              type="checkbox"
              checked={maintainCoverage}
              onChange={(e) => setMaintainCoverage(e.target.checked)}
              style={{ accentColor: C.accent }}
            />
            Assume Junior is replenished to hold the buffer
          </label>
        </div>

        {maintainCoverage ? (
          <p className="mt-3" style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>
            These results assume <strong>maintained Junior coverage</strong>: each time an
            observation period ends and deposits reopen, fresh Junior capital is attracted to
            rebuild the buffer to at least the {params.minCoveragePct}% minimum, re-protecting
            Senior from its (possibly marked-down) new level. This run assumes{' '}
            <span style={{ fontFamily: MONO, fontWeight: 600 }}>
              {fmtUsd(result.juniorCapitalInjected)}
            </span>{' '}
            of fresh Junior capital and {result.seniorMarkdownEvents} Senior mark-down
            {result.seniorMarkdownEvents === 1 ? '' : 's'} over the horizon.{' '}
            <strong>Senior&apos;s protection depends on that replenishment.</strong> If Junior
            capital were not available in a crisis, Senior would be exposed once Junior is
            exhausted and would track the strategy down, in this scenario that takes Senior to{' '}
            <span style={{ fontFamily: MONO, fontWeight: 600, color: C.danger }}>
              {fmtUsd(exposedSeniorEnd)}
            </span>{' '}
            instead of {fmtUsd(seniorEnd)} (uncheck the box to see the exposed case). Even with
            replenishment, a single drawdown that exceeds the entire buffer within one
            observation period still marks Senior down.
          </p>
        ) : (
          <p className="mt-3" style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>
            <strong>Fixed Junior capital, no replenishment.</strong> Once a crash exhausts
            Junior there is no buffer left, so Senior tracks the strategy down and ends at{' '}
            <span style={{ fontFamily: MONO, fontWeight: 600, color: C.danger }}>
              {fmtUsd(seniorEnd)}
            </span>
            . This is the raw on-chain accountant result with a fixed Junior tranche. The
            intended product (checkbox on) continuously refills Junior, which is what protects
            Senior.
          </p>
        )}

        <p className="mt-4" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }}>
          Backtest math is the Royco Day accountant, proven wei-exact (52/52 vectors).
          Parameters are illustrative and pending accountant sign-off. Projections, not
          promises. This is not an offer or investment advice.
        </p>
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

function SummaryChip({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 0, padding: '12px 14px', background: C.cardBg }}>
      <p style={{ color: C.olive, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 1, fontWeight: 600 }}>
        {label}
      </p>
      <p className="mt-1.5" style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
        {body}
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
