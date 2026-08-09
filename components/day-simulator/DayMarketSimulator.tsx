'use client';

import dynamic from 'next/dynamic';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import { applySourceStress, calibrateSeriesApy, hasObservedDrawdown } from '@/lib/day-simulator-template/series';
import { ydmShare } from '@/lib/day/engine/ydm';
import {
  decodeDayDesign,
  encodeDayDesign,
} from '@/lib/day-simulator-template/permalink';
// A preset that moved only the requirement left the premium behind: at target
// utilization the YDM share is yTarget regardless of pool size, so raising SLP
// liquidity changed the pool without changing what Sr paid for it.
import {
  DAY_JR_PREMIUM_PER_COVERAGE,
  DAY_SLP_PREMIUM_PER_LIQUIDITY,
} from '@/lib/day-simulator-template/issuer-presets';
import {
  matchDayIssuerPreset,
} from '@/lib/day-simulator-template/issuer-presets';
import {
  buildDayConfigExport,
  DAY_DEPLOYMENT_TERM_BOUNDS,
  dayConfigExportFilename,
  EMPTY_DAY_DEPLOYMENT_FIELDS,
  parseDayDeploymentTerm,
  type DayDeploymentFieldId,
  type DayDeploymentFieldValues,
} from '@/lib/day-simulator-template/config-export';
import { shouldRefillJunior } from '@/lib/day-simulator-template/refill';
import {
  buildDayFiniteForwardSeries,
  buildDayInitialBalances,
  buildDayMarketConfig,
  buildDayForwardSeries,
  DAY_TARGET_UTILIZATION,
} from '@/lib/day-simulator-template/runtime';
import {
  DayChartTooltip,
  useDayChartHover,
} from '@/components/day-simulator/DayChartTooltip';
import DayGuidedTutorial from '@/components/day-simulator/DayGuidedTutorial';
import DayLearningExperience from '@/components/day-simulator/DayLearningExperience';
import DayDeploymentInputs from '@/components/day-simulator/DayDeploymentInputs';
import { DayTimeframeBrush } from '@/components/day-simulator/DayTimeframeBrush';
import {
  DAY_INPUT_PANEL,
  DAY_SIMULATOR_SURFACE,
  DAY_SIMULATOR_THEME,
  DAY_SIMULATOR_TYPE,
  DayButton,
  DayEyebrow,
  DaySectionHeader,
  DayZoneHeader,
} from '@/components/day-simulator/DaySimulatorUI';

const ResponsiveContainerNoSSR = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);

// Royco Explorer visual contract. Tranche colors remain semantic.
const C = DAY_SIMULATOR_THEME;

const SERIF = DAY_SIMULATOR_TYPE.sans;
const MONO = DAY_SIMULATOR_TYPE.mono;
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
  borderColor: C.border,
  borderRadius: 12,
  borderStyle: 'solid',
  borderWidth: 1,
  padding: 14,
  boxShadow: '0 1px 2px rgba(29,28,25,.035)',
} as const;

const sectionCardStyle = {
  ...cardStyle,
  padding: 16,
  scrollMarginTop: 16,
} as const;

// Controls are recessed, results are raised. See DAY_SIMULATOR_SURFACE.
const inputSectionCardStyle = {
  ...DAY_SIMULATOR_SURFACE.input,
  borderRadius: 12,
  padding: 16,
  scrollMarginTop: 16,
} as const;

// Opaque so a selected preset reads the same on the white output surfaces and
// on the recessed input zone; a translucent wash muddies against the latter.
const PRESET_ACTIVE_BG = '#FAEFE6';




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
        fontSize: 13,
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
          `Jr recovery claim reset (${erasure.reason}): ${erasure.forfeitPctOfJuniorNav.toFixed(1)}% of Jr NAV at the time`,
        )}
      {seniorLoss &&
        row('●', C.danger, `Sr loss event: $${seniorLoss.lossIndexPts.toFixed(2)} per $100 of Sr`)}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <DayEyebrow>{children}</DayEyebrow>;
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={className}
      style={{
        color: C.text,
        fontFamily: SERIF,
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: '-0.025em',
        lineHeight: 1.12,
      }}
    >
      {children}
    </h2>
  );
}

function PanelTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={className}
      style={{ color: C.text, fontFamily: SERIF, fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}
    >
      {children}
    </h3>
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
        <p className="mt-2" style={{ color: noteColor, fontSize: 11.5, lineHeight: 1.5 }}>
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
    ? `Atomic Sr sale into the current SLP pool with no intervening arbitrage. The current pool can fill ${(
      atomicCapacity * 100
    ).toFixed(1)}% of opening Sr NAV before reaching its boundary.`
    : `Illustrative sale of the full Sr position across ${cycleCount} segments. Each new segment assumes arbitrage fully recenters the SLP pool to marked redemption value. This is not a timing or fill guarantee.`;

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
                fontSize: 10,
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
            ? 'Sr sold in one atomic transaction (% of all Sr NAV)'
            : 'Cumulative Sr sold across arbitrage-assisted segments'}
        </text>
      </svg>
      {hoveredPoint && (
        <DayChartTooltip
          title={mode === 'atomic' ? 'Atomic SLP quote' : `Illustrative sale segment ${hoveredPoint.cycle}`}
          xPct={(hoveredPoint.share / xMaximum) * 100}
          rows={[
            {
              label: mode === 'atomic' ? 'Sr offered' : 'Cumulative Sr sold',
              value: `${(hoveredPoint.share * 100).toFixed(1)}%`,
            },
            ...(mode === 'arbitrage'
              ? [
                  {
                    label: 'Current sale segment',
                    value: `${(hoveredPoint.batchShare * 100).toFixed(1)}% of Sr`,
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
  const juniorZoneLabel = 'Jr absorbs loss';
  const seniorZoneLabel = 'Sr absorbs excess';
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
        aria-label={`Sr stays at $100 through a ${(metrics.coverageLossLimit * 100).toFixed(1)}% base-asset loss, then declines to $${metrics.endingSeniorBalancePer100.toFixed(1)} at a ${(metrics.displayMaxLoss * 100).toFixed(1)}% loss. Hover, tap, or focus and use the arrow keys to inspect the chart.`}
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
          Sr $ balance
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
              label: 'Sr value',
              value: `$${hoveredLossPoint.seniorBalancePer100.toFixed(1)}`,
              color: hoveredLossPoint.seniorBalancePer100 >= 100 - 1e-8 ? C.olive : C.danger,
            },
            {
              label: 'Jr buffer',
              value: hoveredLossPoint.loss <= metrics.coverageLossLimit ? 'Protecting Sr' : 'Exhausted',
              color: hoveredLossPoint.loss <= metrics.coverageLossLimit ? C.olive : C.danger,
            },
          ]}
          note={hoveredLossPoint.loss <= metrics.coverageLossLimit
            ? 'Jr absorbs this modeled source loss before Sr.'
            : 'The modeled Jr buffer is depleted, so additional loss reaches Sr.'}
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
      style={{ borderBottom: `1px solid ${C.border}`, gap: 12, paddingBottom: 10 }}
    >
      <div style={itemStyle}>
        <svg aria-hidden="true" height="24" viewBox="0 0 42 24" width="42">
          <line x1="1" x2="19" y1="7" y2="7" stroke={C.seniorLine} strokeWidth="2" />
          <line x1="23" x2="41" y1="7" y2="7" stroke={C.juniorLine} strokeWidth="2" />
          <line x1="1" x2="19" y1="17" y2="17" stroke={C.olive} strokeWidth="2" />
          <line x1="23" x2="41" y1="17" y2="17" stroke={C.strategyLine} strokeWidth="2" />
        </svg>
        <span style={copyStyle}>Each line is $100 in one position.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ background: C.obsFill, height: 24, opacity: 0.32, width: 28 }} />
        <span style={copyStyle}>A shaded band is an Observation Period.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ background: C.danger, borderRadius: 9999, height: 9, width: 9 }} />
        <span style={copyStyle}>A Jr mark means its covered loss was finalized.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ border: `2px solid ${C.danger}`, borderRadius: 9999, height: 10, width: 10 }} />
        <span style={copyStyle}>An Sr mark means loss reached Sr.</span>
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
      body: 'Jr covers Sr first. The covered amount becomes Jr’s first claim on a recovery.',
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
        ? `Its duration is market-specific (${days} days here). Direct Sr and Jr deposits and redemptions pause; SLP redemptions pause. Sr can still sell through the SLP pool.`
        : 'Direct Sr and Jr deposits and redemptions pause; SLP redemptions pause. Sr can still sell through the SLP pool.',
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 66">
          <rect x={observationStartX} y="2" width={observationEndX - observationStartX} height="48" fill={C.obsFill} fillOpacity="0.32" />
          <line x1="5" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,18 48,16 72,15 84,24 111,38 142,30 174,24 205,22" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <polyline points="5,18 48,16 72,15 142,15 174,13 205,11" fill="none" stroke={C.seniorLine} strokeWidth="2" />
          <text x={(observationStartX + observationEndX) / 2} y="63" fill={C.eyebrow} fontFamily={MONO} fontSize="10" textAnchor="middle">
            {days}d
          </text>
        </svg>
      ),
    },
    {
      number: '3',
      title: 'Recover or finalize',
      body: generalizeObservation
        ? "A full recovery restores Jr. If the window ends before full recovery, Jr's covered loss is finalized."
        : "Recovery restores Jr first. If the window ends before recovery, Jr's covered loss is finalized.",
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 54">
          <rect x="5" y="2" width={recoveryObservationEndX - 5} height="48" fill={C.obsFill} fillOpacity="0.32" />
          <rect x="116" y="2" width={finalizationObservationEndX - 116} height="48" fill={C.obsFill} fillOpacity="0.32" />
          <line x1="5" x2="95" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,15 28,18 49,34 72,23 83,15 95,10" fill="none" stroke={C.olive} strokeWidth="2" />
          <text x="105" y="30" fill={C.kpiLabel} fontFamily={MONO} fontSize="10" textAnchor="middle">OR</text>
          <line x1="116" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="116,15 140,19 162,34 194,34 205,34" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <circle cx={finalizationObservationEndX} cy="34" r="4" fill={C.danger} />
        </svg>
      ),
    },
  ];
  return (
    <div
      className="mt-4 grid grid-cols-1 lg:grid-cols-3"
      style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}
    >
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
        <label style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          {label}
        </label>
        <span style={{ color: C.accent, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{display}</span>
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
        style={{ accentColor: C.accent, height: 22 }}
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

// Utilization is the one dimension the rest of the page holds still. The
// premiums Sr pays are curves in it, so a design that shows only the value at
// the 90% target hides how the split behaves as a tranche fills or empties.
// This reads the accountant's own YDM curve; it is not an issuer control,
// because target utilization is fixed by the protocol.
function YieldShareCurve({
  curve,
  color,
  label,
  scrubUtilization,
  targetUtilization,
}: {
  curve: { y0: number; yTarget: number; y100: number };
  color: string;
  label: string;
  scrubUtilization: number;
  targetUtilization: number;
}) {
  const W = 260, H = 120, PAD_L = 30, PAD_B = 22, PAD_T = 8;
  const maxU = 1;
  const x = (u: number) => PAD_L + (u / maxU) * (W - PAD_L - 6);
  const y = (share: number) => PAD_T + (1 - share) * (H - PAD_T - PAD_B);
  const samples = Array.from({ length: 61 }, (_, i) => {
    const u = (i / 60) * maxU;
    return { u, share: ydmShare({ mode: 'static', ...curve }, curve.yTarget, u, targetUtilization) };
  });
  const path = samples.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.u).toFixed(1)} ${y(p.share).toFixed(1)}`).join(' ');
  const atScrub = ydmShare({ mode: 'static', ...curve }, curve.yTarget, scrubUtilization, targetUtilization);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ color: C.eyebrow, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ color, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
          {(atScrub * 100).toFixed(1)}%
        </span>
      </div>
      <svg
        aria-label={`${label}: ${(atScrub * 100).toFixed(1)}% of Sr yield at ${(scrubUtilization * 100).toFixed(0)}% utilization`}
        className="mt-2"
        role="img"
        style={{ display: 'block', height: 'auto', width: '100%' }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {[0, 0.5, 1].map((share) => (
          <g key={share}>
            <line stroke={C.border} strokeDasharray="3 3" x1={PAD_L} x2={W - 6} y1={y(share)} y2={y(share)} />
            <text fill={C.kpiLabel} fontFamily={MONO} fontSize="7.5" textAnchor="end" x={PAD_L - 4} y={y(share) + 2.5}>
              {share * 100}%
            </text>
          </g>
        ))}
        {/* the protocol's fixed target */}
        <line stroke={C.eyebrow} strokeDasharray="2 2" x1={x(targetUtilization)} x2={x(targetUtilization)} y1={PAD_T} y2={H - PAD_B} />
        <text fill={C.eyebrow} fontFamily={MONO} fontSize="7.5" textAnchor="middle" x={x(targetUtilization)} y={H - PAD_B + 10}>
          target
        </text>
        <path d={path} fill="none" stroke={color} strokeWidth="2" />
        <line stroke={C.text} x1={x(scrubUtilization)} x2={x(scrubUtilization)} y1={PAD_T} y2={H - PAD_B} strokeWidth="1" />
        <circle cx={x(scrubUtilization)} cy={y(atScrub)} fill={color} r="3.6" stroke={C.cardBg} strokeWidth="1.4" />
        <text fill={C.kpiLabel} fontFamily={MONO} fontSize="7.5" x={PAD_L} y={H - 4}>0%</text>
        <text fill={C.kpiLabel} fontFamily={MONO} fontSize="7.5" textAnchor="end" x={W - 6} y={H - 4}>
          {(maxU * 100).toFixed(0)}%
        </text>
      </svg>
    </div>
  );
}

// The page's thesis in one figure: a single source fans into three positions.
// Stroke weight carries capital share, the end labels carry modeled APY, so the
// figure restates the split rather than decorating it.
function SourceSplitDiagram({
  juniorApy,
  juniorCapital,
  juniorFunded,
  liquidityApy,
  liquidityCapital,
  liquidityFunded,
  seniorApy,
  seniorCapital,
  sourceApy,
  sourceLabel,
}: {
  juniorApy: number;
  juniorCapital: number;
  juniorFunded: boolean;
  liquidityApy: number;
  liquidityCapital: number;
  liquidityFunded: boolean;
  seniorApy: number;
  seniorCapital: number;
  sourceApy: number;
  sourceLabel: string;
}) {
  const total = Math.max(seniorCapital + juniorCapital + liquidityCapital, 1);
  const strokeFor = (capital: number) =>
    Math.max(2, Math.min(11, (capital / total) * 24));
  const legs = [
    {
      apy: seniorApy,
      capital: seniorCapital,
      color: C.seniorLine,
      funded: true,
      key: 'sr',
      name: 'Sr',
      role: 'Protected, sellable',
      y: 27,
    },
    {
      apy: juniorApy,
      capital: juniorCapital,
      color: C.juniorLine,
      funded: juniorFunded,
      key: 'jr',
      name: 'Jr',
      role: 'Takes first loss',
      y: 75,
    },
    {
      apy: liquidityApy,
      capital: liquidityCapital,
      color: C.olive,
      funded: liquidityFunded,
      key: 'slp',
      name: 'SLP',
      role: 'Supplies the pool',
      y: 123,
    },
  ];
  return (
    <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <svg
        aria-label={`One source at ${pct(sourceApy)} a year splits into Sr at ${pct(seniorApy)}, Jr ${juniorFunded ? `at ${pct(juniorApy)}` : 'not selected'}, and SLP ${liquidityFunded ? `at ${pct(liquidityApy)}` : 'not selected'}.`}
        role="img"
        style={{ display: 'block', height: 'auto', width: '100%' }}
        viewBox="0 0 560 150"
      >
        <text fill={C.text} fontFamily={MONO} fontSize="21" fontWeight="600" x="4" y="72">
          {pct(sourceApy)}
        </text>
        {/* SVG text does not wrap, so a long asset name would run into the
            curves; clip it to the column and keep the full name in the title. */}
        <text fill={C.muted} fontSize="10" x="4" y="88">
          <title>{sourceLabel}</title>
          {sourceLabel.length > 26 ? `${sourceLabel.slice(0, 25)}…` : sourceLabel}
        </text>
        <text fill={C.muted} fontSize="10" x="4" y="101">
          a year, before the split
        </text>
        {legs.map((leg) => (
          <g key={leg.key}>
            <path
              d={`M 150 75 C 250 75, 250 ${leg.y}, 350 ${leg.y}`}
              fill="none"
              opacity={leg.funded ? 0.85 : 0.5}
              stroke={leg.funded ? leg.color : C.faint}
              strokeDasharray={leg.funded ? undefined : '5 4'}
              strokeLinecap="round"
              strokeWidth={leg.funded ? strokeFor(leg.capital) : 1.5}
            />
            <circle cx="350" cy={leg.y} fill={leg.funded ? leg.color : C.faint} r={leg.funded ? 3.4 : 2.2} />
            <text
              fill={leg.funded ? leg.color : C.faint}
              fontFamily={MONO}
              fontSize="13"
              fontWeight="700"
              x="364"
              y={leg.y - 3}
            >
              {leg.name}
            </text>
            <text
              fill={leg.funded ? C.text : C.danger}
              fontFamily={MONO}
              fontSize="13"
              x="404"
              y={leg.y - 3}
            >
              {leg.funded ? `${pct(leg.apy)}/yr` : 'not selected'}
            </text>
            <text fill={C.muted} fontSize="10" x="364" y={leg.y + 12}>
              {leg.funded
                ? `${leg.role} · ${usd0(leg.capital)}`
                : `No ${leg.name} capital in this design`}
            </text>
          </g>
        ))}
      </svg>
      <p
        className="lg:max-w-56"
        style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}
      >
        Line weight is capital. Premiums to Jr and SLP come out of Sr&apos;s share of
        the source yield.
      </p>
    </div>
  );
}

// One labelled band of related controls inside the assumptions editor, so
// capital, coverage, and liquidity read as groups rather than a flat grid.
function EditGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div style={{ ...DAY_INPUT_PANEL, padding: 12 }}>
      <p style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
        {title}
      </p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

// Presets plus a trailing "Other" cell, so exactly one option always reads as
// selected. Other takes selection either because the caller latched it (the
// user clicked it) or because the current value matches no preset.
function PresetRow({
  ariaLabel,
  activeValue,
  custom,
  onOther,
  presets,
  onSelect,
}: {
  ariaLabel: string;
  activeValue: number;
  custom: boolean;
  onOther: () => void;
  presets: { label: string; value: number }[];
  onSelect: (value: number) => void;
}) {
  const otherActive = custom || !presets.some((preset) => preset.value === activeValue);
  const cellStyle = (active: boolean) => ({
    background: active ? PRESET_ACTIVE_BG : C.cardBg,
    border: `1px solid ${active ? C.accent : C.border}`,
    color: active ? C.accent : C.muted,
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 700,
    minHeight: 34,
    padding: '7px 8px',
    textTransform: 'uppercase' as const,
  });
  return (
    <div aria-label={ariaLabel} className="mt-2 grid grid-cols-2 sm:grid-cols-4" role="group" style={{ gap: 6 }}>
      {presets.map((preset) => {
        const active = !otherActive && activeValue === preset.value;
        return (
          <button
            aria-pressed={active}
            key={preset.value}
            onClick={() => onSelect(preset.value)}
            style={cellStyle(active)}
            type="button"
          >
            {preset.label}
          </button>
        );
      })}
      <button
        aria-pressed={otherActive}
        onClick={onOther}
        style={cellStyle(otherActive)}
        type="button"
      >
        Show advanced
      </button>
    </div>
  );
}

function AssumptionSummaryTile({
  index,
  label,
  mechanism,
  outcome,
  value,
}: {
  index: number;
  label: string;
  mechanism: string;
  outcome: string;
  value: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [placeAbove, setPlaceAbove] = useState(false);
  const tooltipAlignment = index === 0
    ? 'left-0'
    : index === 1
      ? 'right-0 md:left-0 md:right-auto'
      : index === 2
        ? 'left-0 md:right-0 md:left-auto'
        : 'right-0';
  const tooltipId = `day-sim-assumption-effect-${index}`;
  const updatePlacement = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 128;
    const requiredSpace = tooltipHeight + 10;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const nextPlaceAbove = spaceBelow < requiredSpace && spaceAbove > spaceBelow;
    setPlaceAbove((current) => current === nextPlaceAbove ? current : nextPlaceAbove);
  }, []);

  return (
    <div
      aria-describedby={tooltipId}
      aria-label={`${label}: ${value}`}
      className="group relative cursor-help outline-none focus-visible:ring-1 focus-visible:ring-[#A65B20]"
      data-tooltip-placement={placeAbove ? 'above' : 'below'}
      onClick={updatePlacement}
      onFocus={updatePlacement}
      onMouseEnter={updatePlacement}
      onPointerDown={updatePlacement}
      onPointerEnter={updatePlacement}
      ref={cardRef}
      // A read-only state readout, so it deliberately does not borrow the
      // bordered treatment of the preset buttons directly above it.
      style={{ borderLeft: `2px solid ${C.border}`, padding: '2px 0 2px 10px' }}
      tabIndex={0}
    >
      <p style={{ color: C.kpiLabel, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</p>
      <p className="mt-1" style={{ color: C.text, fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>{value}</p>
      <div
        className={`pointer-events-none absolute z-30 w-72 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 ${placeAbove ? 'bottom-full mb-2' : 'top-full mt-2'} ${tooltipAlignment}`}
        id={tooltipId}
        ref={tooltipRef}
        role="tooltip"
        style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(29,28,25,.14)',
          color: C.text,
          fontSize: 13,
          lineHeight: 1.45,
          maxHeight: 'calc(100vh - 20px)',
          overflowY: 'auto',
          padding: '9px 10px',
        }}
      >
        <p>
          <strong style={{ fontWeight: 700 }}>How it works:</strong>{' '}
          {mechanism}
        </p>
        <p className="mt-2" style={{ color: C.muted }}>
          <strong style={{ color: C.text, fontWeight: 700 }}>Current result:</strong>{' '}
          {outcome}
        </p>
      </div>
    </div>
  );
}

const annualized = (end: number, start: number, days: number) =>
  days > 0 && start > 0 && end >= 0
    ? end === 0 ? -1 : Math.pow(end / start, 365 / days) - 1
    : 0;
const pctSigned = (value: number): string =>
  `${value < 0 ? '\u2212' : '+'}${Math.abs(value * 100).toFixed(2)}%`;

const pct = (value: number, digits = 1) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
const drawdownPct = (value: number) =>
  value * 100 >= 0.05 ? `−${(value * 100).toFixed(1)}%` : '0.0%';
const usd0 = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const signColor = (value: number) => (value < 0 ? C.danger : C.text);

export default function DayMarketSimulator({
  market,
  variant = 'standard',
  onExitTutorial,
}: {
  market?: DayMarket;
  variant?: 'standard' | 'guided' | 'executive' | 'learning' | 'tutorial';
  onExitTutorial?: () => void;
}) {
  const activeMarket = market ?? DAY_EXPLORER_TEMPLATE_MARKET;
  const isTutorial = variant === 'tutorial';
  const isGuided = variant === 'guided' || isTutorial;
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
    ?? 'Royco Day splits one strategy base asset into three positions. Sr pays Jr a risk premium for first-loss coverage and SLP a liquidity premium for secondary liquidity.';
  const marketDefaults = activeMarket.defaults;
  // A shared link wins over the market default, but only for the fields it
  // carries. Read once at mount so later edits are not fought by the URL.
  const linkedDesign = useMemo(
    () => typeof window === 'undefined' ? {} : decodeDayDesign(window.location.search),
    [],
  );
  const [deploymentInputs, setDeploymentInputs] = useState<DayDeploymentFieldValues>(
    EMPTY_DAY_DEPLOYMENT_FIELDS,
  );
  const updateDeploymentInput = useCallback((id: DayDeploymentFieldId, value: string) => {
    setDeploymentInputs((current) => ({ ...current, [id]: value }));
  }, []);
  const y100SharePct = parseDayDeploymentTerm(
    deploymentInputs.yieldShareAtFullUtilization,
    marketDefaults.riskYDM.y100 * 100,
    DAY_DEPLOYMENT_TERM_BOUNDS.yieldShareAtFullUtilization,
  );
  const exitBufferPct = parseDayDeploymentTerm(
    deploymentInputs.protectedExitThreshold,
    marketDefaults.exitBufferPct,
    DAY_DEPLOYMENT_TERM_BOUNDS.protectedExitThreshold,
  );
  const selfLiquidationBonusPct = parseDayDeploymentTerm(
    deploymentInputs.selfLiquidationBonus,
    marketDefaults.selfLiquidationBonus * 100,
    DAY_DEPLOYMENT_TERM_BOUNDS.selfLiquidationBonus,
  );
  // Deployment-checklist terms override the manifest defaults before the accountant runs.
  const defaults = useMemo(
    () => ({
      ...marketDefaults,
      riskYDM: { ...marketDefaults.riskYDM, y100: y100SharePct / 100 },
      exitBufferPct,
      selfLiquidationBonus: selfLiquidationBonusPct / 100,
    }),
    [exitBufferPct, marketDefaults, selfLiquidationBonusPct, y100SharePct],
  );
  const backtestDisplay = activeMarket.customization.backtestDisplay;
  const forwardTest = activeMarket.customization.forwardTest;
  const reverseMarket = activeMarket.customization.reverseMarket;
  const omitInitialZeroReturnPeriod = forwardTest?.omitInitialZeroReturnPeriod === true;
  const returnUnit = backtestDisplay?.returnUnit ?? 'USD';
  const isNativeReturnUnit = returnUnit !== 'USD';
  const [sourceApyPct, setSourceApyPct] = useState(linkedDesign.sourceApyPct ?? defaults.sourceApy * 100);
  const [observationDays, setObservationDays] = useState(linkedDesign.observationDays ?? defaults.observationDays);
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
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showReview, setShowReview] = useState(!isGuided);
  const [showDeploymentInputs, setShowDeploymentInputs] = useState(false);
  // Latched when the user picks "Other", so that cell reads as selected even
  // while the value still happens to equal a preset. Picking a preset clears it.
  const [coverageIsCustom, setCoverageIsCustom] = useState(false);
  const [liquidityIsCustom, setLiquidityIsCustom] = useState(false);
  const [stressDepthPct, setStressDepthPct] = useState(linkedDesign.stressDepthPct ?? 0);
  // Read-only exploration of the yield-share curves; utilization is an outcome
  // of deposits and redemptions, so this scrubs the curves without changing the
  // configuration the accountant runs. Coverage and liquidity utilization are
  // separate inputs in the accountant (preCoverage vs preLiquidity), so each
  // curve gets its own scrub rather than sharing one figure.
  const [openPositionRow, setOpenPositionRow] = useState<string | null>(null);
  const [showUtilizationCurves, setShowUtilizationCurves] = useState(false);

  const [scrubCoverageUtilPct, setScrubCoverageUtilPct] = useState(DAY_TARGET_UTILIZATION * 100);
  const [scrubLiquidityUtilPct, setScrubLiquidityUtilPct] = useState(DAY_TARGET_UTILIZATION * 100);
  const [showMonthly, setShowMonthly] = useState(true);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartTickCount, setChartTickCount] = useState(7);
  const [coveragePct, setCoveragePct] = useState(linkedDesign.coveragePct ?? defaults.coverage * 100);
  const [minLiquidityPct, setMinLiquidityPct] = useState(linkedDesign.minLiquidityPct ?? defaults.minLiquidity * 100);
  const [eclpBandWidthPct, setEclpBandWidthPct] = useState(linkedDesign.eclpBandWidthPct ?? defaults.eclpBandWidth * 100);
  const [riskSharePct, setRiskSharePct] = useState(linkedDesign.riskSharePct ?? defaults.riskYDM.yTarget * 100);
  const [liqSharePct, setLiqSharePct] = useState(linkedDesign.liqSharePct ?? defaults.liqYDM.yTarget * 100);
  const [maintainCoverage, setMaintainCoverage] = useState(linkedDesign.maintainCoverage ?? defaults.maintainCoverage);
  const [seniorCapitalUsd, setSeniorCapitalUsd] = useState(10_000_000);
  // Tranche capital implied by the coverage and liquidity ratios at the 90%
  // utilization the simulator seeds. Derived once and reused everywhere it is
  // shown, so the preview, the editor, and the split diagram cannot disagree.
  const juniorCapitalUsd = seniorCapitalUsd
    * ((coveragePct / 100) / Math.max(DAY_TARGET_UTILIZATION - coveragePct / 100, 0.001));
  const liquidityCapitalUsd = seniorCapitalUsd
    * ((minLiquidityPct / 100) / DAY_TARGET_UTILIZATION);
  // A premium can only be paid to a tranche that exists. At zero coverage or
  // zero liquidity the counterparty has no capital and no shares, so charging
  // Sr its yield share would debit Sr and credit nobody — Sr would trail the
  // source it is built on. The slider values are kept, not clamped, so raising
  // coverage again restores the configured premium.
  const effectivePremium = (share: number, funded: boolean) => (funded ? share : 0);
  const juniorIsFunded = coveragePct > 0;
  const liquidityIsFunded = minLiquidityPct > 0;
  const shownRiskSharePct = effectivePremium(riskSharePct, juniorIsFunded);
  const recentredCurve = (ydm: { y0: number; yTarget: number; y100: number }, yTarget: number) => ({
    y0: Math.max(0, yTarget - Math.max(0, ydm.yTarget - ydm.y0)),
    y100: Math.min(1, yTarget + Math.max(0, ydm.y100 - ydm.yTarget)),
    yTarget,
  });
  const shownLiqSharePct = effectivePremium(liqSharePct, liquidityIsFunded);


  // A full accountant pass runs over every observation in the source history,
  // which is ~1,100 points for the default sample. Feeding it deferred values
  // lets a preset or slider commit its own pressed state in the same frame as
  // the click, with the recompute landing as a lower-priority render instead of
  // blocking paint for hundreds of milliseconds.
  const enginePremiumInputs = useDeferredValue({
    coveragePct,
    eclpBandWidthPct,
    liqSharePct,
    minLiquidityPct,
    observationDays,
    riskSharePct,
    sourceApyPct,
    stressDepthPct,
  });
  const [range, setRange] = useState<IndexRange>({
    a: 0,
    b: simulationSeries.length - 1,
  });

  const changeTutorialStep = useCallback((value: number) => {
    setTutorialStep(value);
    if (value === 1 || value === 2) setShowInputs(true);
  }, []);

  const showTutorialSection = useCallback(() => {
    if (tutorialStep === 1 || tutorialStep === 2) setShowInputs(true);
    const targetId = tutorialStep === 0
      ? 'day-sim-positions'
      : tutorialStep === 1
        ? 'day-sim-coverage-control'
        : tutorialStep === 2
          ? 'day-sim-liquidity-control'
          : 'day-sim-live-outcomes';
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [tutorialStep]);

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

  useEffect(() => {
    if (typeof window === 'undefined' || !isGuided) return;
    const next = new URL(window.location.href);
    const design = encodeDayDesign({
      coveragePct,
      minLiquidityPct,
      eclpBandWidthPct,
      riskSharePct,
      liqSharePct,
      observationDays,
      sourceApyPct,
      stressDepthPct,
      maintainCoverage,
    });
    design.forEach((value, key) => next.searchParams.set(key, value));
    if (next.href !== window.location.href) {
      window.history.replaceState(null, '', next);
    }
  }, [
    coveragePct,
    eclpBandWidthPct,
    isGuided,
    liqSharePct,
    maintainCoverage,
    minLiquidityPct,
    observationDays,
    riskSharePct,
    sourceApyPct,
    stressDepthPct,
  ]);

  const maxIndex = Math.max(0, simulationSeries.length - 1);
  const viewRange = useMemo(
    () => normalizeRange(range.a, range.b, maxIndex),
    [maxIndex, range],
  );
  // The stress overlay sits on top of the calibrated path, so the Source APY
  // above stays the unshocked baseline and the shock reads as "and then this
  // happens to it". The accountant still derives every tranche outcome itself.
  const modeledSeries = useMemo(
    () => forwardTest
      ? simulationSeries
      : applySourceStress(
        calibrateSeriesApy(simulationSeries, enginePremiumInputs.sourceApyPct / 100),
        enginePremiumInputs.stressDepthPct / 100,
      ),
    [forwardTest, simulationSeries, enginePremiumInputs],
  );
  const view = useMemo(
    () => modeledSeries.slice(viewRange.a, viewRange.b + 1),
    [modeledSeries, viewRange],
  );

  const { result, fullResult } = useMemo(() => {
    const run = (series: DaySeriesPoint[]) => {
    const coverage = enginePremiumInputs.coveragePct / 100;
    const minLiquidity = enginePremiumInputs.minLiquidityPct / 100;
    const eclpBandWidth = enginePremiumInputs.eclpBandWidthPct / 100;
    const riskTarget = effectivePremium(
      enginePremiumInputs.riskSharePct,
      enginePremiumInputs.coveragePct > 0,
    ) / 100;
    const liqTarget = effectivePremium(
      enginePremiumInputs.liqSharePct,
      enginePremiumInputs.minLiquidityPct > 0,
    ) / 100;
    const initial = buildDayInitialBalances(defaults, { coverage, minLiquidity });
    const cfg = buildDayMarketConfig(defaults, {
      coverage,
      minLiquidity,
      eclpBandWidth,
      observationDays: enginePremiumInputs.observationDays,
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
              ? 'Sr impairment'
              : 'Jr recovery claim reset';
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
        ltRawNAV: snapshot.ltRawNAV,
        accruedLiquidityPremium: snapshot.accruedLiquidityPremium,
        poolPctST: snapshot.poolPctST,
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
      targetDays: enginePremiumInputs.observationDays,
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
      juniorCapitalInjectedShareOfStart: initial.jt > 0
        ? juniorCapitalInjected / initial.jt
        : 0,
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
    defaults,
    enginePremiumInputs,
    maintainCoverage,
    modeledSeries,
    omitInitialZeroReturnPeriod,
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
  }, [displayMaxIndex, displaySeriesOffset, maxIndex, setRange]);

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
  const matchedPresetId = useMemo(
    () => matchDayIssuerPreset({
      coveragePct,
      minLiquidityPct,
      eclpBandWidthPct,
      riskSharePct,
      liqSharePct,
      observationDays,
      maintainCoverage,
    }),
    [
      coveragePct,
      eclpBandWidthPct,
      liqSharePct,
      maintainCoverage,
      minLiquidityPct,
      observationDays,
      riskSharePct,
    ],
  );
  const exportConfiguration = useCallback(() => {
    if (typeof window === 'undefined') return;
    const exportedAt = new Date().toISOString();
    const payload = buildDayConfigExport({
      exportedAt,
      market: {
        id: activeMarket.id,
        name: activeMarket.identity.marketName,
        asset: activeMarket.identity.displayAssetName,
        variant,
      },
      presetId: matchedPresetId,
      terms: {
        coveragePct,
        minLiquidityPct,
        eclpBandWidthPct,
        riskSharePct,
        liqSharePct,
        observationDays,
        sourceApyPct,
        maintainCoverage,
        y100SharePct,
        exitBufferPct,
        selfLiquidationBonusPct,
      },
      scenario: {
        sourceStressPct: stressDepthPct,
      },
      modeled: {
        seniorApy: result.seniorApy,
        juniorApy: result.juniorApy,
        liquidityApy: result.liquidityApy,
        coverageLossLimit: result.explainer.coverage.coverageLossLimit,
        referenceSellShareOfSenior: result.explainer.liquidity.referenceSellShareOfSenior,
        boundarySellShareOfSenior: result.explainer.liquidity.boundarySellShareOfSenior,
      },
      deploymentInputs: {
        tokenContractSource: deploymentInputs.tokenContractSource,
        tokenContractAddress: deploymentInputs.tokenContractAddress,
        chain: deploymentInputs.chain,
        adaptationSpeed: deploymentInputs.adaptationSpeed,
      },
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = dayConfigExportFilename(activeMarket.identity.marketName, exportedAt);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [
    activeMarket.id,
    activeMarket.identity.displayAssetName,
    activeMarket.identity.marketName,
    coveragePct,
    deploymentInputs,
    eclpBandWidthPct,
    exitBufferPct,
    liqSharePct,
    maintainCoverage,
    matchedPresetId,
    minLiquidityPct,
    observationDays,
    result,
    riskSharePct,
    selfLiquidationBonusPct,
    sourceApyPct,
    stressDepthPct,
    variant,
    y100SharePct,
  ]);
  // Contributions are expressed as APY percentages so a column of them adds up
  // to the reported net. Where the accountant does not decompose a figure, one
  // combined line carries it rather than an invented split. Non-percentage
  // configuration lives in `assumptions`, kept out of the arithmetic.
  const positionBreakdown = (position: string): {
    contributions: { label: string; note?: string; pct: number }[];
    net: { label: string; pct: number };
    assumptions: { label: string; value: string }[];
    caveat: string;
  } => {
    const gross = result.strategyApy;
    if (position === 'Sr') {
      const toJunior = -(shownRiskSharePct / 100) * gross;
      const toLiquidity = -(shownLiqSharePct / 100) * gross;
      const balance = result.seniorApy - (gross + toJunior + toLiquidity);
      return {
        contributions: [
          { label: 'Gross source yield', pct: gross },
          { label: 'Risk premium to Jr', note: `${shownRiskSharePct.toFixed(0)}% of Sr yield`, pct: toJunior },
          { label: 'Liquidity premium to SLP', note: `${shownLiqSharePct.toFixed(0)}% of Sr yield`, pct: toLiquidity },
          {
            label: juniorIsFunded ? 'Loss absorption and pool effects' : 'Sr absorbing losses itself',
            note: 'Balance to the reported result, not separately reported.',
            pct: balance,
          },
        ],
        net: { label: 'Net Sr APY', pct: result.seniorApy },
        assumptions: [
          { label: 'Loss absorbed by Jr before Sr is touched', value: `${(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% of source` },
          { label: 'Sr sellable in one transaction', value: `${(result.explainer.liquidity.referenceSellShareOfSenior * 100).toFixed(1)}% at ${(result.explainer.liquidity.referenceQuote.slippage * 100).toFixed(1)}% slippage` },
        ],
        caveat: juniorIsFunded
          ? 'The first three lines are reported directly. The fourth is the remainder between that arithmetic and the accountant\u2019s result.'
          : 'With coverage at 0% there is no Jr capital, so Sr absorbs source losses itself. The fourth line is the remainder between the arithmetic and the accountant\u2019s result.',
      };
    }
    if (position === 'Jr') {
      return {
        contributions: [
          { label: 'Source exposure on Jr capital', note: 'Jr holds the same base asset as Sr.', pct: gross },
          { label: 'Risk premium received', note: 'Net of losses absorbed.', pct: result.juniorApy - gross },
        ],
        net: { label: 'Net Jr APY', pct: result.juniorApy },
        assumptions: [
          { label: 'Deepest Jr drawdown', value: drawdownPct(result.juniorMaxDrawdown) },
          { label: 'Recovery claims erased', value: `${result.erasedRecoveryClaims}` },
          { label: 'Recapitalised after finalized losses', value: `${(result.juniorCapitalInjectedShareOfStart * 100).toFixed(0)}% of Jr starting capital` },
        ],
        caveat: 'Jr is levered to the source: a small buffer behind a large Sr position means source losses reach Jr magnified, which is why Jr\u2019s drawdown far exceeds the source\u2019s.',
      };
    }
    if (position === 'SLP') {
      // A modeled attribution, not four figures the accountant emits. Each driver
      // is built from what it does report — end-of-run pool composition — times
      // the configured rate for that leg. The last line is the balance to the
      // engine's own total, so the column still sums to the reported result and
      // impermanent loss plus any interaction between legs lands there rather
      // than being silently distributed.
      const srShareOfPool = endStep?.poolPctST ?? 0;
      const stableShareOfPool = Math.max(0, 1 - srShareOfPool);
      const premiumOnPool = liquidityCapitalUsd > 0
        ? (shownLiqSharePct / 100) * result.strategyApy * (seniorCapitalUsd / liquidityCapitalUsd)
        : 0;
      const tradingFees = (defaults.swapFeeBps / 10_000) * defaults.poolTurnoverPerYear;
      const stableLeg = stableShareOfPool * defaults.stableYield;
      const srLeg = srShareOfPool * result.seniorApy;
      const balance = result.liquidityApy - (premiumOnPool + tradingFees + stableLeg + srLeg);
      return {
        contributions: [
          { label: 'Liquidity premium from Sr', note: `${shownLiqSharePct.toFixed(0)}% of Sr yield, earned on a smaller pool`, pct: premiumOnPool },
          { label: 'Pool trading fees', note: `${defaults.swapFeeBps} bps on ${defaults.poolTurnoverPerYear}\u00d7 turnover`, pct: tradingFees },
          { label: 'Stable leg yield', note: `${(stableShareOfPool * 100).toFixed(0)}% of the pool`, pct: stableLeg },
          { label: 'Sr held inside the pool', note: `${(srShareOfPool * 100).toFixed(0)}% of the pool`, pct: srLeg },
          { label: 'Impermanent loss and leg interaction', note: 'Balance to the reported total.', pct: balance },
        ],
        net: { label: 'Net SLP APY', pct: result.liquidityApy },
        assumptions: [
          { label: 'Stable-asset yield on the stable leg', value: pct(defaults.stableYield) },
          { label: 'Pool trading fee', value: `${defaults.swapFeeBps} bps` },
          { label: 'Assumed pool turnover', value: `${defaults.poolTurnoverPerYear}\u00d7 / year` },
          { label: 'Pool band below $1', value: `${formatEclpBandPercent(eclpBandWidthPct)}%` },
          { label: 'Liquidity premium reinvested into the pool', value: defaults.reinvestLiquidityPremium ? 'Yes' : 'No' },
        ],
        caveat: 'The total is the accountant\u2019s and exact. The four drivers are a modeled attribution \u2014 pool composition times each leg\u2019s rate \u2014 so treat the split as indicative.',
      };
    }
    return {
      contributions: [{ label: 'Source path over the window', pct: gross }],
      net: { label: 'Source APY', pct: gross },
      assumptions: stressDepthPct > 0
        ? [{ label: 'Hypothetical drawdown overlay', value: `\u2212${stressDepthPct.toFixed(0)}% (not source data)` }]
        : [],
      caveat: 'The source path is the input every position is derived from, not a Royco Day position itself.',
    };
  };

  const tutorialHighlightStyle = {
    background: `${C.accent}08`,
    borderColor: C.accent,
    boxShadow: `inset 3px 0 ${C.accent}, 0 1px 2px rgba(29,28,25,.035)`,
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
            symbol: 'Sr',
            name: activeMarket.identity.seniorName,
            job: 'Receives first-loss protection and an immediate secondary-market exit.',
            paidFor: 'Sr keeps source yield after paying Jr for protection and SLP for liquidity.',
            endValue: from100(endStep.senior),
            apy: result.seniorApy,
            maxDrawdown: result.seniorMaxDrawdown,
            color: C.seniorLine,
          },
          {
            symbol: 'Jr',
            name: activeMarket.identity.juniorName,
            job: 'Absorbs covered losses before Sr.',
            paidFor: 'Jr earns the risk premium because its capital is the first-loss buffer.',
            endValue: from100(endStep.junior),
            apy: result.juniorApy,
            maxDrawdown: result.juniorMaxDrawdown,
            color: C.juniorLine,
          },
          {
            symbol: 'SLP',
            name: 'Senior Liquidity Provider',
            job: 'Makes Sr sellable through the E-CLP pool.',
            paidFor: 'SLP earns the liquidity premium for providing the pool that buys Sr.',
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
    <div className="flex flex-col" style={{ gap: 12 }}>
      {isTutorial && endStep && (
        <DayGuidedTutorial
          assetName={activeMarket.identity.displayAssetName}
          coverage={result.explainer.coverage}
          coveragePct={coveragePct}
          eclpBandWidthPct={eclpBandWidthPct}
          liquidity={result.explainer.liquidity}
          minLiquidityPct={minLiquidityPct}
          onCoverageChange={setCoveragePct}
          onEclpBandWidthChange={setEclpBandWidthPct}
          onExit={onExitTutorial ?? (() => undefined)}
          onMinLiquidityChange={setMinLiquidityPct}
          onReset={() => {
            setCoveragePct(defaults.coverage * 100);
            setMinLiquidityPct(defaults.minLiquidity * 100);
            setEclpBandWidthPct(defaults.eclpBandWidth * 100);
          }}
          onShowInSimulator={showTutorialSection}
          onStepChange={changeTutorialStep}
          step={tutorialStep}
        />
      )}
      {!isGuided && <section>
        <div className="flex items-center gap-2">
          <span style={{ background: C.olive, borderRadius: 9999, display: 'inline-block', height: 6, width: 6 }} />
          <DayEyebrow>{activeMarket.copy.eyebrow}</DayEyebrow>
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
        <p className="max-w-3xl" style={{ color: C.muted, fontSize: 13, lineHeight: 1.38, margin: '0 0 12px' }}>
          {isExecutive
            ? heroDescription
            : isGuided
              ? 'Understand the structure, confirm the assumptions, and then compare the modeled outcomes. Each step explains what the next result means.'
              : activeMarket.copy.description}
        </p>
      </section>}

      {isExecutive && showSection('roles') && (
        <section style={sectionCardStyle}>
          <Eyebrow>One investment · three choices</Eyebrow>
          <SectionTitle className="mt-2">
            Choose how you want to participate in the same strategy base asset
          </SectionTitle>
          <p className="mt-2" style={{ color: C.muted, fontSize: 13, lineHeight: 1.45 }}>
            Sr and Jr are invested in the strategy base asset. SLP provides secondary liquidity through a separate AMM pool.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
            <div style={{ background: C.pageBg, border: `1px solid ${C.seniorLine}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Senior Tranche (Sr) · coverage and liquidity</Eyebrow>
              <p className="mt-3" style={{ color: C.accent, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.seniorApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Receives first-loss coverage and secondary liquidity.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Jr absorbs losses before Sr. Sr can redeem through the primary route or sell immediately into the SLP pool at the current market price.
              </p>
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.juniorLine}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Junior Tranche (Jr) · first-loss capital</Eyebrow>
              <p className="mt-3" style={{ color: C.juniorLine, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.juniorApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Earns a risk premium for taking losses first.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Jr shares the strategy base asset&apos;s exposure with Sr and absorbs losses before Sr.
              </p>
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.olive}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Senior Liquidity Provider (SLP) · secondary liquidity</Eyebrow>
              <p className="mt-3" style={{ color: C.olive, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.liquidityApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Earns by providing the secondary exit for Sr.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                SLP return can include the liquidity premium, trading fees, Sr appreciation, and stable-asset yield, less impermanent loss.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_56px_1fr]" style={{ alignItems: 'center', gap: 8 }}>
            <div style={{ background: `${C.strategyLine}12`, border: `1px solid ${C.border}`, padding: 12 }}>
              <p style={{ color: C.kpiLabel, fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Strategy base asset</p>
              <p className="mt-1" style={{ color: C.strategyLine, fontFamily: SERIF, fontSize: 18 }}>{activeMarket.identity.displayAssetName} yield</p>
            </div>
            <div className="hidden items-center justify-center md:flex" aria-hidden="true" style={{ color: C.faint, fontFamily: MONO, fontSize: 20 }}>→</div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 8 }}>
              <div style={{ borderLeft: `3px solid ${C.eyebrow}`, padding: '7px 10px' }}>
                <p style={{ color: C.eyebrow, fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Sr pays Jr</p>
                <p className="mt-1" style={{ color: C.muted, fontSize: 11.5 }}>Jr provides first-loss coverage.</p>
              </div>
              <div style={{ borderLeft: `3px solid ${C.olive}`, padding: '7px 10px' }}>
                <p style={{ color: C.olive, fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Sr pays SLP</p>
                <p className="mt-1" style={{ color: C.muted, fontSize: 11.5 }}>SLP provides secondary liquidity.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {isExecutive && showSection('senior-summary') && (
        <section style={sectionCardStyle}>
          <Eyebrow>What Sr gets</Eyebrow>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
            <ExecutiveMetric label="Sr average yield" value={`${pct(result.seniorApy)}/yr`} valueColor={C.accent} />
            <ExecutiveMetric label="Minimum Jr coverage" value={`${coveragePct.toFixed(0)}% minimum`} valueColor={C.juniorLine} />
            <ExecutiveMetric label="Minimum SLP liquidity" value={`${minLiquidityPct.toFixed(0)}% minimum`} valueColor={C.olive} />
          </div>
        </section>
      )}

      {!isExecutive && !isGuided && <section style={sectionCardStyle}>
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
              value="Sr"
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
                <title>Risk premium from Sr to Jr; liquidity premium from Sr to SLP</title>
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
                value="Jr"
                note={isGuided ? 'Earns more for taking losses before Sr' : 'Absorbs losses before Sr'}
                color={C.juniorLine}
              />
              <FlowBox
                eyebrow="Secondary liquidity"
                value="SLP"
                note={isGuided ? 'Earns for making Sr easier to sell' : 'Provides AMM exit liquidity for Sr'}
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

      {showSection('market-inputs') && <section
        id="day-sim-assumptions"
        style={{
          ...(isGuided ? inputSectionCardStyle : sectionCardStyle),
          ...(isTutorial && (tutorialStep === 1 || tutorialStep === 2) ? tutorialHighlightStyle : {}),
        }}
      >
        <DaySectionHeader
          action={<div className="flex items-center gap-2">
            <DayButton
              onClick={exportConfiguration}
              style={{ minHeight: 32, padding: '6px 10px' }}
              variant="quiet"
            >
              Export JSON
            </DayButton>
            <DayButton
            onClick={() => setShowInputs((value) => !value)}
            aria-label={showInputs ? 'Collapse market inputs' : 'Expand market inputs'}
            aria-expanded={showInputs}
            style={{ minHeight: 32, padding: '6px 10px' }}
            variant="quiet"
          >
            {isGuided ? (showInputs ? 'Done' : 'Edit') : (showInputs ? '−' : '+')}
          </DayButton>
          </div>}
          description={isGuided ? 'Every outcome below is derived from these values.' : undefined}
          eyebrow={isGuided ? undefined : 'Market inputs'}
          title={isGuided ? 'Tranching design' : 'Market inputs'}
        />

        <div className="mt-3">
          <p style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            Volatility coverage
          </p>
          <PresetRow
            activeValue={coveragePct}
            ariaLabel="Coverage presets"
            custom={coverageIsCustom}
            onOther={() => {
              setCoverageIsCustom(true);
              setShowInputs(true);
            }}
            onSelect={(value) => {
              setCoverageIsCustom(false);
              setCoveragePct(value);
              setRiskSharePct(value * DAY_JR_PREMIUM_PER_COVERAGE);
            }}
            presets={[
              { label: 'No coverage · 0%', value: 0 },
              { label: 'Minimal · 5%', value: 5 },
              { label: 'High · 25%', value: 25 },
            ]}
          />
        </div>
        <div className="mt-3">
          <p style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            Liquidity
          </p>
          <PresetRow
            activeValue={minLiquidityPct}
            ariaLabel="Liquidity presets"
            custom={liquidityIsCustom}
            onOther={() => {
              setLiquidityIsCustom(true);
              setShowInputs(true);
            }}
            onSelect={(value) => {
              setLiquidityIsCustom(false);
              setMinLiquidityPct(value);
              setLiqSharePct(value * DAY_SLP_PREMIUM_PER_LIQUIDITY);
            }}
            presets={[
              { label: 'No liquidity · 0%', value: 0 },
              { label: 'Minimal · 10%', value: 10 },
              { label: 'High · 25%', value: 25 },
            ]}
          />
        </div>

        {isGuided && !showInputs && (
          <>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4" style={{ gap: 6 }}>
              {[
                {
                  mechanism: 'A higher Source APY creates more yield to divide among Sr, Jr, and SLP.',
                  label: 'Source APY',
                  outcome: `The selected source contributes ${sourceApyPct.toFixed(1)}% annualized yield before the premium split.`,
                  value: `${sourceApyPct.toFixed(1)}%`,
                },
                {
                  mechanism: 'More Jr Coverage increases the first-loss buffer protecting Senior (Sr).',
                  label: 'Jr coverage',
                  outcome: `At the current setting, the source can lose about ${(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% before Sr begins losing value.`,
                  value: `${coveragePct.toFixed(0)}%`,
                },
                {
                  mechanism: 'Higher SLP Liquidity gives Sr holders more liquidity when they want to sell.',
                  label: 'SLP liquidity',
                  outcome: `${(result.explainer.liquidity.referenceSellShareOfSenior * 100).toFixed(1)}% of Sr can sell at once with about ${(result.explainer.liquidity.referenceQuote.slippage * 100).toFixed(1)}% average price impact.`,
                  value: `${minLiquidityPct.toFixed(0)}%`,
                },
                {
                  mechanism: 'A wider Pool Band lets more Sr sell at once but allows the pool price to move farther below $1.',
                  label: 'Pool band',
                  outcome: `${(result.explainer.liquidity.boundarySellShareOfSenior * 100).toFixed(1)}% of Sr is the largest modeled one-time sale.`,
                  value: `${formatEclpBandPercent(eclpBandWidthPct)}%`,
                },
              ].map(({ label, mechanism, outcome, value }, index) => (
                <AssumptionSummaryTile
                  index={index}
                  key={label}
                  label={label}
                  mechanism={mechanism}
                  outcome={outcome}
                  value={value}
                />
              ))}
            </div>
            {/* The capital these ratios imply is the economics of the design,
                not a footnote, so it is set as a readable line rather than
                fine print. */}
            <p className="mt-3" style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
              On{' '}
              <strong style={{ color: C.text, fontFamily: MONO, fontWeight: 600 }}>{usd0(seniorCapitalUsd)}</strong>{' '}
              of Sr, this design needs{' '}
              <strong style={{ color: C.juniorLine, fontFamily: MONO, fontWeight: 700 }}>{usd0(juniorCapitalUsd)}</strong>{' '}
              of Jr first-loss capital and{' '}
              <strong style={{ color: C.olive, fontFamily: MONO, fontWeight: 700 }}>{usd0(liquidityCapitalUsd)}</strong>{' '}
              in the SLP pool.
            </p>
            <p className="mt-1.5" style={{ color: C.kpiLabel, fontSize: 11.5, lineHeight: 1.45 }}>
              Sr pays {shownRiskSharePct.toFixed(0)}% of its yield to Jr and {shownLiqSharePct.toFixed(0)}% to SLP · {observationDays}-day recovery window · Jr capital {maintainCoverage ? 'restored' : 'not restored'} after finalized losses
            </p>
          </>
        )}

        {showInputs && (
          <div className="mt-3 flex flex-col" style={{ gap: 10 }}>
            <div style={{ ...DAY_INPUT_PANEL, padding: 12 }}>
              <p style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Capital</p>
              <p className="mt-1" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4 }}>
                What the coverage and liquidity settings above mean in dollars for each tranche. Sized at the 90% target utilization the simulator seeds — slightly above the bare minimum the protocol would accept.
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3" style={{ gap: 10 }}>
                <div>
                  <label style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Senior capital ($)
                  </label>
                  <input
                    inputMode="numeric"
                    onChange={(event) => {
                      const next = Number(event.target.value.replace(/[^0-9]/g, ''));
                      if (Number.isFinite(next)) setSeniorCapitalUsd(next);
                    }}
                    style={{
                      background: C.cardBg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.text,
                      fontFamily: MONO,
                      fontSize: 13.5,
                      fontWeight: 600,
                      marginTop: 6,
                      minHeight: 38,
                      padding: '10px 12px',
                      width: '100%',
                    }}
                    type="text"
                    value={seniorCapitalUsd.toLocaleString('en-US')}
                  />
                  <p className="mt-1" style={{ color: C.kpiLabel, fontSize: 10, lineHeight: 1.4 }}>
                    Protected tranche principal.
                  </p>
                </div>
                <div>
                  <label style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Junior capital ($)
                  </label>
                  <div
                    style={{
                      background: '#EAE8E1',
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.text,
                      fontFamily: MONO,
                      fontSize: 13.5,
                      fontWeight: 600,
                      marginTop: 6,
                      minHeight: 38,
                      padding: '10px 12px',
                      textAlign: 'right',
                    }}
                  >
                    {usd0(juniorCapitalUsd)}
                  </div>
                  <p className="mt-1" style={{ color: C.kpiLabel, fontSize: 10, lineHeight: 1.4 }}>
                    First-loss tranche principal.
                  </p>
                </div>
                <div>
                  <label style={{ color: C.eyebrow, fontSize: 11.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Liquidity pool capital ($)
                  </label>
                  <div
                    style={{
                      background: '#EAE8E1',
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.text,
                      fontFamily: MONO,
                      fontSize: 13.5,
                      fontWeight: 600,
                      marginTop: 6,
                      minHeight: 38,
                      padding: '10px 12px',
                      textAlign: 'right',
                    }}
                  >
                    {usd0(liquidityCapitalUsd)}
                  </div>
                  <p className="mt-1" style={{ color: C.kpiLabel, fontSize: 10, lineHeight: 1.4 }}>
                    SLP capital backing secondary liquidity.
                  </p>
                </div>
              </div>
            </div>
            <EditGroup title="Source">
              <div className={isGuided && !forwardTest ? undefined : 'md:col-span-2'}>
                <SliderControl
                  label="Strategy base-asset APY (%)"
                  value={sourceApyPct}
                  min={0}
                  max={30}
                  step={0.1}
                  display={`${sourceApyPct.toFixed(1)}%`}
                  description={isGuided ? "Annualized return applied to the selected source history." : ""}
                  onChange={setSourceApyPct}
                />
              </div>
              {isGuided && !forwardTest && (
                <div>
                  <SliderControl
                    label="Hypothetical source drawdown (%)"
                    value={stressDepthPct}
                    min={0}
                    max={60}
                    step={1}
                    display={stressDepthPct > 0 ? `−${stressDepthPct.toFixed(0)}%` : 'None'}
                    description={`A modeled shock laid over the selected history, not part of the source data. Jr currently absorbs the first ${(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% of source loss.`}
                    onChange={setStressDepthPct}
                  />
                </div>
              )}
            </EditGroup>

            <EditGroup title="Coverage · Jr first-loss">
              <div id="day-sim-coverage-control" style={isTutorial && tutorialStep === 1 ? { border: `1px solid ${C.accent}`, borderRadius: 8, padding: 8 } : undefined}>
                <SliderControl
                  label="Minimum coverage requirement (%)"
                  value={coveragePct}
                  min={0}
                  max={25}
                  step={1}
                  display={`${coveragePct.toFixed(0)}%`}
                  description={isGuided ? `Minimum protection setting used to size the Jr buffer. Current modeled effect: Sr remains at $100 through about ${(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% source loss.` : ""}
                  onChange={setCoveragePct}
                />
              </div>
              <div>
                <SliderControl
                  disabled={coveragePct === 0}
                  label="Jr risk premium (% of Sr yield)"
                  value={riskSharePct}
                  min={0}
                  max={80}
                  step={1}
                  display={coveragePct === 0 ? 'Not charged' : `${riskSharePct.toFixed(0)}%`}
                  description={isGuided
                    ? coveragePct === 0
                      ? 'No Jr capital at 0% coverage, so Sr pays no risk premium. Raise coverage to fund Jr and charge for it.'
                      : 'The share of Sr yield paid to Jr for taking losses first.'
                    : ""}
                  onChange={(value) => {
                    setRiskSharePct(value);
                    if (value + liqSharePct > 100) setLiqSharePct(100 - value);
                  }}
                />
              </div>
              <div>
                <SliderControl
                  label="Observation Period duration (days)"
                  value={observationDays}
                  min={7}
                  max={194}
                  step={1}
                  display={`${observationDays} days`}
                  description={isGuided ? "How long the source has to recover before a covered Jr loss is finalized." : ""}
                  onChange={setObservationDays}
                />
              </div>
              {isGuided && (
                <label
                  className="flex cursor-pointer items-start gap-3"
                  style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 11.5, lineHeight: 1.4, padding: 10 }}
                >
                  <input
                    checked={maintainCoverage}
                    onChange={(event) => setMaintainCoverage(event.target.checked)}
                    style={{ accentColor: C.accent, marginTop: 2 }}
                    type="checkbox"
                  />
                  <span>
                    <strong style={{ color: C.text, display: 'block', fontWeight: 600 }}>Restore Jr after finalized losses</strong>
                    Adds fresh Jr capital to rebuild the minimum coverage buffer.
                  </span>
                </label>
              )}
            </EditGroup>

            <EditGroup title="Liquidity · SLP pool">
              <div id="day-sim-liquidity-control" style={isTutorial && tutorialStep === 2 ? { border: `1px solid ${C.accent}`, borderRadius: 8, padding: 8 } : undefined}>
                <SliderControl
                  label="Minimum liquidity requirement (%)"
                  value={minLiquidityPct}
                  min={0}
                  max={25}
                  step={1}
                  display={`${minLiquidityPct.toFixed(0)}%`}
                  description={isGuided ? `Minimum SLP capital supporting Sr sales. Current modeled effect: ${(result.explainer.liquidity.referenceSellShareOfSenior * 100).toFixed(1)}% of Sr can sell at once with about ${(result.explainer.liquidity.referenceQuote.slippage * 100).toFixed(1)}% average price impact.` : ""}
                  onChange={setMinLiquidityPct}
                />
              </div>
              <div>
                <SliderControl
                  disabled={minLiquidityPct === 0}
                  label="SLP liquidity premium (% of Sr yield)"
                  value={liqSharePct}
                  min={0}
                  max={80}
                  step={1}
                  display={minLiquidityPct === 0 ? 'Not charged' : `${liqSharePct.toFixed(0)}%`}
                  description={isGuided
                    ? minLiquidityPct === 0
                      ? 'No SLP pool at 0% liquidity, so Sr pays no liquidity premium. Raise liquidity to fund the pool and charge for it.'
                      : 'The share of Sr yield paid to SLP for providing secondary liquidity.'
                    : ""}
                  onChange={(value) => {
                    setLiqSharePct(value);
                    if (value + riskSharePct > 100) setRiskSharePct(100 - value);
                  }}
                />
              </div>
              {isGuided && (
              <div className="md:col-span-2">
                <SliderControl
                  label="E-CLP downside band (%)"
                  value={eclpBandWidthPct}
                  min={0.25}
                  max={20}
                  step={0.25}
                  display={`${formatEclpBandPercent(eclpBandWidthPct)}% · $${formatEclpFloor(eclpBandWidthPct)} floor`}
                  description={`How far the modeled pool price can move below $1. Narrow bands keep sales closer to $1 but allow less to be sold at once. Current modeled effect: ${(result.explainer.liquidity.boundarySellShareOfSenior * 100).toFixed(1)}% of Sr is the largest one-time sale, with about ${(result.explainer.liquidity.boundaryQuote.slippage * 100).toFixed(1)}% average price impact.`}
                  onChange={setEclpBandWidthPct}
                >
                  <div aria-label="E-CLP band presets" className="mt-2 grid grid-cols-2 sm:grid-cols-4" role="group" style={{ gap: 6 }}>
                    {[
                      { label: 'Near par', value: 0.5 },
                      { label: 'Standard', value: 1 },
                      { label: 'Wide', value: 3 },
                      { label: 'Very wide', value: 10 },
                    ].map((preset) => {
                      const active = eclpBandWidthPct === preset.value;
                      return (
                        <button
                          aria-pressed={active}
                          key={preset.value}
                          onClick={() => setEclpBandWidthPct(preset.value)}
                          style={{
                            background: active ? PRESET_ACTIVE_BG : C.cardBg,
                            border: `1px solid ${active ? C.accent : C.border}`,
                            color: active ? C.accent : C.muted,
                            fontFamily: MONO,
                            fontSize: 10,
                            fontWeight: 700,
                            minHeight: 34,
                            padding: '7px 8px',
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
            </EditGroup>
          </div>
        )}
      </section>}

      {isGuided && (
        <DayZoneHeader label="Outcomes" zone="output" />
      )}

      {isGuided && (
        <section style={sectionCardStyle}>
          <DaySectionHeader title="One source, three positions" />
          <div className="mt-4">
          <SourceSplitDiagram
            juniorApy={result.juniorApy}
            juniorCapital={juniorCapitalUsd}
            juniorFunded={juniorIsFunded}
            liquidityApy={result.liquidityApy}
            liquidityCapital={liquidityCapitalUsd}
            liquidityFunded={liquidityIsFunded}
            seniorApy={result.seniorApy}
            seniorCapital={seniorCapitalUsd}
            sourceApy={result.strategyApy}
            sourceLabel={activeMarket.identity.displayAssetName}
          />
          </div>
        </section>
      )}

      {!isExecutive && !isGuided && <section style={sectionCardStyle}>
        <Eyebrow>Simulated APYs</Eyebrow>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
          <Kpi label="Sr avg/yr" value={`${pct(result.seniorApy)}/yr`} valueColor={C.accent} />
          <Kpi label="Jr avg/yr" value={`${pct(result.juniorApy)}/yr`} valueColor={C.text} />
          <Kpi label="SLP avg/yr" value={`${pct(result.liquidityApy)}/yr`} valueColor={C.olive} />
        </div>
      </section>}

      {showSection('liquidity-and-coverage') && <section
        id="day-sim-live-outcomes"
        style={{
          ...sectionCardStyle,
          ...(isTutorial && tutorialStep === 3 ? tutorialHighlightStyle : {}),
        }}
      >
        {isGuided
          ? (
            <DaySectionHeader
              title="Sr risk and liquidity"
            />
          )
          : (
            <DaySectionHeader
              eyebrow="Outcomes"
              title="Sr risk and liquidity"
            />
          )}
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 10, marginTop: 12 }}>
        <div className={isGuided ? "flex flex-col" : undefined} style={isGuided
          ? { background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: isTutorial && tutorialStep === 1 ? `inset 3px 0 ${C.accent}` : undefined, padding: 14 }
          : { background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}
        >
          {isExecutive
            ? <Eyebrow>Loss waterfall</Eyebrow>
            : <Eyebrow>{isGuided ? 'Key risk · Loss protection' : 'First-loss coverage'}</Eyebrow>}
          {isGuided && (
            <>
              <PanelTitle className="mt-2">
                When does Sr lose money?
              </PanelTitle>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Jr absorbs losses first; losses beyond that buffer reduce Sr.
              </p>
              <div className="mt-3">
                <p style={{ color: juniorIsFunded ? C.olive : C.danger, fontFamily: MONO, fontSize: 28, fontWeight: 600, letterSpacing: '-0.05em' }}>
                  {juniorIsFunded
                    ? `${(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% source loss`
                    : 'No buffer'}
                </p>
                <p style={{ color: C.text, fontSize: 11.5 }}>
                  {juniorIsFunded ? 'before Sr starts falling' : 'Sr takes the first loss itself'}
                </p>
                <div
                  aria-label={`Sr is covered through ${(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)} percent source loss on the displayed ${(result.explainer.coverage.displayMaxLoss * 100).toFixed(1)} percent loss range`}
                  className="mt-3 flex"
                  role="img"
                  style={{ background: `${C.danger}18`, borderRadius: 9999, height: 9, overflow: 'hidden' }}
                >
                  <div style={{ background: C.olive, width: `${Math.min(100, result.explainer.coverage.coverageLossLimit / result.explainer.coverage.displayMaxLoss * 100)}%` }} />
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>
                  {juniorIsFunded
                    ? <>If the source loses {(result.explainer.coverage.displayMaxLoss * 100).toFixed(1)}%, <strong style={{ color: C.danger, fontWeight: 600 }}>$100 of Sr falls to ${result.explainer.coverage.endingSeniorBalancePer100.toFixed(0)}</strong>.</>
                    : <span style={{ color: C.danger }}>Raise Jr coverage above 0% to give Sr a buffer.</span>}
                </p>
              </div>
            </>
          )}
          {isExecutive && (
            <>
              <PanelTitle className="mt-2">
                Jr absorbs losses before Sr.
              </PanelTitle>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                The minimum coverage requirement sets the Jr buffer, but does not guarantee Sr principal against losses beyond that buffer.
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
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                marginTop: 'auto',
                minHeight: 38,
                padding: '10px 16px',
                textTransform: 'uppercase',
                width: 'fit-content',
              }}
              type="button"
            >
              {showCoverageDetail ? 'Hide curve' : 'See loss curve'}
            </button>
          )}
          {(!isGuided || showCoverageDetail) && <CoverageLossDiagram metrics={result.explainer.coverage} />}
          {(isGuided || isExecutive) && (
            <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
              Coverage is a buffer, not a guarantee. Sr declines after about {(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% of base-asset loss.
            </p>
          )}
        </div>

        <div
          className={isGuided ? "flex flex-col" : undefined}
          style={isGuided
            ? { background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: isTutorial && tutorialStep === 2 ? `inset 3px 0 ${C.accent}` : undefined, padding: 14 }
            : { background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}
        >
          {isExecutive
            ? <Eyebrow>If an Sr holder wants to sell</Eyebrow>
            : <Eyebrow>{isGuided ? 'Key risk · Liquidity' : 'Secondary liquidity'}</Eyebrow>}
          {isGuided && (
            <>
              <PanelTitle className="mt-2">
                How much Sr can sell?
              </PanelTitle>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Larger atomic sales move the price down. Arbitrage between sales can reopen capacity.
              </p>
              <div className="mt-3">
                <p style={{ color: liquidityIsFunded ? C.olive : C.danger, fontFamily: MONO, fontSize: 28, fontWeight: 600, letterSpacing: '-0.05em' }}>
                  {liquidityIsFunded
                    ? `${(result.explainer.liquidity.referenceSellShareOfSenior * 100).toFixed(1)}% of Sr`
                    : 'No pool'}
                </p>
                <p style={{ color: C.text, fontSize: 11.5 }}>
                  {liquidityIsFunded
                    ? `can sell at about ${(result.explainer.liquidity.referenceQuote.slippage * 100).toFixed(1)}% average slippage`
                    : 'Sr can only exit through primary redemption'}
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
                <p className="mt-2" style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>
                  {liquidityIsFunded
                    ? <>Largest one-time sale: <strong style={{ color: C.seniorLine, fontWeight: 600 }}>{(result.explainer.liquidity.boundarySellShareOfSenior * 100).toFixed(1)}%</strong> of Sr, at {(result.explainer.liquidity.boundaryQuote.slippage * 100).toFixed(1)}% below marked value.</>
                    : <span style={{ color: C.danger }}>Raise SLP liquidity above 0% to open a secondary market.</span>}
                </p>
              </div>
            </>
          )}
          {isExecutive && (
            <>
              <PanelTitle className="mt-2">
                Sell immediately through the SLP pool.
              </PanelTitle>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Sr can sell at the pool&apos;s current market price instead of waiting for primary redemption.
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
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                marginTop: 'auto',
                minHeight: 38,
                padding: '10px 16px',
                textTransform: 'uppercase',
                width: 'fit-content',
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
        </div>
      </section>}

      {isGuided && endStep && (
        <section
          id="day-sim-positions"
          style={{
            ...sectionCardStyle,
            ...(isTutorial && tutorialStep === 0 ? tutorialHighlightStyle : {}),
          }}
        >
          <DaySectionHeader title="Position comparison" />
          {isGuided && result.juniorCapitalInjectedShareOfStart > 0.001 && (
            <p className="mt-3" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}>
              <strong style={{ color: C.text, fontWeight: 600 }}>Jr was recapitalized during this run.</strong>{' '}
              Finalized losses were followed by fresh Jr capital equal to{' '}
              <strong style={{ color: C.juniorLine, fontFamily: MONO, fontWeight: 700 }}>
                {(result.juniorCapitalInjectedShareOfStart * 100).toFixed(0)}%
              </strong>{' '}
              of Jr&apos;s starting capital, so part of Sr&apos;s result is paid for by that
              top-up rather than by the source. Turn off &ldquo;Restore Jr after finalized
              losses&rdquo; to see the run without it.
            </p>
          )}
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
                        fontSize: 9,
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
                  ['Sr', 'Protected by Jr, and can exit early into the SLP pool; pays both a premium for it', from100(endStep.senior), pct(result.seniorApy), drawdownPct(result.seniorMaxDrawdown), C.seniorLine],
                  ['Jr', 'Takes first loss; earns risk premium', from100(endStep.junior), pct(result.juniorApy), drawdownPct(result.juniorMaxDrawdown), C.juniorLine],
                  ['SLP', 'Supplies the pool Sr sells into; earns liquidity premium', from100(endStep.liquidity), pct(result.liquidityApy), drawdownPct(result.liquidityMaxDrawdown), C.olive],
                ].map(([position, role, ending, apy, drawdown, color], index) => {
                  const open = openPositionRow === position;
                  const rule = index < 3 || open ? `1px solid ${C.border}` : undefined;
                  return (
                  <Fragment key={position as string}>
                  <tr
                    onClick={() => setOpenPositionRow(open ? null : (position as string))}
                    style={{ background: index % 2 === 0 ? C.cardBg : C.pageBg, cursor: 'pointer' }}
                  >
                    <td style={{ borderBottom: rule, color, fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: '10px' }}>
                      {position}
                    </td>
                    <td style={{ borderBottom: rule, color: C.muted, fontSize: 11.5, padding: '10px' }}>{role}</td>
                    <td style={{ borderBottom: rule, color, fontFamily: MONO, fontSize: 15, fontWeight: 600, padding: '10px' }}>{ending}</td>
                    <td style={{ borderBottom: rule, color: C.text, fontFamily: MONO, fontSize: 11.5, padding: '10px' }}>{apy}</td>
                    <td style={{ borderBottom: rule, color: C.text, fontFamily: MONO, fontSize: 11.5, padding: '10px' }}>
                      <span className="flex items-baseline justify-between gap-3">
                        <span>{drawdown}</span>
                        <button
                          aria-controls={`day-sim-position-${position}`}
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} where ${position}'s return comes from`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenPositionRow(open ? null : (position as string));
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: open ? C.accent : C.muted,
                            cursor: 'pointer',
                            fontSize: 13,
                            lineHeight: 1,
                            padding: '2px 4px',
                          }}
                          type="button"
                        >
                          {open ? '▾' : '▸'}
                        </button>
                      </span>
                    </td>
                  </tr>
                  {open && (() => {
                    const b = positionBreakdown(position as string);
                    const cell = { padding: '5px 10px', verticalAlign: 'baseline' } as const;
                    const label = { ...cell, color: C.text, fontSize: 11.5 };
                    const amount = { ...cell, color: C.text, fontFamily: MONO, fontSize: 11.5 };
                    const eyebrow = {
                      color: C.eyebrow, fontFamily: MONO, fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.12em', padding: '10px 10px 2px', textTransform: 'uppercase' as const,
                    };
                    // Real cells, so each label sits under "What it does" and each
                    // figure under "Avg / year" — the column adds up in place.
                    return (
                      <>
                        <tr id={`day-sim-position-${position}`} style={{ background: C.pageBg }}>
                          <td style={{ background: C.pageBg }} />
                          <td colSpan={4} style={eyebrow}>Where the return comes from</td>
                        </tr>
                        {b.contributions.map((c) => {
                          const negative = c.pct < 0;
                          return (
                            <tr key={c.label} style={{ background: C.pageBg }}>
                              <td style={{ background: C.pageBg }} />
                              <td style={label}>
                                {c.label}
                                {c.note && (
                                  <span style={{ color: C.kpiLabel, display: 'block', fontSize: 10, marginTop: 2 }}>{c.note}</span>
                                )}
                              </td>
                              <td style={cell} />
                              <td style={{ ...amount, color: negative ? C.danger : C.text, fontWeight: 600 }}>
                                {pctSigned(c.pct)}
                              </td>
                              <td style={cell} />
                            </tr>
                          );
                        })}
                        <tr style={{ background: C.pageBg }}>
                          <td style={{ background: C.pageBg }} />
                          <td style={{ ...label, borderTop: `1px solid ${C.text}`, fontSize: 12, fontWeight: 600 }}>
                            {b.net.label}
                          </td>
                          <td style={{ ...cell, borderTop: `1px solid ${C.text}` }} />
                          <td style={{ ...amount, borderTop: `1px solid ${C.text}`, color, fontSize: 14, fontWeight: 700 }}>
                            {pctSigned(b.net.pct)}
                          </td>
                          <td style={{ ...cell, borderTop: `1px solid ${C.text}` }} />
                        </tr>
                        {b.assumptions.length > 0 && (
                          <tr style={{ background: C.pageBg }}>
                            <td style={{ background: C.pageBg }} />
                            <td colSpan={4} style={eyebrow}>Assumptions</td>
                          </tr>
                        )}
                        {b.assumptions.map((a) => (
                          <tr key={a.label} style={{ background: C.pageBg }}>
                            <td style={{ background: C.pageBg }} />
                            <td style={{ ...label, color: C.muted, fontSize: 11 }}>{a.label}</td>
                            <td style={cell} />
                            <td colSpan={2} style={{ ...amount, color: C.muted, fontSize: 11 }}>{a.value}</td>
                          </tr>
                        ))}
                        <tr style={{ background: C.pageBg }}>
                          <td style={{ background: C.pageBg, borderBottom: index < 3 ? `1px solid ${C.border}` : undefined }} />
                          <td
                            colSpan={4}
                            style={{
                              borderBottom: index < 3 ? `1px solid ${C.border}` : undefined,
                              color: C.kpiLabel, fontSize: 10, lineHeight: 1.4,
                              padding: '8px 10px 10px', maxWidth: '78ch',
                            }}
                          >
                            {b.caveat}
                          </td>
                        </tr>
                      </>
                    );
                  })()}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isExecutive && showSection('observation-period') && sourceHasObservedDrawdown && (
        <section style={sectionCardStyle}>
          <Eyebrow>What is an Observation Period?</Eyebrow>
          <SectionTitle className="mt-2">
            A defined recovery window after Jr begins covering an Sr drawdown
          </SectionTitle>
          <p className="mt-2 max-w-3xl" style={{ color: C.muted, fontSize: 13, lineHeight: 1.45 }}>
            The window gives the strategy base asset time to recover before Jr&apos;s covered loss is finalized. Sr can still sell through the SLP pool while direct Sr and Jr deposits and redemptions are paused.
          </p>
          <GuidedObservationSteps days={observationDays} generalizeObservation />
        </section>
      )}

      {showSection('backtest') && <section style={sectionCardStyle}>
        <DaySectionHeader
          action={<DayButton
            aria-expanded={showReview}
            aria-label={showReview ? 'Collapse' : 'Expand'}
            onClick={() => setShowReview((value) => !value)}
            style={{ minHeight: 32, padding: '6px 10px' }}
            variant="quiet"
          >
            {isGuided ? (showReview ? 'Hide history' : 'Show history') : (showReview ? '−' : '+')}
          </DayButton>}
          description={forwardTest
            ? 'The shared accountant applies each forward path to the strategy base asset, Sr, Jr, and SLP. Select an outcome to compare timing and loss absorption.'
            : isExecutive
              ? 'This accountant-backed chart shows each position, every Observation Period, and every finalized loss.'
              : isGuided
                ? 'Not the performance of a live Royco Day market.'
                : DAY_LOCKED_COPY.reviewDescription}
          title={forwardTest
            ? `Test the ${forwardTest.termDays}-day facility under ${forwardTest.scenarios.length} payment outcomes.`
            : isExecutive
              ? 'See it in the market history.'
              : isGuided
                ? 'Historical backtest'
                : DAY_LOCKED_COPY.reviewTitle}
        />

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
                        <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4, marginTop: 5 }}>
                          {scenario.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
                  <ExecutiveMetric label="Total strategy cap" value={usd0(reverseMarket.strategyCap)} valueColor={C.text} />
                  <ExecutiveMetric label="Sr cap" value={usd0(reverseMarket.seniorCap)} valueColor={C.accent} />
                  <ExecutiveMetric label={`${reverseMarket.issuerName} Jr commitment`} value={usd0(reverseMarket.juniorCap)} valueColor={C.juniorLine} />
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                  {reverseMarket.seniorSupportLabel}: {usd0(reverseMarket.seniorSupportAmount)}. Jr deposits are closed and issuer-funded. SLP uses the shared 10% Sr / 90% stable-asset composition.
                </p>
                {selectedForwardScenario && (
                  <p className="mt-1" style={{ color: C.kpiLabel, fontSize: 10, lineHeight: 1.45 }}>
                    Selected outcome: {selectedForwardScenario.description}
                  </p>
                )}
              </div>
            )}
            {/* Reading guide and colour key share one panel so the chart is
                preceded by a single block rather than two stacked legends. */}
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12, padding: 12 }}>
              {isGuided && <GuidedChartGuide />}
              <div
                className="flex flex-wrap items-center gap-x-5 gap-y-1.5"
                style={{ color: C.muted, fontSize: 11.5, marginTop: isGuided ? 10 : 0 }}
              >
                <LegendSwatch color={C.seniorLine}>Sr share price</LegendSwatch>
                <LegendSwatch color={C.juniorLine}>Jr share price</LegendSwatch>
                <LegendSwatch color={C.olive}>SLP share price</LegendSwatch>
                <LegendSwatch color={C.strategyLine}>Strategy base asset</LegendSwatch>
                <span className="flex items-center gap-2">
                  <span style={{ color: C.danger }}>●</span> Jr loss finalized
                </span>
                <span className="flex items-center gap-2">
                  <span style={{ color: C.danger }}>●</span> Sr loss event
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
                    tick={{ fill: C.kpiLabel, fontSize: 11.5 }}
                    stroke={C.border}
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{ fill: C.kpiLabel, fontSize: 11.5 }}
                    stroke={C.border}
                    domain={[yMin, chartYMax]}
                    label={isNativeReturnUnit
                      ? {
                        value: `${returnUnit}-relative index (start = 100)`,
                        angle: -90,
                        position: 'insideLeft',
                        fill: C.kpiLabel,
                        fontSize: 11.5,
                      }
                      : {
                        value: '$ per $100 deposited',
                        angle: -90,
                        position: 'insideLeft',
                        fill: C.kpiLabel,
                        fontSize: 11.5,
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
                        fontSize: 11.5,
                      }}
                    />
                  ))}
                  <Line type="monotone" dataKey="strategy" name="Strategy base asset" stroke={C.strategyLine} dot={false} strokeWidth={1.3} />
                  <Line type="monotone" dataKey="junior" name="Jr" stroke={C.juniorLine} dot={false} strokeWidth={2.2} />
                  <Line type="monotone" dataKey="senior" name="Sr" stroke={C.seniorLine} dot={false} strokeWidth={2.2} />
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
                          text={`Jr ${endStep.junior.toFixed(0)}`}
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
                          text={`Sr ${endStep.senior.toFixed(0)}`}
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
              <p className="mt-2" style={{ color: C.kpiLabel, fontSize: 10, lineHeight: 1.45 }}>
                {backtestDisplay.footnote}
              </p>
            )}

            {forwardTest?.tailRiskDisclosure && (
              <p className="mt-2" style={{ color: C.danger, fontSize: 10, lineHeight: 1.45 }}>
                Tail risk: {forwardTest.tailRiskDisclosure}
              </p>
            )}

            {/* The window selector sits directly under the chart it controls,
                before the Observation Period explainer. */}
            <DayTimeframeBrush
              dates={allDates}
              series={displayedBrushSeries}
              bands={brushBands}
              view={displayedViewRange}
              isFull={isFullRange(displayedViewRange, displayMaxIndex)}
              mode={forwardTest ? 'forward' : 'backtest'}
              onChange={setDisplayedRange}
            />

            {isGuided && <GuidedObservationSteps days={observationDays} />}

            {isGuided && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: C.border }}>
                <div>
                  <p style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Monthly return table</p>
                  <p className="mt-0.5" style={{ color: C.muted, fontSize: 10 }}>For users who want every monthly change.</p>
                </div>
                <button
                  aria-expanded={showMonthly}
                  onClick={() => setShowMonthly((value) => !value)}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${C.border}`,
                    color: C.accent,
                    fontFamily: MONO,
                    fontSize: 9,
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

            {(!isGuided || showMonthly) && <div
              className="mt-3 overflow-x-auto"
              style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '4px 10px 8px' }}
            >
              <table className="w-full" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: MONO, fontSize: 11.8 }}>
                <thead>
                  <tr
                    className="text-left"
                    style={{
                      color: C.kpiLabel,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600,
                      fontSize: 9,
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
                  <ReturnRow positionColor={C.strategyLine} label="Strategy base asset" values={result.monthly.map((row) => row.strategyReturn)} end={endStep?.strategy ?? 100} annualized={result.strategyApy} showCurrency={!isNativeReturnUnit} />
                  <ReturnRow positionColor={C.seniorLine} label="Sr return" values={result.monthly.map((row) => row.seniorReturn)} end={endStep?.senior ?? 100} annualized={result.seniorApy} showCurrency={!isNativeReturnUnit} />
                  <ReturnRow positionColor={C.juniorLine} label="Jr return" values={result.monthly.map((row) => row.juniorReturn)} end={endStep?.junior ?? 100} annualized={result.juniorApy} showCurrency={!isNativeReturnUnit} />
                  <ReturnRow positionColor={C.olive} label="SLP return" values={result.monthly.map((row) => row.liquidityReturn)} end={endStep?.liquidity ?? 100} annualized={result.liquidityApy} showCurrency={!isNativeReturnUnit} />
                </tbody>
              </table>
            </div>}
          </div>
        )}
      </section>}

      {showSection('junior-funding') && !isGuided && <section style={{ ...sectionCardStyle, borderLeft: `3px solid ${C.accent}` }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>{isGuided ? 'Model assumption' : 'Jr funding assumption'}</Eyebrow>
            {isGuided && (
              <p className="mt-1" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4 }}>
                Decide whether fresh Jr capital replaces first-loss capital after a finalized loss.
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: C.muted, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={maintainCoverage}
              onChange={(event) => setMaintainCoverage(event.target.checked)}
              style={{ accentColor: C.accent }}
            />
            {isGuided ? 'Add fresh Jr capital after a finalized loss' : 'Add Jr capital after finalized losses'}
          </label>
        </div>
        <p className="mt-2" style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
          {maintainCoverage
            ? `Fresh Jr capital is added after each Observation Period closes to restore the ${coveragePct.toFixed(0)}% minimum coverage requirement. This run adds ${usd0(result.juniorCapitalInjected)}.`
            : 'No fresh Jr capital is added after finalized losses, so coverage can remain below its starting level.'}
        </p>
        <p className="mt-3" style={{ color: C.kpiLabel, fontSize: 11.5, lineHeight: 1.45 }}>
          Illustrative parameters. Not an offer or investment advice.
        </p>
      </section>}

      {isGuided && (
        <section style={sectionCardStyle}>
          <DaySectionHeader
            action={<DayButton
              aria-expanded={showUtilizationCurves}
              aria-label={showUtilizationCurves ? 'Collapse' : 'Expand'}
              onClick={() => setShowUtilizationCurves((value) => !value)}
              style={{ minHeight: 32, padding: '6px 10px' }}
              variant="quiet"
            >
              {showUtilizationCurves ? 'Hide curves' : 'Show curves'}
            </DayButton>}
            description="Each premium is a curve in its own utilization, and the two move independently: Jr's tracks coverage utilization, SLP's tracks liquidity utilization. Utilization moves with deposits and redemptions — it is set by the market, not by the issuer."
            title="How the premiums move with utilization"
          />
          {showUtilizationCurves && <div className="mt-4 grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
            {([
              {
                capitalAt: (u: number) => u > coveragePct / 100
                  ? seniorCapitalUsd * ((coveragePct / 100) / (u - coveragePct / 100))
                  : Number.POSITIVE_INFINITY,
                capitalNoun: 'Jr first-loss capital',
                color: C.juniorLine,
                curve: recentredCurve(defaults.riskYDM, shownRiskSharePct / 100),
                driver: 'Coverage utilization',
                funded: juniorIsFunded,
                key: 'risk',
                label: 'Jr risk premium · share of Sr yield',
                onChange: setScrubCoverageUtilPct,
                paidTo: 'Jr',
                scrubPct: scrubCoverageUtilPct,
              },
              {
                capitalAt: (u: number) => u > 0
                  ? seniorCapitalUsd * ((minLiquidityPct / 100) / u)
                  : Number.POSITIVE_INFINITY,
                capitalNoun: 'SLP pool capital',
                color: C.olive,
                curve: recentredCurve(defaults.liqYDM, shownLiqSharePct / 100),
                driver: 'Liquidity utilization',
                funded: liquidityIsFunded,
                key: 'liq',
                label: 'SLP liquidity premium · share of Sr yield',
                onChange: setScrubLiquidityUtilPct,
                paidTo: 'SLP',
                scrubPct: scrubLiquidityUtilPct,
              },
            ]).map((pane) => (
              <div key={pane.key} style={{ ...DAY_INPUT_PANEL, padding: 12 }}>
                <YieldShareCurve
                  color={pane.color}
                  curve={pane.curve}
                  label={pane.label}
                  scrubUtilization={pane.scrubPct / 100}
                  targetUtilization={DAY_TARGET_UTILIZATION}
                />
                {pane.funded && (
                  <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}>
                    At {pane.scrubPct.toFixed(0)}% this design holds{' '}
                    <strong style={{ color: pane.color, fontFamily: MONO, fontWeight: 700 }}>
                      {Number.isFinite(pane.capitalAt(pane.scrubPct / 100))
                        ? usd0(pane.capitalAt(pane.scrubPct / 100))
                        : 'unbounded'}
                    </strong>{' '}
                    of {pane.capitalNoun} behind{' '}
                    <strong style={{ color: C.text, fontFamily: MONO, fontWeight: 600 }}>{usd0(seniorCapitalUsd)}</strong>{' '}
                    of Sr — versus{' '}
                    <strong style={{ color: C.text, fontFamily: MONO, fontWeight: 600 }}>
                      {usd0(pane.capitalAt(DAY_TARGET_UTILIZATION))}
                    </strong>{' '}
                    at the {(DAY_TARGET_UTILIZATION * 100).toFixed(0)}% target. Utilization rises when Sr
                    grows faster than {pane.paidTo}, and falls when {pane.paidTo} is topped up.
                  </p>
                )}
                <div className="mt-3">
                  <SliderControl
                    description={`Sr pays ${(ydmShare({ mode: 'static', ...pane.curve }, pane.curve.yTarget, pane.scrubPct / 100, DAY_TARGET_UTILIZATION) * 100).toFixed(1)}% of its yield to ${pane.paidTo} at this utilization. The ${(DAY_TARGET_UTILIZATION * 100).toFixed(0)}% target is a fixed protocol parameter; every other outcome on this page is modeled at it.`}
                    display={`${pane.scrubPct.toFixed(0)}%`}
                    label={pane.driver}
                    max={100}
                    min={0}
                    onChange={pane.onChange}
                    step={1}
                    value={pane.scrubPct}
                  />
                </div>
              </div>
            ))}
          </div>}
        </section>
      )}

      {isGuided && (
        <hr
          aria-hidden
          style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '4px 0' }}
        />
      )}

      {isGuided && (
        <DayDeploymentInputs
          adaptationSpeed={defaults.riskYDM.maxAdaptSpeedPerYear}
          coveragePct={coveragePct}
          deploymentInputs={deploymentInputs}
          expanded={showDeploymentInputs}
          marketName={activeMarket.identity.marketName}
          observationDays={observationDays}
          onDeploymentInputChange={updateDeploymentInput}
          onToggleExpanded={() => setShowDeploymentInputs((value) => !value)}
          protectedExitThresholdPct={defaults.exitBufferPct}
          riskSharePct={riskSharePct}
          riskYDM={defaults.riskYDM}
          selfLiquidationBonus={defaults.selfLiquidationBonus}
          sourceApyPct={sourceApyPct}
        >
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <DayButton onClick={exportConfiguration} variant="primary">
              Export configuration (JSON)
            </DayButton>
            <span style={{ color: C.kpiLabel, fontSize: 10, lineHeight: 1.45 }}>
              Exports the simulated terms with the values entered above.
            </span>
          </div>
        </DayDeploymentInputs>
      )}

      {showSection('disclosure') && <footer
        style={{
          color: C.kpiLabel,
          fontSize: 11.5,
          lineHeight: 1.45,
        }}
        className="pb-8 border-t pt-4"
      >
        <p style={{ borderColor: C.border }}>
          <strong style={{ fontWeight: 600 }}>What this is, and what it is not.</strong>{' '}
          {activeMarket.provenance.dataMode === 'published-apy-forward'
            ? `The strategy base asset source is ${activeMarket.provenance.source}. This forward model uses the ${activeMarket.provenance.sourceProvider === 'User input' ? 'net' : 'published'} ${(activeMarket.provenance.publishedApy ?? defaults.sourceApy) * 100}% APY and does not present historical performance.`
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
  positionColor,
  values,
  end,
  annualized,
  showCurrency,
}: {
  label: string;
  positionColor?: string;
  values: number[];
  end: number;
  annualized: number;
  showCurrency: boolean;
}) {
  return (
    <tr style={{ borderTop: `1px solid ${C.border}` }}>
      <td className="text-left" style={{ padding: '6px 7px', borderBottom: `1px solid ${C.border}`, color: positionColor ?? C.text, fontWeight: positionColor ? 700 : 400, whiteSpace: 'nowrap' }}>
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
        <span style={{ color: C.kpiLabel, fontSize: 11.5 }}>
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
