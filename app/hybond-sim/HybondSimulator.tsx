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
  ReferenceLine,
  usePlotArea,
} from 'recharts';

import {
  runBacktest,
  type BacktestResult,
  type ErasureEvent,
  type ErasureReason,
  type ObservationPeriod,
  type SeniorLossEvent,
} from '@/lib/try/backtest';
import {
  HYBOND_DEFAULT_PARAMS,
  HYBOND_NAV_SERIES,
  OBSERVATION_DAYS_MAX,
  OBSERVATION_DAYS_MIN,
  PRESETS,
  buildHybondConfig,
  juniorFromFirstLossPct,
  screenPresets,
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
  config: buildHybondConfig(HYBOND_DEFAULT_PARAMS),
  depositST: HYBOND_DEFAULT_PARAMS.depositST,
  depositJT: HYBOND_DEFAULT_PARAMS.depositJT,
  series: [],
});

// A fixed term long enough (10 years) to outlast the whole series, so no observation
// period can ever expire and no coverage recovery is ever erased. Differencing this
// against the same run at the real term isolates exactly what expiry cost Junior.
const NO_EXPIRY_TERM_SECONDS = 315_360_000n;

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
  // Tenbin's CHART.junF (:483) — the "Junior if recoveries kept" counterfactual line.
  juniorKeptLine: '#C9B8A2',
  // Tenbin's CHART.free (:483) — the hovered non-observation band.
  freeLine: '#4BCB81',
};

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, monospace";

// Sign-aware color for returns/drawdowns.
const signColor = (frac: number): string => (frac < 0 ? C.danger : C.text);

// Port of tenbin-sims/index.html:736 fmtPct — fixed decimals with trailing zeros trimmed.
const fmtTrim = (v: number, dec = 2): string =>
  Number(v).toFixed(dec).replace(/\.?0+$/, '');

// Port of tenbin-sims/index.html:737. Presentational twin of scenarios.ts's
// utilWadFromBufferPct (which is the same ratio scaled into WAD).
const utilizationPctFromBufferPct = (v: number): number => 10000 / Math.max(v, 0.01);

// Port of tenbin-sims/index.html:503-508 erasureCause, extended to this engine's
// reason set. Tenbin's 'st-il' cause is deliberately NOT ported: Tenbin force-erases
// Junior's claim on any Senior effective loss, which the accountant never does, so
// there is no state here to label with it.
const erasureCause = (reason: ErasureReason): string => {
  switch (reason) {
    case 'liquidation':
      return 'protected Senior exit opened';
    case 'expired':
      return 'observation period ended';
    case 'juniorWiped':
      return 'Junior fully depleted';
    case 'noTerm':
      return 'no observation term set';
    default:
      return 'recovery claim erased';
  }
};

// Tenbin's estimateText (:487): the SVG chart furniture is laid out by hand, so box
// widths come from a monospace-ish character estimate rather than measured text.
const estimateText = (t: string): number => t.length * 6;

// --- chart overlay shapes ---------------------------------------------------
// Recharts has no I-beam/annotation primitive, so these render through the `shape`
// render prop of ReferenceLine/ReferenceDot: recharts still owns every data-to-pixel
// mapping (and the clip path), and these only draw in the pixel space it hands over.

/**
 * Port of tenbin-sims/index.html:539-550. The claim Junior forfeited at an erasure,
 * drawn as an I-beam from where Junior would have been (`top`) down to where the
 * Junior line actually landed.
 *
 * Tenbin gates the whole I-beam on forfeit > 0.1% (:540); we draw it for every
 * erasure event (a sub-pixel beam is still an honest mark) and gate only the label,
 * on Tenbin's >= 4% (:544).
 */
function ErasureIBeam(props: {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  clipPath?: string;
  beamLabel?: string | null;
}) {
  const plot = usePlotArea();
  const { x1, y1, y2, clipPath, beamLabel } = props;
  if (
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(y2)
  ) {
    return null;
  }
  const x = x1 as number;
  const yTop = y1 as number;
  const yBottom = y2 as number;

  let labelBox: { x: number; y: number; w: number; h: number } | null = null;
  if (beamLabel) {
    const w = estimateText(beamLabel) + 12;
    const h = 16;
    // Tenbin :546 clamps the box inside the plot rect so it never escapes the chart.
    const lx = plot
      ? Math.min(Math.max(x + 7, plot.x + 4), plot.x + plot.width - w - 4)
      : x + 7;
    const ly = plot
      ? Math.min(
          Math.max((yTop + yBottom) / 2 - h / 2, plot.y + 4),
          plot.y + plot.height - h - 4,
        )
      : (yTop + yBottom) / 2 - h / 2;
    labelBox = { x: lx, y: ly, w, h };
  }

  return (
    <g clipPath={clipPath}>
      <line x1={x} y1={yTop} x2={x} y2={yBottom} stroke={C.danger} strokeWidth={2.4} />
      <line x1={x - 5} y1={yTop} x2={x + 5} y2={yTop} stroke={C.danger} strokeWidth={1.2} />
      <line
        x1={x - 5}
        y1={yBottom}
        x2={x + 5}
        y2={yBottom}
        stroke={C.danger}
        strokeWidth={1.2}
      />
      {labelBox && beamLabel && (
        <g>
          <rect
            x={labelBox.x}
            y={labelBox.y}
            width={labelBox.w}
            height={labelBox.h}
            fill={C.cardBg}
            fillOpacity={0.94}
            stroke={C.danger}
            strokeWidth={0.8}
          />
          <text
            x={labelBox.x + 6}
            y={labelBox.y + labelBox.h / 2 + 0.5}
            fill={C.danger}
            fontSize={10.5}
            fontWeight={700}
            dominantBaseline="middle"
          >
            {beamLabel}
          </text>
        </g>
      )}
    </g>
  );
}

/** Port of tenbin-sims/index.html:552-554 — a Senior loss event on the Senior line. */
function SeniorLossMark(props: { cx?: number; cy?: number; clipPath?: string }) {
  const { cx, cy, clipPath } = props;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const x = cx as number;
  const y = cy as number;
  return (
    <g clipPath={clipPath}>
      <line x1={x} y1={y - 9} x2={x} y2={y + 9} stroke={C.danger} strokeWidth={1.5} />
      <circle cx={x} cy={y} r={4.2} fill={C.danger} stroke={C.cardBg} strokeWidth={1.4} />
    </g>
  );
}

/** Port of tenbin-sims/index.html:555-556 — the "Jr N" / "Sr N" tag at the view's right edge. */
function EndValueTag(props: { cx?: number; cy?: number; text?: string; color?: string }) {
  const plot = usePlotArea();
  const { cx, cy, text, color } = props;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !text) return null;
  const x = plot
    ? Math.min((cx as number) + 4, plot.x + plot.width - 28)
    : (cx as number) + 4;
  return (
    <text
      x={x}
      y={cy}
      fill={color}
      fontSize={11}
      fontWeight={600}
      dominantBaseline="middle"
    >
      {text}
    </text>
  );
}

/** Port of tenbin-sims/index.html:557-565 — the chip above a hovered band. */
function BandChip(props: {
  x1?: number;
  x2?: number;
  clipPath?: string;
  chipLabel?: string;
  color?: string;
}) {
  const plot = usePlotArea();
  const { x1, x2, chipLabel, color } = props;
  if (!Number.isFinite(x1) || !Number.isFinite(x2) || !chipLabel || !plot) return null;
  const cx = ((x1 as number) + (x2 as number)) / 2;
  const w = estimateText(chipLabel) + 16;
  const h = 20;
  const tx = Math.min(Math.max(cx - w / 2, plot.x + 4), plot.x + plot.width - w - 4);
  const ty = plot.y + 6;
  return (
    <g>
      <rect
        x={tx}
        y={ty}
        width={w}
        height={h}
        fill={C.cardBg}
        fillOpacity={0.96}
        stroke={color}
      />
      <text
        x={tx + w / 2}
        y={ty + h / 2 + 0.5}
        fill={color}
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {chipLabel}
      </text>
    </g>
  );
}

