'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { Sim } from '@/lib/day/engine/runner';
import { MarketState } from '@/lib/day/engine/types';
import { DAY_LOCKED_COPY } from '@/lib/day-simulator-template/locked-copy';
import {
  buildDayExplainerMetrics,
  type DayExplainerMetrics,
} from '@/lib/day-simulator-template/explainer';
import { DAY_EXPLORER_TEMPLATE_MARKET } from '@/lib/day-simulator-template/explorer-market';
import { isFullRange, normalizeRange, type IndexRange } from '@/lib/hybond/timeframe';
import type {
  DayForwardScenarioId,
  DayMarket,
  DaySeriesPoint,
} from '@/lib/day-simulator-template/market';
import { isDaySectionVisible } from '@/lib/day-simulator-template/market';
import {
  buildDayErasureEvent,
  formatDayErasureLabel,
  type DayErasureEvent,
} from '@/lib/day-simulator-template/erasure';
import { calibrateSeriesApy, hasObservedDrawdown } from '@/lib/day-simulator-template/series';
import { shouldRefillJunior } from '@/lib/day-simulator-template/refill';
import {
  buildDayFiniteForwardSeries,
  buildDayInitialBalances,
  buildDayMarketConfig,
  buildDayForwardSeries,
} from '@/lib/day-simulator-template/runtime';
import {
  DayChartTooltip,
  useDayChartHover,
} from '@/components/day-simulator/DayChartTooltip';
import DayLearningExperience from '@/components/day-simulator/DayLearningExperience';
import { DayTimeframeBrush } from '@/components/day-simulator/DayTimeframeBrush';

const ResponsiveContainerNoSSR = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);

// Royco Explorer visual contract. Tranche colors remain semantic.
const C = {
  pageBg: '#F4F3EF',
  cardBg: '#FFFFFF',
  border: '#DEDDD7',
  text: '#1D1C19',
  muted: '#68665F',
  eyebrow: '#817A70',
  kpiLabel: '#969188',
  accent: '#A65B20',
  olive: '#3F7D5A',
  danger: '#A24737',
  faint: '#B7B3AB',
  seniorLine: '#8B6B4B',
  juniorLine: '#25231F',
  strategyLine: '#9A968F',
  obsFill: '#F4C77B',
  freeLine: '#51A473',
};

const SERIF = "var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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

const formatEclpBandPercent = (bandPct: number): string =>
  bandPct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const formatEclpFloor = (bandPct: number): string => {
  const floor = 1 - bandPct / 100;
  return bandPct < 1
    ? floor.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
    : floor.toFixed(2);
};

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

const cardStyle = {
  background: C.cardBg,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 14,
  boxShadow: '0 1px 2px rgba(29,28,25,.035)',
} as const;

const estimateText = (text: string): number => text.length * 6;

type SvgPoint = { x: number; y: number };
type SvgRect = { left: number; right: number; top: number; bottom: number };
type LiquidityChartMode = 'atomic' | 'arbitrage';
type LiquidityHoverPoint = {
  share: number;
  batchShare: number;
  cycle: number;
  executionPrice: number;
  slippage: number;
};

const isReferenceAtPoolBoundary = (
  metrics: DayExplainerMetrics['liquidity'],
): boolean =>
  Math.abs(metrics.referenceSellNAV - metrics.boundarySellNAV)
    <= Math.max(1e-6, metrics.boundarySellNAV * 1e-8);

const niceChartMaximum = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 2 ? 0.5 : normalized <= 5 ? 1 : 2;
  return Math.ceil(normalized / step) * step * magnitude;
};

const formatBasisPoints = (value: number): string =>
  `${value < 10 ? value.toFixed(1) : value.toFixed(0)} bps`;

const segmentIntersectsRect = (start: SvgPoint, end: SvgPoint, rect: SvgRect) => {
  if (start.x === end.x) {
    return start.x >= rect.left
      && start.x <= rect.right
      && Math.max(start.y, end.y) >= rect.top
      && Math.min(start.y, end.y) <= rect.bottom;
  }
  const segmentLeft = Math.max(Math.min(start.x, end.x), rect.left);
  const segmentRight = Math.min(Math.max(start.x, end.x), rect.right);
  if (segmentLeft > segmentRight) return false;
  const yAt = (pointX: number) =>
    start.y + ((pointX - start.x) / (end.x - start.x)) * (end.y - start.y);
  const segmentTop = Math.min(yAt(segmentLeft), yAt(segmentRight));
  const segmentBottom = Math.max(yAt(segmentLeft), yAt(segmentRight));
  return segmentBottom >= rect.top && segmentTop <= rect.bottom;
};

const nearestPointIndex = <T,>(
  points: T[],
  target: number,
  valueOf: (point: T) => number,
): number => {
  if (!points.length) return -1;
  let nearest = 0;
  let distance = Math.abs(valueOf(points[0]) - target);
  for (let index = 1; index < points.length; index += 1) {
    const candidateDistance = Math.abs(valueOf(points[index]) - target);
    if (candidateDistance < distance) {
      nearest = index;
      distance = candidateDistance;
    }
  }
  return nearest;
};

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

function distributeEndTagYs(targetYs: number[], minY: number, maxY: number, gap: number): number[] {
  if (!targetYs.length) return [];

  const order = targetYs.map((target, index) => ({ target, index })).sort((a, b) => a.target - b.target);
  const placed = new Array<number>(targetYs.length);

  let previous = minY - gap;
  for (const item of order) {
    const y = Math.max(item.target, previous + gap);
    placed[item.index] = y;
    previous = y;
  }

  const overflow = placed[order[order.length - 1].index] - maxY;
  if (overflow > 0) {
    for (let index = 0; index < placed.length; index += 1) placed[index] -= overflow;
  }

  const underflow = minY - placed[order[0].index];
  if (underflow > 0) {
    for (let index = 0; index < placed.length; index += 1) placed[index] += underflow;
  }

  return placed;
}

function EndValueTag(props: {
  cx?: number;
  cy?: number;
  text?: string;
  color?: string;
  tagIndex?: number;
  peerValues?: number[];
  yMin?: number;
  yMax?: number;
}) {
  const plot = usePlotArea();
  const { cx, cy, text, color, tagIndex = 0, peerValues = [], yMin = 0, yMax = 1 } = props;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !text) return null;

  const targetYs = plot && peerValues.length > 0
    ? peerValues.map((peerValue) => {
        const boundedValue = Math.max(yMin, Math.min(yMax, peerValue));
        return plot.y + plot.height * (1 - (boundedValue - yMin) / (yMax - yMin));
      })
    : [];
  const tagYs = plot
    ? distributeEndTagYs(targetYs, plot.y + 8, plot.y + plot.height - 8, 16)
    : [];
  const y = tagYs[tagIndex] ?? (cy as number);
  // Keep labels in a reserved gutter to the right of the terminal point. The
  // line ends at the point, so its stroke cannot run through the text.
  const x = plot ? plot.x + plot.width + 7 : (cx as number) + 7;
  return (
    <text x={x} y={y} fill={color} fontSize={11} fontWeight={600} dominantBaseline="middle">
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
          `Observation Period: ${observationSplit(observation, false)} (${observation.startDate} -> ${observation.endDate})`,
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
          `JT recovery claim reset (${erasure.reason}): ${erasure.forfeitPctOfJuniorNav.toFixed(1)}% of JT NAV at the time`,
        )}
      {seniorLoss &&
        row('●', C.danger, `ST loss event: $${seniorLoss.lossIndexPts.toFixed(2)} per $100 of ST`)}
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
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', minHeight: 76 }}>
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

function ExecutiveMetric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, minHeight: 88, padding: '14px 16px' }}>
      <p style={{ color: C.kpiLabel, fontSize: 8.8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p className="mt-2" style={{ color: valueColor, fontFamily: MONO, fontSize: 28, fontWeight: 600, letterSpacing: '-0.05em' }}>
        {value}
      </p>
    </div>
  );
}

function FlowBox({
  eyebrow,
  value,
  note,
  color = C.text,
}: {
  eyebrow: string;
  value: string;
  note: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        minHeight: 92,
        padding: '12px 14px',
      }}
    >
      <p style={{ color: C.kpiLabel, fontSize: 8.8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {eyebrow}
      </p>
      <p className="mt-2" style={{ color, fontFamily: MONO, fontSize: 22, fontWeight: 600, letterSpacing: '-0.04em' }}>
        {value}
      </p>
      <p className="mt-1" style={{ color: C.muted, fontSize: 10.8, lineHeight: 1.35 }}>
        {note}
      </p>
    </div>
  );
}

