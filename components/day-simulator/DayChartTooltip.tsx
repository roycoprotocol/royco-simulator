'use client';

import { useCallback, useEffect, useState } from 'react';

const C = {
  cardBg: '#FFFDF9',
  border: '#E8E2D8',
  text: '#171511',
  muted: '#6D6860',
  eyebrow: '#967756',
};

const MONO = '"SFMono-Regular", Consolas, monospace';
const DAY_CHART_HOVER_EVENT = 'day-chart-hover';

export function useDayChartHover<T>(
  chartId: string,
): [T | null, (next: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    const clearForOtherChart = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== chartId) setValue(null);
    };
    const clearOnScroll = () => setValue(null);
    window.addEventListener(DAY_CHART_HOVER_EVENT, clearForOtherChart);
    window.addEventListener('scroll', clearOnScroll, true);
    return () => {
      window.removeEventListener(DAY_CHART_HOVER_EVENT, clearForOtherChart);
      window.removeEventListener('scroll', clearOnScroll, true);
    };
  }, [chartId]);

  const setActiveValue = useCallback((next: T | null) => {
    if (next !== null) {
      window.dispatchEvent(new CustomEvent<string>(DAY_CHART_HOVER_EVENT, { detail: chartId }));
    }
    setValue(next);
  }, [chartId]);

  return [value, setActiveValue];
}

export type DayChartTooltipRow = {
  label: string;
  value: string;
  color?: string;
};

export function DayChartTooltip({
  title,
  xPct,
  rows,
  note,
  compact = false,
}: {
  title: string;
  xPct: number;
  rows: DayChartTooltipRow[];
  note?: string;
  compact?: boolean;
}) {
  const clampedX = Math.max(3, Math.min(97, xPct));
  const alignRight = clampedX > 62;

  return (
    <div
      aria-live="polite"
      data-day-chart-tooltip
      role="status"
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        boxShadow: '0 8px 24px rgba(60,45,28,.12)',
        color: C.text,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 2 : 4,
        left: `${clampedX}%`,
        maxWidth: compact ? 250 : 220,
        minWidth: compact ? 224 : 184,
        padding: compact ? '6px 8px' : '8px 10px',
        pointerEvents: 'none',
        position: 'absolute',
        top: compact ? 3 : 58,
        transform: alignRight ? 'translateX(-100%)' : 'translateX(0)',
        zIndex: 20,
      }}
    >
      <p
        style={{
          color: C.eyebrow,
          fontFamily: MONO,
          fontSize: compact ? 8.5 : 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </p>
      <div
        style={{
          display: 'grid',
          gap: compact ? '1px 10px' : '3px 10px',
          gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : '1fr',
        }}
      >
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            style={{
              alignItems: 'baseline',
              display: 'flex',
              fontSize: compact ? 9 : 10.5,
              gap: 8,
              justifyContent: 'space-between',
              lineHeight: 1.35,
              minWidth: 0,
            }}
          >
            <span style={{ color: C.muted }}>{row.label}</span>
            <strong style={{ color: row.color ?? C.text, fontFamily: MONO, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {row.value}
            </strong>
          </div>
        ))}
      </div>
      {note && (
        <p style={{ color: C.muted, fontSize: compact ? 8.5 : 9.5, lineHeight: 1.35 }}>
          {note}
        </p>
      )}
    </div>
  );
}