/**
 * Observation-period phrasing shared by the hover chip (:558) and the tooltip row
 * (:573). The target/observed split is load-bearing here: the term is set in seconds
 * but the series is sampled monthly, so a 30d target is observed as 30d or 31d purely
 * from month length.
 */
const observationSplit = (o: ObservationPeriod, forChip: boolean): string => {
  if (o.expired && o.targetDays && o.days !== o.targetDays) {
    return forChip
      ? `${o.targetDays}d target / ${o.days}d observed`
      : `${o.targetDays}d target, next sample at ${o.days}d`;
  }
  return `${o.days}d`;
};

/**
 * Port of tenbin-sims/index.html:566-594. Everything below the series rows is looked
 * up from the hovered date rather than passed down from hover state, so the tooltip
 * can never disagree with the label recharts is showing.
 */
function ChartTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ name?: string | number; value?: unknown; color?: string }>;
  dateIndex: Map<string, number>;
  observationPeriods: ObservationPeriod[];
  nonObservationPeriods: ObservationPeriod[];
  erasureEvents: ErasureEvent[];
  seniorLossEvents: SeniorLossEvent[];
}) {
  const {
    active,
    label,
    payload,
    dateIndex,
    observationPeriods,
    nonObservationPeriods,
    erasureEvents,
    seniorLossEvents,
  } = props;
  if (!active || !payload || payload.length === 0 || typeof label !== 'string') return null;

  const i = dateIndex.get(label);
  const inBand = (o: ObservationPeriod) => i !== undefined && i >= o.aIndex && i <= o.bIndex;
  const obs = observationPeriods.find(inBand) ?? null;
  const nonObs = obs ? null : (nonObservationPeriods.find(inBand) ?? null);
  // Tenbin :571-572 allows a one-step tolerance so the row still shows when the
  // pointer lands just beside the event.
  const near = (idx: number) => i !== undefined && Math.abs(idx - i) <= 1;
  const erasure = erasureEvents.find((e) => near(e.index)) ?? null;
  const seniorLoss = seniorLossEvents.find((e) => near(e.index)) ?? null;

  const row = (glyph: string, color: string, text: string) => (
    <div key={text} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color, flexShrink: 0 }}>{glyph}</span>
      <span>{text}</span>
    </div>
  );

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        color: C.text,
        fontSize: 12,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <div style={{ color: C.muted, fontWeight: 600, marginBottom: 2 }}>{monthLabel(label)}</div>
      {payload.map((p) =>
        typeof p.value === 'number'
          ? row('●', p.color ?? C.text, `${p.name}: $${p.value.toFixed(2)}`)
          : null,
      )}
      {obs &&
        row(
          '■',
          C.eyebrow,
          `Observation period: ${observationSplit(obs, false)} (${obs.startDate} -> ${obs.endDate})`,
        )}
      {nonObs &&
        row(
          '■',
          C.freeLine,
          `Non-observation period: ${nonObs.days}d (${nonObs.startDate} -> ${nonObs.endDate})`,
        )}
      {erasure &&
        row(
          '▼',
          C.danger,
          `Junior recovery erased (${erasureCause(erasure.reason)}): ${erasure.forfeitPctOfJuniorNav.toFixed(1)}% of Junior's NAV at the time`,
        )}
      {seniorLoss &&
        row(
          '●',
          C.danger,
          `Senior loss event: $${seniorLoss.lossIndexPts.toFixed(2)} per $100 of Senior`,
        )}
    </div>
  );
}

/** Port of tenbin-sims/index.html:830-835 — pure function of the buffer setting. */
function exitThresholdNote(v: number): string {
  const util = `${fmtTrim(utilizationPctFromBufferPct(v), 2)}% on-chain liquidation utilization`;
  if (v >= 90) {
    return `Earlier exit: Senior can leave while Junior still has about ${fmtTrim(v, 1)}% of required buffer remaining (${util}).`;
  }
  if (v <= 50) {
    return `Later exit: Senior waits until Junior buffer is much more depleted (${util}).`;
  }
  return `Middle setting: Senior can leave at about ${fmtTrim(v, 1)}% Junior buffer remaining (${util}).`;
}

