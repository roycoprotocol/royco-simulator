'use client';

// ---------------------------------------------------------------------------
// HybondSimulator — tenbin-style vertical market simulator for a hypothetical
// srHYBond senior/junior tranche market over the BNY Mellon and Insight Global
// Short-Dated High Yield Bond strategy (a composite proxy, not HYBOND's own
// history). Every tranche-accounting number rendered here comes from
// runBacktest() (which bridges to the validated engine, reused unchanged from
// lib/try). This component performs NO tranche accounting itself; the only
// local computation is presentational (indexing already-computed values,
// contiguous observation runs for chart shading, formatting, and the trivial
// Junior pool-share %).
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useRef, useState } from 'react';
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
  HYBOND_DEFAULT_PARAMS,
  HYBOND_NAV_SERIES,
  PRESETS,
  buildConfig,
  type HybondParams,
} from '@/lib/hybond/scenarios';
import {
  indexFromFraction,
  isFullRange,
  moveHandle,
  nearestSide,
  normalizeRange,
  panRange,
  pctOf,
  type IndexRange,
} from '@/lib/hybond/timeframe';

// Neutral zero-step result. The engine rejects some configurations outright (e.g. a
// $0 Junior tranche), and runBacktest runs inside a render-time useMemo, so a throw
// would take the page down. safeBacktest falls back to this and surfaces the reason
// inline instead.
const EMPTY_RESULT: BacktestResult = runBacktest({
  config: buildConfig(HYBOND_DEFAULT_PARAMS),
  depositST: HYBOND_DEFAULT_PARAMS.depositST,
  depositJT: HYBOND_DEFAULT_PARAMS.depositJT,
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

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
/** "2020-06" → "Jun 2020". Falls back to the raw key if it is not YYYY-MM. */
const monthLabel = (key: string): string => {
  const [y, m] = key.split('-');
  const name = MONTH_NAMES[Number(m) - 1];
  return name && y ? `${name} ${y}` : key;
};

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

export default function HybondSimulator() {
  const [params, setParams] = useState<HybondParams>(HYBOND_DEFAULT_PARAMS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maintainCoverage, setMaintainCoverage] = useState(true);
  const [showHistory, setShowHistory] = useState(true);

  const run = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config: buildConfig(params),
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: HYBOND_NAV_SERIES,
          maintainJuniorCoverage: maintainCoverage,
        }),
      ),
    [params, maintainCoverage],
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
          series: HYBOND_NAV_SERIES,
          maintainJuniorCoverage: false,
        }),
      ).result,
    [params],
  );
  const exposedSeniorEnd = exposedResult.steps.length
    ? exposedResult.steps[exposedResult.steps.length - 1].stIndex
    : 100;

  // Counterfactual: the same path with MAINTAINED Junior coverage (the
  // intended-product assumption), used when the checkbox is off to show what
  // the replenished case would have looked like for comparison.
  const maintainedResult = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config: buildConfig(params),
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: HYBOND_NAV_SERIES,
          maintainJuniorCoverage: true,
        }),
      ).result,
    [params],
  );
  const maintainedSeniorEnd = maintainedResult.steps.length
    ? maintainedResult.steps[maintainedResult.steps.length - 1].stIndex
    : 100;
  const maintainedJuniorEnd = maintainedResult.steps.length
    ? maintainedResult.steps[maintainedResult.steps.length - 1].jtIndex
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

  // --- Chart timeframe brush (VIEW ONLY) ------------------------------------
  // The brush zooms the chart. It never re-runs the backtest: KPIs, secondary
  // stats, summary chips, and the calendar table all stay computed over the
  // full history above, exactly as before.
  const maxIndex = Math.max(0, result.steps.length - 1);
  const [range, setRange] = useState<IndexRange>(() => ({
    a: 0,
    b: HYBOND_NAV_SERIES.length - 1,
  }));
  const view = useMemo(() => normalizeRange(range.a, range.b, maxIndex), [range, maxIndex]);
  const viewIsFull = isFullRange(view, maxIndex);

  // Only the steps inside the selected window reach the chart. Deriving the
  // shading and markers from this same slice clips them to the view for free.
  const visibleSteps = useMemo(
    () => result.steps.slice(view.a, view.b + 1),
    [result.steps, view.a, view.b],
  );

  // Contiguous observation runs → ReferenceArea shading (presentational).
  const observationRuns = useMemo(() => {
    const runs: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    let prev: string | null = null;
    for (const s of visibleSteps) {
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
  }, [visibleSteps]);

  const lossMarkers = useMemo(
    () => visibleSteps.filter((s) => s.juniorLossLocked),
    [visibleSteps],
  );

  const chartData = useMemo(
    () =>
      visibleSteps.map((s) => ({
        date: s.date,
        strategy: s.priceIndex,
        senior: s.stIndex,
        junior: s.jtIndex,
        marketState: s.marketState,
      })),
    [visibleSteps],
  );

  // Full-history observation bands for the brush's mini preview (index runs).
  const brushBands = useMemo(() => {
    const bands: { a: number; b: number }[] = [];
    let start: number | null = null;
    result.steps.forEach((s, i) => {
      if (s.inObservation) {
        if (start === null) start = i;
      } else if (start !== null) {
        bands.push({ a: start, b: i - 1 });
        start = null;
      }
    });
    if (start !== null) bands.push({ a: start, b: result.steps.length - 1 });
    return bands;
  }, [result.steps]);

  const brushSeries = useMemo(
    () => ({
      strategy: result.steps.map((s) => s.priceIndex),
      senior: result.steps.map((s) => s.stIndex),
      junior: result.steps.map((s) => s.jtIndex),
    }),
    [result.steps],
  );

  const dates = useMemo(() => result.steps.map((s) => s.date), [result.steps]);

  // Title derived from the series itself rather than a hardcoded label.
  const rangeTitle = dates.length
    ? `${monthLabel(dates[0])} to ${monthLabel(dates[dates.length - 1])} projection`
    : 'Projection';

  const seniorEnd = result.steps.length
    ? result.steps[result.steps.length - 1].stIndex
    : 100;

  // Junior's minimum effective NAV over the run ($), and whether it ever came
  // close to full exhaustion against its own deposit, both computed from the
  // engine's own step output (never hardcoded) so the disclaimer text below
  // stays truthful across scenarios and parameter changes.
  const juniorMinEffNav = useMemo(
    () =>
      result.steps.length
        ? Math.min(...result.steps.map((s) => Number(s.jtEff) / 1e18))
        : params.depositJT,
    [result.steps, params.depositJT],
  );
  const juniorEverNearExhaustion = juniorMinEffNav < params.depositJT * 0.1;
  const seniorDivergesUnderExposure = Math.abs(exposedSeniorEnd - seniorEnd) >= 0.01;
  const juniorEnd = result.steps.length
    ? result.steps[result.steps.length - 1].jtIndex
    : 100;
  // Fixed Junior vs. maintained-coverage Junior, compared on the SAME (fixed)
  // path's own end value against the maintained-coverage counterfactual, for
  // the checkbox-off branch of the disclaimer below.
  const seniorSameWhenFixed = Math.abs(seniorEnd - maintainedSeniorEnd) < 0.01;
  const juniorHigherWhenFixed = juniorEnd > maintainedJuniorEnd + 0.01;

  const updateParam = (patch: Partial<HybondParams>) =>
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
            ROYCO · srHYBond MARKET
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
          HYBond Sim
        </h1>
        <p className="mt-3 max-w-3xl" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
          HYBond Sim models a hypothetical Royco senior and junior market over the BNY Mellon
          and Insight Global Short-Dated High Yield Bond strategy, the portfolio behind
          OpenEden&apos;s tokenized HYBOND. Senior is shielded by Junior&apos;s first-loss
          buffer, and Junior earns a share of Senior&apos;s yield for absorbing that risk. The
          strategy reported a 7.52% average yield to expected redemption and a 2.35 year
          average expected maturity, per Insight as at 31 March 2025.
        </p>
      </section>

      {/* ================= 2. ACTIONS ROW ================= */}
      <section className="flex items-end justify-end flex-wrap gap-4">
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

      {/* ================= 2b. PROVENANCE DISCLOSURE ================= */}
      <section
        style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0 }}
        className="p-6"
      >
        <Eyebrow>What this is, and what it is not</Eyebrow>
        <p className="mt-3" style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>
          This is a counterfactual, not a track record. HYBOND launched on 1 April 2026 and has
          no multi-year history. The underlying series here is a proxy built from Insight&apos;s
          Global Short-Dated High Yield Bond composite, gross of fees, as reported by Insight as
          at 30 June 2025. A composite aggregates accounts following the strategy, it is not the
          NAV of any share class, and gross of fees is not what a holder receives. HYBOND&apos;s
          1.00% management fee and the fund&apos;s own charges would reduce these returns.
        </p>
        <p className="mt-3" style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>
          Only five annual checkpoints, June to June, come from published data. The month to
          month path between them is synthetic, so every drawdown date, observation period, and
          Junior loss lock-in shown here is an artifact of that sequencing rather than observed
          history.
        </p>
        <p className="mt-3" style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>
          No Royco market over HYBOND has been announced. This is an illustration of the
          mechanism, not a product.
        </p>
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
              {rangeTitle}
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
              How the tranches tracked the underlying composite proxy across the full history.
              Metrics below cover every month, the timeframe control zooms the chart only.
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
                Underlying (composite proxy)
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
                    name="Underlying"
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

            {/* Chart timeframe brush (view-only zoom over the full series) */}
            <TimeframeBrush
              dates={dates}
              series={brushSeries}
              bands={brushBands}
              view={view}
              isFull={viewIsFull}
              onChange={setRange}
            />

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
                    <th className="py-2 pr-4 font-semibold text-right">Underlying</th>
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
            {result.seniorMarkdownEvents === 1 ? '' : 's'}, with {result.juniorLossEvents} Junior
            loss lock-in{result.juniorLossEvents === 1 ? '' : 's'}, over the horizon.{' '}
            {seniorDivergesUnderExposure ? (
              <>
                <strong>Senior&apos;s protection depends on that replenishment.</strong>{' '}
                If Junior capital were not available in a crisis, Senior would be exposed once
                Junior is exhausted and would track the underlying down, in this scenario that
                takes Senior to{' '}
                <span style={{ fontFamily: MONO, fontWeight: 600, color: C.danger }}>
                  {fmtUsd(exposedSeniorEnd)}
                </span>{' '}
                instead of {fmtUsd(seniorEnd)} (uncheck the box to see the exposed case).
              </>
            ) : (
              <>
                On this path, replenishment did not change Senior&apos;s outcome. Senior ends at{' '}
                <span style={{ fontFamily: MONO, fontWeight: 600 }}>{fmtUsd(seniorEnd)}</span>{' '}
                either way (uncheck the box to compare), because Junior&apos;s buffer was never
                close to exhausted.
              </>
            )}{' '}
            {juniorEverNearExhaustion ? (
              <>
                Junior&apos;s effective NAV did fall as low as{' '}
                <span style={{ fontFamily: MONO, fontWeight: 600 }}>
                  {fmtUsd(juniorMinEffNav)}
                </span>{' '}
                against a {fmtUsd0(params.depositJT)} deposit on this path.
              </>
            ) : (
              <>
                Junior&apos;s effective NAV never dropped below{' '}
                <span style={{ fontFamily: MONO, fontWeight: 600 }}>
                  {fmtUsd(juniorMinEffNav)}
                </span>{' '}
                against a {fmtUsd0(params.depositJT)} deposit, so this run does not test what
                happens when Senior&apos;s protection actually fails.
              </>
            )}{' '}
            Senior&apos;s protection still depends on Junior capital being available, and a
            drawdown exceeding the entire buffer within one observation period would still mark
            Senior down. This series contains no such event, so the run does not demonstrate
            that case.
          </p>
        ) : (
          <p className="mt-3" style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>
            <strong>Fixed Junior capital, no replenishment.</strong> Once a crash exhausts
            Junior there is no buffer left, so Senior would track the underlying down. On this
            path, {juniorEverNearExhaustion ? (
              <>Junior was exhausted and Senior ends at{' '}
                <span style={{ fontFamily: MONO, fontWeight: 600, color: C.danger }}>
                  {fmtUsd(seniorEnd)}
                </span>
                .</>
            ) : (
              <>Junior was never close to exhausted, so fixed Junior survives, and Senior ends
                {seniorSameWhenFixed ? ' at the same ' : ' at '}
                <span style={{ fontFamily: MONO, fontWeight: 600 }}>{fmtUsd(seniorEnd)}</span>{' '}
                {seniorSameWhenFixed
                  ? 'as the maintained-coverage case'
                  : `versus ${fmtUsd(maintainedSeniorEnd)} with replenishment`}
                {juniorHigherWhenFixed ? (
                  <>
                    . Junior itself ends slightly higher here,{' '}
                    <span style={{ fontFamily: MONO, fontWeight: 600 }}>
                      {fmtUsd(juniorEnd)}
                    </span>{' '}
                    versus{' '}
                    <span style={{ fontFamily: MONO, fontWeight: 600 }}>
                      {fmtUsd(maintainedJuniorEnd)}
                    </span>{' '}
                    with replenishment, because fewer shares split the same premiums
                  </>
                ) : null}
                .</>
            )}{' '}
            This is the raw on-chain accountant result with a fixed Junior tranche. The
            intended product (checkbox on) continuously refills Junior, which is what protects
            Senior when a buffer actually runs low.
          </p>
        )}

        <p className="mt-4" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }}>
          Backtest math is the Royco Day accountant, proven wei-exact against the contract on this series (61/61 vectors).
          Parameters are illustrative and pending accountant sign-off. Projections, not
          promises. This is not an offer or investment advice.
        </p>
      </section>

      {/* ================= FOOTER ================= */}
      <footer style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }} className="pb-8">
        Backtest math is the Royco Day accountant, proven wei-exact against the contract on
        this series (61/61 vectors). Underlying series is a proxy built from Insight&apos;s
        Global Short-Dated High Yield Bond composite, total return, gross of fees, per Insight
        as at 30 June 2025. Only the five annual June checkpoints are published data, monthly
        sequencing is synthetic. Parameters illustrative, pending accountant sign-off
        (OPEN-QUESTIONS).
      </footer>
    </div>
  );
}

