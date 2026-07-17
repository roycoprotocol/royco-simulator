'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
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
import {
  buildDayErasureEvent,
  type DayErasureEvent,
} from '@/lib/day-simulator-template/erasure';
import { calibrateSeriesApy } from '@/lib/day-simulator-template/series';
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
  freeLine: '#4BCB81',
};

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = '"SFMono-Regular", Consolas, monospace';
const DAY = 86_400;
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const monthLabel = (key: string): string => {
  const [year, month] = key.split('-');
  const name = MONTH_NAMES[Number(month) - 1];
  return name && year ? `${name} ${year}` : key;
};

const dateLabel = (key: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : monthLabel(key);

async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  if (copied) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type DayObservationPeriod = {
  aIndex: number;
  bIndex: number;
  startDate: string;
  endDate: string;
  days: number;
  targetDays: number;
  expired: boolean;
};

type DaySeniorLossEvent = {
  index: number;
  date: string;
  lossIndexPts: number;
};

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
    maintainCoverage: true,
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

const estimateText = (text: string): number => text.length * 6;

function ErasureIBeam(props: {
  x1?: number;
  y1?: number;
  y2?: number;
  clipPath?: string;
  beamLabel?: string | null;
}) {
  const plot = usePlotArea();
  const { x1, y1, y2, clipPath, beamLabel } = props;
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(y2)) return null;
  const x = x1 as number;
  const yTop = y1 as number;
  const yBottom = y2 as number;
  let labelBox: { x: number; y: number; width: number; height: number } | null = null;
  if (beamLabel) {
    const width = estimateText(beamLabel) + 12;
    const height = 16;
    const left = plot
      ? Math.min(Math.max(x + 7, plot.x + 4), plot.x + plot.width - width - 4)
      : x + 7;
    const top = plot
      ? Math.min(
          Math.max((yTop + yBottom) / 2 - height / 2, plot.y + 4),
          plot.y + plot.height - height - 4,
        )
      : (yTop + yBottom) / 2 - height / 2;
    labelBox = { x: left, y: top, width, height };
  }
  return (
    <g clipPath={clipPath}>
      <line x1={x} y1={yTop} x2={x} y2={yBottom} stroke={C.danger} strokeWidth={2.4} />
      <line x1={x - 5} y1={yTop} x2={x + 5} y2={yTop} stroke={C.danger} strokeWidth={1.2} />
      <line x1={x - 5} y1={yBottom} x2={x + 5} y2={yBottom} stroke={C.danger} strokeWidth={1.2} />
      {labelBox && beamLabel && (
        <g>
          <rect
            x={labelBox.x}
            y={labelBox.y}
            width={labelBox.width}
            height={labelBox.height}
            fill={C.cardBg}
            fillOpacity={0.94}
            stroke={C.danger}
            strokeWidth={0.8}
          />
          <text
            x={labelBox.x + 6}
            y={labelBox.y + labelBox.height / 2 + 0.5}
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

function EndValueTag(props: { cx?: number; cy?: number; text?: string; color?: string }) {
  const plot = usePlotArea();
  const { cx, cy, text, color } = props;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !text) return null;
  const x = plot ? Math.min((cx as number) + 4, plot.x + plot.width - 28) : (cx as number) + 4;
  return (
    <text x={x} y={cy} fill={color} fontSize={11} fontWeight={600} dominantBaseline="middle">
      {text}
    </text>
  );
}

function BandChip(props: {
  x1?: number;
  x2?: number;
  chipLabel?: string;
  color?: string;
}) {
  const plot = usePlotArea();
  const { x1, x2, chipLabel, color } = props;
  if (!Number.isFinite(x1) || !Number.isFinite(x2) || !chipLabel || !plot) return null;
  const center = ((x1 as number) + (x2 as number)) / 2;
  const width = estimateText(chipLabel) + 16;
  const height = 20;
  const left = Math.min(Math.max(center - width / 2, plot.x + 4), plot.x + plot.width - width - 4);
  const top = plot.y + 6;
  return (
    <g>
      <rect x={left} y={top} width={width} height={height} fill={C.cardBg} fillOpacity={0.96} stroke={color} />
      <text
        x={left + width / 2}
        y={top + height / 2 + 0.5}
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

const observationSplit = (period: DayObservationPeriod, forChip: boolean): string => {
  if (period.expired && period.targetDays && period.days !== period.targetDays) {
    return forChip
      ? `${period.targetDays}d target / ${period.days}d observed`
      : `${period.targetDays}d target, next sample at ${period.days}d`;
  }
  return `${period.days}d`;
};

function ChartTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ name?: string | number; value?: unknown; color?: string }>;
  dateIndex: Map<string, number>;
  observationPeriods: DayObservationPeriod[];
  nonObservationPeriods: DayObservationPeriod[];
  erasureEvents: DayErasureEvent[];
  seniorLossEvents: DaySeniorLossEvent[];
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
  const index = dateIndex.get(label);
  const inBand = (period: DayObservationPeriod) =>
    index !== undefined && index >= period.aIndex && index <= period.bIndex;
  const observation = observationPeriods.find(inBand) ?? null;
  const nonObservation = observation ? null : (nonObservationPeriods.find(inBand) ?? null);
  const near = (eventIndex: number) => index !== undefined && Math.abs(eventIndex - index) <= 1;
  const erasure = erasureEvents.find((event) => near(event.index)) ?? null;
  const seniorLoss = seniorLossEvents.find((event) => near(event.index)) ?? null;
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
      <div style={{ color: C.muted, fontWeight: 600, marginBottom: 2 }}>{dateLabel(label)}</div>
      {payload.map((entry) =>
        typeof entry.value === 'number'
          ? row('●', entry.color ?? C.text, `${entry.name}: $${entry.value.toFixed(2)}`)
          : null,
      )}
      {observation &&
        row(
          '■',
          C.eyebrow,
          `Observation period: ${observationSplit(observation, false)} (${observation.startDate} -> ${observation.endDate})`,
        )}
      {nonObservation &&
        row(
          '■',
          C.freeLine,
          `Non-observation period: ${nonObservation.days}d (${nonObservation.startDate} -> ${nonObservation.endDate})`,
        )}
      {erasure &&
        row(
          '▼',
          C.danger,
          `Junior recovery erased (${erasure.reason}): ${erasure.forfeitPctOfJuniorNav.toFixed(1)}% of Junior's NAV at the time`,
        )}
      {seniorLoss &&
        row('●', C.danger, `Senior loss event: $${seniorLoss.lossIndexPts.toFixed(2)} per $100 of Senior`)}
    </div>
  );
}

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
          color: valueColor,
          fontFamily: MONO,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.05em',
        }}
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
const signColor = (value: number) => (value < 0 ? C.danger : C.text);