// The series starts mid-2020 and ends mid-2025, so the first and last calendar rows
// are partial. Label them rather than letting them read as full years.
const yearLabel = (year: string, i: number, n: number): string => {
  if (i === 0 && n > 1) return `${year}½`;
  if (i === n - 1 && n > 1) return `${year} YTD`;
  return year;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Port of tenbin-sims/index.html:916-935: execCommand first (it works from a user
 * gesture without a permission prompt), navigator.clipboard as the fallback.
 */
/** The minimal read surface shared by URLSearchParams and Next's searchParams record. */
interface Query {
  get(key: string): string | null;
}

/** What a server page hands down from its own `searchParams`. */
export type InitialQuery = Record<string, string | string[] | undefined>;

/** Record → Query. Repeated keys (`?obs=1&obs=2`) read as the first one, as URLSearchParams does. */
const queryFromRecord = (record: InitialQuery): Query => ({
  get: (key) => {
    const raw = record[key];
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw ?? null;
  },
});

/**
 * Permalink → state. Every value is clamped to its control's own range, so a
 * hand-edited URL can never push the engine outside a configuration the UI can express.
 */
function stateFromQuery(q: Query): { params: HybondParams; maintain: boolean } {
  const preset = PRESETS.find((p) => p.id === q.get('preset'));
  let params: HybondParams = preset ? { ...preset.params } : { ...HYBOND_DEFAULT_PARAMS };

  const num = (key: string): number | null => {
    const raw = q.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const coverage = num('coverage');
  if (coverage !== null) params.minCoveragePct = clamp(Math.round(coverage), 8, 65);
  const obs = num('obs');
  if (obs !== null) {
    params.observationDays = clamp(Math.round(obs), OBSERVATION_DAYS_MIN, OBSERVATION_DAYS_MAX);
  }
  const yieldShare = num('yieldShare');
  if (yieldShare !== null) params.seniorShareToJuniorPct = clamp(Math.round(yieldShare), 20, 80);
  const exitBuffer = num('exitBuffer');
  if (exitBuffer !== null) params.exitBufferPct = clamp(exitBuffer, 1, 99.91);

  // A URL-supplied first-loss % only resizes Junior while the link is on; presets carry
  // a hand-set Junior and stay unlinked.
  if (params.linkJuniorToFirstLoss) {
    params = { ...params, depositJT: juniorFromFirstLossPct(params.depositST, params.minCoveragePct) };
  }

  return { params, maintain: q.get('maintain') !== '0' };
}

async function writeClipboardText(txt: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = txt;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  if (ok) return true;
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    return false;
  }
}

export default function HybondSimulator({ initialQuery }: { initialQuery: InitialQuery }) {
  // The permalink arrives as a prop the server page read off its own `searchParams`,
  // so it is applied in the FIRST render: state is seeded from it, never patched after
  // mount. Deliberately NOT useSearchParams — that hook suspends on the client, and with
  // a Suspense boundary here React would keep the server HTML and never attach fibers,
  // leaving a pixel-perfect but completely dead page.
  const initial = useMemo(() => stateFromQuery(queryFromRecord(initialQuery)), [initialQuery]);

  const [params, setParams] = useState<HybondParams>(initial.params);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maintainCoverage, setMaintainCoverage] = useState(initial.maintain);
  const [showHistory, setShowHistory] = useState(true);

  const config = useMemo(() => buildHybondConfig(params), [params]);

  const run = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config,
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: HYBOND_NAV_SERIES,
          maintainJuniorCoverage: maintainCoverage,
        }),
      ),
    [config, params.depositST, params.depositJT, maintainCoverage],
  );
  const result = run.result;

  // Counterfactual: the same path with FIXED Junior (no replenishment), used to
  // show — in the disclaimer — what Senior's exposure looks like without the
  // maintained-coverage assumption. This is also the baseline leg of the erased-
  // recoveries gap below.
  const exposedResult = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config,
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: HYBOND_NAV_SERIES,
          maintainJuniorCoverage: false,
        }),
      ).result,
    [config, params.depositST, params.depositJT],
  );
  const exposedSeniorEnd = exposedResult.steps.length
    ? exposedResult.steps[exposedResult.steps.length - 1].stIndex
    : 100;

  // Counterfactual: the same path with a term too long to ever expire, so Junior keeps
  // every coverage recovery. `gap` is what expiry permanently cost Junior, in $ per $100
  // of Junior.
  //
  // BOTH legs run with maintainJuniorCoverage:false regardless of the checkbox. With
  // replenishment on, the difference also picks up the recoveries a replenished Junior
  // would have earned, which conflates erasure with forgone replenishment (11.86 vs the
  // clean 9.13 at the defaults). The comparison must vary the term and nothing else.
  const noExpiryResult = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config: { ...config, fixedTermDurationSeconds: NO_EXPIRY_TERM_SECONDS },
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: HYBOND_NAV_SERIES,
          maintainJuniorCoverage: false,
        }),
      ).result,
    [config, params.depositST, params.depositJT],
  );

  const lastIndex = <T,>(arr: T[]): T | null => (arr.length ? arr[arr.length - 1] : null);

  // Junior's ending share price with and without expiry. Phase 2b charts the full
  // no-expiry path; 2a only needs the endpoint difference.
  const gap = useMemo(() => {
    const withRecoveries = lastIndex(noExpiryResult.steps)?.jtIndex;
    const asRun = lastIndex(exposedResult.steps)?.jtIndex;
    if (withRecoveries === undefined || asRun === undefined) return 0;
    return Math.max(0, withRecoveries - asRun);
  }, [noExpiryResult.steps, exposedResult.steps]);

  // Counterfactual: the same path with MAINTAINED Junior coverage (the
  // intended-product assumption), used when the checkbox is off to show what
  // the replenished case would have looked like for comparison.
  const maintainedResult = useMemo(
    () =>
      safeBacktest(() =>
        runBacktest({
          config,
          depositST: params.depositST,
          depositJT: params.depositJT,
          series: HYBOND_NAV_SERIES,
          maintainJuniorCoverage: true,
        }),
      ).result,
    [config, params.depositST, params.depositJT],
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
          p.params.minCoveragePct === params.minCoveragePct &&
          p.params.exitBufferPct === params.exitBufferPct,
      ),
    [params],
  );

  const jtPct =
    params.depositST + params.depositJT > 0
      ? (params.depositJT / (params.depositST + params.depositJT)) * 100
      : 0;

  // Every preset run through the real engine: the UI shows a computed pass/fail badge
  // rather than asserting the screen in prose the way Tenbin does (:272).
  const presetScreen = useMemo(() => screenPresets(), []);

  // The Senior hard guardrail. `seniorMaxDrawdown` is a float reduction over the whole
  // path, so it is tested against a dust threshold rather than exact zero.
  const seniorProtected =
    result.seniorMarkdownEvents === 0 && result.seniorMaxDrawdown < 0.0005;

  const strategyEnd = lastIndex(result.steps)?.priceIndex ?? 100;
  const genesisUtilPct = result.steps.length
    ? (Number(result.steps[0].coverageUtilWad) / 1e18) * 100
    : 0;
  const firstSeniorLoss = result.seniorLossEvents[0] ?? null;
  // Peak coverage utilization actually reached. The exit threshold is 100/bufferPct, so
  // this is what decides whether ANY buffer setting could open the protected exit.
  const maxCoverageUtil = useMemo(
    () =>
      result.steps.length
        ? Math.max(...result.steps.map((s) => Number(s.coverageUtilWad) / 1e18))
        : 0,
    [result.steps],
  );
  // Senior's share of the underlying's return. Engine-derived on both sides: there is
  // no imported yield target here.
  const seniorCapturePct =
    result.strategyAvgYr !== 0 ? (result.seniorAvgYr / result.strategyAvgYr) * 100 : NaN;

  const deployRangeOk =
    params.observationDays >= OBSERVATION_DAYS_MIN &&
    params.observationDays <= OBSERVATION_DAYS_MAX;

  const activeScenarioName = activePreset?.label ?? 'Custom';

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

  // Port of Tenbin's clippedBand (:514): a band straddling the window edge still renders,
  // trimmed to the visible edge rather than dropped.
  const clipBand = useCallback(
    (o: ObservationPeriod): { x1: string; x2: string } | null => {
      const a = Math.max(o.aIndex, view.a);
      const b = Math.min(o.bIndex, view.b);
      const x1 = result.steps[a]?.date;
      const x2 = result.steps[b]?.date;
      if (b <= a || !x1 || !x2) return null;
      return { x1, x2 };
    },
    [result.steps, view.a, view.b],
  );

  // Observation bands → ReferenceArea shading (presentational).
  //
  // Derived from result.observationPeriods, NOT from a run of `inObservation` steps:
  // `inObservation` is only true on the step that ENTERS the term (backtest.ts:414), and
  // a period's real span runs from that entry to the sample that closes it (bIndex, the
  // first step back out). Shading the `inObservation` steps alone produced x1 === x2, a
  // zero-width rect, which recharts drops entirely (Rectangle.js:117), so the bands had
  // been invisible. This is also the source the hover overlay reads, so the highlight now
  // covers exactly the band it highlights.
  const observationRuns = useMemo(
    () =>
      result.observationPeriods
        .map(clipBand)
        .filter((b): b is { x1: string; x2: string } => b !== null),
    [result.observationPeriods, clipBand],
  );

  const lossMarkers = useMemo(
    () => visibleSteps.filter((s) => s.juniorLossLocked),
    [visibleSteps],
  );

  // Tenbin's `junW` curve (legend :227): Junior's path if no observation period ever
  // expired, so every coverage recovery is kept.
  //
  // Only plotted when replenishment is OFF. With it on, the plotted Junior line carries
  // fresh Junior capital that this counterfactual does not, so the visual gap between the
  // two lines would conflate erasure with replenishment. The "Claims value erased" stat
  // and the deploy handoff still report `gap` in that case, with the caveat in the label.
  const showJuniorKept = !maintainCoverage;

  const chartData = useMemo(
    () =>
      visibleSteps.map((s, i) => ({
        date: s.date,
        strategy: s.priceIndex,
        senior: s.stIndex,
        junior: s.jtIndex,
        juniorKept: noExpiryResult.steps[view.a + i]?.jtIndex,
        marketState: s.marketState,
      })),
    [visibleSteps, noExpiryResult.steps, view.a],
  );

  // Chart annotations, all clipped to the same visible window as chartData.
  const visibleErasures = useMemo(
    () => result.erasureEvents.filter((e) => e.index >= view.a && e.index <= view.b),
    [result.erasureEvents, view.a, view.b],
  );
  const visibleSeniorLosses = useMemo(
    () => result.seniorLossEvents.filter((e) => e.index >= view.a && e.index <= view.b),
    [result.seniorLossEvents, view.a, view.b],
  );
  // Tenbin :533-535 rules a dashed vertical at each year boundary. The x-axis here is a
  // monthly category, so the January sample stands in for the boundary itself.
  const yearMarks = useMemo(
    () =>
      visibleSteps
        .filter((s) => s.date.slice(5, 7) === '01')
        .map((s) => ({ date: s.date, year: s.date.slice(0, 4) })),
    [visibleSteps],
  );

  // Port of Tenbin's visibleYmax (:509-513): the y domain has to cover the erasure tops,
  // which are annotations rather than data and so are invisible to recharts' auto domain.
  const yMax = useMemo(() => {
    let m = 0;
    for (const d of chartData) {
      const vals = showJuniorKept
        ? [d.strategy, d.senior, d.junior, d.juniorKept]
        : [d.strategy, d.senior, d.junior];
      for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) m = Math.max(m, v);
    }
    for (const e of visibleErasures) m = Math.max(m, e.top);
    return Math.max(Math.ceil((m * 1.04) / 10) * 10, 110);
  }, [chartData, visibleErasures, showJuniorKept]);

  // Hovered date drives the band overlays and the band chip. The tooltip does its own
  // lookup from the same date, so the two can never drift apart.
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const dateIndex = useMemo(() => {
    const m = new Map<string, number>();
    result.steps.forEach((s, i) => m.set(s.date, i));
    return m;
  }, [result.steps]);
  const hoverIndex = hoverDate === null ? undefined : dateIndex.get(hoverDate);
  const inHoveredBand = (o: ObservationPeriod) =>
    hoverIndex !== undefined && hoverIndex >= o.aIndex && hoverIndex <= o.bIndex;
  const hoverObs = result.observationPeriods.find(inHoveredBand) ?? null;
  const hoverNonObs = hoverObs ? null : (result.nonObservationPeriods.find(inHoveredBand) ?? null);

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

  const hoverObsBand = hoverObs ? clipBand(hoverObs) : null;
  const hoverNonObsBand = hoverNonObs ? clipBand(hoverNonObs) : null;
  // Exactly one chip is ever shown (Tenbin :557 / :562 are an if/else), so it resolves to
  // a single element rather than two mutually exclusive ones. See the JSX below.
  const hoverChip: { band: { x1: string; x2: string }; label: string; color: string } | null =
    hoverObsBand && hoverObs
      ? {
          band: hoverObsBand,
          label: `Observation period ${observationSplit(hoverObs, true)}`,
          color: C.eyebrow,
        }
      : hoverNonObsBand && hoverNonObs
        ? {
            band: hoverNonObsBand,
            label: `Non-observation period ${hoverNonObs.days}d`,
            color: C.freeLine,
          }
        : null;

  // The "Jr N" / "Sr N" tags read the steps at the view's right edge (Tenbin :555-556).
  const endStep = result.steps[view.b] ?? null;

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

  // Every param change flows through here. When Junior is linked to the first-loss %,
  // any patch touching either side of that relation re-derives Junior.
  const updateParam = (patch: Partial<HybondParams>) =>
    setParams((p) => {
      const next = { ...p, ...patch };
      const relinked =
        next.linkJuniorToFirstLoss &&
        (patch.minCoveragePct !== undefined || patch.depositST !== undefined);
      if (!relinked) return next;
      return { ...next, depositJT: juniorFromFirstLossPct(next.depositST, next.minCoveragePct) };
    });

  const permalink = (): string => {
    if (typeof window === 'undefined') return '';
    const q = new URLSearchParams({
      preset: activePreset?.id ?? 'custom',
      coverage: String(params.minCoveragePct),
      obs: String(params.observationDays),
      yieldShare: String(params.seniorShareToJuniorPct),
      exitBuffer: String(params.exitBufferPct),
      maintain: maintainCoverage ? '1' : '0',
    });
    return `${window.location.origin}${window.location.pathname}?${q.toString()}`;
  };

  const [copyLinkLabel, setCopyLinkLabel] = useState('Copy link');
  const copyLink = async () => {
    const ok = await writeClipboardText(permalink());
    setCopyLinkLabel(ok ? 'Copied link' : 'Copy failed');
    setTimeout(() => setCopyLinkLabel('Copy link'), ok ? 1200 : 1600);
  };

  // --- Deploy handoff (tenbin-sims/index.html:751-823) -----------------------
  // Emits the REAL bigints off the MarketConfig the backtest just ran, so the handoff
  // cannot drift from the simulated numbers the way a re-derivation could.
  const deployText = useMemo(() => {
    const thresholdUtilPct = utilizationPctFromBufferPct(params.exitBufferPct);
    const erasedByReason = (['expired', 'liquidation', 'juniorWiped', 'noTerm'] as ErasureReason[])
      .map((reason) => `${reason}: ${result.erasureEvents.filter((e) => e.reason === reason).length}`)
      .join(', ');
    const maxObs = result.maxObservedObservationDays;
    return [
      'Dawn market-design parameter handoff',
      'Generated by HYBond Sim',
      'Loaded market: srHYBond (BNY Mellon / Insight Global Short-Dated High Yield Bond composite proxy)',
      `Scenario: ${activeScenarioName}`,
      '',
      'Chosen market terms',
      `firstLossProtection: ${params.minCoveragePct}%`,
      `observationPeriod: ${params.observationDays} days`,
      `seniorYieldSharePaidToJunior: ${params.seniorShareToJuniorPct}%`,
      `seniorExitTrigger: ${fmtTrim(params.exitBufferPct, 2)}% Junior buffer remaining`,
      `initialFundingRead: ${jtPct.toFixed(1)}% Junior / ${(100 - jtPct).toFixed(1)}% Senior at 90% target utilization`,
      '',
      'MarketConfig fields resolved by this tool',
      `minCoverageWAD: ${config.minCoverageWAD.toString()}   // ${params.minCoveragePct}% first-loss protection`,
      `fixedTermDurationSeconds: ${config.fixedTermDurationSeconds.toString()}   // ${params.observationDays} days`,
      `coverageLiquidationUtilizationWAD: ${config.coverageLiquidationUtilizationWAD.toString()}   // opens Senior exit at ${fmtTrim(params.exitBufferPct, 1)}% Junior buffer remaining (${fmtTrim(thresholdUtilPct, 2)}% utilization)`,
      `jtCoinvested: ${config.jtCoinvested}   // Junior follows the same strategy path as Senior`,
      'ydmType: DeployScript.YDMType.StaticCurve',
      'ydmSpecificParams: abi.encode(DeployScript.StaticCurveYDMParams({',
      `  jtYieldShareAtZeroUtilWAD: ${config.jtYDM.yieldShareAtZeroUtilWAD.toString()},`,
      `  jtYieldShareAtTargetUtilWAD: ${config.jtYDM.yieldShareAtTargetWAD.toString()},`,
      `  jtYieldShareAtFullUtilWAD: ${config.jtYDM.yieldShareAtFullUtilWAD.toString()},`,
      `  targetUtilizationWAD: ${config.jtYDM.targetUtilizationWAD.toString()}`,
      '}))',
      '',
      'Suggested labels',
      'seniorTrancheName: Royco-ST HYBOND Senior',
      'seniorTrancheSymbol: ST-HYBOND',
      'juniorTrancheName: Royco-JT HYBOND Junior',
      'juniorTrancheSymbol: JT-HYBOND',
      '',
      'Still needed from deploy engineer',
      'marketName: SET_FINAL_MARKET_NAME',
      'chainId: SET_CHAIN_ID',
      'seniorAsset / juniorAsset: SET_BY_MARKET_ASSET',
      'stSelfLiquidationBonusWAD: SET_BY_DEPLOY_POLICY',
      'stDustTolerance / jtDustTolerance: SET_FROM_QUOTER_INTEGRATION',
      'kernelType / kernelSpecificParams: SET_BY_HYBOND_INTEGRATION',
      'oracle or quoter wiring: SET_BY_HYBOND_INTEGRATION',
      'transferAgentAddress and whitelist policy: SET_BY_COMPLIANCE_REQUIREMENTS',
      'fee policy fields: SET_BY_PROTOCOL_APPROVED_DEPLOY_POLICY',
      '',
      'Historical simulator read',
      `guardrailStatus: ${seniorProtected ? 'READY - no historical Senior loss events' : 'NEEDS_REVIEW - Senior hard guardrail fails'}`,
      `seniorAvgAnnualized: ${(result.seniorAvgYr * 100).toFixed(2)}%`,
      `juniorAvgAnnualized: ${(result.juniorAvgYr * 100).toFixed(2)}%`,
      `seniorWorstDrawdown: ${(-result.seniorMaxDrawdown * 100).toFixed(2)}%`,
      `juniorWorstDrawdown: ${(-result.juniorMaxDrawdown * 100).toFixed(2)}%`,
      `seniorLossEvents: ${result.seniorLossEvents.length}`,
      `exitTriggerHits: ${result.exitTriggerHits}`,
      `recoveryClaimsErasedEvents: ${result.erasureEvents.length}   // ${erasedByReason}`,
      `recoveryClaimsErasedValuePer100Junior: $${gap.toFixed(2)}`,
      `outsideObservation: ${result.outsideObservationPct.toFixed(1)}%`,
      `maxObservedObservationPeriod: ${maxObs} days   // historical samples can land after the exact ${params.observationDays}d deploy expiry`,
      '',
      'Notes',
      '- These are finalized market-design parameters, not a complete deploy transaction.',
      '- Deploy.s.sol builds RoycoAccountantInitParams and ydmInitializationData from MarketConfig; do not paste ydmInitializationData directly into MarketConfig.',
      '- The simulator uses a flat yield-share projection. Live market pricing can move with supply, demand, and the deployed YDM curve.',
      '- The underlying series is sampled MONTHLY, so an observation period is only ever observed closing at a month end. Historical samples can land well after the exact deploy expiry, and the observed maximum above overstates the configured term for that reason.',
      '- Concrete assets, oracle/quoter wiring, authority, fee policy, whitelist policy, and deployed contract addresses must come from the production integration.',
    ].join('\n');
  }, [config, params, result, gap, jtPct, seniorProtected, activeScenarioName]);

  const [copyDeployLabel, setCopyDeployLabel] = useState('Copy');
  const deployRef = useRef<HTMLTextAreaElement>(null);
  const copyDeploy = async () => {
    if (await writeClipboardText(deployText)) {
      setCopyDeployLabel('Copied');
      setTimeout(() => setCopyDeployLabel('Copy'), 1200);
    } else {
      deployRef.current?.focus();
      deployRef.current?.select();
      setCopyDeployLabel('Select text');
      setTimeout(() => setCopyDeployLabel('Copy'), 1600);
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
          {copyLinkLabel}
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
        style={{
          background: seniorProtected ? C.cardBg : 'rgba(255,249,246,.95)',
          border: `1px solid ${seniorProtected ? C.border : 'rgba(143,77,66,.45)'}`,
          borderRadius: 0,
        }}
        className="p-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* left: description */}
          <div>
            <Eyebrow>Overview</Eyebrow>
            <h2
              className="mt-2"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                fontSize: 24,
                color: seniorProtected ? C.text : C.danger,
              }}
            >
              {rangeTitle}
            </h2>
            {/* Descriptor, port of tenbin-sims/index.html:702-704. */}
            <p className="mt-3" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              {seniorProtected ? (
                <>
                  Current {activeScenarioName} terms pass the Senior hard guardrail: no historical
                  Senior loss events with {params.minCoveragePct}% first-loss protection,{' '}
                  {params.observationDays}d observation period, and {params.seniorShareToJuniorPct}%
                  of Senior yield paid to Junior.
                </>
              ) : (
                <>
                  Fails Senior hard guardrail: {result.seniorLossEvents.length} historical Senior
                  loss events
                  {firstSeniorLoss ? `, first on ${monthLabel(firstSeniorLoss.date)}` : ''}, with{' '}
                  {fmtPct(result.seniorMaxDrawdown, 1)} worst Senior drawdown.
                </>
              )}
            </p>

          </div>

          {/* right: two KPI cards. Both notes render ALWAYS. Tenbin CSS-hides the
              Senior note unless the guardrail fails (:46-47), which buries the pass
              case; at 0 loss events the note is the reassurance, not noise. */}
          <div className="grid grid-cols-2 gap-4">
            <Kpi
              label="Senior avg/yr"
              value={`${fmtSignedPct(result.seniorAvgYr, 1)}/yr`}
              valueColor={seniorProtected ? C.accent : C.danger}
              note={
                result.seniorLossEvents.length > 0
                  ? `Do not use: ${result.seniorLossEvents.length} Senior loss events.`
                  : 'No historical Senior loss events.'
              }
              noteColor={result.seniorLossEvents.length > 0 ? C.danger : C.kpiLabel}
            />
            <Kpi
              label="Junior avg/yr"
              value={`${fmtSignedPct(result.juniorAvgYr, 1)}/yr`}
              note={`${fmtUsd(juniorEnd)} ending value; erased recoveries ${fmtUsd(gap)}`}
            />
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
                  const screen = presetScreen.find((s) => s.id === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      // Presets carry linkJuniorToFirstLoss:false and a hand-set Junior,
                      // so selecting one must NOT re-derive it from the first-loss %.
                      onClick={() => setParams({ ...p.params })}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 0,
                        border: `1px solid ${active ? C.accent : C.border}`,
                        background: C.cardBg,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.label}</span>
                        {screen && <ScreenBadge pass={screen.pass} />}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        Junior {fmtUsd0(p.params.depositJT)}, {p.params.observationDays}-day
                        observation, {p.params.seniorShareToJuniorPct}% share
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }}>
                Presets set Junior by hand rather than deriving it from the first-loss
                slider, so selecting one leaves that link off. Each badge is the live
                screen result: every preset is re-run through the accountant and passes
                only if it produces no historical Senior loss events.
              </p>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              {/* Primary control, port of tenbin-sims/index.html:183-187. */}
              <SliderControl
                label="First-loss protection (%)"
                value={params.minCoveragePct}
                min={8}
                max={65}
                step={1}
                display={`${params.minCoveragePct}%`}
                desc={`Junior first-loss reserve. ${params.minCoveragePct}% means about $${params.minCoveragePct} of protection per $100 of market exposure before Senior can lose money.`}
                onChange={(v) => updateParam({ minCoveragePct: v })}
              >
                {params.linkJuniorToFirstLoss ? (
                  <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                    Junior deposit derived:{' '}
                    <b style={{ fontFamily: MONO, color: C.text, fontWeight: 600 }}>
                      {fmtUsd0(params.depositJT)}
                    </b>
                    . Genesis utilization {genesisUtilPct.toFixed(0)}%, the curve&apos;s target.
                  </p>
                ) : (
                  <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                    Junior is set by hand, so this only sets the coverage floor rebuilt when
                    deposits reopen.
                  </p>
                )}
              </SliderControl>

              <SliderControl
                label="Senior deposit ($)"
                value={params.depositST}
                min={100}
                max={10000}
                step={100}
                display={fmtUsd0(params.depositST)}
                desc="Market size. Protected capital that Junior shields from losses."
                onChange={(v) => updateParam({ depositST: v })}
              />

              <SliderControl
                label="Senior yield share to Junior (%)"
                value={params.seniorShareToJuniorPct}
                min={20}
                max={80}
                step={1}
                display={`${params.seniorShareToJuniorPct}%`}
                desc={`Projection assumption: Junior receives ${params.seniorShareToJuniorPct}% of Senior yield here. Projection assumption only. Live markets price this through supply/demand and the YDM curve.`}
                onChange={(v) => updateParam({ seniorShareToJuniorPct: v })}
              >
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                  This run models the curve as genuinely flat: the same share applies at every
                  utilization, so nothing here reprices it.
                </p>
              </SliderControl>

              <SliderControl
                label="Observation period (days)"
                value={params.observationDays}
                min={OBSERVATION_DAYS_MIN}
                max={OBSERVATION_DAYS_MAX}
                step={1}
                display={`${params.observationDays} days`}
                desc={`Junior has ${params.observationDays} days to recover before the recovery claim is erased. Longer helps Junior, but keeps Senior waiting longer.`}
                onChange={(v) => updateParam({ observationDays: v })}
              >
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                  Resolution limit: this series samples monthly, so a term under about 30 days
                  cannot resolve before the next month end. Settings of 1, 15, 29, and 30 days
                  produce byte-identical output here. The {OBSERVATION_DAYS_MAX}-day ceiling is the
                  accountant&apos;s uint24 limit on the term.
                </p>
              </SliderControl>

              {/* Port of tenbin-sims/index.html:198-202. */}
              <SliderControl
                label="Junior buffer remaining for Senior exit (%)"
                value={params.exitBufferPct}
                min={1}
                max={99.91}
                step={0.01}
                display={`${fmtTrim(params.exitBufferPct, 2)}% buffer`}
                desc={exitThresholdNote(params.exitBufferPct)}
                onChange={(v) => updateParam({ exitBufferPct: v })}
              >
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                  Derived read: {result.exitTriggerHits} exit trigger hits on this path. Coverage
                  utilization peaks at {maxCoverageUtil.toFixed(4)} here, and even the most
                  aggressive legal setting (99.91% buffer) only lowers the threshold to 1.0009, so
                  Junior&apos;s buffer never depletes far enough to open the protected exit at any
                  setting of this slider. It does not move the outcome on this series.
                </p>
              </SliderControl>
            </div>

            {/* Junior deposit: an advanced override, not a primary control. Linked, it is
                a function of the first-loss % and the design point holds at U = 0.90. */}
            <div style={{ border: `1px solid ${C.border}`, padding: '14px 16px', background: C.cardBg }}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <Eyebrow>Advanced override</Eyebrow>
                  <p className="mt-1.5" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                    {params.linkJuniorToFirstLoss
                      ? 'Junior deposit is derived from the first-loss protection above, which holds genesis utilization at the curve target. Unlink to set it directly.'
                      : 'Junior deposit is set directly. The first-loss slider no longer sizes it.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateParam({ linkJuniorToFirstLoss: !params.linkJuniorToFirstLoss })
                  }
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 0,
                    color: C.accent,
                    textTransform: 'uppercase',
                    fontSize: 10,
                    letterSpacing: 1,
                    padding: '7px 12px',
                    background: 'transparent',
                    flexShrink: 0,
                  }}
                >
                  {params.linkJuniorToFirstLoss ? 'Unlink Junior' : 'Relink to first-loss'}
                </button>
              </div>

              <div className="mt-4">
                <SliderControl
                  label="Junior deposit ($)"
                  value={params.depositJT}
                  min={50}
                  max={10000}
                  step={50}
                  disabled={params.linkJuniorToFirstLoss}
                  display={fmtUsd0(params.depositJT)}
                  desc="First-loss buffer that absorbs drawdowns for Senior."
                  onChange={(v) => updateParam({ depositJT: v })}
                >
                  {!params.linkJuniorToFirstLoss && (
                    <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                      Genesis utilization is{' '}
                      <b style={{ fontFamily: MONO, color: C.text, fontWeight: 600 }}>
                        {genesisUtilPct.toFixed(2)}%
                      </b>
                      {Math.abs(genesisUtilPct - 90) > 0.005
                        ? `, off the 90% design point the curve targets. Junior ≈ ${jtPct.toFixed(0)}% of the pool.`
                        : `, still on the 90% design point. Junior ≈ ${jtPct.toFixed(0)}% of the pool.`}
                    </p>
                  )}
                </SliderControl>
              </div>
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

            {/* Guardrail tiles, port of tenbin-sims/index.html:209, 473-477. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Guardrail
                label="Senior protection"
                ok={seniorProtected}
                body={
                  seniorProtected
                    ? `${fmtPct(result.seniorMaxDrawdown)} Senior drawdown and no Senior loss events.`
                    : `Senior protection fails: ${result.seniorLossEvents.length} Senior loss events and ${fmtPct(result.seniorMaxDrawdown)} worst drawdown.`
                }
              />
              {/* Tenbin's second tile checks a 6.8-7.4% band (:470), which is an
                  stMXN/stBRL calibration with no meaning for this fund. Replaced with
                  Senior's capture of the underlying, derived entirely from this run. */}
              <Guardrail
                label="Senior vs underlying"
                ok
                body={`Senior captures ${fmtSignedPct(result.seniorAvgYr, 1)}/yr of the underlying's ${fmtSignedPct(result.strategyAvgYr, 1)}/yr (${Number.isFinite(seniorCapturePct) ? seniorCapturePct.toFixed(0) : '—'}%); Junior takes ${fmtSignedPct(result.juniorAvgYr, 1)}/yr for the first-loss.`}
              />
              <Guardrail
                label="Junior tradeoff"
                ok
                body={`Junior gets ${fmtSignedPct(result.juniorAvgYr, 1)}/yr, worst drawdown ${fmtPct(result.juniorMaxDrawdown, 1)}, erased recoveries ${fmtUsd(gap)} per $100 of Junior.`}
              />
              <Guardrail
                label="Deploy range"
                ok={deployRangeOk}
                body={
                  deployRangeOk
                    ? `Observation period ${params.observationDays}d is inside the deploy-safe ${OBSERVATION_DAYS_MIN}-${OBSERVATION_DAYS_MAX}d range.`
                    : `Observation period ${params.observationDays}d is outside the deploy-safe ${OBSERVATION_DAYS_MIN}-${OBSERVATION_DAYS_MAX}d range.`
                }
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
              {showJuniorKept && (
                <LegendSwatch color={C.juniorKeptLine} dashed>
                  Junior if recoveries kept (fixed Junior, no replenishment)
                </LegendSwatch>
              )}
              <LegendSwatch color={C.strategyLine}>Underlying (composite proxy)</LegendSwatch>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>●</span> Junior loss locked
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

            {showJuniorKept && (
              <p className="mb-4" style={{ color: C.kpiLabel, fontSize: 11.5, lineHeight: 1.5 }}>
                The kept-recoveries line is a counterfactual, not a setting. It runs the same
                path with an observation term longer than the whole horizon, so no period
                ever expires. That is not deployable: on-chain the fixed term is a uint24 of
                seconds, capped at 194 days, and this config is never handed to deploy.
              </p>
            )}

            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainerNoSSR>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                  onMouseMove={(s: { activeLabel?: string | number }) =>
                    setHoverDate(typeof s?.activeLabel === 'string' ? s.activeLabel : null)
                  }
                  onMouseLeave={() => setHoverDate(null)}
                >
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
                  {/* Hovered observation band (Tenbin :526-527) */}
                  {hoverObsBand && (
                    <ReferenceArea
                      x1={hoverObsBand.x1}
                      x2={hoverObsBand.x2}
                      fill={C.eyebrow}
                      fillOpacity={0.22}
                      stroke={C.eyebrow}
                      strokeWidth={1.5}
                    />
                  )}
                  {/* Hovered non-observation band (Tenbin :528-529) */}
                  {hoverNonObsBand && (
                    <ReferenceArea
                      x1={hoverNonObsBand.x1}
                      x2={hoverNonObsBand.x2}
                      fill={C.freeLine}
                      fillOpacity={0.08}
                      stroke={C.freeLine}
                      strokeWidth={1.4}
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
                    domain={[0, yMax]}
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
                    content={
                      <ChartTooltip
                        dateIndex={dateIndex}
                        observationPeriods={result.observationPeriods}
                        nonObservationPeriods={result.nonObservationPeriods}
                        erasureEvents={result.erasureEvents}
                        seniorLossEvents={result.seniorLossEvents}
                      />
                    }
                  />
                  {/* $100 baseline (Tenbin :536) */}
                  <ReferenceLine
                    y={100}
                    stroke={C.kpiLabel}
                    strokeDasharray="2 3"
                    zIndex={150}
                  />
                  {/* Year boundaries (Tenbin :533-535) */}
                  {yearMarks.map((m) => (
                    <ReferenceLine
                      key={`year-${m.year}`}
                      x={m.date}
                      stroke={C.border}
                      strokeDasharray="4 5"
                      zIndex={150}
                      label={{
                        value: m.year,
                        position: 'insideBottom',
                        fill: C.kpiLabel,
                        fontSize: 11,
                      }}
                    />
                  ))}
                  {/* Line widths, dashes, and draw order follow Tenbin :538 exactly. */}
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    name="Base strategy"
                    stroke={C.strategyLine}
                    dot={false}
                    strokeWidth={1.3}
                  />
                  {showJuniorKept && (
                    <Line
                      type="monotone"
                      dataKey="juniorKept"
                      name="Junior if recoveries kept"
                      stroke={C.juniorKeptLine}
                      strokeDasharray="6 4"
                      dot={false}
                      strokeWidth={1.5}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="junior"
                    name="Junior"
                    stroke={C.juniorLine}
                    dot={false}
                    strokeWidth={2.2}
                  />
                  <Line
                    type="monotone"
                    dataKey="senior"
                    name="Senior"
                    stroke={C.seniorLine}
                    dot={false}
                    strokeWidth={2.2}
                  />
                  {/* Erasure I-beams (Tenbin :539-550) */}
                  {visibleErasures.map((e) => (
                    <ReferenceLine
                      key={`erasure-${e.index}`}
                      segment={[
                        { x: e.date, y: e.top },
                        { x: e.date, y: e.top - e.forfeitIndexPts },
                      ]}
                      zIndex={600}
                      shape={
                        <ErasureIBeam
                          beamLabel={
                            e.forfeitPctOfJuniorNav >= 4
                              ? `erased −${e.forfeitPctOfJuniorNav.toFixed(0)}%`
                              : null
                          }
                        />
                      }
                    />
                  ))}
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
                  {/* Senior loss events (Tenbin :552-554) */}
                  {visibleSeniorLosses.map((e) => (
                    <ReferenceDot
                      key={`senior-loss-${e.index}`}
                      x={e.date}
                      y={result.steps[e.index].stIndex}
                      r={4.2}
                      shape={<SeniorLossMark />}
                    />
                  ))}
                  {/* End-of-view value tags (Tenbin :555-556) */}
                  {endStep && (
                    <ReferenceDot
                      x={endStep.date}
                      y={endStep.jtIndex}
                      shape={
                        <EndValueTag
                          text={`Jr ${endStep.jtIndex.toFixed(0)}`}
                          color={C.juniorLine}
                        />
                      }
                    />
                  )}
                  {endStep && (
                    <ReferenceDot
                      x={endStep.date}
                      y={endStep.stIndex}
                      shape={
                        <EndValueTag
                          text={`Sr ${endStep.stIndex.toFixed(0)}`}
                          color={C.seniorLine}
                        />
                      }
                    />
                  )}
                  {/* Hovered band chip (Tenbin :557-565).
                      Tenbin's two chips (:557 obs, :562 non-obs) are one element here on
                      purpose. They are mutually exclusive, and as two sibling slots the
                      swap unmounts one and mounts the other into the same zIndex layer in
                      a single commit, which recharts 3.5 renders as nothing. Keeping one
                      element makes the swap a prop update, so the layer is never vacated. */}
                  {hoverChip && (
                    <ReferenceLine
                      segment={[
                        { x: hoverChip.band.x1, y: 100 },
                        { x: hoverChip.band.x2, y: 100 },
                      ]}
                      zIndex={700}
                      shape={<BandChip chipLabel={hoverChip.label} color={hoverChip.color} />}
                    />
                  )}
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

            {/* Calendar table, transposed to Tenbin's row layout (:250-254, :720-734):
                rows are series, columns are years. */}
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
                    <th className="py-2 pr-4 font-semibold">
                      Calendar-year return / observation stats
                    </th>
                    {result.calendar.map((row, i) => (
                      <th key={row.year} className="py-2 pr-4 font-semibold text-right">
                        {yearLabel(row.year, i, result.calendar.length)}
                      </th>
                    ))}
                    <th className="py-2 font-semibold text-right">end $100 → avg/yr</th>
                  </tr>
                </thead>
                <tbody>
                  <ReturnRow
                    label="Base strategy"
                    values={result.calendar.map((r) => r.strategyReturn)}
                    end={strategyEnd}
                    ann={result.strategyAvgYr}
                  />
                  <ReturnRow
                    label="Junior return"
                    values={result.calendar.map((r) => r.juniorReturn)}
                    end={juniorEnd}
                    ann={result.juniorAvgYr}
                  />
                  <ReturnRow
                    label="Senior return"
                    values={result.calendar.map((r) => r.seniorReturn)}
                    end={seniorEnd}
                    ann={result.seniorAvgYr}
                  />
                  <StatRow
                    label="Non-observation %"
                    cells={result.calendar.map((r) => {
                      const d = result.yearlyObservationDays[r.year];
                      return d && d.total ? `${((d.non / d.total) * 100).toFixed(1)}%` : '—';
                    })}
                    end={`${result.outsideObservationPct.toFixed(1)}%`}
                  />
                  <StatRow
                    label="Observation periods triggered"
                    cells={result.calendar.map((r) =>
                      String(result.yearlyObservationTriggers[r.year] ?? 0),
                    )}
                    end={String(result.observationEvents)}
                    endSuffix="total"
                  />
                </tbody>
              </table>
            </div>

            {/* Additional outcome metrics (:716-719) */}
            <div className="mt-8">
              <Eyebrow>Additional outcome metrics</Eyebrow>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                <SecondaryStat
                  label="Senior worst drop"
                  value={fmtSignedPct(-result.seniorMaxDrawdown)}
                  color={result.seniorMaxDrawdown > 0 ? C.danger : C.text}
                />
                <SecondaryStat
                  label="Junior worst drop"
                  value={fmtSignedPct(-result.juniorMaxDrawdown)}
                  color={result.juniorMaxDrawdown > 0 ? C.danger : C.text}
                />
                {/* Target and observed are split deliberately: at monthly cadence the
                    observed length is bounded by the sampling, not the term. */}
                <SecondaryStat
                  label="Max observed observation period"
                  value={`${result.maxObservedObservationDays}d`}
                  note={`${params.observationDays}d target`}
                />
                <SecondaryStat label="Claims erased" value={String(result.juniorLossEvents)} />
                <SecondaryStat
                  label="Claims value erased"
                  value={fmtUsd(gap)}
                  note="per $100 of Junior"
                />
                <SecondaryStat
                  label="Senior loss events"
                  value={String(result.seniorLossEvents.length)}
                  color={result.seniorLossEvents.length > 0 ? C.danger : C.text}
                />
                <SecondaryStat
                  label="Strategy avg/yr"
                  value={`${fmtSignedPct(result.strategyAvgYr, 1)}/yr`}
                />
                <SecondaryStat label="Observation periods" value={String(result.observationEvents)} />
              </div>
            </div>

            {/* Prose panels (:261-265, :268-272) */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div style={{ border: `1px solid ${C.border}`, padding: '14px 16px' }}>
                <p style={{ fontWeight: 600, color: C.text, fontSize: 13, marginBottom: 8 }}>
                  Protocol mechanics
                </p>
                <ProseRow color={C.seniorLine}>
                  Senior is the protected side: losses reach Senior only after the Junior
                  first-loss cushion is used first.
                </ProseRow>
                <ProseRow color={C.juniorLine}>
                  Junior receives extra yield for taking first losses and can give up recoveries
                  when the observation period expires before the strategy recovers.
                </ProseRow>
                {/* Tenbin's third bullet claims "Junior starts with a modest extra
                    cushion". False here: genesis utilization is exactly the curve's
                    target, so Junior starts with no cushion beyond what it is sized for. */}
                <ProseRow color={C.strategyLine}>
                  Loaded model inputs: Senior and Junior follow the same strategy path with no
                  leverage between them, and Junior starts sized exactly to its coverage
                  requirement, at {genesisUtilPct.toFixed(0)}% utilization, with no extra cushion
                  beyond it.
                </ProseRow>
              </div>
              <div style={{ border: `1px solid ${C.border}`, padding: '14px 16px' }}>
                <p style={{ fontWeight: 600, color: C.text, fontSize: 13, marginBottom: 8 }}>
                  Preset ladder
                </p>
                <ProseRow color={C.olive}>
                  <b>Conservative</b>, larger Junior cushion and more recovery time. Lower Junior
                  upside, fewer erased recovery claims.
                </ProseRow>
                <ProseRow color={C.seniorLine}>
                  <b>Balanced</b>, middle setting: Senior stays protected historically, while
                  Junior still gets meaningful upside.
                </ProseRow>
                <ProseRow color={C.juniorLine}>
                  <b>Aggressive</b>, smaller Junior cushion and shorter recovery time. Higher
                  Junior upside, more erased recovery claims.
                </ProseRow>
                <div className="mt-3 flex flex-col gap-1.5">
                  {presetScreen.map((s) => (
                    <div key={s.id} className="flex items-center gap-2" style={{ fontSize: 11, color: C.muted }}>
                      <ScreenBadge pass={s.pass} />
                      <span>
                        {s.label}: {s.seniorMarkdownEvents} Senior loss events,{' '}
                        {fmtPct(s.seniorMaxDrawdown)} worst Senior drawdown
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.6 }}>
                  Scenarios vary how much risk Junior takes. The badges above are computed live by
                  re-running each preset through the accountant on this series, not asserted.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ================= 5b. DEPLOY HANDOFF ================= */}
      <section
        style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0 }}
        className="p-6"
      >
        <details>
          <summary className="cursor-pointer">
            <Eyebrow>Deploy handoff</Eyebrow>
            <h2 className="mt-2" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.text }}>
              Copy final market-design parameters.
            </h2>
            <p className="mt-2" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              This is the finalized parameter handoff, not the full integration package.
            </p>
          </summary>

          <div className="mt-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
                <StatusPill ok={seniorProtected}>
                  {seniorProtected ? 'Ready' : 'Needs review'}
                </StatusPill>{' '}
                Includes chosen terms, MarketConfig fields, and integration placeholders.
              </p>
              <button
                type="button"
                onClick={copyDeploy}
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 0,
                  color: C.accent,
                  textTransform: 'uppercase',
                  fontSize: 10,
                  letterSpacing: 1,
                  padding: '7px 12px',
                  background: 'transparent',
                  flexShrink: 0,
                }}
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
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 0,
                background: C.pageBg,
                color: C.text,
                fontFamily: MONO,
                fontSize: 11.5,
                lineHeight: 1.6,
                padding: '12px 14px',
                height: 340,
                resize: 'vertical',
              }}
            />
          </div>
        </details>
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