// --- Chart timeframe brush --------------------------------------------------

// The brush's own drag state. `pan` remembers where the grab started and the
// window it started from, so sliding preserves the window width exactly.
type DragMode =
  | { kind: 'handle'; side: 'start' | 'end' }
  | { kind: 'pan'; grabIndex: number; origin: IndexRange };

const BRUSH_TRACK_H = 54;
// The mini preview is drawn in a fixed viewBox and stretched with
// preserveAspectRatio="none", so it needs no width measurement to be correct.
const BRUSH_VB_W = 1000;

function TimeframeBrush({
  dates,
  series,
  bands,
  view,
  isFull,
  onChange,
}: {
  dates: string[];
  series: { strategy: number[]; senior: number[]; junior: number[] };
  bands: { a: number; b: number }[];
  view: IndexRange;
  isFull: boolean;
  onChange: (r: IndexRange) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const max = Math.max(0, dates.length - 1);

  const indexFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return indexFromFraction((clientX - r.left) / Math.max(r.width, 1), max);
    },
    [max],
  );

  // All drags capture the pointer on the TRACK, so moves keep arriving through
  // React's handlers even when the cursor leaves the element. React detaches
  // these on unmount, so there is nothing to clean up by hand.
  const begin = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    trackRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = mode;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const i = indexFromEvent(e.clientX);
    if (drag.kind === 'handle') onChange(moveHandle(view, drag.side, i, max));
    else onChange(panRange(drag.origin, i - drag.grabIndex, max));
  };

  const endDrag = (e: React.PointerEvent) => {
    dragRef.current = null;
    if (trackRef.current?.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // Click bare track: grab whichever handle is nearer and send it here.
  const onTrackDown = (e: React.PointerEvent) => {
    const i = indexFromEvent(e.clientX);
    const side = nearestSide(view, i);
    begin({ kind: 'handle', side }, e);
    onChange(moveHandle(view, side, i, max));
  };

  // Arrow = 1 month, Shift+Arrow = 12 months.
  const onHandleKey = (side: 'start' | 'end') => (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const step = dir * (e.shiftKey ? 12 : 1);
    onChange(moveHandle(view, side, (side === 'start' ? view.a : view.b) + step, max));
  };

  const leftPct = pctOf(view.a, max);
  const rightPct = pctOf(view.b, max);

  // Year gridline/tick positions: first point in each calendar year.
  const years = useMemo(() => {
    const out: { year: number; pct: number }[] = [];
    if (!dates.length) return out;
    const first = Number(dates[0].slice(0, 4));
    const last = Number(dates[dates.length - 1].slice(0, 4));
    for (let y = first; y <= last; y++) {
      const i = dates.findIndex((d) => Number(d.slice(0, 4)) >= y);
      out.push({ year: y, pct: pctOf(i < 0 ? max : i, max) });
    }
    return out;
  }, [dates, max]);

  // Mini preview paths, sharing one scale across all three lines.
  const preview = useMemo(() => {
    const all = [...series.strategy, ...series.senior, ...series.junior];
    if (!all.length || max <= 0) return null;
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const span = Math.max(hi - lo, 1);
    lo -= span * 0.12;
    hi += span * 0.08;
    const padY = 7;
    const X = (i: number) => (i / max) * BRUSH_VB_W;
    const Y = (v: number) =>
      BRUSH_TRACK_H - padY - ((v - lo) / (hi - lo)) * (BRUSH_TRACK_H - padY * 2);
    const path = (arr: number[]) =>
      arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(v).toFixed(2)}`).join(' ');
    return {
      strategy: path(series.strategy),
      senior: path(series.senior),
      junior: path(series.junior),
      bands: bands.map((b) => ({ x: X(b.a), w: Math.max(X(b.b) - X(b.a), 1.5) })),
    };
  }, [series, bands, max]);

  if (!dates.length) return null;

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    width: 20,
    height: 30,
    borderRadius: 2,
    border: '1px solid rgba(23,21,17,.22)',
    background: C.cardBg,
    boxShadow: '0 2px 8px rgba(60,45,28,.13)',
    transform: 'translate(-50%,-50%)',
    cursor: 'ew-resize',
    padding: 0,
    touchAction: 'none',
  };
  const gripStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: 7,
    width: 1,
    height: 14,
    background: C.eyebrow,
    boxShadow: `-4px 0 0 ${C.eyebrow}, 4px 0 0 ${C.eyebrow}`,
    transform: 'translateX(-50%)',
  };

  return (
    <div
      aria-label="Chart timeframe controls"
      style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: '10px 0 11px',
        marginTop: 14,
        display: 'grid',
        gap: 8,
      }}
    >
      <div
        className="flex items-center justify-between gap-3"
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: C.kpiLabel,
          fontWeight: 600,
        }}
      >
        <span>Chart timeframe</span>
        <span style={{ fontFamily: MONO, color: C.text, fontSize: 10.5, letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>
          {isFull ? 'Full history' : `${dates[view.a]} → ${dates[view.b]}`}
        </span>
      </div>

      <div style={{ padding: '2px 4px 0' }}>
        <div
          ref={trackRef}
          onPointerDown={onTrackDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'relative',
            height: BRUSH_TRACK_H,
            border: `1px solid ${C.border}`,
            background: C.cardBg,
            cursor: 'crosshair',
            touchAction: 'none',
            overflow: 'hidden',
          }}
        >
          {preview && (
            <svg
              viewBox={`0 0 ${BRUSH_VB_W} ${BRUSH_TRACK_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Full history overview for chart timeframe"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            >
              {preview.bands.map((b, i) => (
                <rect key={`bb-${i}`} x={b.x} y={0} width={b.w} height={BRUSH_TRACK_H} fill={C.obsFill} fillOpacity={0.18} />
              ))}
              {years.map((y) => (
                <line
                  key={`by-${y.year}`}
                  x1={(y.pct / 100) * BRUSH_VB_W}
                  y1={0}
                  x2={(y.pct / 100) * BRUSH_VB_W}
                  y2={BRUSH_TRACK_H}
                  stroke={C.border}
                  strokeDasharray="3 4"
                />
              ))}
              <path d={preview.strategy} fill="none" stroke={C.strategyLine} strokeWidth={1.8} opacity={0.75} vectorEffect="non-scaling-stroke" />
              <path d={preview.senior} fill="none" stroke={C.seniorLine} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <path d={preview.junior} fill="none" stroke={C.juniorLine} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
          )}

          {/* Selected window. The huge outer shadow dims everything outside it. */}
          <div
            onPointerDown={(e) => begin({ kind: 'pan', grabIndex: indexFromEvent(e.clientX), origin: view }, e)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${leftPct}%`,
              width: `${Math.max(rightPct - leftPct, 0)}%`,
              background: 'rgba(150,119,86,.14)',
              borderLeft: `2px solid ${C.eyebrow}`,
              borderRight: `2px solid ${C.eyebrow}`,
              boxShadow: '0 0 0 999px rgba(255,253,249,.62)',
              cursor: 'grab',
              touchAction: 'none',
            }}
          />

          <button
            type="button"
            onPointerDown={(e) => begin({ kind: 'handle', side: 'start' }, e)}
            onKeyDown={onHandleKey('start')}
            aria-label={`Timeframe start, ${monthLabel(dates[view.a])}`}
            style={{ ...handleStyle, left: `${leftPct}%` }}
          >
            <span style={gripStyle} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => begin({ kind: 'handle', side: 'end' }, e)}
            onKeyDown={onHandleKey('end')}
            aria-label={`Timeframe end, ${monthLabel(dates[view.b])}`}
            style={{ ...handleStyle, left: `${rightPct}%` }}
          >
            <span style={gripStyle} />
          </button>
        </div>

        <div style={{ position: 'relative', height: 18, marginTop: 2 }}>
          {years.map((y) => (
            <span
              key={`t-${y.year}`}
              style={{
                position: 'absolute',
                top: 1,
                left: `${y.pct}%`,
                transform: 'translateX(-50%)',
                fontSize: 9.5,
                color: C.kpiLabel,
                fontFamily: MONO,
                whiteSpace: 'nowrap',
              }}
            >
              {y.year}
            </span>
          ))}
        </div>

        <div
          className="flex items-center justify-between gap-3"
          style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600 }}
        >
          <span>
            Start{' '}
            <b style={{ fontFamily: MONO, color: C.text, letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>
              {monthLabel(dates[view.a])}
            </b>
          </span>
          <span>
            End{' '}
            <b style={{ fontFamily: MONO, color: C.text, letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>
              {monthLabel(dates[view.b])}
            </b>
          </span>
        </div>
      </div>
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