function LiquidityExecutionDiagram({
  metrics,
}: {
  metrics: DayExplainerMetrics['liquidity'];
}) {
  const [mode, setMode] = useState<LiquidityChartMode>('arbitrage');
  const width = 520;
  const height = 360;
  const margin = { left: 66, right: 22, top: 48, bottom: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baseline = margin.top + plotHeight;
  const atomicCapacity = Math.max(metrics.boundarySellShareOfSenior, 1e-9);
  const cycleCount = Math.max(1, Math.ceil((1 - 1e-9) / atomicCapacity));
  const atomicCurve = [
    { sellNAV: 0, executionPrice: 1, slippage: 0 },
    ...metrics.curve,
  ].filter(
    (point, index, points) =>
      index === 0 || Math.abs(point.sellNAV - points[index - 1].sellNAV) > 1e-9,
  );
  const quoteAtBatchShare = (batchShare: number) => {
    const clampedShare = Math.max(0, Math.min(atomicCapacity, batchShare));
    const targetNAV = atomicCapacity > 0
      ? (clampedShare / atomicCapacity) * metrics.boundarySellNAV
      : 0;
    const upperIndex = atomicCurve.findIndex((point) => point.sellNAV >= targetNAV - 1e-9);
    const upper = atomicCurve[upperIndex < 0 ? atomicCurve.length - 1 : upperIndex];
    const lower = atomicCurve[Math.max(0, (upperIndex < 0 ? atomicCurve.length - 1 : upperIndex) - 1)];
    const span = upper.sellNAV - lower.sellNAV;
    const weight = span > 1e-9 ? (targetNAV - lower.sellNAV) / span : 0;
    return {
      executionPrice: lower.executionPrice
        + (upper.executionPrice - lower.executionPrice) * weight,
      slippage: lower.slippage + (upper.slippage - lower.slippage) * weight,
    };
  };
  const atomicPoints: LiquidityHoverPoint[] = atomicCurve.map((point) => {
    const share = metrics.boundarySellNAV > 0
      ? (point.sellNAV / metrics.boundarySellNAV) * atomicCapacity
      : 0;
    return {
      share,
      batchShare: share,
      cycle: 1,
      executionPrice: point.executionPrice,
      slippage: point.slippage,
    };
  });
  const arbitrageCycles = Array.from({ length: cycleCount }, (_, index) => {
    const startShare = index * atomicCapacity;
    const endShare = Math.min(1, startShare + atomicCapacity);
    const cycleSize = endShare - startShare;
    const points = atomicPoints
      .filter((point) => point.batchShare <= cycleSize + 1e-9)
      .map((point) => ({
        ...point,
        share: startShare + point.batchShare,
        cycle: index + 1,
      }));
    const lastPoint = points[points.length - 1];
    if (!lastPoint || Math.abs(lastPoint.share - endShare) > 1e-9) {
      const quote = quoteAtBatchShare(cycleSize);
      points.push({
        share: endShare,
        batchShare: cycleSize,
        cycle: index + 1,
        executionPrice: quote.executionPrice,
        slippage: quote.slippage,
      });
    }
    return { index, startShare, endShare, points };
  });
  const xMaximum = mode === 'atomic' ? atomicCapacity : 1;
  const xFromShare = (share: number) =>
    margin.left + (Math.max(0, Math.min(xMaximum, share)) / xMaximum) * plotWidth;
  const boundarySlippageBps = metrics.boundaryQuote.slippage * 10_000;
  const yMaximumBps = niceChartMaximum(boundarySlippageBps * 1.08);
  const yFromSlippage = (slippage: number) =>
    baseline - ((slippage * 10_000) / yMaximumBps) * plotHeight;
  const referenceAtPoolBoundary = isReferenceAtPoolBoundary(metrics);
  const referenceX = xFromShare(metrics.referenceSellShareOfSenior);
  const referenceY = yFromSlippage(metrics.referenceQuote.slippage);
  const boundaryX = xFromShare(atomicCapacity);
  const boundaryY = yFromSlippage(metrics.boundaryQuote.slippage);
  const hoverPointAtShare = (requestedShare: number): LiquidityHoverPoint => {
    const share = Math.max(0, Math.min(xMaximum, requestedShare));
    if (mode === 'atomic') {
      const quote = quoteAtBatchShare(share);
      return {
        share,
        batchShare: share,
        cycle: 1,
        executionPrice: quote.executionPrice,
        slippage: quote.slippage,
      };
    }
    const cycleIndex = Math.min(
      cycleCount - 1,
      Math.floor(Math.max(0, share - 1e-12) / atomicCapacity),
    );
    const startShare = cycleIndex * atomicCapacity;
    const batchShare = Math.max(0, share - startShare);
    const quote = quoteAtBatchShare(batchShare);
    return {
      share,
      batchShare,
      cycle: cycleIndex + 1,
      executionPrice: quote.executionPrice,
      slippage: quote.slippage,
    };
  };
  const [hoveredPoint, setHoveredPoint] = useDayChartHover<LiquidityHoverPoint>('liquidity');
  const keyboardPoints = Array.from(
    { length: 41 },
    (_, index) => hoverPointAtShare((xMaximum * index) / 40),
  );
  const selectFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotLeft = bounds.left + (margin.left / width) * bounds.width;
    const renderedPlotWidth = (plotWidth / width) * bounds.width;
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - plotLeft) / Math.max(renderedPlotWidth, 1)),
    );
    setHoveredPoint(hoverPointAtShare(fraction * xMaximum));
  };
  const moveByKeyboard = (direction: -1 | 1) => {
    const defaultShare = mode === 'atomic'
      ? Math.min(metrics.referenceSellShareOfSenior, atomicCapacity)
      : 0.5;
    const currentIndex = nearestPointIndex(
      keyboardPoints,
      hoveredPoint?.share ?? defaultShare,
      (point) => point.share,
    );
    const nextIndex = Math.max(0, Math.min(keyboardPoints.length - 1, currentIndex + direction));
    setHoveredPoint(keyboardPoints[nextIndex] ?? null);
  };
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * xMaximum);
  const yTicks = [0, yMaximumBps / 2, yMaximumBps];
  const visibleCycles = mode === 'atomic'
    ? [{ index: 0, startShare: 0, endShare: atomicCapacity, points: atomicPoints }]
    : arbitrageCycles;
  const liquidityAriaLabel = mode === 'atomic'
    ? `Atomic ST sale into the current SLP pool with no intervening arbitrage. The current pool can fill ${(
      atomicCapacity * 100
    ).toFixed(1)}% of opening ST NAV before reaching its boundary.`
    : `Illustrative sale of the full ST position across ${cycleCount} segments. Each new segment assumes arbitrage fully recenters the SLP pool to marked redemption value. This is not a timing or fill guarantee.`;

  return (
    <div data-accountant-source="buildDayExplainerMetrics.liquidity" style={{ position: 'relative' }}>
      <div
        aria-label="Liquidity chart view"
        className="mt-3 grid grid-cols-2"
        role="tablist"
        style={{ gap: 6 }}
      >
        {([
          { id: 'arbitrage' as const, label: 'With arbitrage between sales' },
          { id: 'atomic' as const, label: 'One atomic sale' },
        ]).map((option) => {
          const active = mode === option.id;
          return (
            <button
              aria-selected={active}
              key={option.id}
              onClick={() => {
                setMode(option.id);
                setHoveredPoint(null);
              }}
              role="tab"
              style={{
                background: active ? `${C.olive}12` : C.cardBg,
                border: `1px solid ${active ? C.olive : C.border}`,
                color: active ? C.olive : C.muted,
                fontFamily: MONO,
                fontSize: 9.5,
                fontWeight: 700,
                minHeight: 34,
                padding: '7px 8px',
                textTransform: 'uppercase',
              }}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p
        className="mt-2"
        style={{
          background: C.pageBg,
          border: `1px solid ${C.border}`,
          color: C.muted,
          fontSize: 10.8,
          lineHeight: 1.45,
          padding: '8px 10px',
        }}
      >
        {mode === 'atomic'
          ? 'How one transaction moves the current pool before arbitrage has time to respond.'
          : `Illustrative full-position sequence across ${cycleCount} sale segments. Every dotted reset assumes arbitrage fully restores today’s pool state before selling resumes.`}
      </p>
      <svg
        aria-label={`${liquidityAriaLabel} Hover, tap, or focus and use the arrow keys to inspect the chart.`}
        className="mt-2 w-full"
        onBlur={() => setHoveredPoint(null)}
        onFocus={() => {
          setHoveredPoint(
            hoverPointAtShare(
              mode === 'atomic'
                ? Math.min(metrics.referenceSellShareOfSenior, atomicCapacity)
                : Math.min(0.5, xMaximum),
            ),
          );
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          moveByKeyboard(event.key === 'ArrowLeft' ? -1 : 1);
        }}
        onMouseLeave={() => setHoveredPoint(null)}
        onPointerDown={selectFromPointer}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') setHoveredPoint(null);
        }}
        onPointerMove={selectFromPointer}
        role="img"
        tabIndex={0}
        viewBox={`0 0 ${width} ${height}`}
        style={{ cursor: 'crosshair' }}
      >
        {yTicks.slice(1).map((tick) => (
          <line
            key={`y-${tick}`}
            x1={margin.left}
            y1={yFromSlippage(tick / 10_000)}
            x2={margin.left + plotWidth}
            y2={yFromSlippage(tick / 10_000)}
            stroke={C.border}
            strokeDasharray="4 4"
          />
        ))}
        {xTicks.slice(1).map((tick) => (
          <line
            key={`x-${tick}`}
            x1={xFromShare(tick)}
            y1={margin.top}
            x2={xFromShare(tick)}
            y2={baseline}
            stroke={C.border}
            strokeDasharray="4 4"
          />
        ))}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={baseline} stroke={C.border} />
        <line x1={margin.left} y1={baseline} x2={margin.left + plotWidth} y2={baseline} stroke={C.olive} strokeWidth={2} />
        {visibleCycles.map((cycle) => {
          const line = cycle.points
            .map((point) => `${xFromShare(point.share)},${yFromSlippage(point.slippage)}`)
            .join(' ');
          const area = [
            `${xFromShare(cycle.startShare)},${baseline}`,
            line,
            `${xFromShare(cycle.endShare)},${baseline}`,
          ].join(' ');
          const endpoint = cycle.points[cycle.points.length - 1];
          return (
            <g key={cycle.index}>
              <polygon points={area} fill={C.olive} fillOpacity={cycle.index % 2 === 0 ? 0.1 : 0.055} />
              <polyline
                fill="none"
                points={line}
                stroke={C.seniorLine}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3.5}
              />
              {mode === 'arbitrage' && cycle.index < visibleCycles.length - 1 && endpoint && (
                <line
                  x1={xFromShare(cycle.endShare)}
                  y1={yFromSlippage(endpoint.slippage)}
                  x2={xFromShare(cycle.endShare)}
                  y2={baseline}
                  stroke={C.olive}
                  strokeDasharray="3 3"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
        {mode === 'atomic' && !referenceAtPoolBoundary && (
          <>
            <line
              x1={referenceX}
              y1={referenceY}
              x2={referenceX}
              y2={baseline}
              stroke={C.olive}
              strokeDasharray="3 3"
            />
            <circle cx={referenceX} cy={referenceY} r={5} fill={C.cardBg} stroke={C.olive} strokeWidth={2.5} />
            <text
              x={referenceX > margin.left + plotWidth * 0.68 ? referenceX - 9 : referenceX + 9}
              y={Math.max(margin.top + 14, referenceY - 10)}
              fill={C.olive}
              fontFamily={MONO}
              fontSize={10.5}
              fontWeight={600}
              textAnchor={referenceX > margin.left + plotWidth * 0.68 ? 'end' : 'start'}
            >
              100 bps at {(metrics.referenceSellShareOfSenior * 100).toFixed(1)}% sold
            </text>
          </>
        )}
        {mode === 'atomic' && (
          <>
            <line
              x1={boundaryX}
              y1={margin.top}
              x2={boundaryX}
              y2={baseline}
              stroke={C.danger}
              strokeDasharray="4 3"
              strokeWidth={2}
            />
            <circle cx={boundaryX} cy={boundaryY} r={6} fill={C.cardBg} stroke={C.danger} strokeWidth={3} />
            <text
              x={boundaryX - 9}
              y={Math.max(margin.top + 15, boundaryY - 12)}
              fill={C.danger}
              fontFamily={MONO}
              fontSize={10.5}
              fontWeight={600}
              textAnchor="end"
            >
              <tspan x={boundaryX - 9}>{(atomicCapacity * 100).toFixed(1)}% atomic limit</tspan>
              <tspan x={boundaryX - 9} dy="14">{formatBasisPoints(boundarySlippageBps)} average slippage</tspan>
            </text>
          </>
        )}
        {hoveredPoint && (
          <>
            <line
              x1={xFromShare(hoveredPoint.share)}
              y1={margin.top}
              x2={xFromShare(hoveredPoint.share)}
              y2={baseline}
              stroke={C.olive}
              strokeDasharray="3 3"
              strokeWidth={1.5}
            />
            <circle
              cx={xFromShare(hoveredPoint.share)}
              cy={yFromSlippage(hoveredPoint.slippage)}
              r={5}
              fill={C.cardBg}
              stroke={C.olive}
              strokeWidth={2.5}
            />
          </>
        )}
        <text x={margin.left + 6} y={26} fill={C.olive} fontSize={11.5} fontWeight={600}>
          {mode === 'atomic' ? 'Current pool · no intervening arbitrage' : 'Illustrative full-reset sequence'}
        </text>
        <text x={margin.left + plotWidth} y={26} fill={C.kpiLabel} fontSize={10.5} textAnchor="end">
          {mode === 'atomic'
            ? `${(atomicCapacity * 100).toFixed(1)}% maximum atomic fill`
            : 'Dotted reset = arbitrage recenters'}
        </text>
        {yTicks.map((tick) => (
          <text
            key={`y-label-${tick}`}
            x={margin.left - 10}
            y={yFromSlippage(tick / 10_000) + 4}
            fill={tick === 0 ? C.olive : C.kpiLabel}
            fontFamily={MONO}
            fontSize={10.5}
            textAnchor="end"
          >
            {formatBasisPoints(tick)}
          </text>
        ))}
        {xTicks.map((tick, index) => (
          <text
            key={`x-label-${tick}`}
            x={xFromShare(tick)}
            y={height - 34}
            fill={index === xTicks.length - 1 ? C.text : C.kpiLabel}
            fontFamily={MONO}
            fontSize={index === xTicks.length - 1 ? 12 : 10.5}
            fontWeight={index === xTicks.length - 1 ? 700 : 400}
            textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {mode === 'atomic' ? `${(tick * 100).toFixed(1)}%` : `${(tick * 100).toFixed(0)}%`}
          </text>
        ))}
        <text
          transform={`translate(13 ${margin.top + plotHeight / 2}) rotate(-90)`}
          fill={C.kpiLabel}
          fontSize={11.5}
          textAnchor="middle"
        >
          Average slippage
        </text>
        <text
          x={margin.left + plotWidth / 2}
          y={height - 7}
          fill={C.kpiLabel}
          fontSize={11.5}
          textAnchor="middle"
        >
          {mode === 'atomic'
            ? 'ST sold in one atomic transaction (% of all ST NAV)'
            : 'Cumulative ST sold across arbitrage-assisted segments'}
        </text>
      </svg>
      {hoveredPoint && (
        <DayChartTooltip
          title={mode === 'atomic' ? 'Atomic SLP quote' : `Illustrative sale segment ${hoveredPoint.cycle}`}
          xPct={(hoveredPoint.share / xMaximum) * 100}
          rows={[
            {
              label: mode === 'atomic' ? 'ST offered' : 'Cumulative ST sold',
              value: `${(hoveredPoint.share * 100).toFixed(1)}%`,
            },
            ...(mode === 'arbitrage'
              ? [
                  {
                    label: 'Current sale segment',
                    value: `${(hoveredPoint.batchShare * 100).toFixed(1)}% of ST`,
                  },
                  {
                    label: 'Segment',
                    value: `${hoveredPoint.cycle} of ${cycleCount}`,
                  },
                ]
              : []),
            {
              label: 'Average price',
              value: `$${hoveredPoint.executionPrice.toFixed(4)}`,
              color: C.olive,
            },
            {
              label: 'Average slippage',
              value: formatBasisPoints(hoveredPoint.slippage * 10_000),
              color: C.danger,
            },
          ]}
          note={mode === 'atomic'
            ? 'One transaction against the current pool, with no intervening arbitrage.'
            : 'Illustrative only: the next segment assumes arbitrage fully restores the current pool to marked redemption value.'}
        />
      )}
    </div>
  );
}

function CoverageLossDiagram({
  metrics,
}: {
  metrics: DayExplainerMetrics['coverage'];
}) {
  const width = 520;
  const height = 400;
  const margin = { left: 64, right: 20, top: 30, bottom: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const yMin = Math.floor(metrics.endingSeniorBalancePer100);
  const yMax = 100;
  const yRange = Math.max(1, yMax - yMin);
  const x = (loss: number) => margin.left + (loss / metrics.displayMaxLoss) * plotWidth;
  const y = (balance: number) => margin.top + ((yMax - balance) / yRange) * plotHeight;
  const curvePixels = metrics.points.map((point) => ({
    x: x(point.loss),
    y: y(point.seniorBalancePer100),
  }));
  const line = curvePixels.map((point) => `${point.x},${point.y}`).join(' ');
  const breakpointX = x(metrics.coverageLossLimit);
  const endpointX = x(metrics.displayMaxLoss);
  const endpointY = y(metrics.endingSeniorBalancePer100);
  const [hoveredLossIndex, setHoveredLossIndex] = useDayChartHover<number>('coverage');
  const hoveredLossPoint = hoveredLossIndex === null ? null : metrics.points[hoveredLossIndex];
  const selectLossFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotLeft = bounds.left + (margin.left / width) * bounds.width;
    const renderedPlotWidth = (plotWidth / width) * bounds.width;
    const fraction = Math.max(0, Math.min(1, (event.clientX - plotLeft) / Math.max(renderedPlotWidth, 1)));
    const loss = fraction * metrics.displayMaxLoss;
    setHoveredLossIndex(nearestPointIndex(metrics.points, loss, (point) => point.loss));
  };
  const moveLossByKeyboard = (direction: -1 | 1) => {
    const currentIndex = hoveredLossIndex ?? nearestPointIndex(
      metrics.points,
      metrics.coverageLossLimit,
      (point) => point.loss,
    );
    setHoveredLossIndex(Math.max(0, Math.min(metrics.points.length - 1, currentIndex + direction)));
  };
  const narrowCoverageZone = metrics.coverageLossLimit / metrics.displayMaxLoss < 0.18;
  const narrowSeniorZone = (metrics.displayMaxLoss - metrics.coverageLossLimit) / metrics.displayMaxLoss < 0.18;
  type CoverageLabelCandidate = { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  const placeCoverageLabel = (text: string, candidates: CoverageLabelCandidate[]) => {
    const textWidth = estimateText(text);
    for (const candidate of candidates) {
      const left = candidate.anchor === 'start'
        ? candidate.x
        : candidate.anchor === 'end'
          ? candidate.x - textWidth
          : candidate.x - textWidth / 2;
      const rect = {
        left: left - 5,
        right: left + textWidth + 5,
        top: candidate.y - 15,
        bottom: candidate.y + 4,
      };
      const staysInsidePlotWidth = rect.left >= margin.left + 4 && rect.right <= endpointX - 4;
      const staysInsideViewBoxHeight = rect.top >= 4 && rect.bottom <= margin.top + plotHeight - 4;
      const intersectsCurve = curvePixels.some((point, index) =>
        index > 0 && segmentIntersectsRect(curvePixels[index - 1], point, rect));
      if (staysInsidePlotWidth && staysInsideViewBoxHeight && !intersectsCurve) return candidate;
    }
    return candidates[candidates.length - 1];
  };
  const juniorZoneLabel = 'JT absorbs loss';
  const seniorZoneLabel = 'ST absorbs excess';
  const coveredBalanceLabel = '$100 covered';
  const juniorZoneLabelPosition = placeCoverageLabel(juniorZoneLabel, [
    { x: (margin.left + breakpointX) / 2, y: margin.top + 27, anchor: 'middle' },
    { x: margin.left + 10, y: margin.top - 10, anchor: 'start' },
  ]);
  const seniorZoneLabelPosition = placeCoverageLabel(seniorZoneLabel, [
    { x: (breakpointX + endpointX) / 2, y: margin.top + 27, anchor: 'middle' },
    { x: endpointX - 10, y: margin.top - 10, anchor: 'end' },
  ]);
  const coveredBalanceLabelPosition = placeCoverageLabel(coveredBalanceLabel, [
    { x: breakpointX - 12, y: y(100) + 56, anchor: 'end' },
    { x: margin.left + 10, y: margin.top + plotHeight - 16, anchor: 'start' },
  ]);
  return (
    <div data-accountant-source="buildDayExplainerMetrics.coverage" style={{ position: 'relative' }}>
      <svg
        aria-label={`ST stays at $100 through a ${(metrics.coverageLossLimit * 100).toFixed(1)}% base-asset loss, then declines to $${metrics.endingSeniorBalancePer100.toFixed(1)} at a ${(metrics.displayMaxLoss * 100).toFixed(1)}% loss. Hover, tap, or focus and use the arrow keys to inspect the chart.`}
        className="mt-3 w-full"
        onBlur={() => setHoveredLossIndex(null)}
        onFocus={() => {
          setHoveredLossIndex(nearestPointIndex(
            metrics.points,
            metrics.coverageLossLimit,
            (point) => point.loss,
          ));
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          moveLossByKeyboard(event.key === 'ArrowLeft' ? -1 : 1);
        }}
        onMouseLeave={() => setHoveredLossIndex(null)}
        onPointerDown={selectLossFromPointer}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') setHoveredLossIndex(null);
        }}
        onPointerMove={selectLossFromPointer}
        role="img"
        tabIndex={0}
        viewBox={`0 0 ${width} ${height}`}
        style={{ cursor: 'crosshair' }}
      >
        <rect
          x={margin.left}
          y={margin.top}
          width={breakpointX - margin.left}
          height={plotHeight}
          fill={C.freeLine}
          fillOpacity={0.1}
        />
        <rect
          x={breakpointX}
          y={margin.top}
          width={endpointX - breakpointX}
          height={plotHeight}
          fill={C.danger}
          fillOpacity={0.06}
        />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke={C.border} />
        <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke={C.border} />
        <line
          x1={breakpointX}
          y1={margin.top}
          x2={breakpointX}
          y2={margin.top + plotHeight}
          stroke={C.eyebrow}
          strokeDasharray="4 4"
        />
        <polyline points={line} fill="none" stroke={C.seniorLine} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        {hoveredLossPoint && (
          <>
            <line
              x1={x(hoveredLossPoint.loss)}
              y1={margin.top}
              x2={x(hoveredLossPoint.loss)}
              y2={margin.top + plotHeight}
              stroke={hoveredLossPoint.loss <= metrics.coverageLossLimit ? C.olive : C.danger}
              strokeDasharray="3 3"
              strokeWidth={1.5}
            />
            <circle
              cx={x(hoveredLossPoint.loss)}
              cy={y(hoveredLossPoint.seniorBalancePer100)}
              r={5}
              fill={C.cardBg}
              stroke={hoveredLossPoint.loss <= metrics.coverageLossLimit ? C.olive : C.danger}
              strokeWidth={2.5}
            />
          </>
        )}
        <circle cx={breakpointX} cy={y(100)} r={7} fill={C.cardBg} stroke={C.olive} strokeWidth={3} />
        <circle cx={endpointX} cy={endpointY} r={7} fill={C.cardBg} stroke={C.danger} strokeWidth={3} />
        <text x={14} y={margin.top + 5} fill={C.kpiLabel} fontFamily={MONO} fontSize={12}>$100</text>
        <text x={14} y={margin.top + plotHeight + 4} fill={C.kpiLabel} fontFamily={MONO} fontSize={12}>${yMin}</text>
        <text x={margin.left} y={height - 32} fill={C.kpiLabel} fontFamily={MONO} fontSize={12}>0%</text>
        <text
          x={narrowSeniorZone ? breakpointX - 4 : breakpointX}
          y={narrowCoverageZone || narrowSeniorZone ? height - 47 : height - 32}
          fill={C.eyebrow}
          fontFamily={MONO}
          fontSize={12}
          textAnchor={narrowCoverageZone ? 'start' : narrowSeniorZone ? 'end' : 'middle'}
        >
          {(metrics.coverageLossLimit * 100).toFixed(1)}%
        </text>
        <text x={margin.left + plotWidth} y={height - 32} fill={C.kpiLabel} fontFamily={MONO} fontSize={12} textAnchor="end">
          {(metrics.displayMaxLoss * 100).toFixed(1)}%
        </text>
        <text
          x={juniorZoneLabelPosition.x}
          y={juniorZoneLabelPosition.y}
          fill={C.olive}
          fontSize={12.5}
          fontWeight={600}
          textAnchor={juniorZoneLabelPosition.anchor}
        >
          {juniorZoneLabel}
        </text>
        <text
          x={seniorZoneLabelPosition.x}
          y={seniorZoneLabelPosition.y}
          fill={C.danger}
          fontSize={12.5}
          fontWeight={600}
          textAnchor={seniorZoneLabelPosition.anchor}
        >
          {seniorZoneLabel}
        </text>
        <text
          x={coveredBalanceLabelPosition.x}
          y={coveredBalanceLabelPosition.y}
          fill={C.olive}
          fontFamily={MONO}
          fontSize={12.5}
          fontWeight={600}
          textAnchor={coveredBalanceLabelPosition.anchor}
        >
          {coveredBalanceLabel}
        </text>
        <text
          x={endpointX - 7}
          y={endpointY - 17}
          fill={C.danger}
          fontFamily={MONO}
          fontSize={13.5}
          fontWeight={600}
          paintOrder="stroke"
          stroke={C.cardBg}
          strokeWidth={7}
          strokeLinejoin="round"
          textAnchor="end"
        >
          ${metrics.endingSeniorBalancePer100.toFixed(1)}
        </text>
        <text transform={`translate(13 ${margin.top + plotHeight / 2}) rotate(-90)`} fill={C.kpiLabel} fontSize={12} textAnchor="middle">
          ST $ balance
        </text>
        <text x={margin.left + plotWidth / 2} y={height - 8} fill={C.kpiLabel} fontSize={12} textAnchor="middle">
          Strategy base-asset loss
        </text>
      </svg>
      {hoveredLossPoint && (
        <DayChartTooltip
          title="Loss waterfall"
          xPct={(hoveredLossPoint.loss / metrics.displayMaxLoss) * 100}
          rows={[
            { label: 'Source loss', value: `${(hoveredLossPoint.loss * 100).toFixed(1)}%` },
            {
              label: 'ST value',
              value: `$${hoveredLossPoint.seniorBalancePer100.toFixed(1)}`,
              color: hoveredLossPoint.seniorBalancePer100 >= 100 - 1e-8 ? C.olive : C.danger,
            },
            {
              label: 'JT buffer',
              value: hoveredLossPoint.loss <= metrics.coverageLossLimit ? 'Protecting ST' : 'Exhausted',
              color: hoveredLossPoint.loss <= metrics.coverageLossLimit ? C.olive : C.danger,
            },
          ]}
          note={hoveredLossPoint.loss <= metrics.coverageLossLimit
            ? 'JT absorbs this modeled source loss before ST.'
            : 'The modeled JT buffer is depleted, so additional loss reaches ST.'}
        />
      )}
    </div>
  );
}

function GuidedChartGuide() {
  const itemStyle = {
    alignItems: 'center',
    display: 'flex',
    gap: 9,
    minWidth: 0,
  } as const;
  const copyStyle = {
    color: C.muted,
    fontSize: 11.5,
    lineHeight: 1.35,
  } as const;
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
      style={{ borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, gap: 12, padding: '10px 0' }}
    >
      <div style={itemStyle}>
        <svg aria-hidden="true" height="24" viewBox="0 0 42 24" width="42">
          <line x1="1" x2="19" y1="7" y2="7" stroke={C.seniorLine} strokeWidth="2" />
          <line x1="23" x2="41" y1="7" y2="7" stroke={C.juniorLine} strokeWidth="2" />
          <line x1="1" x2="19" y1="17" y2="17" stroke={C.olive} strokeWidth="2" />
          <line x1="23" x2="41" y1="17" y2="17" stroke={C.strategyLine} strokeWidth="2" />
        </svg>
        <span style={copyStyle}>Lines show how $100 in each position changes.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ background: C.obsFill, height: 24, opacity: 0.32, width: 28 }} />
        <span style={copyStyle}>A shaded band is an Observation Period.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ background: C.danger, borderRadius: 9999, height: 9, width: 9 }} />
        <span style={copyStyle}>A JT mark means its covered loss was finalized.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ border: `2px solid ${C.danger}`, borderRadius: 9999, height: 10, width: 10 }} />
        <span style={copyStyle}>An ST mark means loss reached ST.</span>
      </div>
    </div>
  );
}