function Kpi({
  label,
  value,
  note,
  valueColor = C.accent,
  noteColor = C.kpiLabel,
}: {
  label: string;
  value: string;
  note?: string;
  valueColor?: string;
  noteColor?: string;
}) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 0, padding: '12px 14px' }}>
      <p style={{ color: C.kpiLabel, textTransform: 'uppercase', fontSize: 10, letterSpacing: 1 }}>
        {label}
      </p>
      <p
        className="mt-2"
        style={{ color: valueColor, fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.04em', fontSize: 26 }}
      >
        {value}
      </p>
      {note && (
        <p className="mt-2" style={{ color: noteColor, fontSize: 11, lineHeight: 1.5 }}>
          {note}
        </p>
      )}
    </div>
  );
}

function SecondaryStat({
  label,
  value,
  note,
  color = C.text,
}: {
  label: string;
  value: string;
  note?: string;
  color?: string;
}) {
  return (
    <div>
      <p style={{ color: C.kpiLabel, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 1 }}>
        {label}
      </p>
      <p className="mt-1" style={{ color, fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.04em', fontSize: 15 }}>
        {value}
      </p>
      {note && (
        <p className="mt-0.5" style={{ color: C.kpiLabel, fontSize: 10.5, lineHeight: 1.4 }}>
          {note}
        </p>
      )}
    </div>
  );
}

/** A guardrail tile. `ok` drives the ok/warn styling Tenbin applies at :473-477. */
function Guardrail({ label, ok, body }: { label: string; ok: boolean; body: string }) {
  return (
    <div
      style={{
        border: `1px solid ${ok ? C.border : 'rgba(143,77,66,.45)'}`,
        borderLeft: `3px solid ${ok ? C.olive : C.danger}`,
        borderRadius: 0,
        padding: '12px 14px',
        background: ok ? C.cardBg : 'rgba(255,249,246,.95)',
      }}
    >
      <p style={{ color: ok ? C.olive : C.danger, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 1, fontWeight: 600 }}>
        {label}
      </p>
      <p className="mt-1.5" style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  );
}

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{
        border: `1px solid ${ok ? C.olive : C.danger}`,
        color: ok ? C.olive : C.danger,
        textTransform: 'uppercase',
        fontSize: 9.5,
        letterSpacing: 1,
        fontWeight: 600,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Live preset screening result. Computed, never asserted. */
function ScreenBadge({ pass }: { pass: boolean }) {
  return <StatusPill ok={pass}>{pass ? 'Pass' : 'Fail'}</StatusPill>;
}

function ProseRow({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 mt-2">
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: color,
          display: 'inline-block',
          flexShrink: 0,
          marginTop: 6,
        }}
      />
      <p style={{ color: C.text, fontSize: 12.5, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

/** One transposed calendar row of yearly returns, plus the end-value/annualized cell. */
function ReturnRow({
  label,
  values,
  end,
  ann,
}: {
  label: string;
  values: number[];
  end: number;
  ann: number;
}) {
  return (
    <tr style={{ borderTop: `1px solid ${C.border}` }}>
      <td className="py-2 pr-4" style={{ color: C.text, fontSize: 12.5 }}>
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className="py-2 pr-4 text-right"
          style={{ color: signColor(v), fontFamily: MONO }}
        >
          {fmtSignedPct(v, 1)}
        </td>
      ))}
      <td className="py-2 text-right" style={{ color: C.text, fontFamily: MONO }}>
        <b>{fmtUsd(end, 0)}</b>{' '}
        <span style={{ color: C.kpiLabel, fontSize: 11, whiteSpace: 'nowrap' }}>
          {fmtSignedPct(ann, 1)} ann.
        </span>
      </td>
    </tr>
  );
}

/** A transposed calendar row of non-return stats (already formatted). */
function StatRow({
  label,
  cells,
  end,
  endSuffix,
}: {
  label: string;
  cells: string[];
  end: string;
  endSuffix?: string;
}) {
  return (
    <tr style={{ borderTop: `1px solid ${C.border}` }}>
      <td className="py-2 pr-4" style={{ color: C.text, fontSize: 12.5 }}>
        {label}
      </td>
      {cells.map((c, i) => (
        <td key={i} className="py-2 pr-4 text-right" style={{ color: C.text, fontFamily: MONO }}>
          {c}
        </td>
      ))}
      <td className="py-2 text-right" style={{ color: C.text, fontFamily: MONO }}>
        <b>{end}</b>
        {endSuffix && (
          <span style={{ color: C.kpiLabel, fontSize: 11, whiteSpace: 'nowrap' }}> {endSuffix}</span>
        )}
      </td>
    </tr>
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
  disabled = false,
  children,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  desc: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const handle = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(n);
  };
  return (
    <div style={{ opacity: disabled ? 0.55 : 1 }}>
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
        disabled={disabled}
        onChange={(e) => handle(e.target.value)}
        className="w-full"
        style={{ accentColor: C.accent }}
      />
      <p className="mt-1.5" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
        {desc}
      </p>
      {children}
    </div>
  );
}
