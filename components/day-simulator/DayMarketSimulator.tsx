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
import { LOCKED_COPY } from '@/lib/simulator-template/locked-copy';
import {
  buildDayExplainerMetrics,
  type DayExplainerMetrics,
} from '@/lib/day-simulator-template/explainer';
import { isFullRange, normalizeRange, type IndexRange } from '@/lib/hybond/timeframe';
import type {
  DayMarket,
  DayMarketManifest,
  DaySeriesPoint,
} from '@/lib/day-simulator-template/market';
import {
  dayMarketFromManifest,
  isDaySectionVisible,
} from '@/lib/day-simulator-template/market';
import {
  buildDayErasureEvent,
  type DayErasureEvent,
} from '@/lib/day-simulator-template/erasure';
import { calibrateSeriesApy } from '@/lib/day-simulator-template/series';
import { shouldRefillJunior } from '@/lib/day-simulator-template/refill';
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
} from '@/lib/day-simulator-template/runtime';
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
  identity: {
    marketName: 'Royco Day',
    displayAssetName: 'Template strategy',
    underlyingAsset: 'the template strategy',
    seniorName: 'Senior',
    seniorSymbol: 'ST',
    juniorName: 'Junior',
    juniorSymbol: 'JT',
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
    stProtocolFee: 0,
    jtProtocolFee: 0,
    jtYieldShareProtocolFee: 0,
    ltYieldShareProtocolFee: 0,
    stableYield: 0.035,
    swapFeeBps: 10,
    poolTurnoverPerYear: 8,
    eclpBandWidth: 0.1,
    reinvestLiquidityPremium: true,
    initialST: 40_000_000,
    initialJT: 10_000_000,
    initialLT: 6_000_000,
  },
  targets: {
    seniorApyMin: 0,
    seniorApyMax: 1,
    juniorApyMin: 0,
    juniorApyMax: 10,
  },
  certification: {
    intakeConfirmed: true,
  },
  customization: {
    explicitlyAuthorized: false,
    authorizationNote: '',
    hiddenSections: [],
    copyOverrides: {},
  },
  provenance: {
    source: 'Deterministic one-year template path',
    sourceUrl: 'https://github.com/roycoprotocol/dawn-simulator',
    sourceProvider: 'Royco',
    dataCadence: 'monthly',
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

const FALLBACK_MARKET: DayMarket = dayMarketFromManifest(FALLBACK_MANIFEST, FALLBACK_SERIES);

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
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, minHeight: 88, padding: '14px 16px' }}>
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
  avoidLabelOverlap = false,
}: {
  metrics: DayExplainerMetrics['liquidity'];
  avoidLabelOverlap?: boolean;
}) {
  const width = 520;
  const height = 400;
  const margin = { left: 70, right: 24, top: 52, bottom: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xMax = metrics.boundarySellNAV;
  const curve = [
    { sellNAV: 0, executionPrice: 1, slippage: 0 },
    ...metrics.curve,
  ];
  const minExecutionPrice = Math.min(...curve.map((point) => point.executionPrice));
  const yMin = Math.max(0, minExecutionPrice - 0.006);
  const yRange = Math.max(0.001, 1 - yMin);
  const x = (sellNAV: number) => margin.left + (sellNAV / xMax) * plotWidth;
  const y = (executionPrice: number) => margin.top + ((1 - executionPrice) / yRange) * plotHeight;
  const baseline = margin.top + plotHeight;
  const referenceX = x(metrics.referenceSellNAV);
  const boundaryX = x(metrics.boundarySellNAV);
  const referenceY = y(metrics.referenceQuote.executionPrice);
  const boundaryY = y(metrics.boundaryQuote.executionPrice);
  const referenceSlippage = metrics.referenceQuote.slippage * 100;
  const boundarySlippage = metrics.boundaryQuote.slippage * 100;
  const referenceSellPct = metrics.referenceSellShareOfSenior * 100;
  const boundarySellPct = metrics.boundarySellShareOfSenior * 100;
  const curvePixels = curve.map((point) => ({ x: x(point.sellNAV), y: y(point.executionPrice) }));
  const curveLine = curvePixels.map((point) => `${point.x},${point.y}`).join(' ');
  const segmentIntersectsRect = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    rect: { left: number; right: number; top: number; bottom: number },
  ) => {
    if (start.x === end.x) {
      return start.x >= rect.left
        && start.x <= rect.right
        && Math.max(start.y, end.y) >= rect.top
        && Math.min(start.y, end.y) <= rect.bottom;
    }
    const segmentLeft = Math.max(Math.min(start.x, end.x), rect.left);
    const segmentRight = Math.min(Math.max(start.x, end.x), rect.right);
    if (segmentLeft > segmentRight) return false;
    const yAt = (pointX: number) => {
      return start.y + ((pointX - start.x) / (end.x - start.x)) * (end.y - start.y);
    };
    const segmentTop = Math.min(yAt(segmentLeft), yAt(segmentRight));
    const segmentBottom = Math.max(yAt(segmentLeft), yAt(segmentRight));
    return segmentBottom >= rect.top && segmentTop <= rect.bottom;
  };
  const labelPosition = (preferredX: number, pointY: number, textWidth: number, anchor: 'start' | 'end') => {
    if (!avoidLabelOverlap) return { x: preferredX, y: pointY - 13 };
    const horizontalOffsets = anchor === 'start' ? [0, 32, 64] : [0, -32, -64, -96, -128];
    const verticalOffsets = [-13, -34, -55, -76, -97, 28];
    for (const horizontalOffset of horizontalOffsets) {
      const candidateX = preferredX + horizontalOffset;
      const left = anchor === 'start' ? candidateX : candidateX - textWidth;
      for (const verticalOffset of verticalOffsets) {
        const candidateY = pointY + verticalOffset;
        const rect = {
          left: left - 4,
          right: left + textWidth + 4,
          top: candidateY - 15,
          bottom: candidateY + 4,
        };
        if (
          rect.left < margin.left + 4
          || rect.right > margin.left + plotWidth - 4
          || rect.top < margin.top + 4
          || rect.bottom > baseline - 4
        ) continue;
        const intersectsCurve = curvePixels.some((point, index) =>
          index > 0 && segmentIntersectsRect(curvePixels[index - 1], point, rect));
        if (!intersectsCurve) return { x: candidateX, y: candidateY };
      }
    }
    const fallbackX = anchor === 'end' ? preferredX - 96 : preferredX;
    return {
      x: fallbackX,
      y: Math.max(margin.top + 20, pointY - 34),
    };
  };
  const referenceLabel = labelPosition(referenceX + 12, referenceY, 104, 'start');
  const boundaryLabel = labelPosition(boundaryX - 10, boundaryY, 112, 'end');
  const arbitrageArea = [
    `${x(0)},${y(1)}`,
    `${boundaryX},${y(1)}`,
    ...curve.slice().reverse().map((point) => `${x(point.sellNAV)},${y(point.executionPrice)}`),
  ].join(' ');
  return (
    <div data-accountant-source="buildDayExplainerMetrics.liquidity">
      <svg
        aria-label={`Atomic Senior exits execute immediately against the liquidity pool. An exit equal to ${referenceSellPct.toFixed(1)}% of opening Senior NAV has ${referenceSlippage.toFixed(1)}% slippage, while an exit equal to ${boundarySellPct.toFixed(1)}% of opening Senior NAV has ${boundarySlippage.toFixed(1)}% slippage. The widening discount to underlying redemption value represents a growing arbitrage incentive to restore the price.`}
        className="mt-3 w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={margin.left}
            y1={margin.top + plotHeight * fraction}
            x2={margin.left + plotWidth}
            y2={margin.top + plotHeight * fraction}
            stroke={C.border}
            strokeDasharray="4 4"
          />
        ))}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={baseline} stroke={C.border} />
        <line x1={margin.left} y1={baseline} x2={margin.left + plotWidth} y2={baseline} stroke={C.border} />
        <polygon points={arbitrageArea} fill={C.olive} fillOpacity={0.09} />
        <line x1={margin.left} y1={y(1)} x2={margin.left + plotWidth} y2={y(1)} stroke={C.olive} strokeWidth={2} strokeDasharray="6 4" />
        <polyline points={curveLine} fill="none" stroke={C.seniorLine} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={referenceX} y1={referenceY - 3} x2={referenceX} y2={y(1) + 10} stroke={C.olive} strokeWidth={2} />
        <path d={`M ${referenceX - 5} ${y(1) + 17} L ${referenceX} ${y(1) + 9} L ${referenceX + 5} ${y(1) + 17}`} fill="none" stroke={C.olive} strokeWidth={2} />
        <line x1={boundaryX - 6} y1={boundaryY - 3} x2={boundaryX - 6} y2={y(1) + 10} stroke={C.olive} strokeWidth={3} />
        <path d={`M ${boundaryX - 12} ${y(1) + 19} L ${boundaryX - 6} ${y(1) + 9} L ${boundaryX} ${y(1) + 19}`} fill="none" stroke={C.olive} strokeWidth={3} />
        <circle cx={referenceX} cy={referenceY} r={5} fill={C.cardBg} stroke={C.olive} strokeWidth={2.5} />
        <circle cx={boundaryX} cy={boundaryY} r={6} fill={C.cardBg} stroke={C.danger} strokeWidth={3} />
        <text x={margin.left + 8} y={margin.top - 15} fill={C.olive} fontSize={13} fontWeight={600}>
          Underlying redemption value
        </text>
        <text x={margin.left + plotWidth} y={margin.top - 15} fill={C.olive} fontSize={13} fontWeight={600} textAnchor="end">
          Arbitrage incentive grows →
        </text>
        <text
          x={referenceLabel.x}
          y={referenceLabel.y}
          fill={C.danger}
          fontFamily={MONO}
          fontSize={12.5}
          fontWeight={600}
        >
          {referenceSlippage.toFixed(1)}% slippage
        </text>
        <text
          x={boundaryLabel.x}
          y={boundaryLabel.y}
          fill={C.danger}
          fontFamily={MONO}
          fontSize={12.5}
          fontWeight={600}
          textAnchor="end"
        >
          {boundarySlippage.toFixed(1)}% slippage
        </text>
        <text x={referenceX} y={height - 37} fill={C.olive} fontFamily={MONO} fontSize={15} fontWeight={700} textAnchor="middle">
          {referenceSellPct.toFixed(1)}%
        </text>
        <text x={boundaryX} y={height - 37} fill={C.danger} fontFamily={MONO} fontSize={15} fontWeight={700} textAnchor="end">
          {boundarySellPct.toFixed(1)}%
        </text>
        <text x={14} y={margin.top + 4} fill={C.olive} fontFamily={MONO} fontSize={11}>100%</text>
        <text x={14} y={baseline + 4} fill={C.kpiLabel} fontFamily={MONO} fontSize={11}>
          {(yMin * 100).toFixed(1)}%
        </text>
        <text transform={`translate(13 ${margin.top + plotHeight / 2}) rotate(-90)`} fill={C.kpiLabel} fontSize={12} textAnchor="middle">
          Execution value
        </text>
        <text x={margin.left + plotWidth / 2} y={height - 8} fill={C.kpiLabel} fontSize={12} textAnchor="middle">
          Atomic Senior exit (% of Senior notional)
        </text>
      </svg>
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
  const line = metrics.points.map((point) => `${x(point.loss)},${y(point.seniorBalancePer100)}`).join(' ');
  const breakpointX = x(metrics.coverageLossLimit);
  const endpointX = x(metrics.displayMaxLoss);
  const endpointY = y(metrics.endingSeniorBalancePer100);
  const narrowCoverageZone = metrics.coverageLossLimit / metrics.displayMaxLoss < 0.18;
  return (
    <div data-accountant-source="buildDayExplainerMetrics.coverage">
      <svg
        aria-label={`Senior stays at $100 through a ${(metrics.coverageLossLimit * 100).toFixed(1)}% strategy loss, then declines to $${metrics.endingSeniorBalancePer100.toFixed(1)} at a ${(metrics.displayMaxLoss * 100).toFixed(1)}% loss.`}
        className="mt-3 w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
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
        <circle cx={breakpointX} cy={y(100)} r={7} fill={C.cardBg} stroke={C.olive} strokeWidth={3} />
        <circle cx={endpointX} cy={endpointY} r={7} fill={C.cardBg} stroke={C.danger} strokeWidth={3} />
        <text x={14} y={margin.top + 5} fill={C.kpiLabel} fontFamily={MONO} fontSize={12}>$100</text>
        <text x={14} y={margin.top + plotHeight + 4} fill={C.kpiLabel} fontFamily={MONO} fontSize={12}>${yMin}</text>
        <text x={margin.left} y={height - 32} fill={C.kpiLabel} fontFamily={MONO} fontSize={12}>0%</text>
        <text
          x={breakpointX}
          y={narrowCoverageZone ? height - 47 : height - 32}
          fill={C.eyebrow}
          fontFamily={MONO}
          fontSize={12}
          textAnchor={narrowCoverageZone ? 'start' : 'middle'}
        >
          {(metrics.coverageLossLimit * 100).toFixed(1)}%
        </text>
        <text x={margin.left + plotWidth} y={height - 32} fill={C.kpiLabel} fontFamily={MONO} fontSize={12} textAnchor="end">
          {(metrics.displayMaxLoss * 100).toFixed(1)}%
        </text>
        <text
          x={narrowCoverageZone ? margin.left + 10 : (margin.left + breakpointX) / 2}
          y={margin.top + 27}
          fill={C.olive}
          fontSize={12.5}
          fontWeight={600}
          textAnchor={narrowCoverageZone ? 'start' : 'middle'}
        >
          Junior absorbs loss
        </text>
        <text x={(breakpointX + endpointX) / 2} y={margin.top + 27} fill={C.danger} fontSize={12.5} fontWeight={600} textAnchor="middle">
          Senior absorbs excess
        </text>
        <text
          x={narrowCoverageZone ? breakpointX + 12 : breakpointX - 12}
          y={y(100) + 56}
          fill={C.olive}
          fontFamily={MONO}
          fontSize={12.5}
          fontWeight={600}
          textAnchor={narrowCoverageZone ? 'start' : 'end'}
        >
          $100 covered
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
          Senior $ balance
        </text>
        <text x={margin.left + plotWidth / 2} y={height - 8} fill={C.kpiLabel} fontSize={12} textAnchor="middle">
          Base strategy loss
        </text>
      </svg>
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
        <span style={copyStyle}>A shaded band is an observation period.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ background: C.danger, borderRadius: 9999, height: 9, width: 9 }} />
        <span style={copyStyle}>A Junior mark means covered loss became permanent.</span>
      </div>
      <div style={itemStyle}>
        <span aria-hidden="true" style={{ border: `2px solid ${C.danger}`, borderRadius: 9999, height: 10, width: 10 }} />
        <span style={copyStyle}>A Senior mark means loss reached Senior.</span>
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
  const steps = [
    {
      number: '1',
      title: 'Drawdown',
      body: 'Junior covers Senior first. The covered amount is tracked for possible recovery.',
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 54">
          <line x1="5" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,15 48,14 86,20 124,38 164,31 205,27" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <polyline points="5,15 48,15 86,16 124,18 164,18 205,18" fill="none" stroke={C.seniorLine} strokeWidth="2" />
        </svg>
      ),
    },
    {
      number: '2',
      title: generalizeObservation ? 'Observation period' : `${days}-day observation`,
      body: generalizeObservation
        ? `Its duration is market-specific (${days} days here). Direct Senior and Junior deposits/redemptions pause; LP withdrawals pause. Senior can still sell through the LP.`
        : 'Direct Senior and Junior deposits/redemptions pause; LP withdrawals pause. Senior can still sell through the LP.',
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 54">
          <rect x="72" y="2" width="70" height="48" fill={C.obsFill} fillOpacity="0.32" />
          <line x1="5" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,15 48,16 84,24 111,38 144,29 174,24 205,22" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <polyline points="5,15 48,15 84,17 111,18 144,18 174,18 205,18" fill="none" stroke={C.seniorLine} strokeWidth="2" />
        </svg>
      ),
    },
    {
      number: '3',
      title: 'Recover or finalize',
      body: generalizeObservation
        ? "A full recovery restores Junior. If the window ends before full recovery, Junior's covered loss becomes permanent."
        : "Recovery restores Junior first. If the window ends before recovery, Junior's covered loss becomes permanent.",
      art: (
        <svg aria-hidden="true" className="mt-3 w-full" viewBox="0 0 210 54">
          <line x1="5" x2="95" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="5,15 28,18 49,34 72,23 95,10" fill="none" stroke={C.olive} strokeWidth="2" />
          <text x="105" y="30" fill={C.kpiLabel} fontFamily={MONO} fontSize="9" textAnchor="middle">OR</text>
          <line x1="116" x2="205" y1="15" y2="15" stroke={C.kpiLabel} strokeDasharray="4 4" />
          <polyline points="116,15 140,19 162,34 184,34 205,34" fill="none" stroke={C.juniorLine} strokeWidth="2" />
          <circle cx="184" cy="34" r="4" fill={C.danger} />
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
  days > 0 && start > 0 && end > 0 ? Math.pow(end / start, 365 / days) - 1 : 0;
const pct = (value: number, digits = 1) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
const usd0 = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const signColor = (value: number) => (value < 0 ? C.danger : C.text);

export default function DayMarketSimulator({
  market,
  variant = 'standard',
}: {
  market?: DayMarket;
  variant?: 'standard' | 'guided' | 'executive';
}) {
  const activeMarket = market ?? FALLBACK_MARKET;
  const isGuided = variant === 'guided';
  const isExecutive = variant === 'executive';
  const showSection = (section: (typeof activeMarket.customization.hiddenSections)[number]) =>
    isDaySectionVisible(activeMarket.customization, section);
  const heroTitle = activeMarket.customization.copyOverrides.heroTitle
    ?? 'Make illiquid yield easier to own.';
  const heroDescription = activeMarket.customization.copyOverrides.heroDescription
    ?? 'Royco Day gives Senior holders first-loss coverage and a dedicated exit pool. Junior and LP participants earn additional yield for providing those benefits.';
  const defaults = activeMarket.defaults;
  const [showInputs, setShowInputs] = useState(false);
  const [showReview, setShowReview] = useState(true);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartTickCount, setChartTickCount] = useState(7);
  const [sourceApyPct, setSourceApyPct] = useState(defaults.sourceApy * 100);
  const [coveragePct, setCoveragePct] = useState(defaults.coverage * 100);
  const [minLiquidityPct, setMinLiquidityPct] = useState(defaults.minLiquidity * 100);
  const [riskSharePct, setRiskSharePct] = useState(defaults.riskYDM.yTarget * 100);
  const [liqSharePct, setLiqSharePct] = useState(defaults.liqYDM.yTarget * 100);
  const [observationDays, setObservationDays] = useState(defaults.observationDays);
  const [maintainCoverage, setMaintainCoverage] = useState(defaults.maintainCoverage);
  const [range, setRange] = useState<IndexRange>({
    a: 0,
    b: activeMarket.series.length - 1,
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
    const riskTarget = riskSharePct / 100;
    const liqTarget = liqSharePct / 100;
    const initial = buildDayInitialBalances(defaults, { coverage, minLiquidity });
    const cfg = buildDayMarketConfig(defaults, {
      coverage,
      minLiquidity,
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
        const reason = /term expired/i.test(exitEvent?.msg ?? '')
          ? 'observation period ended'
          : /liquidation breach/i.test(exitEvent?.msg ?? '')
            ? 'coverage-based Senior exit opened'
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
    liqSharePct,
    maintainCoverage,
    modeledSeries,
    minLiquidityPct,
    observationDays,
    riskSharePct,
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
  }, [chartTickCount, result.chart, yearMarks]);
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
          {isExecutive ? heroTitle : activeMarket.copy.title}
        </h1>
        <p className="max-w-3xl" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38, margin: '0 0 12px' }}>
          {isExecutive
            ? heroDescription
            : isGuided
            ? 'See how one yield strategy can support three different positions.'
            : activeMarket.copy.description}
        </p>
      </section>

      {isExecutive && showSection('senior-summary') && (
        <section style={{ ...cardStyle, padding: 16 }}>
          <Eyebrow>What Senior receives</Eyebrow>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
            <ExecutiveMetric label="Senior average yield" value={`${pct(result.seniorApy)}/yr`} valueColor={C.accent} />
            <ExecutiveMetric label="Contract-enforced coverage" value={`${coveragePct.toFixed(0)}% minimum`} valueColor={C.juniorLine} />
            <ExecutiveMetric label="Dedicated liquidity" value={`${minLiquidityPct.toFixed(0)}% minimum`} valueColor={C.olive} />
          </div>
        </section>
      )}

      {isExecutive && showSection('roles') && (
        <section style={{ ...cardStyle, padding: 16 }}>
          <Eyebrow>One opportunity · three roles</Eyebrow>
          <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 24, fontWeight: 400, lineHeight: 1.12 }}>
            One investment opportunity becomes three specialized positions.
          </h2>
          <p className="mt-2" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.45 }}>
            Each position earns yield for doing a different job. Senior pays premiums for coverage and liquidity, and Junior and LP earn those premiums for providing them.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
            <div style={{ background: C.pageBg, border: `1px solid ${C.seniorLine}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Senior · yield and liquidity</Eyebrow>
              <p className="mt-3" style={{ color: C.accent, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.seniorApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Senior takes losses only after Junior.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Senior keeps the remaining strategy yield and can exit through the dedicated LP before the underlying asset matures.
              </p>
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.juniorLine}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>Junior · first-loss capital</Eyebrow>
              <p className="mt-3" style={{ color: C.juniorLine, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.juniorApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Gets paid to take losses first.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Earns a risk premium because Junior takes investment losses before Senior does.
              </p>
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.olive}`, minHeight: 178, padding: 14 }}>
              <Eyebrow>LP · dedicated liquidity</Eyebrow>
              <p className="mt-3" style={{ color: C.olive, fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>
                {pct(result.liquidityApy)}/yr
              </p>
              <p className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Gets paid to fund exits.</p>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Earns a liquidity premium by providing the assets Senior holders can sell into.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_56px_1fr]" style={{ alignItems: 'center', gap: 8 }}>
            <div style={{ background: `${C.strategyLine}12`, border: `1px solid ${C.border}`, padding: 12 }}>
              <p style={{ color: C.kpiLabel, fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Underlying opportunity</p>
              <p className="mt-1" style={{ color: C.strategyLine, fontFamily: SERIF, fontSize: 18 }}>{activeMarket.identity.displayAssetName} base yield</p>
            </div>
            <div className="hidden items-center justify-center md:flex" aria-hidden="true" style={{ color: C.faint, fontFamily: MONO, fontSize: 20 }}>→</div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 8 }}>
              <div style={{ borderLeft: `3px solid ${C.eyebrow}`, padding: '7px 10px' }}>
                <p style={{ color: C.eyebrow, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' }}>Risk premium → Junior</p>
                <p className="mt-1" style={{ color: C.muted, fontSize: 11 }}>Pays for first-loss coverage.</p>
              </div>
              <div style={{ borderLeft: `3px solid ${C.olive}`, padding: '7px 10px' }}>
                <p style={{ color: C.olive, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' }}>Liquidity premium → LP</p>
                <p className="mt-1" style={{ color: C.muted, fontSize: 11 }}>Pays for dedicated liquidity.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {!isExecutive && <section style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>How Day works</Eyebrow>
        {isGuided && (
          <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.12 }}>
            One strategy. Three positions. Each is paid for a different role.
          </h2>
        )}
        <div
          className="mt-3 grid grid-cols-1 xl:grid-cols-[minmax(0,2.3fr)_minmax(290px,1fr)]"
          style={{ gap: 8, alignItems: 'center' }}
        >
          <div
            className="grid grid-cols-1 md:grid-cols-[minmax(140px,.9fr)_24px_minmax(135px,.85fr)_minmax(96px,.62fr)_minmax(180px,1.12fr)]"
            style={{ gap: 8, alignItems: 'center', minWidth: 0 }}
          >
            <FlowBox
              eyebrow="Underlying"
              value="Base yield"
              note={`${activeMarket.provenance.feesIncluded ? 'Fee-inclusive' : 'Fee-exclusive'} source ${activeMarket.provenance.priceType.toUpperCase()} path`}
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
              eyebrow="Tranche"
              value="Senior (ST)"
              note="Keeps residual yield after premiums"
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
                <title>Risk premium from Senior to Junior; Liquidity premium from Senior to LP</title>
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
                eyebrow="Coverage"
                value="Junior (JT)"
                note="Funds Senior downside coverage"
                color={C.juniorLine}
              />
              <FlowBox
                eyebrow="Liquidity"
                value="LP"
                note="Funds secondary-market liquidity"
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
                  <span style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Coverage</span>
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                  {DAY_LOCKED_COPY.coverageBenefit}
                </p>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <div className="flex items-center gap-3">
                  <span style={{ background: C.olive, borderRadius: 9999, height: 8, width: 8 }} />
                  <span style={{ color: C.text, fontFamily: SERIF, fontSize: 18 }}>Liquidity</span>
                </div>
                <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                  {DAY_LOCKED_COPY.liquidityBenefit}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>}

      {showSection('market-inputs') && <section style={{ ...cardStyle, padding: '10px 12px' }}>
        <div className="flex items-center justify-between gap-4">
          <Eyebrow>Market inputs</Eyebrow>
          <button
            type="button"
            onClick={() => setShowInputs((value) => !value)}
            aria-label={showInputs ? 'Collapse market inputs' : 'Expand market inputs'}
            aria-expanded={showInputs}
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
            {showInputs ? '−' : '+'}
          </button>
        </div>

        {showInputs && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2" style={{ gap: 8 }}>
            <div style={{ background: `${C.strategyLine}14`, border: `1px solid ${C.strategyLine}`, padding: 12 }}>
              <SliderControl
                label="Base strategy APY (%)"
                value={sourceApyPct}
                min={0}
                max={30}
                step={0.1}
                display={`${sourceApyPct.toFixed(1)}%`}
                description=""
                tone={C.muted}
                labelColor={C.muted}
                onChange={setSourceApyPct}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, padding: 12 }}>
              <SliderControl
                label="Minimum coverage (%)"
                value={coveragePct}
                min={3}
                max={65}
                step={1}
                display={`${coveragePct.toFixed(0)}%`}
                description=""
                onChange={setCoveragePct}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, padding: 12 }}>
              <SliderControl
                label="Minimum liquidity (%)"
                value={minLiquidityPct}
                min={1}
                max={50}
                step={1}
                display={`${minLiquidityPct.toFixed(0)}%`}
                description=""
                onChange={setMinLiquidityPct}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, padding: 12 }}>
              <SliderControl
                label="Junior yield share (%)"
                value={riskSharePct}
                min={0}
                max={80}
                step={1}
                display={`${riskSharePct.toFixed(0)}%`}
                description=""
                onChange={(value) => {
                  setRiskSharePct(value);
                  if (value + liqSharePct > 100) setLiqSharePct(100 - value);
                }}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, padding: 12 }}>
              <SliderControl
                label="LP yield share (%)"
                value={liqSharePct}
                min={0}
                max={80}
                step={1}
                display={`${liqSharePct.toFixed(0)}%`}
                description=""
                onChange={(value) => {
                  setLiqSharePct(value);
                  if (value + riskSharePct > 100) setRiskSharePct(100 - value);
                }}
              />
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, padding: 12 }}>
              <SliderControl
                label="Observation period duration (days)"
                value={observationDays}
                min={7}
                max={194}
                step={1}
                display={`${observationDays} days`}
                description=""
                onChange={setObservationDays}
              />
            </div>
          </div>
        )}
      </section>}

      {!isExecutive && <section style={{ ...cardStyle, padding: 14 }}>
        <Eyebrow>APYs</Eyebrow>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
          <Kpi label="Senior avg/yr" value={`${pct(result.seniorApy)}/yr`} valueColor={C.accent} />
          <Kpi label="Junior avg/yr" value={`${pct(result.juniorApy)}/yr`} valueColor={C.text} />
          <Kpi label="LP avg/yr" value={`${pct(result.liquidityApy)}/yr`} valueColor={C.olive} />
        </div>
      </section>}

      {showSection('liquidity-and-coverage') && <section className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 10 }}>
        <div style={{ ...cardStyle, padding: 14 }}>
          {isExecutive ? <Eyebrow>If a Senior wants to exit</Eyebrow> : <Eyebrow>Liquidity</Eyebrow>}
          {isExecutive && (
            <>
              <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.12 }}>
                Sell through the dedicated LP.
              </h2>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Senior does not have to wait for the underlying asset to mature.
              </p>
            </>
          )}
          <LiquidityExecutionDiagram metrics={result.explainer.liquidity} avoidLabelOverlap={isExecutive} />
          {(isGuided || isExecutive) && (
            <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
              {isExecutive
                ? 'Larger sale → larger discount → stronger arbitrage incentive to buy below underlying redemption value.'
                : 'Senior can exit through the LP. Larger atomic sales move farther down the curve and create a larger arbitrage opportunity.'}
            </p>
          )}
        </div>

        <div style={{ ...cardStyle, padding: 14 }}>
          {isExecutive ? <Eyebrow>Loss waterfall</Eyebrow> : <Eyebrow>Coverage</Eyebrow>}
          {isExecutive && (
            <>
              <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.12 }}>
                Junior absorbs loss first.
              </h2>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Contracts require a minimum Junior buffer behind Senior, providing first-loss coverage.
              </p>
            </>
          )}
          <CoverageLossDiagram metrics={result.explainer.coverage} />
          {(isGuided || isExecutive) && (
            <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
              {isExecutive ? 'At the current starting balance, ' : 'Coverage is Junior\'s first-loss buffer. At the current starting balance, '}
              Junior can absorb about {(result.explainer.coverage.coverageLossLimit * 100).toFixed(1)}% of strategy losses before Senior declines.
            </p>
          )}
        </div>
      </section>}

      {isExecutive && showSection('observation-period') && (
        <section style={{ ...cardStyle, padding: 16 }}>
          <Eyebrow>What is an observation period?</Eyebrow>
          <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 24, fontWeight: 400, lineHeight: 1.12 }}>
            A defined recovery window after Junior begins covering a loss.
          </h2>
          <p className="mt-2 max-w-3xl" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.45 }}>
            The window gives the strategy time to recover before Junior&apos;s covered loss becomes permanent. Senior can still sell through the LP while direct Senior and Junior deposits and redemptions are paused.
          </p>
          <GuidedObservationSteps days={observationDays} generalizeObservation />
        </section>
      )}

      {showSection('backtest') && <section style={cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Backtest</Eyebrow>
            <h2 className="mt-2" style={{ color: C.text, fontFamily: SERIF, fontSize: 22, fontWeight: 400, lineHeight: 1.08 }}>
              {isExecutive ? 'See it in the market history.' : isGuided ? 'See the rules play out over time.' : LOCKED_COPY.reviewTitle}
            </h2>
            <p className="mt-1" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.38 }}>
              {isExecutive
                ? 'This accountant-backed chart shows each position, every observation period, and any loss that becomes permanent.'
                : isGuided
                ? 'Use the chart to see when Junior coverage is active, when a loss can still recover, and when it becomes permanent.'
                : LOCKED_COPY.reviewDescription}
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
            {isGuided && <GuidedChartGuide />}
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
            <div ref={chartContainerRef} style={{ width: '100%', minWidth: 0, height: 360, minHeight: 360 }}>
              <ResponsiveContainerNoSSR>
                <LineChart
                  data={result.chart}
                  margin={{ top: 8, right: chartTickCount <= 3 ? 36 : 16, bottom: 8, left: 0 }}
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

            {isGuided && <GuidedObservationSteps days={observationDays} />}

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
      </section>}

      {showSection('junior-funding') && <section style={{ ...cardStyle, borderLeft: `3px solid ${C.accent}` }}>
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
      </section>}

      {showSection('disclosure') && <footer
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
      </footer>}
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