export default function DayMarketSimulator({ market }: { market?: DayMarket }) {
  const activeMarket = market ?? FALLBACK_MARKET;
  const defaults = activeMarket.defaults;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReview, setShowReview] = useState(true);
  const [showDeploy, setShowDeploy] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [sourceApyPct, setSourceApyPct] = useState(defaults.sourceApy * 100);
  const [coveragePct, setCoveragePct] = useState(defaults.coverage * 100);
  const [minLiquidityPct, setMinLiquidityPct] = useState(defaults.minLiquidity * 100);
  const [riskSharePct, setRiskSharePct] = useState(defaults.riskYDM.yTarget * 100);
  const [liqSharePct, setLiqSharePct] = useState(defaults.liqYDM.yTarget * 100);
  const [observationDays, setObservationDays] = useState(defaults.observationDays);
  const riskFullPct = defaults.riskYDM.y100 * 100;
  const exitBufferPct = defaults.exitBufferPct;
  const seniorDeposit = defaults.initialST;
  const manualJuniorDeposit = defaults.initialJT;
  const linkJuniorToFirstLoss = defaults.linkJuniorToFirstLoss;
  const [maintainCoverage, setMaintainCoverage] = useState(defaults.maintainCoverage);
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
  const modeledSeries = useMemo(
    () => calibrateSeriesApy(activeMarket.series, sourceApyPct / 100),
    [activeMarket.series, sourceApyPct],
  );
  const view = useMemo(
    () => modeledSeries.slice(viewRange.a, viewRange.b + 1),
    [modeledSeries, viewRange],
  );

  const { result, fullResult } = useMemo(() => {
    const run = (series: DaySeriesPoint[]) => {
    const coverage = coveragePct / 100;
    const minLiquidity = minLiquidityPct / 100;
    const ltRatio = minLiquidity / 0.9;
    const jtRatio = coverage / Math.max(0.9 - coverage, 0.001);
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
      stSelfLiquidationBonus: defaults.selfLiquidationBonus,
    });
    const sim = new Sim(cfg, initial);
    const snapshots = [sim.last()];
    const firstSnapshot = snapshots[0];
    const erasureEvents: DayErasureEvent[] = [];
    let juniorCapitalInjected = 0;
    for (let index = 1; index < series.length; index += 1) {
      const previous = series[index - 1];
      const current = series[index];
      const elapsedDays = Math.max(
        1,
        Math.round((Date.parse(current.date) - Date.parse(previous.date)) / 86_400_000),
      );
      const sourceReturn = current.price / previous.price - 1;
      const eventStart = sim.events.length;
      const previousSnapshot = snapshots[snapshots.length - 1];
      sim.step({ dtSec: elapsedDays * DAY, stReturn: sourceReturn, jtReturn: sourceReturn });
      const postReturn = sim.last();
      const stepEvents = sim.events.slice(eventStart);
      const erasureEvent = stepEvents.find((event) => event.kind === 'jt-il-erased');
      if (erasureEvent?.amountNAV !== undefined) {
        const exitEvent = stepEvents.find((event) => event.kind === 'exit-fixed-term');
        const reason = /term expired/i.test(exitEvent?.msg ?? '')
          ? 'observation period ended'
          : /liquidation breach/i.test(exitEvent?.msg ?? '')
            ? 'protected Senior exit opened'
            : /ST impairment/i.test(exitEvent?.msg ?? '')
              ? 'Senior impairment'
              : 'recovery claim erased';
        const currentJuniorIndex = firstSnapshot.jtPrice > 0
          ? (postReturn.jtPrice / firstSnapshot.jtPrice) * 100
          : 0;
        const preRefillJuniorNAV = postReturn.jtEffectiveNAV > 1e-12
          ? postReturn.jtEffectiveNAV
          : previousSnapshot.jtEffectiveNAV;
        const navPerIndexPoint = firstSnapshot.jtPrice > 0
          ? (sim.state.jtShares * firstSnapshot.jtPrice) / 100
          : 0;
        erasureEvents.push(
          buildDayErasureEvent({
            index,
            date: current.date,
            currentJuniorIndex,
            erasedAmount: erasureEvent.amountNAV,
            preRefillJuniorNAV,
            navPerIndexPoint,
            reason,
          }),
        );
      }
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
    const chart = series.map((point, index) => {
      const snapshot = snapshots[index];
      return {
        date: point.date,
        t: snapshot.t,
        senior: (snapshot.stPrice / firstSnapshot.stPrice) * 100,
        junior: (snapshot.jtPrice / firstSnapshot.jtPrice) * 100,
        liquidity: (snapshot.ltPrice / firstSnapshot.ltPrice) * 100,
        strategy: (point.price / series[0].price) * 100,
        state: snapshot.state,
        stIL: snapshot.stIL,
        jtIL: snapshot.jtIL,
        utilization: snapshot.utilization,
        liquidityUtilization: snapshot.liquidityUtilization,
        seniorEffectiveNAV: snapshot.stEffectiveNAV,
        juniorEffectiveNAV: snapshot.jtEffectiveNAV,
      };
    });
    const first = chart[0];
    const last = chart[chart.length - 1];
    const days = Math.max(
      1,
      (Date.parse(series[series.length - 1].date) - Date.parse(series[0].date)) / 86_400_000,
    );
    const makePeriod = (
      aIndex: number,
      bIndex: number,
      expired: boolean,
    ): DayObservationPeriod => ({
      aIndex,
      bIndex,
      startDate: chart[aIndex].date,
      endDate: chart[bIndex].date,
      days: Math.round((Date.parse(chart[bIndex].date) - Date.parse(chart[aIndex].date)) / 86_400_000),
      targetDays: observationDays,
      expired,
    });
    const observationPeriods: DayObservationPeriod[] = [];
    for (let index = 0; index < chart.length; index += 1) {
      if (chart[index].state !== MarketState.FIXED_TERM) continue;
      if (index > 0 && chart[index - 1].state === MarketState.FIXED_TERM) continue;
      let closeIndex = index + 1;
      while (closeIndex < chart.length && chart[closeIndex].state === MarketState.FIXED_TERM) {
        closeIndex += 1;
      }
      if (closeIndex >= chart.length) {
        observationPeriods.push(makePeriod(index, chart.length - 1, false));
      } else {
        const exitEvent = sim.events.find(
          (event) => event.t === chart[closeIndex].t && event.kind === 'exit-fixed-term',
        );
        observationPeriods.push(
          makePeriod(index, closeIndex, /term expired/i.test(exitEvent?.msg ?? '')),
        );
      }
    }
    const nonObservationPeriods: DayObservationPeriod[] = [];
    let nonObservationStart = 0;
    for (const period of observationPeriods) {
      if (period.aIndex > nonObservationStart) {
        nonObservationPeriods.push(makePeriod(nonObservationStart, period.aIndex, false));
      }
      nonObservationStart = period.bIndex;
    }
    if (chart.length - 1 > nonObservationStart) {
      nonObservationPeriods.push(makePeriod(nonObservationStart, chart.length - 1, false));
    }
    const observationBands = observationPeriods.map((period) => ({
      start: period.startDate,
      end: period.endDate,
    }));
    const observationEvents = observationPeriods.length;
    const maxObservedObservationDays = observationPeriods.reduce(
      (maximum, period) => Math.max(maximum, period.days),
      0,
    );
    const totalObservedDays = Math.max(
      0,
      (Date.parse(chart[chart.length - 1].date) - Date.parse(chart[0].date)) / 86_400_000,
    );
    const outsideObservationPct = totalObservedDays > 0
      ? ((totalObservedDays - observationPeriods.reduce((sum, period) => sum + period.days, 0)) /
          totalObservedDays) *
        100
      : 0;
    const maxDrawdown = (key: 'senior' | 'junior' | 'liquidity') => {
      let peak = chart[0][key];
      let worst = 0;
      for (const point of chart) {
        peak = Math.max(peak, point[key]);
        worst = Math.max(worst, peak > 0 ? 1 - point[key] / peak : 0);
      }
      return worst;
    };
    const seniorLossEventDetails: DaySeniorLossEvent[] = chart.flatMap((point, index) => {
      if (index === 0 || point.stIL <= chart[index - 1].stIL + 1e-9) return [];
      const lossIndexPts = Math.max(0, chart[index - 1].senior - point.senior);
      return lossIndexPts > 1e-9 ? [{ index, date: point.date, lossIndexPts }] : [];
    });
    const monthEnds = new Map<string, (typeof chart)[number]>();
    for (const point of chart) monthEnds.set(point.date.slice(0, 7), point);
    let previousStrategy = 100;
    let previousJunior = 100;
    let previousSenior = 100;
    let previousLiquidity = 100;
    const monthly = Array.from(monthEnds.entries()).map(([month, monthEnd]) => {
      const strategyReturn = monthEnd.strategy / previousStrategy - 1;
      const juniorReturn = monthEnd.junior / previousJunior - 1;
      const seniorReturn = monthEnd.senior / previousSenior - 1;
      const liquidityReturn = monthEnd.liquidity / previousLiquidity - 1;
      previousStrategy = monthEnd.strategy;
      previousJunior = monthEnd.junior;
      previousSenior = monthEnd.senior;
      previousLiquidity = monthEnd.liquidity;
      return {
        month,
        strategyReturn,
        juniorReturn,
        seniorReturn,
        liquidityReturn,
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
      observationPeriods,
      nonObservationPeriods,
      observationBands,
      observationEvents,
      outsideObservationPct,
      maxObservedObservationDays,
      erasureEvents,
      seniorLossEventDetails,
      erasedRecoveryClaims: erasureEvents.length,
      seniorLossEvents: seniorLossEventDetails.length,
      juniorCapitalInjected,
      seniorMaxDrawdown: maxDrawdown('senior'),
      juniorMaxDrawdown: maxDrawdown('junior'),
      liquidityMaxDrawdown: maxDrawdown('liquidity'),
      monthly,
    };
    };
    const result = run(view);
    const fullResult = isFullRange(viewRange, maxIndex) ? result : run(modeledSeries);
    return { result, fullResult };
  }, [
    coveragePct,
    defaults,
    exitBufferPct,
    linkJuniorToFirstLoss,
    liqSharePct,
    maintainCoverage,
    manualJuniorDeposit,
    modeledSeries,
    minLiquidityPct,
    observationDays,
    riskFullPct,
    riskSharePct,
    seniorDeposit,
    view,
    viewRange,
    maxIndex,
  ]);

  const allDates = useMemo(
    () => modeledSeries.map((point) => point.date),
    [modeledSeries],
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

  const bandDates = useCallback(
    (period: DayObservationPeriod): { x1: string; x2: string } | null => {
      const x1 = result.chart[period.aIndex]?.date;
      const x2 = result.chart[period.bIndex]?.date;
      if (period.bIndex <= period.aIndex || !x1 || !x2) return null;
      return { x1, x2 };
    },
    [result.chart],
  );
  const observationRuns = useMemo(
    () =>
      result.observationPeriods
        .map(bandDates)
        .filter((band): band is { x1: string; x2: string } => band !== null),
    [bandDates, result.observationPeriods],
  );
  const yearMarks = useMemo(() => {
    const marks: Array<{ date: string; year: string }> = [];
    let previousYear = '';
    for (const point of result.chart) {
      const year = point.date.slice(0, 4);
      if (year !== previousYear) {
        if (previousYear !== '') marks.push({ date: point.date, year });
        previousYear = year;
      }
    }
    return marks;
  }, [result.chart]);
  const xTicks = useMemo(() => {
    const dates = result.chart.map((point) => point.date);
    if (dates.length <= 1) return dates;
    const yearMarkIndices = yearMarks
      .map((mark) => dates.indexOf(mark.date))
      .filter((index) => index > 0 && index < dates.length - 1);
    const anchorIndices = Array.from(new Set([0, ...yearMarkIndices, dates.length - 1])).sort(
      (left, right) => left - right,
    );
    const desiredTickCount = Math.min(Math.max(7, anchorIndices.length), dates.length);

    const segmentIntervals = Array.from(
      { length: Math.max(anchorIndices.length - 1, 0) },
      () => 1,
    );
    let remainingIntervals = desiredTickCount - 1 - segmentIntervals.length;
    while (remainingIntervals > 0) {
      let widestSegment = 0;
      let widestIntervalDays = -1;
      for (let index = 0; index < segmentIntervals.length; index += 1) {
        const start = Date.parse(dates[anchorIndices[index]]);
        const end = Date.parse(dates[anchorIndices[index + 1]]);
        const intervalDays = (end - start) / 86_400_000 / segmentIntervals[index];
        if (intervalDays > widestIntervalDays) {
          widestSegment = index;
          widestIntervalDays = intervalDays;
        }
      }
      segmentIntervals[widestSegment] += 1;
      remainingIntervals -= 1;
    }

    const tickIndices = [anchorIndices[0]];
    for (let segment = 0; segment < segmentIntervals.length; segment += 1) {
      const start = anchorIndices[segment];
      const end = anchorIndices[segment + 1];
      for (let step = 1; step <= segmentIntervals[segment]; step += 1) {
        tickIndices.push(
          Math.round(start + ((end - start) * step) / segmentIntervals[segment]),
        );
      }
    }
    return Array.from(new Set(tickIndices)).map((index) => dates[index]);
  }, [result.chart, yearMarks]);
  const yMax = useMemo(() => {
    let maximum = 0;
    for (const point of result.chart) {
      maximum = Math.max(
        maximum,
        point.strategy,
        point.senior,
        point.junior,
        point.liquidity,
      );
    }
    for (const event of result.erasureEvents) maximum = Math.max(maximum, event.top);
    return Math.max(Math.ceil((maximum * 1.04) / 10) * 10, 110);
  }, [result.chart, result.erasureEvents]);
  const dateIndex = useMemo(() => {
    const index = new Map<string, number>();
    result.chart.forEach((point, pointIndex) => index.set(point.date, pointIndex));
    return index;
  }, [result.chart]);
  const hoverIndex = hoverDate === null ? undefined : dateIndex.get(hoverDate);
  const inHoveredBand = (period: DayObservationPeriod) =>
    hoverIndex !== undefined && hoverIndex >= period.aIndex && hoverIndex <= period.bIndex;
  const hoverObservation = result.observationPeriods.find(inHoveredBand) ?? null;
  const hoverNonObservation = hoverObservation
    ? null
    : (result.nonObservationPeriods.find(inHoveredBand) ?? null);
  const hoverObservationBand = hoverObservation ? bandDates(hoverObservation) : null;
  const hoverNonObservationBand = hoverNonObservation ? bandDates(hoverNonObservation) : null;
  const hoverChip: { band: { x1: string; x2: string }; label: string; color: string } | null =
    hoverObservationBand && hoverObservation
      ? {
          band: hoverObservationBand,
          label: `Observation period ${observationSplit(hoverObservation, true)}`,
          color: C.eyebrow,
        }
      : hoverNonObservationBand && hoverNonObservation
        ? {
            band: hoverNonObservationBand,
            label: `Non-observation period ${hoverNonObservation.days}d`,
            color: C.freeLine,
          }
        : null;
  const endStep = result.chart[result.chart.length - 1];
  const rangeTitle = result.chart.length
    ? `${monthLabel(result.chart[0].date)} to ${monthLabel(result.chart[result.chart.length - 1].date)} projection`
    : 'Projection';

  const activePreset = activeMarket.presets?.find(
    (preset) =>
      Math.abs(preset.sourceApy * 100 - sourceApyPct) < 1e-9 &&
      Math.abs(preset.coverage * 100 - coveragePct) < 1e-9 &&
      preset.observationDays === observationDays &&
      Math.abs(preset.juniorYieldShare * 100 - riskSharePct) < 1e-9 &&
      Math.abs(preset.minLiquidity * 100 - minLiquidityPct) < 1e-9 &&
      Math.abs(preset.lpYieldShare * 100 - liqSharePct) < 1e-9,
  );

  const applyPreset = (preset: NonNullable<DayMarket['presets']>[number]) => {
    setSourceApyPct(preset.sourceApy * 100);
    setCoveragePct(preset.coverage * 100);
    setObservationDays(preset.observationDays);
    setRiskSharePct(preset.juniorYieldShare * 100);
    setMinLiquidityPct(preset.minLiquidity * 100);
    setLiqSharePct(preset.lpYieldShare * 100);
  };

  const deployText = useMemo(
    () =>
      [
        `market: ${activeMarket.copy.title}`,
        `underlying: ${activeMarket.provenance.source}`,
        `baseStrategyApy: ${sourceApyPct.toFixed(2)}%`,
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
    [
      activeMarket,
      exitBufferPct,
      linkJuniorToFirstLoss,
      maintainCoverage,
      observationDays,
      result,
      sourceApyPct,
    ],
  );

  const copyText = async (
    text: string,
    setLabel: (label: string) => void,
    done: string,
    reset: string,
    selectOnFailure?: () => void,
  ) => {
    const copied = await writeClipboardText(text);
    if (copied) {
      setLabel(done);
      window.setTimeout(() => setLabel(reset), 1200);
    } else {
      selectOnFailure?.();
      setLabel(selectOnFailure ? 'Select text' : 'Copy failed');
      window.setTimeout(() => setLabel(reset), 1600);
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
          className="mt-3 max-w-3xl"
          style={{
            color: C.text,
            fontFamily: SERIF,
            fontSize: 'clamp(32px,3.4vw,44px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            margin: '12px 0 6px',
          }}
        >
          {activeMarket.copy.title}
        </h1>
        <p className="max-w-3xl" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, margin: '0 0 12px' }}>
          {activeMarket.copy.description}
        </p>
      </section>

      <section className="flex items-end justify-end flex-wrap gap-4">
        <button
          type="button"
          onClick={() => copyText(window.location.href, setCopyLabel, 'Copied link', 'Copy link')}
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
        <div
          className="grid grid-cols-1 min-[621px]:grid-cols-3 min-[981px]:grid-cols-[minmax(0,1fr)_repeat(3,minmax(185px,220px))]"
          style={{ gap: 10 }}
        >
          <div className="min-[621px]:col-span-3 min-[981px]:col-span-1">
            <Eyebrow>{LOCKED_COPY.overviewEyebrow}</Eyebrow>
            <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08 }}>
              {rangeTitle}
            </h2>
            <p className="mt-2" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38 }}>
              {LOCKED_COPY.overviewDescription}
            </p>
          </div>
          <Kpi label="Senior avg/yr" value={`${pct(result.seniorApy)}/yr`} valueColor={C.accent} />
          <Kpi label="Junior avg/yr" value={`${pct(result.juniorApy)}/yr`} valueColor={C.text} />
          <Kpi label="LP avg/yr" value={`${pct(result.liquidityApy)}/yr`} valueColor={C.olive} />
        </div>
      </section>

      <section style={cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>{LOCKED_COPY.customizeEyebrow}</Eyebrow>
            <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08 }}>
              {LOCKED_COPY.customizeTitle}
            </h2>
            <p className="mt-1" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38 }}>
              {DAY_LOCKED_COPY.customizeDescription}
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
                          {(preset.sourceApy * 100).toFixed(1)}% base APY ·{' '}
                          {(preset.coverage * 100).toFixed(0)}% coverage ·{' '}
                          {(preset.minLiquidity * 100).toFixed(0)}% liquidity ·{' '}
                          {(preset.juniorYieldShare * 100).toFixed(0)}% Junior ·{' '}
                          {(preset.lpYieldShare * 100).toFixed(0)}% LP · {preset.observationDays}d
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.4 }}>
                  Presets change only the displayed terms. Backend accountant parameters remain fixed for this market.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <SliderControl
                label="Base strategy APY (%)"
                value={sourceApyPct}
                min={0}
                max={30}
                step={0.1}
                display={`${sourceApyPct.toFixed(1)}%`}
                description="Annualized return of the base strategy. The daily NAV path keeps its historical drawdown shape while its full-window return is calibrated to this APY."
                onChange={setSourceApyPct}
              />
              <SliderControl
                label="Minimum coverage (%)"
                value={coveragePct}
                min={3}
                max={65}
                step={1}
                display={`${coveragePct.toFixed(0)}%`}
                description="Contractual minimum used by the backend to size and replenish Junior at the 90% utilization target."
                onChange={setCoveragePct}
              />
              <SliderControl
                label="Minimum liquidity (%)"
                value={minLiquidityPct}
                min={1}
                max={50}
                step={1}
                display={`${minLiquidityPct.toFixed(0)}%`}
                description="Minimum LP backing required for secondary-market liquidity."
                onChange={setMinLiquidityPct}
              />
              <SliderControl
                label="Junior yield share (%)"
                value={riskSharePct}
                min={0}
                max={80}
                step={1}
                display={`${riskSharePct.toFixed(0)}%`}
                description="Share of Senior yield paid to Junior at the 90% utilization target."
                onChange={(value) => {
                  setRiskSharePct(value);
                  if (value + liqSharePct > 100) setLiqSharePct(100 - value);
                }}
              />
              <SliderControl
                label="LP yield share (%)"
                value={liqSharePct}
                min={0}
                max={80}
                step={1}
                display={`${liqSharePct.toFixed(0)}%`}
                description="Share of Senior yield paid to LP at the 90% utilization target."
                onChange={(value) => {
                  setLiqSharePct(value);
                  if (value + riskSharePct > 100) setRiskSharePct(100 - value);
                }}
              />
              <SliderControl
                label="Observation period duration (days)"
                value={observationDays}
                min={7}
                max={194}
                step={1}
                display={`${observationDays} days`}
                description={`Junior has ${observationDays} days to recover before the recovery claim is erased. Longer helps Junior, but keeps Senior waiting longer.`}
                onChange={setObservationDays}
              />
            </div>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>{LOCKED_COPY.reviewEyebrow}</Eyebrow>
            <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08 }}>
              {LOCKED_COPY.reviewTitle}
            </h2>
            <p className="mt-1" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38 }}>
              {LOCKED_COPY.reviewDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowReview((value) => !value)}
            aria-label={showReview ? 'Collapse' : 'Expand'}
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
        </div>

        {showReview && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-3" style={{ fontSize: 11.5, color: C.muted }}>
              <LegendSwatch color={C.seniorLine}>Senior share price</LegendSwatch>
              <LegendSwatch color={C.juniorLine}>Junior share price</LegendSwatch>
              <LegendSwatch color={C.olive}>LP share price</LegendSwatch>
              <LegendSwatch color={C.strategyLine}>Base strategy</LegendSwatch>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>●</span> Junior loss locked
              </span>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>●</span> Senior loss event
              </span>
              <span className="flex items-center gap-2">
                <span style={{ width: 18, height: 10, background: C.obsFill, opacity: 0.32, display: 'inline-block' }} />
                observation period
              </span>
            </div>
            <div style={{ width: '100%', minWidth: 0, height: 360, minHeight: 360 }}>
              <ResponsiveContainerNoSSR>
                <LineChart
                  data={result.chart}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                  onMouseMove={(state: { activeLabel?: string | number }) =>
                    setHoverDate(typeof state?.activeLabel === 'string' ? state.activeLabel : null)
                  }
                  onMouseLeave={() => setHoverDate(null)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  {observationRuns.map((band, index) => (
                    <ReferenceArea
                      key={`obs-${index}`}
                      x1={band.x1}
                      x2={band.x2}
                      fill={C.obsFill}
                      fillOpacity={0.32}
                      stroke="none"
                    />
                  ))}
                  {hoverObservationBand && (
                    <ReferenceArea
                      x1={hoverObservationBand.x1}
                      x2={hoverObservationBand.x2}
                      fill={C.eyebrow}
                      fillOpacity={0.22}
                      stroke={C.eyebrow}
                      strokeWidth={1.5}
                    />
                  )}
                  {hoverNonObservationBand && (
                    <ReferenceArea
                      x1={hoverNonObservationBand.x1}
                      x2={hoverNonObservationBand.x2}
                      fill={C.freeLine}
                      fillOpacity={0.08}
                      stroke={C.freeLine}
                      strokeWidth={1.4}
                    />
                  )}
                  <XAxis
                    dataKey="date"
                    ticks={xTicks}
                    interval={0}
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
                        seniorLossEvents={result.seniorLossEventDetails}
                      />
                    }
                  />
                  <ReferenceLine y={100} stroke={C.kpiLabel} strokeDasharray="2 3" zIndex={150} />
                  {yearMarks.map((mark) => (
                    <ReferenceLine
                      key={`year-${mark.year}`}
                      x={mark.date}
                      stroke={C.border}
                      strokeDasharray="4 5"
                      zIndex={150}
                      label={{
                        value: mark.year,
                        position: 'insideBottom',
                        fill: C.kpiLabel,
                        fontSize: 11,
                      }}
                    />
                  ))}
                  <Line type="monotone" dataKey="strategy" name="Base strategy" stroke={C.strategyLine} dot={false} strokeWidth={1.3} />
                  <Line type="monotone" dataKey="junior" name="Junior" stroke={C.juniorLine} dot={false} strokeWidth={2.2} />
                  <Line type="monotone" dataKey="senior" name="Senior" stroke={C.seniorLine} dot={false} strokeWidth={2.2} />
                  <Line type="monotone" dataKey="liquidity" name="LP" stroke={C.olive} dot={false} strokeWidth={2.2} />
                  {result.erasureEvents.map((event) => (
                    <ReferenceLine
                      key={`erasure-${event.index}`}
                      segment={[
                        { x: event.date, y: event.top },
                        { x: event.date, y: event.top - event.forfeitIndexPts },
                      ]}
                      zIndex={600}
                      shape={
                        <ErasureIBeam
                          beamLabel={
                            event.forfeitPctOfJuniorNav >= 4
                              ? `erased −${event.forfeitPctOfJuniorNav.toFixed(0)}%`
                              : null
                          }
                        />
                      }
                    />
                  ))}
                  {result.seniorLossEventDetails.map((event) => (
                    <ReferenceDot
                      key={`senior-loss-${event.index}`}
                      x={event.date}
                      y={result.chart[event.index].senior}
                      r={4.2}
                      shape={<SeniorLossMark />}
                    />
                  ))}
                  {endStep && (
                    <ReferenceDot
                      x={endStep.date}
                      y={endStep.junior}
                      shape={<EndValueTag text={`Jr ${endStep.junior.toFixed(0)}`} color={C.juniorLine} />}
                    />
                  )}
                  {endStep && (
                    <ReferenceDot
                      x={endStep.date}
                      y={endStep.senior}
                      shape={<EndValueTag text={`Sr ${endStep.senior.toFixed(0)}`} color={C.seniorLine} />}
                    />
                  )}
                  {endStep && (
                    <ReferenceDot
                      x={endStep.date}
                      y={endStep.liquidity}
                      shape={<EndValueTag text={`LP ${endStep.liquidity.toFixed(0)}`} color={C.olive} />}
                    />
                  )}
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

            <DayTimeframeBrush
              dates={allDates}
              series={brushSeries}
              bands={brushBands}
              view={viewRange}
              isFull={isFullRange(viewRange, maxIndex)}
              onChange={setRange}
            />

            <div className="mt-4 overflow-x-auto">
              <table className="w-full" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: MONO, fontSize: 11.8 }}>
                <thead>
                  <tr
                    className="text-left"
                    style={{
                      color: C.kpiLabel,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600,
                      fontSize: 9.5,
                    }}
                  >
                    <th className="text-left" style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', whiteSpace: 'nowrap' }}>
                      Month-over-month return
                    </th>
                    {result.monthly.map((row) => (
                      <th key={row.month} className="text-right" style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', whiteSpace: 'nowrap' }}>
                        {monthLabel(row.month)}
                      </th>
                    ))}
                    <th className="text-right" style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px', whiteSpace: 'nowrap' }}>
                      end $100 → avg/yr
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ReturnRow label="Base strategy" values={result.monthly.map((row) => row.strategyReturn)} end={endStep?.strategy ?? 100} annualized={result.strategyApy} />
                  <ReturnRow label="Senior return" values={result.monthly.map((row) => row.seniorReturn)} end={endStep?.senior ?? 100} annualized={result.seniorApy} />
                  <ReturnRow label="Junior return" values={result.monthly.map((row) => row.juniorReturn)} end={endStep?.junior ?? 100} annualized={result.juniorApy} />
                  <ReturnRow label="LP return" values={result.monthly.map((row) => row.liquidityReturn)} end={endStep?.liquidity ?? 100} annualized={result.liquidityApy} />
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <details
          open={showDeploy}
          onToggle={(event) => setShowDeploy((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex items-start justify-between gap-4 cursor-pointer" style={{ listStyle: 'none' }}>
            <div>
              <Eyebrow>{LOCKED_COPY.deployEyebrow}</Eyebrow>
              <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08 }}>
                {LOCKED_COPY.deployTitle}
              </h2>
              <p className="mt-1" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38 }}>
                {LOCKED_COPY.deployDescription}
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
              <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.4 }}>
                Includes the active accountant terms, tranche sizing, curve anchors, and source.
              </p>
              <button
                type="button"
                onClick={() => copyText(deployText, setCopyDeployLabel, 'Copied', 'Copy', () => deployRef.current?.select())}
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
              style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 0, color: C.text, fontFamily: MONO, fontSize: 11.5, height: 285, lineHeight: 1.6, padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
        </details>
      </section>

      <section style={{ ...cardStyle, borderLeft: `3px solid ${C.accent}` }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <Eyebrow>Junior funding</Eyebrow>
          <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: C.muted, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={maintainCoverage}
              onChange={(event) => setMaintainCoverage(event.target.checked)}
              style={{ accentColor: C.accent }}
            />
            Refill Junior after losses
          </label>
        </div>
        <p className="mt-2" style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
          {maintainCoverage
            ? `Junior is refilled after each observation period to restore the ${coveragePct.toFixed(0)}% minimum coverage. This run adds ${usd0(result.juniorCapitalInjected)}.`
            : 'Junior is not refilled after losses. Everything else stays the same.'}
        </p>
        <p className="mt-3" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.45 }}>
          Illustrative parameters. Not an offer or investment advice.
        </p>
      </section>

      <footer
        style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.45 }}
        className="pb-8 border-t pt-4"
      >
        <p style={{ borderColor: C.border }}>
          <strong style={{ fontWeight: 600 }}>What this is, and what it is not.</strong>{' '}
          The underlying is {activeMarket.provenance.source}, covering {startDate} through {endDate}.
        </p>
        <p className="mt-1">{activeMarket.copy.disclosure}</p>
        <p className="mt-1">
          Source:{' '}
          {activeMarket.provenance.sourceUrl}
        </p>
      </footer>
    </div>
  );
}

function ReturnRow({
  label,
  values,
  end,
  annualized,
}: {
  label: string;
  values: number[];
  end: number;
  annualized: number;
}) {
  return (
    <tr style={{ borderTop: `1px solid ${C.border}` }}>
      <td className="text-left" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: C.text, whiteSpace: 'nowrap' }}>
        {label}
      </td>
      {values.map((value, index) => (
        <td
          key={index}
          className="text-right"
          style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: signColor(value), whiteSpace: 'nowrap' }}
        >
          {pct(value)}
        </td>
      ))}
      <td className="text-right" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: C.text, whiteSpace: 'nowrap' }}>
        <b>${end.toFixed(0)}</b>{' '}
        <span style={{ color: C.kpiLabel, fontSize: 11 }}>
          {pct(annualized)} ann.
        </span>
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
