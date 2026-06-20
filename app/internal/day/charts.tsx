import { C } from "./theme";

export interface Series {
  label: string;
  color: string;
  data: number[];
  dashed?: boolean;
}

interface LineChartProps {
  xs: number[]; // x values (e.g. time in seconds)
  series: Series[];
  height?: number;
  yLabel?: string;
  xFmt?: (x: number) => string;
  yFmt?: (y: number) => string;
  bands?: { y: number; color: string; label: string }[]; // horizontal threshold lines
  y0?: number; // force y-axis floor
  yMaxClamp?: number; // clamp displayed max (e.g. utilization spikes to Infinity)
  cursor?: number | null; // x value to draw a vertical scrubber line at
}

// Minimal dependency-free responsive line chart in SVG.
export function LineChart({ xs, series, height = 180, yLabel, xFmt, yFmt, bands = [], y0, yMaxClamp, cursor }: LineChartProps) {
  const W = 760;
  const H = height;
  const padL = 52;
  const padR = 14;
  const padT = 12;
  const padB = 22;

  const allY = series.flatMap((s) => s.data).filter((v) => isFinite(v));
  const bandY = bands.map((b) => b.y).filter((v) => isFinite(v));
  let lo = y0 ?? Math.min(...allY, ...bandY);
  let hi = Math.max(...allY, ...bandY);
  if (yMaxClamp != null) hi = Math.min(hi, yMaxClamp);
  if (!isFinite(lo)) lo = 0;
  if (!isFinite(hi)) hi = 1;
  if (hi - lo < 1e-9) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  const xmin = xs[0] ?? 0;
  const xmax = xs[xs.length - 1] ?? 1;
  const sx = (x: number) => padL + ((x - xmin) / (xmax - xmin || 1)) * (W - padL - padR);
  const sy = (y: number) => padT + (1 - (clamp(y, lo, hi) - lo) / (hi - lo)) * (H - padT - padB);

  const ticks = 4;
  const yticks = Array.from({ length: ticks + 1 }, (_, i) => lo + ((hi - lo) * i) / ticks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} preserveAspectRatio="xMidYMid meet">
      {/* y grid + labels */}
      {yticks.map((yt, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={sy(yt)} y2={sy(yt)} stroke={C.line} strokeWidth={1} />
          <text x={padL - 6} y={sy(yt) + 3} textAnchor="end" fontSize={9} fill={C.mut} fontFamily="ui-monospace, monospace">
            {yFmt ? yFmt(yt) : yt.toFixed(0)}
          </text>
        </g>
      ))}
      {/* threshold bands */}
      {bands.map((b, i) =>
        isFinite(b.y) && b.y >= lo && b.y <= hi ? (
          <g key={"b" + i}>
            <line x1={padL} x2={W - padR} y1={sy(b.y)} y2={sy(b.y)} stroke={b.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
            <text x={W - padR} y={sy(b.y) - 3} textAnchor="end" fontSize={8.5} fill={b.color} fontFamily="ui-monospace, monospace">
              {b.label}
            </text>
          </g>
        ) : null,
      )}
      {/* series */}
      {series.map((s, si) => {
        const d = s.data
          .map((y, i) => (isFinite(y) ? `${i === 0 ? "M" : "L"}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}` : ""))
          .join(" ");
        return <path key={si} d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? "5 3" : undefined} opacity={0.95} />;
      })}
      {/* cursor */}
      {cursor != null && isFinite(cursor) && (
        <line x1={sx(cursor)} x2={sx(cursor)} y1={padT} y2={H - padB} stroke={C.text} strokeWidth={1} opacity={0.45} strokeDasharray="2 2" />
      )}
      {/* x labels */}
      {[xmin, xmin + (xmax - xmin) / 2, xmax].map((xt, i) => (
        <text key={i} x={sx(xt)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize={9} fill={C.mut} fontFamily="ui-monospace, monospace">
          {xFmt ? xFmt(xt) : xt.toFixed(0)}
        </text>
      ))}
      {yLabel && (
        <text x={padL - 44} y={padT + 4} fontSize={8.5} fill={C.dim} fontFamily="ui-monospace, monospace" transform={`rotate(-90 ${10} ${H / 2})`} style={{ transformBox: "view-box" }}>
          {yLabel}
        </text>
      )}
    </svg>
  );
}

// Market-state ribbon over time (PERPETUAL vs FIXED_TERM)
export function StateTimeline({ xs, states, xFmt }: { xs: number[]; states: string[]; xFmt?: (x: number) => string }) {
  const W = 760;
  const H = 26;
  const padL = 52;
  const padR = 14;
  const xmin = xs[0] ?? 0;
  const xmax = xs[xs.length - 1] ?? 1;
  const sx = (x: number) => padL + ((x - xmin) / (xmax - xmin || 1)) * (W - padL - padR);
  const segs: { x0: number; x1: number; s: string }[] = [];
  for (let i = 0; i < states.length; i++) {
    const x0 = sx(xs[i]);
    const x1 = i + 1 < xs.length ? sx(xs[i + 1]) : x0 + 2;
    segs.push({ x0, x1, s: states[i] });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} preserveAspectRatio="none">
      {segs.map((g, i) => (
        <rect key={i} x={g.x0} y={4} width={Math.max(0.5, g.x1 - g.x0)} height={14} fill={g.s === "FIXED_TERM" ? C.warn : C.sr} opacity={g.s === "FIXED_TERM" ? 0.85 : 0.28} />
      ))}
      <text x={padL} y={H - 1} fontSize={8.5} fill={C.mut} fontFamily="ui-monospace, monospace">market state</text>
    </svg>
  );
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
