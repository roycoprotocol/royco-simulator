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

const fmtTrim = (value: number, decimals = 2): string =>
  Number(value).toFixed(decimals).replace(/\.?0+$/, '');

const utilizationPctFromBufferPct = (value: number): number =>
  10000 / Math.max(value, 0.01);

function exitThresholdNote(value: number): string {
  const utilization = `${fmtTrim(utilizationPctFromBufferPct(value), 2)}% on-chain liquidation utilization`;
  if (value >= 90) {
    return `Earlier exit: Senior can leave while Junior still has about ${fmtTrim(value, 1)}% of required buffer remaining (${utilization}).`;
  }
  if (value <= 50) {
    return `Later exit: Senior waits until Junior buffer is much more depleted (${utilization}).`;
  }
  return `Middle setting: Senior can leave at about ${fmtTrim(value, 1)}% Junior buffer remaining (${utilization}).`;
}

const yearLabel = (
  year: string,
  index: number,
  count: number,
  firstDate: string,
  lastDate: string,
): string => {
  if (index === 0 && firstDate.slice(5, 7) !== '01') return `${year}½`;
  if (index === count - 1 && lastDate.slice(5, 7) !== '12') return `${year} YTD`;
  return year;
};

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

type DayErasureEvent = {
  index: number;
  date: string;
  forfeitIndexPts: number;
  forfeitPctOfJuniorNav: number;
  top: number;
  reason: string;
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
    const erasureEvents: DayErasureEvent[] = sim.events
      .filter((event) => event.kind === 'jt-il-erased')
      .map((event) => {
        const index = chart.findIndex((point) => point.t === event.t);
        if (index < 0) return null;
        const amountMatch = event.msg.match(/erased:\s*([\d,.]+)/i);
        const erasedAmount = Number((amountMatch?.[1] ?? '0').replace(/,/g, ''));
        const current = chart[index];
        const previous = chart[Math.max(0, index - 1)];
        const reference = current.juniorEffectiveNAV > 1e-12 ? current : previous;
        const navPerIndexPoint = reference.junior > 0
          ? reference.juniorEffectiveNAV / reference.junior
          : 0;
        const forfeitIndexPts = navPerIndexPoint > 0 ? erasedAmount / navPerIndexPoint : 0;
        const forfeitPctOfJuniorNav = reference.juniorEffectiveNAV > 0
          ? (erasedAmount / reference.juniorEffectiveNAV) * 100
          : 0;
        const exitEvent = sim.events.find(
          (candidate) => candidate.t === event.t && candidate.kind === 'exit-fixed-term',
        );
        const reason = /term expired/i.test(exitEvent?.msg ?? '')
          ? 'observation period ended'
          : /liquidation breach/i.test(exitEvent?.msg ?? '')
            ? 'protected Senior exit opened'
            : /ST impairment/i.test(exitEvent?.msg ?? '')
              ? 'Senior impairment'
              : 'recovery claim erased';
        return {
          index,
          date: current.date,
          forfeitIndexPts,
          forfeitPctOfJuniorNav,
          top: current.junior + forfeitIndexPts,
          reason,
        };
      })
      .filter((event): event is DayErasureEvent => event !== null);
    const seniorLossEventDetails: DaySeniorLossEvent[] = chart.flatMap((point, index) => {
      if (index === 0 || point.stIL <= chart[index - 1].stIL + 1e-9) return [];
      const lossIndexPts = Math.max(0, chart[index - 1].senior - point.senior);
      return lossIndexPts > 1e-9 ? [{ index, date: point.date, lossIndexPts }] : [];
    });
    const calendarYears = Array.from(new Set(chart.map((point) => point.date.slice(0, 4))));
    let previousStrategy = 100;
    let previousJunior = 100;
    let previousSenior = 100;
    let previousLiquidity = 100;
    const seriesStartDay = Date.parse(chart[0].date) / 86_400_000;
    const seriesEndDay = Date.parse(chart[chart.length - 1].date) / 86_400_000;
    const calendar = calendarYears.map((year) => {
      const yearPoints = chart.filter((point) => point.date.startsWith(year));
      const yearLast = yearPoints[yearPoints.length - 1];
      const strategyReturn = yearLast.strategy / previousStrategy - 1;
      const juniorReturn = yearLast.junior / previousJunior - 1;
      const seniorReturn = yearLast.senior / previousSenior - 1;
      const liquidityReturn = yearLast.liquidity / previousLiquidity - 1;
      previousStrategy = yearLast.strategy;
      previousJunior = yearLast.junior;
      previousSenior = yearLast.senior;
      previousLiquidity = yearLast.liquidity;
      const yearNumber = Number(year);
      const yearStart = Math.max(Date.parse(`${yearNumber}-01-01`) / 86_400_000, seriesStartDay);
      const yearEnd = Math.min(Date.parse(`${yearNumber + 1}-01-01`) / 86_400_000, seriesEndDay);
      const totalDays = Math.max(0, yearEnd - yearStart);
      const observationDayCount = observationPeriods.reduce((sum, period) => {
        const periodStart = Date.parse(period.startDate) / 86_400_000;
        const periodEnd = Date.parse(period.endDate) / 86_400_000;
        return sum + Math.max(0, Math.min(periodEnd, yearEnd) - Math.max(periodStart, yearStart));
      }, 0);
      return {
        year,
        strategyReturn,
        juniorReturn,
        seniorReturn,
        liquidityReturn,
        nonObservationPct: totalDays > 0
          ? ((totalDays - observationDayCount) / totalDays) * 100
          : 0,
        observationTriggers: observationPeriods.filter((period) => period.startDate.startsWith(year)).length,
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
    const desiredTickCount = Math.min(8, dates.length);
    if (desiredTickCount <= 1) return dates;
    const candidates = Array.from({ length: desiredTickCount }, (_, index) =>
      dates[Math.round((index * (dates.length - 1)) / (desiredTickCount - 1))],
    );
    const snapped = candidates.map((date) => {
      const day = Date.parse(date) / 86_400_000;
      let nearestYearMark: { date: string; distance: number } | null = null;
      for (const mark of yearMarks) {
        const distance = Math.abs(Date.parse(mark.date) / 86_400_000 - day);
        if (!nearestYearMark || distance < nearestYearMark.distance) {
          nearestYearMark = { date: mark.date, distance };
        }
      }
      return nearestYearMark && nearestYearMark.distance <= 21 ? nearestYearMark.date : date;
    });
    return Array.from(new Set(snapped));
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
  const initialExposure = result.initial.st + result.initial.jt + result.initial.lt;
  const genesisFirstLossPct = initialExposure > 0 ? (result.initial.jt / initialExposure) * 100 : 0;
  const genesisUtilPct = (result.chart[0]?.utilization ?? 0) * 100;
  const juniorPoolPct = initialExposure > 0 ? (result.initial.jt / initialExposure) * 100 : 0;
  const finiteCoverageUtilization = result.chart
    .map((point) => point.utilization)
    .filter(Number.isFinite);
  const maxCoverageUtilization = finiteCoverageUtilization.length
    ? Math.max(...finiteCoverageUtilization)
    : 0;
  const coverageUtilizationUnbounded = result.chart.some(
    (point) => !Number.isFinite(point.utilization),
  );
  const exitUtilizationThreshold = utilizationPctFromBufferPct(exitBufferPct) / 100;
  let exitTriggerHits = 0;
  let previouslyBreached = false;
  for (const point of result.chart) {
    const breached = point.utilization >= exitUtilizationThreshold;
    if (breached && !previouslyBreached) exitTriggerHits += 1;
    previouslyBreached = breached;
  }
  const curveShapeDescription = riskFullPct === riskSharePct
    ? `flat at ${fmtTrim(riskSharePct, 2)}%`
    : `${fmtTrim(riskSharePct, 2)}% at the 90% target and ${fmtTrim(riskFullPct, 2)}% at 100% utilization`;

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
    const copied = await writeClipboardText(text);
    if (copied) {
      setLabel(done);
      window.setTimeout(() => setLabel(reset), 1200);
    } else {
      deployRef.current?.select();
      setLabel('Select text');
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
              {LOCKED_COPY.customizeDescription}
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
                    const presetLpRatio = preset.minLiquidity / 0.9;
                    const presetJuniorRatio = preset.coverage / Math.max(0.9 - preset.coverage, 0.001);
                    const presetFirstLossPct =
                      (presetJuniorRatio / (1 + presetJuniorRatio + presetLpRatio)) * 100;
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
                          {fmtTrim(presetFirstLossPct, 2)}% actual first-loss ·{' '}
                          {(preset.coverage * 100).toFixed(0)}% minimum coverage · {preset.observationDays}d obs · {(preset.riskYDM.yTarget * 100).toFixed(0)}% to Junior · {(preset.minLiquidity * 100).toFixed(0)}% LP
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.4 }}>
                  Risk rises down the ladder: less first-loss capital, shorter recovery, and more Senior yield to Junior. Each rung is recomputed through the accountant; the compact warning above appears only when the selected terms produce a Senior loss. Day adds the explicit LP requirement at the end of each rung.
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
                description={`At genesis, Junior provides ${fmtTrim(genesisFirstLossPct, 2)}% of total market exposure as actual first-loss capital, computed from the run. This slider sets the ${coveragePct.toFixed(0)}% contractual minimum coverage ratio used to size and rebuild Junior; it is not the protection actually posted.`}
                onChange={setCoveragePct}
              >
                {linkJuniorToFirstLoss ? (
                  <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                    Junior deposit derived:{' '}
                    <b style={{ fontFamily: MONO, color: C.text, fontWeight: 600 }}>
                      {usd0(result.initial.jt)}
                    </b>
                    . Genesis utilization {genesisUtilPct.toFixed(0)}%, the curve&apos;s target.
                  </p>
                ) : (
                  <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                    Junior is set by hand, so this only sets the coverage floor rebuilt when deposits reopen.
                  </p>
                )}
              </SliderControl>
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
                description={`Projection assumption: Junior receives ${riskSharePct.toFixed(0)}% of Senior yield here. Projection assumption only. Live markets price this through supply/demand and the YDM curve.`}
                onChange={(value) => {
                  setRiskSharePct(value);
                  if (value + liqSharePct > 100) setLiqSharePct(100 - value);
                }}
              >
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                  This run models a StaticCurveYDM that is {curveShapeDescription}. The control sets the share at the 90% target; the full-utilization endpoint is carried by the market configuration.
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
                  This series is real daily NAV, so observation terms resolve at daily resolution: 7 to 194 days are all distinct terms. The 194-day ceiling is the accountant&apos;s uint24 limit on the term.
                </p>
              </SliderControl>
              <SliderControl
                label="Junior buffer remaining for Senior exit (%)"
                value={exitBufferPct}
                min={1}
                max={99.91}
                step={0.01}
                display={`${exitBufferPct.toFixed(2)}% buffer`}
                description={exitThresholdNote(exitBufferPct)}
                onChange={setExitBufferPct}
              >
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                  Derived read, for this configuration: coverage utilization{' '}
                  {coverageUtilizationUnbounded
                    ? `is unbounded on this path (it peaks at ${maxCoverageUtilization.toFixed(4)} while Junior is still solvent)`
                    : `peaks at ${maxCoverageUtilization.toFixed(4)}`}
                  , against the {exitUtilizationThreshold.toFixed(4)} threshold this {fmtTrim(exitBufferPct, 2)}% buffer sets.{' '}
                  {exitTriggerHits > 0
                    ? `The protected exit opens ${exitTriggerHits} time${exitTriggerHits === 1 ? '' : 's'} here, so this slider does move the outcome on this configuration.`
                    : 'The protected exit never opens on this configuration. Other settings of this slider, and other parameters, can open it.'}
                </p>
              </SliderControl>
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
                  {!linkJuniorToFirstLoss && (
                    <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.5 }}>
                      Genesis utilization is{' '}
                      <b style={{ fontFamily: MONO, color: C.text, fontWeight: 600 }}>
                        {genesisUtilPct.toFixed(2)}%
                      </b>
                      {Math.abs(genesisUtilPct - 90) > 0.005
                        ? `, off the 90% design point the curve targets. Junior ≈ ${juniorPoolPct.toFixed(0)}% of the pool.`
                        : `, still on the 90% design point. Junior ≈ ${juniorPoolPct.toFixed(0)}% of the pool.`}
                    </p>
                  )}
                </SliderControl>
              </div>
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
                    <th className="text-left" style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px' }}>
                      Calendar-year return / observation stats
                    </th>
                    {result.calendar.map((row, index) => (
                      <th key={row.year} className="text-right" style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px' }}>
                        {yearLabel(row.year, index, result.calendar.length, result.chart[0]?.date ?? '', result.chart[result.chart.length - 1]?.date ?? '')}
                      </th>
                    ))}
                    <th className="text-right" style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 7px' }}>
                      end $100 → avg/yr
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ReturnRow label="Base strategy" values={result.calendar.map((row) => row.strategyReturn)} end={endStep?.strategy ?? 100} annualized={result.strategyApy} />
                  <ReturnRow label="Junior return" values={result.calendar.map((row) => row.juniorReturn)} end={endStep?.junior ?? 100} annualized={result.juniorApy} />
                  <ReturnRow label="Senior return" values={result.calendar.map((row) => row.seniorReturn)} end={endStep?.senior ?? 100} annualized={result.seniorApy} />
                  <ReturnRow label="LP return" values={result.calendar.map((row) => row.liquidityReturn)} end={endStep?.liquidity ?? 100} annualized={result.liquidityApy} />
                  <StatRow label="Non-observation %" cells={result.calendar.map((row) => `${row.nonObservationPct.toFixed(1)}%`)} end={`${result.outsideObservationPct.toFixed(1)}%`} />
                  <StatRow label="Observation periods triggered" cells={result.calendar.map((row) => String(row.observationTriggers))} end={String(result.observationEvents)} endSuffix="total" />
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <Eyebrow>Additional outcome metrics</Eyebrow>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
                <SecondaryStat label="Senior worst drop" value={pct(-result.seniorMaxDrawdown)} color={result.seniorMaxDrawdown > 0 ? C.danger : C.text} />
                <SecondaryStat label="Junior worst drop" value={pct(-result.juniorMaxDrawdown)} color={result.juniorMaxDrawdown > 0 ? C.danger : C.text} />
                <SecondaryStat label="LP worst drop" value={pct(-result.liquidityMaxDrawdown)} color={result.liquidityMaxDrawdown > 0 ? C.danger : C.text} />
                <SecondaryStat label="Max observed observation period" value={`${result.maxObservedObservationDays}d`} note={`${observationDays}d target`} />
                <SecondaryStat label="Claims erased" value={String(result.erasedRecoveryClaims)} />
                <SecondaryStat label="Senior loss events" value={String(result.seniorLossEvents)} color={result.seniorLossEvents > 0 ? C.danger : C.text} />
                <SecondaryStat label="Observation periods" value={String(result.observationEvents)} />
                <SecondaryStat label="Junior capital injected" value={usd0(result.juniorCapitalInjected)} />
                <SecondaryStat label="Strategy avg/yr" value={`${pct(result.strategyApy)}/yr`} />
                <SecondaryStat label="Coverage utilization" value={`${(result.final.utilization * 100).toFixed(1)}%`} />
                <SecondaryStat label="LP utilization" value={`${(result.final.liquidityUtilization * 100).toFixed(1)}%`} />
                <SecondaryStat label="NAV conservation residual" value={result.final.conservationResidual.toExponential(2)} />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div style={{ border: `1px solid ${C.border}`, padding: '12px 14px' }}>
                <p style={{ color: C.text, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Protocol mechanics</p>
                <ProseRow color={C.seniorLine}>
                  Senior is the protected side: losses reach Senior only after the Junior first-loss cushion is used first.
                </ProseRow>
                <ProseRow color={C.juniorLine}>
                  Junior receives extra yield for taking first losses and can give up recoveries when the observation period expires before the strategy recovers.
                </ProseRow>
                <ProseRow color={C.strategyLine}>
                  Loaded model inputs: Senior and Junior follow the same strategy path with no leverage between them, and Junior starts sized exactly to its coverage requirement, at {genesisUtilPct.toFixed(0)}% utilization, with no extra cushion beyond it.
                </ProseRow>
                <ProseRow color={C.olive}>
                  Day adds the LP tranche: it backs secondary exits through the E-CLP pool and earns the LP premium, stable carry, and modeled swap fees without replacing any Dawn protection rule.
                </ProseRow>
              </div>
              <div style={{ border: `1px solid ${C.border}`, padding: '12px 14px' }}>
                <p style={{ color: C.text, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Preset ladder</p>
                {(activeMarket.presets ?? []).map((preset) => (
                  <ProseRow
                    key={preset.id}
                    color={preset.id === 'conservative' ? C.olive : preset.id === 'balanced' ? C.seniorLine : C.juniorLine}
                  >
                    <b>{preset.label}</b>, {(preset.coverage * 100).toFixed(0)}% minimum coverage, {preset.observationDays}-day recovery, {(preset.riskYDM.yTarget * 100).toFixed(0)}% of Senior yield to Junior, and {(preset.minLiquidity * 100).toFixed(0)}% minimum LP.
                  </ProseRow>
                ))}
                <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.4 }}>
                  The ladder is recomputed live on the selected daily NAV series; Day&apos;s LP terms are shown as additive parameters on every rung.
                </p>
              </div>
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
          Day uses the Dawn protection and observation rules with an additive LP tranche. Source:{' '}
          {activeMarket.provenance.sourceUrl}
        </p>
      </footer>
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
      <p style={{ color: C.kpiLabel, textTransform: 'uppercase', fontSize: 8.8, letterSpacing: '0.14em', fontWeight: 700 }}>
        {label}
      </p>
      <p className="mt-1" style={{ color, fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.04em', fontSize: 17 }}>
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
      <td className="text-left" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: C.text }}>
        {label}
      </td>
      {values.map((value, index) => (
        <td
          key={index}
          className="text-right"
          style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: signColor(value) }}
        >
          {pct(value)}
        </td>
      ))}
      <td className="text-right" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: C.text }}>
        <b>${end.toFixed(0)}</b>{' '}
        <span style={{ color: C.kpiLabel, fontSize: 11, whiteSpace: 'nowrap' }}>
          {pct(annualized)} ann.
        </span>
      </td>
    </tr>
  );
}

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
      <td className="text-left" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: C.text }}>
        {label}
      </td>
      {cells.map((cell, index) => (
        <td key={index} className="text-right" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: C.text }}>
          {cell}
        </td>
      ))}
      <td className="text-right" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: C.text }}>
        <b>{end}</b>
        {endSuffix && <span style={{ color: C.kpiLabel, fontSize: 11, whiteSpace: 'nowrap' }}> {endSuffix}</span>}
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