function GuidedObservationSteps({
  days,
  generalizeObservation = false,
}: {
  days: number;
  generalizeObservation?: boolean;
}) {
  const observationStartX = 72;
  const observationEndX = 142;
  const recoveryObservationEndX = 83;
  const finalizationObservationEndX = 194;
  const steps = [
    {
      number: '1',
      title: 'Drawdown',
      body: 'JT covers ST first. The covered amount becomes JT’s first claim on a recovery.',
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 54">
          <line x1="5" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,18 48,15 86,20 124,38 164,31 205,27" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <polyline points="5,18 48,15 205,15" fill="none" stroke={C.seniorLine} strokeWidth="2" />
        </svg>
      ),
    },
    {
      number: '2',
      title: generalizeObservation ? 'Observation Period' : `${days}-day Observation Period`,
      body: generalizeObservation
        ? `Its duration is market-specific (${days} days here). Direct ST and JT deposits and redemptions pause; SLP redemptions pause. ST can still sell through the SLP pool.`
        : 'Direct ST and JT deposits and redemptions pause; SLP redemptions pause. ST can still sell through the SLP pool.',
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 66">
          <rect x={observationStartX} y="2" width={observationEndX - observationStartX} height="48" fill={C.obsFill} fillOpacity="0.32" />
          <line x1="5" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,18 48,16 72,15 84,24 111,38 142,30 174,24 205,22" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <polyline points="5,18 48,16 72,15 142,15 174,13 205,11" fill="none" stroke={C.seniorLine} strokeWidth="2" />
          <text x={(observationStartX + observationEndX) / 2} y="63" fill={C.eyebrow} fontFamily={MONO} fontSize="9" textAnchor="middle">
            {days}d
          </text>
        </svg>
      ),
    },
    {
      number: '3',
      title: 'Recover or finalize',
      body: generalizeObservation
        ? "A full recovery restores JT. If the window ends before full recovery, JT's covered loss is finalized."
        : "Recovery restores JT first. If the window ends before recovery, JT's covered loss is finalized.",
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 54">
          <rect x="5" y="2" width={recoveryObservationEndX - 5} height="48" fill={C.obsFill} fillOpacity="0.32" />
          <rect x="116" y="2" width={finalizationObservationEndX - 116} height="48" fill={C.obsFill} fillOpacity="0.32" />
          <line x1="5" x2="95" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,15 28,18 49,34 72,23 83,15 95,10" fill="none" stroke={C.olive} strokeWidth="2" />
          <text x="105" y="30" fill={C.kpiLabel} fontFamily={MONO} fontSize="9" textAnchor="middle">OR</text>
          <line x1="116" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="116,15 140,19 162,34 194,34 205,34" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <circle cx={finalizationObservationEndX} cy="34" r="4" fill={C.danger} />
        </svg>
      ),
    },
  ];
  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-3" style={{ border: `1px solid ${C.border}` }}>
      {steps.map((step, index) => (
        <div
          key={step.number}
          className={index === 0 ? undefined : 'border-t lg:border-l lg:border-t-0'}
          style={{ borderColor: C.border, minHeight: 154, padding: 12 }}
        >
          <div className="flex items-start gap-3">
            <span
              style={{ background: C.accent, color: C.cardBg, flex: '0 0 auto', fontFamily: MONO, fontSize: 15, height: 28, lineHeight: '28px', textAlign: 'center', width: 28 }}
            >
              {step.number}
            </span>
            <div>
              <p style={{ color: C.eyebrow, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {step.title}
              </p>
              <p className="mt-1" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4 }}>{step.body}</p>
            </div>
          </div>
          {step.art}
        </div>
      ))}
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
  tone = C.accent,
  labelColor = C.eyebrow,
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
  description?: string;
  tone?: string;
  labelColor?: string;
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
        <label style={{ color: labelColor, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          {label}
        </label>
        <span style={{ color: tone, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{display}</span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => handle(event.target.value)}
        className="w-full"
        style={{ accentColor: tone }}
      />
      {description && (
        <p className="mt-1" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4 }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

const annualized = (end: number, start: number, days: number) =>
  days > 0 && start > 0 && end >= 0
    ? end === 0 ? -1 : Math.pow(end / start, 365 / days) - 1
    : 0;
const pct = (value: number, digits = 1) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
const drawdownPct = (value: number) =>
  value * 100 >= 0.05 ? `−${(value * 100).toFixed(1)}%` : '0.0%';
const usd0 = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const signColor = (value: number) => (value < 0 ? C.danger : C.text);

export default function DayMarketSimulator({
  market,
  variant = 'standard',
}: {
  market?: DayMarket;
  variant?: 'standard' | 'guided' | 'executive' | 'learning';
}) {
  const activeMarket = market ?? DAY_EXPLORER_TEMPLATE_MARKET;
  const isGuided = variant === 'guided';
  const isExecutive = variant === 'executive';
  const isLearning = variant === 'learning';
  const sourceFeeLabel = activeMarket.provenance.feesIncluded === true
    ? 'Fee-inclusive'
    : activeMarket.provenance.feesIncluded === false
      ? 'Fee-exclusive'
      : 'Fee treatment unknown';
  const sourceValueLabel = activeMarket.provenance.priceType === 'unknown'
    ? 'price/NAV'
    : activeMarket.provenance.priceType.replaceAll('-', ' ');
  const showSection = (section: (typeof activeMarket.customization.hiddenSections)[number]) =>
    isDaySectionVisible(activeMarket.customization, section);
  const heroTitle = activeMarket.customization.copyOverrides.heroTitle
    ?? 'Make illiquid yield easier to own.';
  const heroDescription = activeMarket.customization.copyOverrides.heroDescription
    ?? 'Royco Day splits one strategy base asset into three positions. ST pays JT a risk premium for first-loss coverage and SLP a liquidity premium for secondary liquidity.';
  const defaults = activeMarket.defaults;
  const backtestDisplay = activeMarket.customization.backtestDisplay;
  const forwardTest = activeMarket.customization.forwardTest;
  const reverseMarket = activeMarket.customization.reverseMarket;
  const omitInitialZeroReturnPeriod = forwardTest?.omitInitialZeroReturnPeriod === true;
  const returnUnit = backtestDisplay?.returnUnit ?? 'USD';
  const isNativeReturnUnit = returnUnit !== 'USD';
  const [sourceApyPct, setSourceApyPct] = useState(defaults.sourceApy * 100);
  const [observationDays, setObservationDays] = useState(defaults.observationDays);
  const [forwardScenario, setForwardScenario] = useState<DayForwardScenarioId>(
    forwardTest?.defaultScenario ?? forwardTest?.scenarios[0]?.id ?? 'normal',
  );
  const simulationSeries = useMemo(
    () => forwardTest && reverseMarket
      ? buildDayFiniteForwardSeries(
        sourceApyPct / 100,
        activeMarket.provenance.retrievedAt ?? '2026-01-01',
        forwardTest,
        reverseMarket,
        forwardScenario,
        observationDays,
      )
      : activeMarket.provenance.dataMode === 'published-apy-forward'
        ? buildDayForwardSeries(
          defaults.sourceApy,
          defaults.stableYield,
          activeMarket.provenance.retrievedAt ?? '2026-01-01',
        )
        : activeMarket.series,
    [activeMarket.provenance.dataMode, activeMarket.provenance.retrievedAt, activeMarket.series, defaults.sourceApy, defaults.stableYield, forwardScenario, forwardTest, observationDays, reverseMarket, sourceApyPct],
  );
  const sourceHasObservedDrawdown = useMemo(
    () => hasObservedDrawdown(activeMarket.series),
    [activeMarket.series],
  );
  const [showInputs, setShowInputs] = useState(false);
  const [showLiquidityDetail, setShowLiquidityDetail] = useState(false);
  const [showCoverageDetail, setShowCoverageDetail] = useState(false);
  const [showReview, setShowReview] = useState(!isGuided);
  const [showMonthly, setShowMonthly] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartTickCount, setChartTickCount] = useState(7);
  const [coveragePct, setCoveragePct] = useState(defaults.coverage * 100);
  const [minLiquidityPct, setMinLiquidityPct] = useState(defaults.minLiquidity * 100);
  const [eclpBandWidthPct, setEclpBandWidthPct] = useState(defaults.eclpBandWidth * 100);
  const [riskSharePct, setRiskSharePct] = useState(defaults.riskYDM.yTarget * 100);
  const [liqSharePct, setLiqSharePct] = useState(defaults.liqYDM.yTarget * 100);
  const [maintainCoverage, setMaintainCoverage] = useState(defaults.maintainCoverage);
  const [range, setRange] = useState<IndexRange>({
    a: 0,
    b: simulationSeries.length - 1,
  });

  useEffect(() => {
    const chartContainer = chartContainerRef.current;
    if (!chartContainer) return;
    const updateTickCount = () => {
      const width = chartContainer.getBoundingClientRect().width;
      const nextCount = width < 270 ? 2 : width < 370 ? 3 : width < 650 ? 4 : width < 760 ? 6 : 7;
      setChartTickCount((current) => (current === nextCount ? current : nextCount));
    };
    updateTickCount();
    const observer = new ResizeObserver(updateTickCount);
    observer.observe(chartContainer);
    return () => observer.disconnect();
  }, []);

  const maxIndex = Math.max(0, simulationSeries.length - 1);
  const viewRange = useMemo(
    () => normalizeRange(range.a, range.b, maxIndex),
    [maxIndex, range],
  );
  const modeledSeries = useMemo(
    () => forwardTest
      ? simulationSeries
      : calibrateSeriesApy(simulationSeries, sourceApyPct / 100),
    [forwardTest, simulationSeries, sourceApyPct],
  );
  const view = useMemo(
    () => modeledSeries.slice(viewRange.a, viewRange.b + 1),
    [modeledSeries, viewRange],
  );

  const { result, fullResult } = useMemo(() => {
    const run = (series: DaySeriesPoint[]) => {
    const coverage = coveragePct / 100;
    const minLiquidity = minLiquidityPct / 100;
    const eclpBandWidth = eclpBandWidthPct / 100;
    const riskTarget = riskSharePct / 100;
    const liqTarget = liqSharePct / 100;
    const initial = buildDayInitialBalances(defaults, { coverage, minLiquidity });
    const cfg = buildDayMarketConfig(defaults, {
      coverage,
      minLiquidity,
      eclpBandWidth,
      observationDays,
      riskYieldShare: riskTarget,
      liquidityYieldShare: liqTarget,
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
        const reason = exitEvent?.observationExitReason === 'period-ended'
          ? 'Observation Period ended'
          : exitEvent?.observationExitReason === 'protected-exit'
            ? 'Protected Exit opened'
            : exitEvent?.observationExitReason === 'st-impairment'
              ? 'ST impairment'
              : 'JT recovery claim reset';
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
      const observationClosed =
        previousSnapshot.state === MarketState.FIXED_TERM &&
        postReturn.state === MarketState.PERPETUAL;
      if (
        observationClosed &&
        shouldRefillJunior(maintainCoverage, previousSnapshot.state, postReturn.state)
      ) {
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
          makePeriod(index, closeIndex, exitEvent?.observationExitReason === 'period-ended'),
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
    const maxDrawdown = (key: 'strategy' | 'senior' | 'junior' | 'liquidity') => {
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
    const monthlyRows = Array.from(monthEnds.entries()).map(([month, monthEnd]) => {
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
    const monthly = omitInitialZeroReturnPeriod
      && chart[0]?.date === modeledSeries[0]?.date
      && monthlyRows.length > 1
      ? monthlyRows.slice(1)
      : monthlyRows;
    const final = sim.last();
    return {
      cfg,
      initial,
      sim,
      chart,
      seniorApy: annualized(last.senior, first.senior, days),
      juniorApy: annualized(last.junior, first.junior, days),
      liquidityApy: annualized(last.liquidity, first.liquidity, days),
      strategyApy: annualized(last.strategy, first.strategy, days),
      final,
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
      strategyMaxDrawdown: maxDrawdown('strategy'),
      seniorMaxDrawdown: maxDrawdown('senior'),
      juniorMaxDrawdown: maxDrawdown('junior'),
      liquidityMaxDrawdown: maxDrawdown('liquidity'),
      monthly,
    };
    };
    const result = run(view);
    const fullResult = isFullRange(viewRange, maxIndex) ? result : run(modeledSeries);
    const explainer = buildDayExplainerMetrics(result.cfg, result.initial);
    return {
      result: { ...result, explainer },
      fullResult: { ...fullResult, explainer },
    };
  }, [
    coveragePct,
    defaults,
    eclpBandWidthPct,
    liqSharePct,
    maintainCoverage,
    modeledSeries,
    minLiquidityPct,
    observationDays,
    omitInitialZeroReturnPeriod,
    riskSharePct,
    view,
    viewRange,
    maxIndex,
  ]);

  const displaySeriesOffset = omitInitialZeroReturnPeriod && modeledSeries.length > 1 ? 1 : 0;
  const displayChart = useMemo(
    () => displaySeriesOffset > 0 && result.chart[0]?.date === modeledSeries[0]?.date
      ? result.chart.slice(displaySeriesOffset)
      : result.chart,
    [displaySeriesOffset, modeledSeries, result.chart],
  );
  const allDates = useMemo(
    () => modeledSeries.slice(displaySeriesOffset).map((point) => point.date),
    [displaySeriesOffset, modeledSeries],
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
  const displayedBrushSeries = useMemo(
    () => ({
      strategy: brushSeries.strategy.slice(displaySeriesOffset),
      senior: brushSeries.senior.slice(displaySeriesOffset),
      junior: brushSeries.junior.slice(displaySeriesOffset),
      liquidity: brushSeries.liquidity.slice(displaySeriesOffset),
    }),
    [brushSeries, displaySeriesOffset],
  );
  const displayMaxIndex = Math.max(0, allDates.length - 1);
  const displayedViewRange = useMemo(
    () => displaySeriesOffset === 0
      ? viewRange
      : isFullRange(viewRange, maxIndex)
        ? { a: 0, b: displayMaxIndex }
        : normalizeRange(
          Math.max(0, viewRange.a - displaySeriesOffset),
          Math.max(0, viewRange.b - displaySeriesOffset),
          displayMaxIndex,
        ),
    [displayMaxIndex, displaySeriesOffset, maxIndex, viewRange],
  );
  const setDisplayedRange = useCallback((next: IndexRange) => {
    if (displaySeriesOffset === 0) {
      setRange(next);
      return;
    }
    if (isFullRange(next, displayMaxIndex)) {
      setRange({ a: 0, b: maxIndex });
      return;
    }
    setRange({
      a: next.a + displaySeriesOffset,
      b: next.b + displaySeriesOffset,
    });
  }, [displayMaxIndex, displaySeriesOffset, maxIndex]);

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
    for (const point of displayChart) {
      const year = point.date.slice(0, 4);
      if (year !== previousYear) {
        if (previousYear !== '') marks.push({ date: point.date, year });
        previousYear = year;
      }
    }
    return marks;
  }, [displayChart]);
  const xTicks = useMemo(() => {
    const dates = displayChart.map((point) => point.date);
    if (dates.length <= 1) return dates;
    const yearMarkIndices = yearMarks
      .map((mark) => dates.indexOf(mark.date))
      .filter((index) => index > 0 && index < dates.length - 1);
    const anchorIndices = Array.from(new Set([0, ...yearMarkIndices, dates.length - 1])).sort(
      (left, right) => left - right,
    );
    const desiredTickCount = Math.min(Math.max(chartTickCount, anchorIndices.length), dates.length);

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
  }, [chartTickCount, displayChart, yearMarks]);
  const yMin = useMemo(() => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const point of result.chart) {
      minimum = Math.min(minimum, point.strategy, point.senior, point.junior, point.liquidity);
      maximum = Math.max(maximum, point.strategy, point.senior, point.junior, point.liquidity);
    }
    const range = Math.max(1, maximum - minimum);
    const padding = Math.max(2, range * 0.08);
    return Math.max(0, Math.floor((minimum - padding) / 5) * 5);
  }, [result.chart]);
  const chartYMax = useMemo(() => {
    let maximum = Number.NEGATIVE_INFINITY;
    for (const point of result.chart) {
      maximum = Math.max(maximum, point.strategy, point.senior, point.junior, point.liquidity);
    }
    for (const event of result.erasureEvents) maximum = Math.max(maximum, event.top);
    const range = Math.max(1, maximum - yMin);
    const padding = Math.max(2, range * 0.08);
    return Math.ceil((maximum + padding) / 5) * 5;
  }, [result.chart, result.erasureEvents, yMin]);
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
          label: `Observation Period ${observationSplit(hoverObservation, true)}`,
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
  const startDate = view[0]?.date ?? '—';
  const endDate = view[view.length - 1]?.date ?? '—';
  const selectedForwardScenario = forwardTest?.scenarios.find(
    (scenario) => scenario.id === forwardScenario,
  );
  const from100 = (value: number) =>
    isNativeReturnUnit
      ? `100 → ${value.toFixed(0)}`
      : `$100 → $${value.toFixed(0)}`;
  const guidedSectionStyle = {
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${C.border}`,
    borderRadius: 0,
    boxShadow: 'none',
    padding: 16,
  } as const;

  if (isLearning && endStep) {
    const dataSummary = activeMarket.provenance.dataMode === 'published-apy-forward'
      ? `Modeled from the published ${((activeMarket.provenance.publishedApy ?? defaults.sourceApy) * 100).toFixed(1)}% APY. These are mechanism outputs, not live performance or a forecast.`
      : `Modeled from ${view.length} ${activeMarket.provenance.dataCadence} source values, ${startDate} to ${endDate}. These are mechanism outputs, not live performance or a forecast.`;
    return (
      <DayLearningExperience
        assetName={activeMarket.identity.displayAssetName}
        coverage={result.explainer.coverage}
        coveragePct={coveragePct}
        dataSummary={dataSummary}
        defaults={{
          sourceApyPct: defaults.sourceApy * 100,
          coveragePct: defaults.coverage * 100,
          minLiquidityPct: defaults.minLiquidity * 100,
          eclpBandWidthPct: defaults.eclpBandWidth * 100,
          riskSharePct: defaults.riskYDM.yTarget * 100,
          liqSharePct: defaults.liqYDM.yTarget * 100,
          observationDays: defaults.observationDays,
          maintainCoverage: defaults.maintainCoverage,
        }}
        modelAssumptions={{
          stableYieldPct: defaults.stableYield * 100,
          swapFeeBps: defaults.swapFeeBps,
          poolTurnoverPerYear: defaults.poolTurnoverPerYear,
          reinvestLiquidityPremium: defaults.reinvestLiquidityPremium,
        }}
        eclpBandWidthPct={eclpBandWidthPct}
        liqSharePct={liqSharePct}
        liquidity={result.explainer.liquidity}
        maintainCoverage={maintainCoverage}
        marketId={activeMarket.id}
        minLiquidityPct={minLiquidityPct}
        observationDays={observationDays}
        onCoverageChange={setCoveragePct}
        onEclpBandWidthChange={setEclpBandWidthPct}
        onLiquidityShareChange={(value) => {
          setLiqSharePct(value);
          if (value + riskSharePct > 100) setRiskSharePct(100 - value);
        }}
        onMaintainCoverageChange={setMaintainCoverage}
        onMinLiquidityChange={setMinLiquidityPct}
        onObservationDaysChange={setObservationDays}
        onRiskShareChange={(value) => {
          setRiskSharePct(value);
          if (value + liqSharePct > 100) setLiqSharePct(100 - value);
        }}
        onSourceApyChange={setSourceApyPct}
        positions={[
          {
            symbol: 'ST',
            name: activeMarket.identity.seniorName,
            job: 'Receives first-loss protection and an immediate secondary-market exit.',
            paidFor: 'ST keeps source yield after paying JT for protection and SLP for liquidity.',
            endValue: from100(endStep.senior),
            apy: result.seniorApy,
            maxDrawdown: result.seniorMaxDrawdown,
            color: C.seniorLine,
          },
          {
            symbol: 'JT',
            name: activeMarket.identity.juniorName,
            job: 'Absorbs covered losses before ST.',
            paidFor: 'JT earns the risk premium because its capital is the first-loss buffer.',
            endValue: from100(endStep.junior),
            apy: result.juniorApy,
            maxDrawdown: result.juniorMaxDrawdown,
            color: C.juniorLine,
          },
          {
            symbol: 'SLP',
            name: 'Senior Liquidity Provider',
            job: 'Makes ST sellable through the E-CLP pool.',
            paidFor: 'SLP earns the liquidity premium for providing the pool that buys ST.',
            endValue: from100(endStep.liquidity),
            apy: result.liquidityApy,
            maxDrawdown: result.liquidityMaxDrawdown,
            color: C.olive,
          },
        ]}
        riskSharePct={riskSharePct}
        sourceApy={result.strategyApy}
        sourceApyPct={sourceApyPct}
        sourceEndValue={from100(endStep.strategy)}
        sourceMaxDrawdown={result.strategyMaxDrawdown}
      />
    );
  }

  return (
    <div
      className="flex flex-col"
      style={isGuided
        ? {
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(29,28,25,.035)',
            gap: 0,
            overflow: 'hidden',
          }
        : { gap: 10 }}
    >
      {!isGuided && <section>
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
            fontSize: isGuided ? 'clamp(22px,2.2vw,28px)' : 'clamp(30px,3.2vw,42px)',
            fontWeight: 500,
            letterSpacing: '-0.035em',
            lineHeight: 1.08,
            margin: '10px 0 6px',
          }}
        >
          {isExecutive
            ? heroTitle
            : isGuided
              ? `How ${activeMarket.identity.displayAssetName} could behave in Royco Day`
              : activeMarket.copy.title}
        </h1>
        <p className="max-w-3xl" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, margin: '0 0 12px' }}>
          {isExecutive
            ? heroDescription
            : isGuided
              ? 'Understand the structure, confirm the assumptions, and then compare the modeled outcomes. Each step explains what the next result means.'
              : activeMarket.copy.description}
        </p>
      </section>}

      {isExecutive && showSection('roles') && (
        <section style={{ ...cardStyle, padding: 16 }}>
          <Eyebrow>One investment · three choices</Eyebrow>
          <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 24, fontWeight: 400, lineHeight: 1.12 }}>
            Choose how you want to participate in the same strategy base asset.
          </h2>
          <p className="mt-2" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.45 }}>
            ST and JT are invested in the strategy base asset. SLP provides secondary liquidity through a separate AMM pool.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
            <div style={{ background: C.pageBg, border: `1px solid ${C.seniorLine}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Senior Tranche (ST) · coverage and liquidity</Eyebrow>
              <p className="mt-3" style={{ color: C.accent, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.seniorApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Receives first-loss coverage and secondary liquidity.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                JT absorbs losses before ST. ST can redeem through the primary route or sell immediately into the SLP pool at the current market price.
              </p>
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.juniorLine}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Junior Tranche (JT) · first-loss capital</Eyebrow>
              <p className="mt-3" style={{ color: C.juniorLine, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.juniorApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Earns a risk premium for taking losses first.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                JT shares the strategy base asset&apos;s exposure with ST and absorbs losses before ST.
              </p>
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.olive}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Senior Liquidity Provider (SLP) · secondary liquidity</Eyebrow>
              <p className="mt-3" style={{ color: C.olive, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.liquidityApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Earns by providing the secondary exit for ST.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                SLP return can include the liquidity premium, trading fees, ST appreciation, and stable-asset yield, less impermanent loss.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_56px_1fr]" style={{ alignItems: 'center', gap: 8 }}>
            <div style={{ background: `${C.strategyLine}12`, border: `1px solid ${C.border}`, padding: 12 }}>
              <p style={{ color: C.kpiLabel, fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Strategy base asset</p>
              <p className="mt-1" style={{ color: C.strategyLine, fontFamily: SERIF, fontSize: 18 }}>{activeMarket.identity.displayAssetName} yield</p>
            </div>
            <div className="hidden items-center justify-center md:flex" aria-hidden="true" style={{ color: C.faint, fontFamily: MONO, fontSize: 20 }}>→</div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 8 }}>
              <div style={{ borderLeft: `3px solid ${C.eyebrow}`, padding: '7px 10px' }}>
                <p style={{ color: C.eyebrow, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' }}>ST pays JT</p>
                <p className="mt-1" style={{ color: C.muted, fontSize: 11 }}>JT provides first-loss coverage.</p>
              </div>
              <div style={{ borderLeft: `3px solid ${C.olive}`, padding: '7px 10px' }}>
                <p style={{ color: C.olive, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' }}>ST pays SLP</p>
                <p className="mt-1" style={{ color: C.muted, fontSize: 11 }}>SLP provides secondary liquidity.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {isExecutive && showSection('senior-summary') && (
        <section style={{ ...cardStyle, padding: 16 }}>
          <Eyebrow>What ST gets</Eyebrow>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
            <ExecutiveMetric label="ST average yield" value={`${pct(result.seniorApy)}/yr`} valueColor={C.accent} />
            <ExecutiveMetric label="Minimum JT coverage" value={`${coveragePct.toFixed(0)}% minimum`} valueColor={C.juniorLine} />
            <ExecutiveMetric label="Minimum SLP liquidity" value={`${minLiquidityPct.toFixed(0)}% minimum`} valueColor={C.olive} />
          </div>
        </section>
      )}

      {!isExecutive && !isGuided && <section style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>How Day works</Eyebrow>
        <div
          className="mt-3 grid grid-cols-1 xl:grid-cols-[minmax(0,2.3fr)_minmax(290px,1fr)]"
          style={{ gap: 8, alignItems: 'center' }}
        >
          <div
            className="grid grid-cols-1 md:grid-cols-[minmax(140px,.9fr)_24px_minmax(135px,.85fr)_minmax(96px,.62fr)_minmax(180px,1.12fr)]"
            style={{ gap: 8, alignItems: 'center', minWidth: 0 }}
          >
            <FlowBox
              eyebrow="Strategy base asset"
              value={isGuided ? 'Yield source' : 'Base-asset yield'}
              note={activeMarket.provenance.dataMode === 'published-apy-forward'
                ? `Published ${(defaults.sourceApy * 100).toFixed(1)}% APY forward input`
                : isGuided
                  ? 'The historical values selected above'
                  : `${sourceFeeLabel} source ${sourceValueLabel} path`}
              color={C.strategyLine}
            />
            <div className="flex items-center justify-center md:hidden" aria-hidden="true" style={{ height: 34 }}>
              <svg className="h-full w-full" viewBox="0 0 240 34" preserveAspectRatio="xMidYMid meet">
                <line x1="120" y1="2" x2="120" y2="27" stroke={C.faint} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <path d="M 115 22 L 120 28 L 125 22" fill="none" stroke={C.faint} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="hidden md:flex items-center justify-center" aria-hidden="true" style={{ color: C.faint, fontFamily: MONO, fontSize: 20 }}>
              →
            </div>
            <FlowBox
              eyebrow="Senior Tranche"
              value="ST"
              note={isGuided
                ? 'Gives up some yield for first-loss coverage and a secondary exit'
                : 'Keeps base-asset yield after premiums'}
              color={C.seniorLine}
            />
            <div className="md:hidden" aria-hidden="true" style={{ height: 112 }}>
              <svg className="h-full w-full" viewBox="0 0 240 112" preserveAspectRatio="xMidYMid meet">
                <line x1="120" y1="0" x2="120" y2="20" stroke={C.seniorLine} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                <circle cx="120" cy="20" r="3" fill={C.seniorLine} />
                <path d="M 120 20 H 60 V 34 M 60 72 V 104" fill="none" stroke={C.eyebrow} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                <path d="M 55 98 L 60 105 L 65 98" fill="none" stroke={C.eyebrow} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                <path d="M 120 20 H 180 V 34 M 180 72 V 104" fill="none" stroke={C.olive} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                <path d="M 175 98 L 180 105 L 185 98" fill="none" stroke={C.olive} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                <text x="60" y="47" fill={C.eyebrow} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  RISK
                </text>
                <text x="60" y="59" fill={C.eyebrow} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  PREMIUM
                </text>
                <text x="180" y="47" fill={C.olive} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  LIQUIDITY
                </text>
                <text x="180" y="59" fill={C.olive} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  PREMIUM
                </text>
              </svg>
            </div>
            <div className="hidden md:block" aria-hidden="true" style={{ alignSelf: 'stretch', minHeight: 192 }}>
              <svg className="h-full w-full" viewBox="0 0 112 192">
                <title>Risk premium from ST to JT; liquidity premium from ST to SLP</title>
                <line x1="0" y1="96" x2="24" y2="96" stroke={C.seniorLine} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <circle cx="24" cy="96" r="3" fill={C.seniorLine} />
                <path d="M 24 96 V 46 H 106" fill="none" stroke={C.eyebrow} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d="M 99 42 L 106 46 L 99 50" fill="none" stroke={C.eyebrow} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d="M 24 96 V 146 H 106" fill="none" stroke={C.olive} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d="M 99 142 L 106 146 L 99 150" fill="none" stroke={C.olive} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <text x="69" y="24" fill={C.eyebrow} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  RISK
                </text>
                <text x="69" y="35" fill={C.eyebrow} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  PREMIUM
                </text>
                <text x="69" y="124" fill={C.olive} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  LIQUIDITY
                </text>
                <text x="69" y="135" fill={C.olive} fontSize="8.8" fontWeight="600" letterSpacing="0.08em" textAnchor="middle">
                  PREMIUM
                </text>
              </svg>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-1" style={{ gap: 8 }}>
              <FlowBox
                eyebrow="First-loss coverage"
                value="JT"
                note={isGuided ? 'Earns more for taking losses before ST' : 'Absorbs losses before ST'}
                color={C.juniorLine}
              />
              <FlowBox
                eyebrow="Secondary liquidity"
                value="SLP"
                note={isGuided ? 'Earns for making ST easier to sell' : 'Provides AMM exit liquidity for ST'}
                color={C.olive}
              />
            </div>
          </div>
          <div
            className="flex min-w-0 flex-col justify-center border-t xl:border-l xl:border-t-0"
            style={{ borderColor: C.border, minHeight: 210, padding: '12px 16px' }}
          >
            <Eyebrow>Benefits</Eyebrow>
            <div className="mt-3 flex flex-col" style={{ gap: 14 }}>
              <div>
                <div className="flex items-center gap-3">
                  <span style={{ background: C.juniorLine, borderRadius: 9999, height: 8, width: 8 }} />
                  <span style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>First-loss coverage</span>
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                  {DAY_LOCKED_COPY.coverageBenefit}
                </p>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <div className="flex items-center gap-3">
                  <span style={{ background: C.olive, borderRadius: 9999, height: 8, width: 8 }} />
                  <span style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Secondary liquidity</span>
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                  {DAY_LOCKED_COPY.liquidityBenefit}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>}

      {showSection('market-inputs') && <section style={isGuided ? guidedSectionStyle : { ...cardStyle, padding: 16 }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Eyebrow>{isGuided ? 'Simulation assumptions' : 'Market inputs'}</Eyebrow>
            {isGuided && (
              <p className="mt-1" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4 }}>
                These values drive every result below.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowInputs((value) => !value)}
            aria-label={showInputs ? 'Collapse market inputs' : 'Expand market inputs'}
            aria-expanded={showInputs}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              color: C.accent,
              width: isGuided ? 'auto' : 28,
              height: 28,
              fontFamily: MONO,
              fontSize: isGuided ? 9.5 : 18,
              fontWeight: isGuided ? 700 : 400,
              letterSpacing: isGuided ? '0.08em' : undefined,
              lineHeight: 1,
              background: 'transparent',
              flexShrink: 0,
              padding: isGuided ? '0 10px' : 0,
              textTransform: isGuided ? 'uppercase' : undefined,
            }}
          >
            {isGuided ? (showInputs ? 'Done' : 'Edit') : (showInputs ? '−' : '+')}
          </button>
        </div>

        {isGuided && !showInputs && (
          <>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4" style={{ gap: 6 }}>
              {[
                ['Source APY', `${sourceApyPct.toFixed(1)}%`],
                ['JT coverage', `${coveragePct.toFixed(0)}%`],
                ['SLP liquidity', `${minLiquidityPct.toFixed(0)}%`],
                ['Pool band', `${formatEclpBandPercent(eclpBandWidthPct)}%`],
              ].map(([label, value]) => (
                <div key={label} style={{ background: C.pageBg, borderRadius: 8, padding: '9px 10px' }}>
                  <p style={{ color: C.kpiLabel, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</p>
                  <p className="mt-1" style={{ color: C.text, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-2" style={{ color: C.kpiLabel, fontSize: 10.5, lineHeight: 1.45 }}>
              Premium split: {riskSharePct.toFixed(0)}% to JT / {liqSharePct.toFixed(0)}% to SLP · {observationDays}-day recovery window · JT capital {maintainCoverage ? 'restored' : 'not restored'} after finalized losses
            </p>
          </>
        )}

        {showInputs && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2" style={{ gap: 8 }}>
            <div style={{ background: `${C.strategyLine}14`, border: `1px solid ${C.strategyLine}`, borderRadius: 10, padding: 12 }}>
              <SliderControl
                label="Strategy base-asset APY (%)"
                value={sourceApyPct}
                min={0}
                max={30}
                step={0.1}
                display={`${sourceApyPct.toFixed(1)}%`}
                description={isGuided ? "Annualized return applied to the selected source history." : ""}
                tone={C.muted}
                labelColor={C.muted}
                onChange={setSourceApyPct}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <SliderControl
                label="Minimum coverage requirement (%)"
                value={coveragePct}
                min={3}
                max={65}
                step={1}
                display={`${coveragePct.toFixed(0)}%`}
                description={isGuided ? "How much JT first-loss capital the market requires relative to ST and JT combined." : ""}
                onChange={setCoveragePct}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <SliderControl
                label="Minimum liquidity requirement (%)"
                value={minLiquidityPct}
                min={1}
                max={50}
                step={1}
                display={`${minLiquidityPct.toFixed(0)}%`}
                description={isGuided ? "How much SLP capital the market requires relative to ST." : ""}
                onChange={setMinLiquidityPct}
              />
            </div>
            {isGuided && (
              <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                <SliderControl
                  label="E-CLP downside band (%)"
                  value={eclpBandWidthPct}
                  min={0.25}
                  max={20}
                  step={0.25}
                  display={`${formatEclpBandPercent(eclpBandWidthPct)}% · $${formatEclpFloor(eclpBandWidthPct)} floor`}
                  description="How far the pool price can move below $1. Very tight bands concentrate nearly all executable liquidity close to par; wider bands allow more price movement."
                  tone={C.olive}
                  labelColor={C.olive}
                  onChange={setEclpBandWidthPct}
                >
                  <div aria-label="E-CLP band presets" className="mt-2 grid grid-cols-2 sm:grid-cols-4" role="group" style={{ gap: 6 }}>
                    {[
                      { label: 'Near par', value: 0.5 },
                      { label: 'Very tight', value: 1 },
                      { label: 'Tight', value: 3 },
                      { label: 'Standard', value: 10 },
                    ].map((preset) => {
                      const active = eclpBandWidthPct === preset.value;
                      return (
                        <button
                          aria-pressed={active}
                          key={preset.value}
                          onClick={() => setEclpBandWidthPct(preset.value)}
                          style={{
                            background: active ? `${C.olive}14` : C.cardBg,
                            border: `1px solid ${active ? C.olive : C.border}`,
                            color: active ? C.olive : C.muted,
                            fontFamily: MONO,
                            fontSize: 9.5,
                            fontWeight: 700,
                            minHeight: 30,
                            padding: '6px 8px',
                            textTransform: 'uppercase',
                          }}
                          type="button"
                        >
                          {preset.label} · {formatEclpBandPercent(preset.value)}%
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3" style={{ color: C.kpiLabel, fontFamily: MONO, fontSize: 9 }}>
                    <span>Tighter · more depth near $1</span>
                    <span>Wider · more downside range</span>
                  </div>
                </SliderControl>
              </div>
            )}
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <SliderControl
                label="JT risk premium (% of ST yield)"
                value={riskSharePct}
                min={0}
                max={80}
                step={1}
                display={`${riskSharePct.toFixed(0)}%`}
                description={isGuided ? "The share of ST yield paid to JT for taking losses first." : ""}
                onChange={(value) => {
                  setRiskSharePct(value);
                  if (value + liqSharePct > 100) setLiqSharePct(100 - value);
                }}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <SliderControl
                label="SLP liquidity premium (% of ST yield)"
                value={liqSharePct}
                min={0}
                max={80}
                step={1}
                display={`${liqSharePct.toFixed(0)}%`}
                description={isGuided ? "The share of ST yield paid to SLP for providing secondary liquidity." : ""}
                onChange={(value) => {
                  setLiqSharePct(value);
                  if (value + riskSharePct > 100) setRiskSharePct(100 - value);
                }}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <SliderControl
                label="Observation Period duration (days)"
                value={observationDays}
                min={7}
                max={194}
                step={1}
                display={`${observationDays} days`}
                description={isGuided ? "How long the source has to recover before a covered JT loss is finalized." : ""}
                onChange={setObservationDays}
              />
            </div>
            {isGuided && (
              <label
                className="flex cursor-pointer items-center gap-3"
                style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, fontSize: 11.5, lineHeight: 1.4, padding: 12 }}
              >
                <input
                  checked={maintainCoverage}
                  onChange={(event) => setMaintainCoverage(event.target.checked)}
                  style={{ accentColor: C.accent }}
                  type="checkbox"
                />
                <span>
                  <strong style={{ color: C.text, display: 'block', fontWeight: 600 }}>Restore JT after finalized losses</strong>
                  Adds fresh JT capital to rebuild the minimum coverage buffer.
                </span>
              </label>
            )}
          </div>
        )}
      </section>}

      {isGuided && endStep && (
        <section style={guidedSectionStyle}>
          <Eyebrow>Market snapshot</Eyebrow>
          <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 500, letterSpacing: '-0.025em', lineHeight: 1.12 }}>
            One source, three different jobs
          </h2>
          <p className="mt-1 max-w-4xl" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
            {activeMarket.provenance.dataMode === 'published-apy-forward'
              ? `Modeled from the published ${((activeMarket.provenance.publishedApy ?? defaults.sourceApy) * 100).toFixed(1)}% APY.`
              : `Modeled from ${view.length} ${activeMarket.provenance.dataCadence} source values, ${startDate} to ${endDate}.`}{' '}
            Not live performance or a forecast.
          </p>
          <div className="mt-3 overflow-x-auto" style={{ border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 720, textAlign: 'left' }}>
              <thead style={{ background: C.pageBg }}>
                <tr>
                  {['Position', 'What it does', 'End value', 'Avg / year', 'Worst drop'].map((label) => (
                    <th
                      key={label}
                      style={{
                        borderBottom: `1px solid ${C.border}`,
                        color: C.kpiLabel,
                        fontSize: 8.5,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        padding: '8px 10px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Source', 'Baseline', from100(endStep.strategy), pct(result.strategyApy), drawdownPct(result.strategyMaxDrawdown), C.strategyLine],
                  ['ST', 'Protected by JT first-loss capital', from100(endStep.senior), pct(result.seniorApy), drawdownPct(result.seniorMaxDrawdown), C.seniorLine],
                  ['JT', 'Takes first loss; earns risk premium', from100(endStep.junior), pct(result.juniorApy), drawdownPct(result.juniorMaxDrawdown), C.juniorLine],
                  ['SLP', 'Provides liquidity for ST', from100(endStep.liquidity), pct(result.liquidityApy), drawdownPct(result.liquidityMaxDrawdown), C.olive],
                ].map(([position, role, ending, apy, drawdown, color], index) => (
                  <tr key={position} style={{ background: index % 2 === 0 ? C.cardBg : C.pageBg }}>
                    <td style={{ borderBottom: index < 3 ? `1px solid ${C.border}` : undefined, color, fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: '10px' }}>{position}</td>
                    <td style={{ borderBottom: index < 3 ? `1px solid ${C.border}` : undefined, color: C.muted, fontSize: 11.5, padding: '10px' }}>{role}</td>
                    <td style={{ borderBottom: index < 3 ? `1px solid ${C.border}` : undefined, color, fontFamily: MONO, fontSize: 14, fontWeight: 600, padding: '10px' }}>{ending}</td>
                    <td style={{ borderBottom: index < 3 ? `1px solid ${C.border}` : undefined, color: C.text, fontFamily: MONO, fontSize: 11.5, padding: '10px' }}>{apy}</td>
                    <td style={{ borderBottom: index < 3 ? `1px solid ${C.border}` : undefined, color: C.text, fontFamily: MONO, fontSize: 11.5, padding: '10px' }}>{drawdown}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!isExecutive && !isGuided && <section style={{ ...cardStyle, padding: 14 }}>
        <Eyebrow>Simulated APYs</Eyebrow>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
          <Kpi label="ST avg/yr" value={`${pct(result.seniorApy)}/yr`} valueColor={C.accent} />
          <Kpi label="JT avg/yr" value={`${pct(result.juniorApy)}/yr`} valueColor={C.text} />
          <Kpi label="SLP avg/yr" value={`${pct(result.liquidityApy)}/yr`} valueColor={C.olive} />
        </div>
      </section>}

      {showSection('liquidity-and-coverage') && <section className="grid grid-cols-1 md:grid-cols-2" style={isGuided ? { borderBottom: `1px solid ${C.border}`, gap: 0 } : { gap: 10 }}>
        <div
          className={isGuided ? "border-b md:border-b-0 md:border-r" : undefined}
          style={isGuided
            ? { background: 'transparent', borderColor: C.border, padding: 16 }
            : { ...cardStyle, padding: 14 }}
        >
          {isExecutive
            ? <Eyebrow>If an ST holder wants to sell</Eyebrow>
            : <Eyebrow>{isGuided ? 'Key risk · Liquidity' : 'Secondary liquidity'}</Eyebrow>}
          {isGuided && (
            <>
              <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.12 }}>
                How much ST can sell?
              </h2>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Larger atomic sales move the price down. Arbitrage between sales can reopen capacity.
              </p>
              <div className="mt-3">
                <p style={{ color: C.olive, fontFamily: MONO, fontSize: 28, fontWeight: 600, letterSpacing: '-0.05em' }}>
                  {(result.explainer.liquidity.referenceSellShareOfSenior * 100).toFixed(1)}% of ST
                </p>
                <p style={{ color: C.text, fontSize: 11.5 }}>
                  can sell at about {(result.explainer.liquidity.referenceQuote.slippage * 100).toFixed(1)}% average slippage
                </p>
                <div
                  aria-label={`${(result.explainer.liquidity.referenceSellShareOfSenior * 100).toFixed(1)} percent near-par capacity and ${(result.explainer.liquidity.boundarySellShareOfSenior * 100).toFixed(1)} percent maximum atomic capacity`}
                  className="mt-3"
                  role="img"
                  style={{ background: C.pageBg, borderRadius: 9999, height: 9, overflow: 'hidden', position: 'relative' }}
                >
                  <div style={{ background: `${C.seniorLine}35`, height: '100%', width: `${Math.min(100, result.explainer.liquidity.boundarySellShareOfSenior * 100)}%` }} />
                  <div style={{ background: C.olive, height: '100%', left: 0, position: 'absolute', top: 0, width: `${Math.min(100, result.explainer.liquidity.referenceSellShareOfSenior * 100)}%` }} />
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.4 }}>
                  Up to <strong style={{ color: C.seniorLine, fontWeight: 600 }}>{(result.explainer.liquidity.boundarySellShareOfSenior * 100).toFixed(1)}%</strong> can fill atomically at the current boundary, averaging {(result.explainer.liquidity.boundaryQuote.slippage * 100).toFixed(1)}% below marked redemption value.
                </p>
              </div>
            </>
          )}
          {isExecutive && (
            <>
              <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.12 }}>
                Sell immediately through the SLP pool.
              </h2>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                ST can sell at the pool&apos;s current market price instead of waiting for primary redemption.
              </p>
            </>
          )}
          {isGuided && (
            <button
              aria-expanded={showLiquidityDetail}
              onClick={() => setShowLiquidityDetail((value) => !value)}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.accent,
                fontFamily: MONO,
                fontSize: 9.5,
                fontWeight: 700,
                marginTop: 10,
                minHeight: 32,
                padding: '7px 10px',
                textTransform: 'uppercase',
              }}
              type="button"
            >
              {showLiquidityDetail ? 'Hide curve' : 'See liquidity curve'}
            </button>
          )}
          {(!isGuided || showLiquidityDetail) && <LiquidityExecutionDiagram metrics={result.explainer.liquidity} />}
          {(isGuided || isExecutive) && (
            <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
              Modeled quotes only. The sequence does not guarantee arbitrage timing, total fill, or realized price.
            </p>
          )}
        </div>

        <div style={isGuided
          ? { background: 'transparent', padding: 16 }
          : { ...cardStyle, padding: 14 }}
        >
          {isExecutive
            ? <Eyebrow>Loss waterfall</Eyebrow>
            : <Eyebrow>{isGuided ? 'Key risk · Loss protection' : 'First-loss coverage'}</Eyebrow>}
          {isGuided && (
            <>
              <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.12 }}>
                When does ST lose money?
              </h2>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                JT absorbs losses first; losses beyond that buffer reduce ST.
              </p>
              <div className="mt-3">
                <p style={{ color: C.olive, fontFamily: MONO, fontSize: 28, fontWeight: 600, letterSpacing: '-0.05em' }}>
                  {(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% source loss
                </p>
                <p style={{ color: C.text, fontSize: 11.5 }}>before ST starts falling below $100</p>
                <div
                  aria-label={`ST is covered through ${(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)} percent source loss on the displayed ${(result.explainer.coverage.displayMaxLoss * 100).toFixed(1)} percent loss range`}
                  className="mt-3 flex"
                  role="img"
                  style={{ background: `${C.danger}18`, borderRadius: 9999, height: 9, overflow: 'hidden' }}
                >
                  <div style={{ background: C.olive, width: `${Math.min(100, result.explainer.coverage.coverageLossLimit / result.explainer.coverage.displayMaxLoss * 100)}%` }} />
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.4 }}>
                  If the source loses {(result.explainer.coverage.displayMaxLoss * 100).toFixed(1)}%, <strong style={{ color: C.danger, fontWeight: 600 }}>$100 of ST falls to ${result.explainer.coverage.endingSeniorBalancePer100.toFixed(0)}</strong>.
                </p>
              </div>
            </>
          )}
          {isExecutive && (
            <>
              <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.12 }}>
                JT absorbs losses before ST.
              </h2>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                The minimum coverage requirement sets the JT buffer, but does not guarantee ST principal against losses beyond that buffer.
              </p>
            </>
          )}
          {isGuided && (
            <button
              aria-expanded={showCoverageDetail}
              onClick={() => setShowCoverageDetail((value) => !value)}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.accent,
                fontFamily: MONO,
                fontSize: 9.5,
                fontWeight: 700,
                marginTop: 10,
                minHeight: 32,
                padding: '7px 10px',
                textTransform: 'uppercase',
              }}
              type="button"
            >
              {showCoverageDetail ? 'Hide curve' : 'See loss curve'}
            </button>
          )}
          {(!isGuided || showCoverageDetail) && <CoverageLossDiagram metrics={result.explainer.coverage} />}
          {(isGuided || isExecutive) && (
            <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
              Coverage is a buffer, not a guarantee. ST declines after about {(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% of base-asset loss.
            </p>
          )}
        </div>
      </section>}

      {isExecutive && showSection('observation-period') && sourceHasObservedDrawdown && (
        <section style={{ ...cardStyle, padding: 16 }}>
          <Eyebrow>What is an Observation Period?</Eyebrow>
          <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 24, fontWeight: 400, lineHeight: 1.12 }}>
            A defined recovery window after JT begins covering an ST drawdown.
          </h2>
          <p className="mt-2 max-w-3xl" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.45 }}>
            The window gives the strategy base asset time to recover before JT&apos;s covered loss is finalized. ST can still sell through the SLP pool while direct ST and JT deposits and redemptions are paused.
          </p>
          <GuidedObservationSteps days={observationDays} generalizeObservation />
        </section>
      )}

      {showSection('backtest') && <section style={isGuided ? guidedSectionStyle : cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            {forwardTest
              ? <Eyebrow>Forward test</Eyebrow>
              : <Eyebrow>{isGuided ? 'Full history · Optional' : 'Backtest'}</Eyebrow>}
            <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08 }}>
              {forwardTest
                ? `Test the ${forwardTest.termDays}-day facility under ${forwardTest.scenarios.length} payment outcomes.`
                : isExecutive
                  ? 'See it in the market history.'
                  : isGuided
                    ? 'See how $100 changed through the selected history.'
                    : DAY_LOCKED_COPY.reviewTitle}
            </h2>
            <p className="mt-1" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38 }}>
              {forwardTest
                ? 'The shared accountant applies each forward path to the strategy base asset, ST, JT, and SLP. Select an outcome to compare timing and loss absorption.'
                : isExecutive
                ? 'This accountant-backed chart shows each position, every Observation Period, and every finalized loss.'
                : isGuided
                ? 'This applies the current assumptions to the source data. It is not the historical performance of a live Royco Day market.'
                : DAY_LOCKED_COPY.reviewDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowReview((value) => !value)}
            aria-label={showReview ? 'Collapse' : 'Expand'}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              color: C.accent,
              width: isGuided ? 'auto' : 28,
              height: 28,
              fontFamily: MONO,
              fontSize: isGuided ? 9.5 : 18,
              fontWeight: isGuided ? 700 : 400,
              letterSpacing: isGuided ? '0.08em' : undefined,
              lineHeight: 1,
              background: 'transparent',
              flexShrink: 0,
              padding: isGuided ? '0 10px' : 0,
              textTransform: isGuided ? 'uppercase' : undefined,
            }}
          >
            {isGuided ? (showReview ? 'Hide history' : 'Show history') : (showReview ? '−' : '+')}
          </button>
        </div>

        {showReview && (
          <div className="mt-4">
            {forwardTest && reverseMarket && (
              <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingBottom: 14 }}>
                <div
                  aria-label="Forward scenario"
                  className={`grid grid-cols-1 ${forwardTest.scenarios.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
                  role="tablist"
                  style={{ gap: 8 }}
                >
                  {forwardTest.scenarios.map((scenario) => {
                    const active = scenario.id === forwardScenario;
                    return (
                      <button
                        aria-selected={active}
                        key={scenario.id}
                        onClick={() => {
                          setForwardScenario(scenario.id);
                          setRange({ a: 0, b: Number.MAX_SAFE_INTEGER });
                        }}
                        role="tab"
                        type="button"
                        style={{
                          background: active ? `${C.eyebrow}12` : C.cardBg,
                          border: `1px solid ${active ? C.eyebrow : C.border}`,
                          color: active ? C.text : C.muted,
                          cursor: 'pointer',
                          padding: '10px 12px',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                          {scenario.label}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, lineHeight: 1.4, marginTop: 5 }}>
                          {scenario.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
                  <ExecutiveMetric label="Total strategy cap" value={usd0(reverseMarket.strategyCap)} valueColor={C.text} />
                  <ExecutiveMetric label="ST cap" value={usd0(reverseMarket.seniorCap)} valueColor={C.accent} />
                  <ExecutiveMetric label={`${reverseMarket.issuerName} JT commitment`} value={usd0(reverseMarket.juniorCap)} valueColor={C.juniorLine} />
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 11, lineHeight: 1.45 }}>
                  {reverseMarket.seniorSupportLabel}: {usd0(reverseMarket.seniorSupportAmount)}. JT deposits are closed and issuer-funded. SLP uses the shared 10% ST / 90% stable-asset composition.
                </p>
                {selectedForwardScenario && (
                  <p className="mt-1" style={{ color: C.kpiLabel, fontSize: 10.5, lineHeight: 1.45 }}>
                    Selected outcome: {selectedForwardScenario.description}
                  </p>
                )}
              </div>
            )}
            {isGuided && <GuidedChartGuide />}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-3" style={{ fontSize: 11.5, color: C.muted }}>
              <LegendSwatch color={C.seniorLine}>ST share price</LegendSwatch>
              <LegendSwatch color={C.juniorLine}>JT share price</LegendSwatch>
              <LegendSwatch color={C.olive}>SLP share price</LegendSwatch>
              <LegendSwatch color={C.strategyLine}>Strategy base asset</LegendSwatch>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>●</span> JT loss finalized
              </span>
              <span className="flex items-center gap-2">
                <span style={{ color: C.danger }}>●</span> ST loss event
              </span>
              <span className="flex items-center gap-2">
                <span style={{ width: 18, height: 10, background: C.obsFill, opacity: 0.32, display: 'inline-block' }} />
                Observation Period
              </span>
              {isNativeReturnUnit && (
                <span style={{ color: C.eyebrow, fontFamily: MONO, fontWeight: 600 }}>
                  Return basis: {returnUnit}
                </span>
              )}
            </div>
            <div ref={chartContainerRef} style={{ width: '100%', minWidth: 0, height: 360, minHeight: 360 }}>
              <ResponsiveContainerNoSSR>
                <LineChart
                  data={displayChart}
                  margin={{ top: 8, right: 68, bottom: 8, left: 0 }}
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
                    domain={[yMin, chartYMax]}
                    label={isNativeReturnUnit
                      ? {
                        value: `${returnUnit}-relative index (start = 100)`,
                        angle: -90,
                        position: 'insideLeft',
                        fill: C.kpiLabel,
                        fontSize: 11,
                      }
                      : {
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
                  <Line type="monotone" dataKey="strategy" name="Strategy base asset" stroke={C.strategyLine} dot={false} strokeWidth={1.3} />
                  <Line type="monotone" dataKey="junior" name="JT" stroke={C.juniorLine} dot={false} strokeWidth={2.2} />
                  <Line type="monotone" dataKey="senior" name="ST" stroke={C.seniorLine} dot={false} strokeWidth={2.2} />
                  <Line type="monotone" dataKey="liquidity" name="SLP" stroke={C.olive} dot={false} strokeWidth={2.2} />
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
                          beamLabel={formatDayErasureLabel(event.forfeitPctOfJuniorNav)}
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
                      shape={
                        <EndValueTag
                          text={`JT ${endStep.junior.toFixed(0)}`}
                          color={C.juniorLine}
                          tagIndex={0}
                          peerValues={[endStep.junior, endStep.senior, endStep.liquidity]}
                          yMin={yMin}
                          yMax={chartYMax}
                        />
                      }
                    />
                  )}
                  {endStep && (
                    <ReferenceDot
                      x={endStep.date}
                      y={endStep.senior}
                      shape={
                        <EndValueTag
                          text={`ST ${endStep.senior.toFixed(0)}`}
                          color={C.seniorLine}
                          tagIndex={1}
                          peerValues={[endStep.junior, endStep.senior, endStep.liquidity]}
                          yMin={yMin}
                          yMax={chartYMax}
                        />
                      }
                    />
                  )}
                  {endStep && (
                    <ReferenceDot
                      x={endStep.date}
                      y={endStep.liquidity}
                      shape={
                        <EndValueTag
                          text={`SLP ${endStep.liquidity.toFixed(0)}`}
                          color={C.olive}
                          tagIndex={2}
                          peerValues={[endStep.junior, endStep.senior, endStep.liquidity]}
                          yMin={yMin}
                          yMax={chartYMax}
                        />
                      }
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

            {backtestDisplay?.footnote && (
              <p className="mt-2" style={{ color: C.kpiLabel, fontSize: 10.5, lineHeight: 1.45 }}>
                {backtestDisplay.footnote}
              </p>
            )}

            {forwardTest?.tailRiskDisclosure && (
              <p className="mt-2" style={{ color: C.danger, fontSize: 10.5, lineHeight: 1.45 }}>
                Tail risk: {forwardTest.tailRiskDisclosure}
              </p>
            )}

            {isGuided && <GuidedObservationSteps days={observationDays} />}

            <DayTimeframeBrush
              dates={allDates}
              series={displayedBrushSeries}
              bands={brushBands}
              view={displayedViewRange}
              isFull={isFullRange(displayedViewRange, displayMaxIndex)}
              mode={forwardTest ? 'forward' : 'backtest'}
              onChange={setDisplayedRange}
            />

            {isGuided && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: C.border }}>
                <div>
                  <p style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>Monthly return table</p>
                  <p className="mt-0.5" style={{ color: C.muted, fontSize: 10.5 }}>For users who want every monthly change.</p>
                </div>
                <button
                  aria-expanded={showMonthly}
                  onClick={() => setShowMonthly((value) => !value)}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${C.border}`,
                    color: C.accent,
                    fontFamily: MONO,
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    minHeight: 30,
                    padding: '0 10px',
                    textTransform: 'uppercase',
                  }}
                  type="button"
                >
                  {showMonthly ? 'Hide table' : 'Show table'}
                </button>
              </div>
            )}

            {(!isGuided || showMonthly) && <div className="mt-4 overflow-x-auto">
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
                      {isNativeReturnUnit
                        ? `end index → avg/yr (${returnUnit})`
                        : 'end $100 → avg/yr'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ReturnRow label="Strategy base asset" values={result.monthly.map((row) => row.strategyReturn)} end={endStep?.strategy ?? 100} annualized={result.strategyApy} showCurrency={!isNativeReturnUnit} />
                  <ReturnRow label="ST return" values={result.monthly.map((row) => row.seniorReturn)} end={endStep?.senior ?? 100} annualized={result.seniorApy} showCurrency={!isNativeReturnUnit} />
                  <ReturnRow label="JT return" values={result.monthly.map((row) => row.juniorReturn)} end={endStep?.junior ?? 100} annualized={result.juniorApy} showCurrency={!isNativeReturnUnit} />
                  <ReturnRow label="SLP return" values={result.monthly.map((row) => row.liquidityReturn)} end={endStep?.liquidity ?? 100} annualized={result.liquidityApy} showCurrency={!isNativeReturnUnit} />
                </tbody>
              </table>
            </div>}
          </div>
        )}
      </section>}

      {showSection('junior-funding') && !isGuided && <section style={{ ...cardStyle, borderLeft: `3px solid ${C.accent}` }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>{isGuided ? 'Model assumption' : 'JT funding assumption'}</Eyebrow>
            {isGuided && (
              <p className="mt-1" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4 }}>
                Decide whether fresh JT capital replaces first-loss capital after a finalized loss.
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: C.muted, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={maintainCoverage}
              onChange={(event) => setMaintainCoverage(event.target.checked)}
              style={{ accentColor: C.accent }}
            />
            {isGuided ? 'Add fresh JT capital after a finalized loss' : 'Add JT capital after finalized losses'}
          </label>
        </div>
        <p className="mt-2" style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
          {maintainCoverage
            ? `Fresh JT capital is added after each Observation Period closes to restore the ${coveragePct.toFixed(0)}% minimum coverage requirement. This run adds ${usd0(result.juniorCapitalInjected)}.`
            : 'No fresh JT capital is added after finalized losses, so coverage can remain below its starting level.'}
        </p>
        <p className="mt-3" style={{ color: C.kpiLabel, fontSize: 11, lineHeight: 1.45 }}>
          Illustrative parameters. Not an offer or investment advice.
        </p>
      </section>}

      {showSection('disclosure') && <footer
        style={{
          background: isGuided ? C.pageBg : undefined,
          color: C.kpiLabel,
          fontSize: 11,
          lineHeight: 1.45,
          padding: isGuided ? 16 : undefined,
        }}
        className={isGuided ? undefined : "pb-8 border-t pt-4"}
      >
        <p style={{ borderColor: C.border }}>
          <strong style={{ fontWeight: 600 }}>What this is, and what it is not.</strong>{' '}
          {activeMarket.provenance.dataMode === 'published-apy-forward'
            ? `The strategy base asset source is ${activeMarket.provenance.source}. This forward test uses the published ${(activeMarket.provenance.publishedApy ?? defaults.sourceApy) * 100}% APY and does not present historical performance.`
            : `The strategy base asset source is ${activeMarket.provenance.source}, covering ${startDate} through ${endDate}.`}
        </p>
        <p className="mt-1">{activeMarket.copy.disclosure}</p>
        <p className="mt-1">
          Source:{' '}
          {activeMarket.provenance.sourceUrl
            ? (
              <a href={activeMarket.provenance.sourceUrl} rel="noreferrer" style={{ color: C.eyebrow, overflowWrap: 'anywhere' }} target="_blank">
                {activeMarket.provenance.sourceUrl}
              </a>
            )
            : `${activeMarket.provenance.sourceProvider} · ${activeMarket.provenance.source}`}
        </p>
        {activeMarket.provenance.supportingSources?.map((source) => (
          <p className="mt-1" key={source.url}>
            Supporting source:{' '}
            <a href={source.url} rel="noreferrer" style={{ color: C.eyebrow, overflowWrap: 'anywhere' }} target="_blank">
              {source.label}
            </a>
          </p>
        ))}
      </footer>}
    </div>
  );
}

function ReturnRow({
  label,
  values,
  end,
  annualized,
  showCurrency,
}: {
  label: string;
  values: number[];
  end: number;
  annualized: number;
  showCurrency: boolean;
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
        <b>{showCurrency ? '$' : ''}{end.toFixed(0)}</b>{' '}
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
