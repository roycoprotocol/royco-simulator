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
  Legend,
} from 'recharts';

import { runBacktest } from '@/lib/try/backtest';
import {
  TRY_DEFAULT_PARAMS,
  PRESETS,
  SCENARIOS,
  buildConfig,
  getScenario,
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

const COLORS = {
  senior: 'var(--success)',
  junior: 'var(--info)',
  strategy: 'var(--insight)',
  warn: 'var(--warning)',
  danger: 'var(--danger)',
};

// Sign-aware color for returns/drawdowns.
const signColor = (frac: number): string =>
  frac < 0 ? 'var(--danger)' : 'var(--primary-text)';

export default function TrySimulator() {
  const [params, setParams] = useState<TryParams>(TRY_DEFAULT_PARAMS);
  const [scenarioId, setScenarioId] = useState<HistoricalScenario['id']>('since2024');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maintainCoverage, setMaintainCoverage] = useState(true);

  const scenario = getScenario(scenarioId);

  const result = useMemo(
    () =>
      runBacktest({
        config: buildConfig(params),
        depositST: params.depositST,
        depositJT: params.depositJT,
        series: getScenario(scenarioId).points,
        maintainJuniorCoverage: maintainCoverage,
      }),
    [params, scenarioId, maintainCoverage],
  );

  // Counterfactual: the same path with FIXED Junior (no replenishment), used to
  // show — in the disclaimer — what Senior's exposure looks like without the
  // maintained-coverage assumption.
  const exposedResult = useMemo(
    () =>
      runBacktest({
        config: buildConfig(params),
        depositST: params.depositST,
        depositJT: params.depositJT,
        series: getScenario(scenarioId).points,
        maintainJuniorCoverage: false,
      }),
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

  return (
    <div className="flex flex-col gap-8">
      {/* ================= A. HERO ================= */}
      <section>
        <h1
          className="text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: 'var(--primary-text)' }}
        >
          One strategy, split into a protected Senior and a first-loss Junior.
        </h1>
        <p className="mt-2 text-sm max-w-3xl" style={{ color: 'var(--secondary-text)' }}>
          wiTRY is a Turkish-lira money-market-fund plus FX strategy. This market
          splits it so Senior is shielded by Junior&apos;s first-loss buffer, and
          Junior earns a share of Senior&apos;s yield for absorbing that risk.
        </p>
      </section>

      {/* ================= B. CUSTOMIZE TERMS ================= */}
      <section
        className="rounded-xl border p-5"
        style={{ background: 'var(--theme-background)', borderColor: 'var(--theme-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--secondary-text)' }}>
            Customize terms
          </h2>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs hover:underline"
            style={{ color: 'var(--tertiary-text)' }}
          >
            {showAdvanced ? 'Hide advanced' : 'Show advanced'}
          </button>
        </div>

        {/* Preset ladder */}
        <div className="mb-5">
          <p className="text-xs mb-2" style={{ color: 'var(--tertiary-text)' }}>
            Preset ladder
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = activePreset?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setParams({ ...p.params })}
                  className="px-3 py-1.5 rounded-lg border text-xs transition-colors"
                  style={{
                    background: active ? 'var(--theme-background-elevated)' : 'transparent',
                    borderColor: active ? 'var(--info)' : 'var(--theme-border)',
                    color: active ? 'var(--primary-text)' : 'var(--secondary-text)',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {activePreset && (
            <p className="mt-2 text-xs" style={{ color: 'var(--secondary-text)' }}>
              {activePreset.note}
            </p>
          )}
        </div>

        {/* Scenario picker */}
        <div className="mb-5">
          <p className="text-xs mb-2" style={{ color: 'var(--tertiary-text)' }}>
            Historical scenario
          </p>
          <div className="flex flex-wrap gap-2">
            {SCENARIOS.map((s) => {
              const active = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenarioId(s.id)}
                  className="px-3 py-1.5 rounded-lg border text-xs transition-colors"
                  style={{
                    background: active ? 'var(--theme-background-elevated)' : 'transparent',
                    borderColor: active ? 'var(--info)' : 'var(--theme-border)',
                    color: active ? 'var(--primary-text)' : 'var(--secondary-text)',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--secondary-text)' }}>
            {scenario.note}{' '}
            <span style={{ color: 'var(--tertiary-text)' }}>
              ({scenario.cadence}, {scenario.points.length} points)
            </span>
          </p>
        </div>

        {/* Sliders / inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <NumberControl
            label="Senior deposit ($)"
            value={params.depositST}
            min={100}
            max={10000}
            step={100}
            onChange={(v) => updateParam({ depositST: v })}
          />
          <NumberControl
            label="Junior deposit ($)"
            value={params.depositJT}
            min={0}
            max={10000}
            step={50}
            onChange={(v) => updateParam({ depositJT: v })}
          />
          <NumberControl
            label="Senior yield share paid to Junior (%)"
            value={params.seniorShareToJuniorPct}
            min={0}
            max={100}
            step={1}
            onChange={(v) => updateParam({ seniorShareToJuniorPct: v })}
          />
          <NumberControl
            label="Observation period (days)"
            value={params.observationDays}
            min={1}
            max={120}
            step={1}
            onChange={(v) => updateParam({ observationDays: v })}
          />
          {showAdvanced && (
            <NumberControl
              label="Min coverage (%)"
              value={params.minCoveragePct}
              min={0}
              max={100}
              step={1}
              onChange={(v) => updateParam({ minCoveragePct: v })}
            />
          )}
        </div>

        <p className="mt-4 text-xs" style={{ color: 'var(--secondary-text)' }}>
          Junior ={' '}
          <span className="tabular-nums" style={{ color: 'var(--info)' }}>
            {jtPct.toFixed(1)}%
          </span>{' '}
          of the pool.
        </p>
      </section>

      {/* ================= C. RESULTS ================= */}
      <>
          {/* KPI cards */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Senior avg/yr" value={fmtSignedPct(result.seniorAvgYr)} color={COLORS.senior} />
            <Kpi label="Junior avg/yr" value={fmtSignedPct(result.juniorAvgYr)} color={COLORS.junior} />
            <Kpi label="Strategy avg/yr" value={fmtSignedPct(result.strategyAvgYr)} color="var(--secondary-text)" />
            <Kpi
              label="Senior max drawdown"
              value={fmtPct(result.seniorMaxDrawdown)}
              color={result.seniorMaxDrawdown > 0 ? COLORS.danger : 'var(--primary-text)'}
            />
            <Kpi label="Observation periods" value={String(result.observationEvents)} color="var(--primary-text)" />
            <Kpi
              label="Junior loss lock-ins"
              value={String(result.juniorLossEvents)}
              color={result.juniorLossEvents > 0 ? COLORS.danger : 'var(--primary-text)'}
            />
          </section>

          {/* Chart */}
          <section
            className="rounded-xl border p-5"
            style={{ background: 'var(--theme-background)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--secondary-text)' }}>
                Review history
              </h2>
              <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
                shaded = observation period (deposits/redemptions frozen)
              </span>
            </div>
            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainerNoSSR>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
                  {observationRuns.map((r, i) => (
                    <ReferenceArea
                      key={`obs-${i}`}
                      x1={r.x1}
                      x2={r.x2}
                      fill={COLORS.warn}
                      fillOpacity={0.08}
                      stroke="none"
                    />
                  ))}
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--tertiary-text)', fontSize: 11 }}
                    stroke="var(--theme-border)"
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{ fill: 'var(--tertiary-text)', fontSize: 11 }}
                    stroke="var(--theme-border)"
                    label={{
                      value: '$ per $100 deposited',
                      angle: -90,
                      position: 'insideLeft',
                      fill: 'var(--tertiary-text)',
                      fontSize: 11,
                    }}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--theme-background-elevated)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: 8,
                      color: 'var(--primary-text)',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'var(--secondary-text)' }}
                    formatter={(value: number | string, name: string) => {
                      const v = typeof value === 'number' ? `$${value.toFixed(2)}` : value;
                      return [v, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--secondary-text)' }} />
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    name="Strategy"
                    stroke={COLORS.strategy}
                    strokeDasharray="5 4"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="senior"
                    name="Senior"
                    stroke={COLORS.senior}
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="junior"
                    name="Junior"
                    stroke={COLORS.junior}
                    dot={false}
                    strokeWidth={2}
                  />
                  {lossMarkers.map((s, i) => (
                    <ReferenceDot
                      key={`loss-${i}`}
                      x={s.date}
                      y={s.jtIndex}
                      r={4}
                      fill={COLORS.danger}
                      stroke="var(--foundation)"
                      label={{
                        value: 'Junior loss locked',
                        position: 'top',
                        fill: COLORS.danger,
                        fontSize: 10,
                      }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainerNoSSR>
            </div>
          </section>

          {/* Calendar returns table */}
          <section
            className="rounded-xl border p-5 overflow-x-auto"
            style={{ background: 'var(--theme-background)', borderColor: 'var(--theme-border)' }}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--secondary-text)' }}>
              Calendar returns
            </h2>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr style={{ color: 'var(--tertiary-text)' }} className="text-left text-xs uppercase tracking-wide">
                  <th className="py-2 pr-4 font-medium">Year</th>
                  <th className="py-2 pr-4 font-medium text-right">Strategy</th>
                  <th className="py-2 pr-4 font-medium text-right">Senior</th>
                  <th className="py-2 pr-4 font-medium text-right">Junior</th>
                  <th className="py-2 font-medium text-right">Senior end $100</th>
                </tr>
              </thead>
              <tbody>
                {result.calendar.map((row) => (
                  <tr key={row.year} className="border-t" style={{ borderColor: 'var(--theme-border)' }}>
                    <td className="py-2 pr-4" style={{ color: 'var(--primary-text)' }}>
                      {row.year}
                    </td>
                    <td className="py-2 pr-4 text-right" style={{ color: signColor(row.strategyReturn) }}>
                      {fmtSignedPct(row.strategyReturn)}
                    </td>
                    <td className="py-2 pr-4 text-right" style={{ color: signColor(row.seniorReturn) }}>
                      {fmtSignedPct(row.seniorReturn)}
                    </td>
                    <td className="py-2 pr-4 text-right" style={{ color: signColor(row.juniorReturn) }}>
                      {fmtSignedPct(row.juniorReturn)}
                    </td>
                    <td className="py-2 text-right" style={{ color: 'var(--primary-text)' }}>
                      {fmtUsd(row.seniorEnd100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* KEY ASSUMPTION — prominent, always-visible disclaimer */}
          <section
            className="rounded-xl border-2 p-5"
            style={{ background: 'var(--theme-background)', borderColor: 'var(--warning)' }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--warning)' }}
              >
                Key modeling assumption — please read
              </span>
              <label
                className="flex items-center gap-2 text-xs cursor-pointer select-none"
                style={{ color: 'var(--secondary-text)' }}
              >
                <input
                  type="checkbox"
                  checked={maintainCoverage}
                  onChange={(e) => setMaintainCoverage(e.target.checked)}
                />
                Assume Junior is replenished to hold the buffer
              </label>
            </div>

            {maintainCoverage ? (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--primary-text)' }}>
                These results assume <strong>maintained Junior coverage</strong>: each time an
                observation period ends and deposits reopen, fresh Junior capital is attracted to
                rebuild the buffer to at least the {params.minCoveragePct}% minimum, re-protecting
                Senior from its (possibly marked-down) new level. This run assumes{' '}
                <span className="tabular-nums font-semibold">
                  {fmtUsd(result.juniorCapitalInjected)}
                </span>{' '}
                of fresh Junior capital and {result.seniorMarkdownEvents} Senior mark-down
                {result.seniorMarkdownEvents === 1 ? '' : 's'} over the horizon.{' '}
                <strong>Senior&apos;s protection depends on that replenishment.</strong> If Junior
                capital were not available in a crisis, Senior would be exposed once Junior is
                exhausted and would track the strategy down — in this scenario that takes Senior to{' '}
                <span className="tabular-nums font-semibold" style={{ color: 'var(--warning)' }}>
                  {fmtUsd(exposedSeniorEnd)}
                </span>{' '}
                instead of {fmtUsd(seniorEnd)} (uncheck the box to see the exposed case). Even with
                replenishment, a single drawdown that exceeds the entire buffer within one
                observation period still marks Senior down.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--primary-text)' }}>
                <strong>Fixed Junior capital — no replenishment.</strong> Once a crash exhausts
                Junior there is no buffer left, so Senior tracks the strategy down and ends at{' '}
                <span className="tabular-nums font-semibold" style={{ color: 'var(--warning)' }}>
                  {fmtUsd(seniorEnd)}
                </span>
                . This is the raw on-chain accountant result with a fixed Junior tranche. The
                intended product (checkbox on) continuously refills Junior, which is what protects
                Senior.
              </p>
            )}

            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--tertiary-text)' }}>
              Backtest math is the Royco Day accountant, proven wei-exact (52/52 vectors).
              Parameters are illustrative and pending accountant sign-off. Projections, not
              promises. This is not an offer or investment advice.
            </p>
          </section>
      </>

      {/* ================= FOOTER ================= */}
      <footer className="pt-2 pb-8 text-[11px] leading-relaxed" style={{ color: 'var(--tertiary-text)' }}>
        Backtest math is the Royco Day accountant, proven wei-exact (52/52
        vectors). Parameters illustrative pending accountant sign-off
        (OPEN-QUESTIONS). wiTRY series from the srwiTRY brief.
      </footer>
    </div>
  );
}

// --- small presentational subcomponents ------------------------------------

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--theme-background)', borderColor: 'var(--theme-border)' }}
    >
      <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const handle = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(n);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs" style={{ color: 'var(--secondary-text)' }}>
          {label}
        </label>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => handle(e.target.value)}
          className="w-24 h-8 px-2 rounded-md border text-right text-sm tabular-nums focus:outline-none"
          style={{
            background: 'var(--theme-background-elevated)',
            borderColor: 'var(--theme-border)',
            color: 'var(--primary-text)',
          }}
        />
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => handle(e.target.value)}
        className="w-full"
        style={{ accentColor: 'var(--info)' }}
      />
    </div>
  );
}

