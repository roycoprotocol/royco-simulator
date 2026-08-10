'use client';

import { useCallback, useMemo, useRef } from 'react';

import {
  DayChartTooltip,
  useDayChartHover,
} from '@/components/day-simulator/DayChartTooltip';
import {
  indexFromFraction,
  moveHandle,
  nearestSide,
  panRange,
  pctOf,
  type IndexRange,
} from '@/lib/hybond/timeframe';

const C = {
  cardBg: '#FFFDF9',
  border: '#E8E2D8',
  text: '#171511',
  muted: '#6D6860',
  eyebrow: '#967756',
  kpiLabel: '#A49B90',
  seniorLine: '#8E7355',
  juniorLine: '#1B1A17',
  strategyLine: '#A7A39A',
  liquidityLine: '#319C61',
  obsFill: '#F4C77B',
};

const MONO = '"SFMono-Regular", Consolas, monospace';
const BRUSH_TRACK_H = 54;
const BRUSH_VB_W = 1000;

type DragMode =
  | { kind: 'handle'; side: 'start' | 'end' }
  | { kind: 'pan'; grabIndex: number; origin: IndexRange };

const dateLabel = (key: string) => key;

export function DayTimeframeBrush({
  dates,
  series,
  bands,
  view,
  isFull,
  mode = 'backtest',
  onChange,
}: {
  dates: string[];
  series: { strategy: number[]; senior: number[]; junior: number[]; liquidity: number[] };
  bands: { a: number; b: number }[];
  view: IndexRange;
  isFull: boolean;
  mode?: 'backtest' | 'forward';
  onChange: (range: IndexRange) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const [hoverIndex, setHoverIndex] = useDayChartHover<number>('timeframe');
  const max = Math.max(0, dates.length - 1);

  const indexFromEvent = useCallback(
    (clientX: number) => {
      const element = trackRef.current;
      if (!element) return 0;
      const bounds = element.getBoundingClientRect();
      return indexFromFraction((clientX - bounds.left) / Math.max(bounds.width, 1), max);
    },
    [max],
  );

  const begin = (mode: DragMode, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    trackRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = mode;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const index = indexFromEvent(event.clientX);
    setHoverIndex(index);
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'handle') onChange(moveHandle(view, drag.side, index, max));
    else onChange(panRange(drag.origin, index - drag.grabIndex, max));
  };

  const endDrag = (event: React.PointerEvent) => {
    dragRef.current = null;
    if (trackRef.current?.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const onTrackDown = (event: React.PointerEvent) => {
    const index = indexFromEvent(event.clientX);
    setHoverIndex(index);
    const side = nearestSide(view, index);
    begin({ kind: 'handle', side }, event);
    onChange(moveHandle(view, side, index, max));
  };

  const onHandleKey = (side: 'start' | 'end') => (event: React.KeyboardEvent) => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const step = direction * (event.shiftKey ? 12 : 1);
    onChange(moveHandle(view, side, (side === 'start' ? view.a : view.b) + step, max));
  };

  const leftPct = pctOf(view.a, max);
  const rightPct = pctOf(view.b, max);
  const hoverPct = hoverIndex === null ? null : pctOf(hoverIndex, max);

  const years = useMemo(() => {
    const output: { year: number; pct: number }[] = [];
    if (!dates.length) return output;
    const first = Number(dates[0].slice(0, 4));
    const last = Number(dates[dates.length - 1].slice(0, 4));
    for (let year = first; year <= last; year += 1) {
      const index = dates.findIndex((date) => Number(date.slice(0, 4)) >= year);
      output.push({ year, pct: pctOf(index < 0 ? max : index, max) });
    }
    return output;
  }, [dates, max]);

  const preview = useMemo(() => {
    const all = [...series.strategy, ...series.senior, ...series.junior, ...series.liquidity];
    if (!all.length || max <= 0) return null;
    let low = Math.min(...all);
    let high = Math.max(...all);
    const span = Math.max(high - low, 1);
    low -= span * 0.12;
    high += span * 0.08;
    const padY = 7;
    const x = (index: number) => (index / max) * BRUSH_VB_W;
    const y = (value: number) =>
      BRUSH_TRACK_H - padY - ((value - low) / (high - low)) * (BRUSH_TRACK_H - padY * 2);
    const path = (values: number[]) =>
      values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
    return {
      strategy: path(series.strategy),
      senior: path(series.senior),
      junior: path(series.junior),
      liquidity: path(series.liquidity),
      bands: bands.map((band) => ({ x: x(band.a), w: Math.max(x(band.b) - x(band.a), 1.5) })),
    };
  }, [bands, max, series]);

  if (!dates.length) return null;

  const isForward = mode === 'forward';
  const startAriaLabel = isForward
    ? `Forward test window start, ${dateLabel(dates[view.a])}`
    : `Backtest window start, ${dateLabel(dates[view.a])}`;
  const endAriaLabel = isForward
    ? `Forward test window end, ${dateLabel(dates[view.b])}`
    : `Backtest window end, ${dateLabel(dates[view.b])}`;

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
      aria-label={isForward ? 'Forward test window controls' : 'Backtest window controls'}
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
        style={{ color: C.kpiLabel, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' }}
      >
        <span>{isForward ? 'Forward test window' : 'Backtest window'}</span>
        <span style={{ color: C.text, fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>
          {isFull ? (isForward ? 'Full scenario' : 'Full history') : `${dateLabel(dates[view.a])} to ${dateLabel(dates[view.b])}`}
        </span>
      </div>

      <div style={{ padding: '2px 4px 0' }}>
        <div
          ref={trackRef}
          aria-label={`${isForward ? 'Forward scenario' : 'Full history'} overview. Hover, tap, or focus and use the arrow keys to inspect values.`}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoverIndex(null);
          }}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setHoverIndex(Math.round((view.a + view.b) / 2));
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowLeft' ? -1 : 1;
            setHoverIndex(Math.max(0, Math.min(max, (hoverIndex ?? Math.round((view.a + view.b) / 2)) + direction)));
          }}
          onMouseLeave={() => {
            if (!dragRef.current) setHoverIndex(null);
          }}
          onPointerDown={onTrackDown}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch' && !dragRef.current) setHoverIndex(null);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="group"
          tabIndex={0}
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
              aria-label={isForward ? 'Full scenario overview for the forward test window' : 'Full history overview for the backtest window'}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            >
              {preview.bands.map((band, index) => (
                <rect key={`bb-${index}`} x={band.x} y={0} width={band.w} height={BRUSH_TRACK_H} fill={C.obsFill} fillOpacity={0.18} />
              ))}
              {years.map((year) => (
                <line
                  key={`by-${year.year}`}
                  x1={(year.pct / 100) * BRUSH_VB_W}
                  y1={0}
                  x2={(year.pct / 100) * BRUSH_VB_W}
                  y2={BRUSH_TRACK_H}
                  stroke={C.border}
                  strokeDasharray="3 4"
                />
              ))}
              <path d={preview.strategy} fill="none" stroke={C.strategyLine} strokeWidth={1.8} opacity={0.75} vectorEffect="non-scaling-stroke" />
              <path d={preview.senior} fill="none" stroke={C.seniorLine} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <path d={preview.junior} fill="none" stroke={C.juniorLine} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <path d={preview.liquidity} fill="none" stroke={C.liquidityLine} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
          )}

          {hoverIndex !== null && hoverPct !== null && (
            <>
              <div
                aria-hidden="true"
                style={{
                  background: C.eyebrow,
                  bottom: 0,
                  left: `${hoverPct}%`,
                  opacity: 0.7,
                  pointerEvents: 'none',
                  position: 'absolute',
                  top: 0,
                  width: 1,
                  zIndex: 15,
                }}
              />
              <DayChartTooltip
                compact
                title={dateLabel(dates[hoverIndex])}
                xPct={hoverPct}
                rows={[
                  { label: 'Source', value: series.strategy[hoverIndex]?.toFixed(1) ?? '—', color: C.strategyLine },
                  { label: 'Sr', value: series.senior[hoverIndex]?.toFixed(1) ?? '—', color: C.seniorLine },
                  { label: 'Jr', value: series.junior[hoverIndex]?.toFixed(1) ?? '—', color: C.juniorLine },
                  { label: 'SLP', value: series.liquidity[hoverIndex]?.toFixed(1) ?? '—', color: C.liquidityLine },
                ]}
              />
            </>
          )}

          <div
            onPointerDown={(event) => begin({ kind: 'pan', grabIndex: indexFromEvent(event.clientX), origin: view }, event)}
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
            onPointerDown={(event) => begin({ kind: 'handle', side: 'start' }, event)}
            onKeyDown={onHandleKey('start')}
            aria-label={startAriaLabel}
            style={{ ...handleStyle, left: `${leftPct}%` }}
          >
            <span style={gripStyle} />
          </button>
          <button
            type="button"
            onPointerDown={(event) => begin({ kind: 'handle', side: 'end' }, event)}
            onKeyDown={onHandleKey('end')}
            aria-label={endAriaLabel}
            style={{ ...handleStyle, left: `${rightPct}%` }}
          >
            <span style={gripStyle} />
          </button>
        </div>

        <div style={{ position: 'relative', height: 18, marginTop: 2 }}>
          {years.map((year) => (
            <span
              key={`t-${year.year}`}
              style={{
                position: 'absolute',
                top: 1,
                left: `${year.pct}%`,
                transform: 'translateX(-50%)',
                fontSize: 9,
                color: C.kpiLabel,
                fontFamily: MONO,
                whiteSpace: 'nowrap',
              }}
            >
              {year.year}
            </span>
          ))}
        </div>

        <div
          className="flex items-center justify-between gap-3"
          style={{ color: C.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}
        >
          <span>
            Start{' '}
            <b style={{ color: C.text, fontFamily: MONO, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>{dateLabel(dates[view.a])}</b>
          </span>
          <span>
            End{' '}
            <b style={{ color: C.text, fontFamily: MONO, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>{dateLabel(dates[view.b])}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
