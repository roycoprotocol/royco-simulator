"use client";

// =============================================================================
// Pool creator — reactive diagrams
// -----------------------------------------------------------------------------
// Hand-written SVG, no chart library. Each one is bound to the control it sits
// above, so moving a slider physically reshapes the picture — a diagram that
// reacts teaches far more than a static one.
//
// The equivalents inside `DayMarketSimulator.tsx` (`CoverageLossDiagram`,
// `LiquidityExecutionDiagram`, `GuidedObservationSteps`) are SHA-locked and
// module-private. These are rebuilt fresh against the same palette.
//
// Every number drawn comes from the accountant via `buildDayExplainerMetrics`
// or a `Snapshot`; nothing here recomputes accounting.
// =============================================================================

import { useCallback, useRef, useState } from "react";
import * as T from "@/components/pool-creator/tokens";
import { pct, usdCompact, perDollar } from "@/lib/pool-creator/format";

// ---------------------------------------------------------------------------
// Shared scaffolding
// ---------------------------------------------------------------------------

const W = 520;
const H = 250;
const PAD = { top: 18, right: 18, bottom: 34, left: 44 };
const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

const svgProps = {
  viewBox: `0 0 ${W} ${H}`,
  width: "100%",
  style: {
    display: "block",
    touchAction: "none" as const,
    overflow: "visible" as const,
    // Charts want width, but not unbounded: past ~1.4x the design size the
    // labels and stroke weights start to look inflated rather than large.
    maxWidth: 720,
  },
  role: "img" as const,
};

function AxisLabel({ x, y, children, anchor = "middle" }: {
  x: number; y: number; children: string; anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={T.MONO}
      fontSize={9}
      fill={T.C.kpiLabel}
    >
      {children}
    </text>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 11.5,
        lineHeight: 1.42,
        color: T.C.text,
        minHeight: 34,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. The Cushion
// ---------------------------------------------------------------------------

export type CushionPoint = { loss: number; seniorBalancePer100: number };

/**
 * Senior's balance per $100 as the strategy falls.
 *
 * Three things carry the lesson: the flat green zone widens as the cushion
 * slider moves, a draggable handle reads out any loss you scrub to, and a ghost
 * marker at the strategy's own worst drawdown crosses from red into green the
 * moment the cushion covers it.
 */
export function CushionDiagram({
  points,
  cushion,
  worstDrawdown,
  worstDrawdownLabel,
  juniorCapital,
  seniorSize,
}: {
  points: CushionPoint[];
  cushion: number;
  worstDrawdown?: number | null;
  worstDrawdownLabel?: string | null;
  juniorCapital: number;
  seniorSize: number;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [probe, setProbe] = useState<number | null>(null);

  // Show a window a bit past the cushion so the kink is never at the edge, and
  // always far enough to include the strategy's own worst fall.
  const maxLoss = Math.max(cushion * 2.4, (worstDrawdown ? Math.abs(worstDrawdown) : 0) * 1.6, 0.06);
  const visible = points.filter((p) => p.loss <= maxLoss + 1e-9);
  const minBalance = Math.min(88, ...visible.map((p) => p.seniorBalancePer100));

  const x = (loss: number) => PAD.left + (loss / maxLoss) * PLOT.w;
  const y = (balance: number) =>
    PAD.top + PLOT.h - ((balance - minBalance) / (100 - minBalance || 1)) * PLOT.h;

  const balanceAt = (loss: number): number => {
    if (loss <= cushion) return 100;
    let prev = visible[0];
    for (const point of visible) {
      if (point.loss >= loss) {
        const span = point.loss - prev.loss || 1;
        const t = (loss - prev.loss) / span;
        return prev.seniorBalancePer100 + t * (point.seniorBalancePer100 - prev.seniorBalancePer100);
      }
      prev = point;
    }
    return prev.seniorBalancePer100;
  };

  const line = visible.map((p) => `${x(p.loss)},${y(p.seniorBalancePer100)}`).join(" ");

  const onPointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const loss = Math.max(0, Math.min(1, (ratio * W - PAD.left) / PLOT.w)) * maxLoss;
    setProbe(loss);
  }, [maxLoss]);

  const probeLoss = probe ?? Math.min(maxLoss * 0.75, cushion * 1.8);
  const probeBalance = balanceAt(probeLoss);
  const juniorPer100 = (juniorCapital / seniorSize) * 100;

  return (
    <div>
      <svg
        {...svgProps}
        ref={svgRef}
        aria-label="Senior balance as the strategy falls"
        onPointerMove={onPointer}
        onPointerLeave={() => setProbe(null)}
      >
        {/* protected zone */}
        <rect
          x={x(0)}
          y={PAD.top}
          width={Math.max(0, x(Math.min(cushion, maxLoss)) - x(0))}
          height={PLOT.h}
          fill={T.C.freeLine}
          fillOpacity={0.1}
        />
        {/* exposed zone */}
        <rect
          x={x(Math.min(cushion, maxLoss))}
          y={PAD.top}
          width={Math.max(0, x(maxLoss) - x(Math.min(cushion, maxLoss)))}
          height={PLOT.h}
          fill={T.C.danger}
          fillOpacity={0.05}
        />

        {/* axes */}
        <line x1={PAD.left} y1={PAD.top + PLOT.h} x2={PAD.left + PLOT.w} y2={PAD.top + PLOT.h} stroke={T.C.border} />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT.h} stroke={T.C.border} />
        <AxisLabel x={PAD.left} y={H - 18} anchor="start">0%</AxisLabel>
        <AxisLabel x={PAD.left + PLOT.w} y={H - 18} anchor="end">{`−${pct(maxLoss, 0)}`}</AxisLabel>
        <AxisLabel x={PAD.left - 6} y={y(100) + 3} anchor="end">$100</AxisLabel>
        <AxisLabel x={PAD.left - 6} y={PAD.top + PLOT.h} anchor="end">{`$${minBalance.toFixed(0)}`}</AxisLabel>
        <text x={PAD.left + PLOT.w / 2} y={H - 4} textAnchor="middle" fontSize={9.5} fill={T.C.muted}>
          strategy falls by
        </text>

        {/* the cushion edge */}
        {cushion <= maxLoss ? (
          <>
            <line
              x1={x(cushion)}
              y1={PAD.top}
              x2={x(cushion)}
              y2={PAD.top + PLOT.h}
              stroke={T.C.accent}
              strokeDasharray="3 3"
            />
            <text
              x={x(cushion) + 5}
              y={PAD.top + 11}
              fontSize={9.5}
              fontFamily={T.MONO}
              fill={T.C.accent}
            >
              {`cushion ${pct(cushion)}`}
            </text>
          </>
        ) : null}

        {/* the strategy's own worst fall */}
        {worstDrawdown && Math.abs(worstDrawdown) <= maxLoss ? (
          <>
            <line
              x1={x(Math.abs(worstDrawdown))}
              y1={PAD.top}
              x2={x(Math.abs(worstDrawdown))}
              y2={PAD.top + PLOT.h}
              stroke={Math.abs(worstDrawdown) <= cushion ? T.C.olive : T.C.danger}
              strokeDasharray="2 4"
              strokeWidth={1.5}
            />
            <text
              x={x(Math.abs(worstDrawdown))}
              y={PAD.top + PLOT.h + 13}
              textAnchor="middle"
              fontSize={8.8}
              fontFamily={T.MONO}
              fill={Math.abs(worstDrawdown) <= cushion ? T.C.olive : T.C.danger}
            >
              {worstDrawdownLabel ?? "worst fall"}
            </text>
          </>
        ) : null}

        <polyline points={line} fill="none" stroke={T.C.seniorLine} strokeWidth={2.2} />

        {/* the scrubbable probe */}
        <line
          x1={x(probeLoss)}
          y1={y(probeBalance)}
          x2={x(probeLoss)}
          y2={PAD.top + PLOT.h}
          stroke={T.C.juniorLine}
          strokeOpacity={0.25}
        />
        <circle cx={x(probeLoss)} cy={y(probeBalance)} r={4.5} fill={T.C.juniorLine} />
      </svg>

      <Caption>
        {probeLoss <= cushion ? (
          <>
            A <b>{pct(probeLoss)}</b> fall: Senior still holds <b>$100.00</b> of every $100. Junior has
            absorbed <b>${(probeLoss * (100 + juniorPer100)).toFixed(2)}</b> and has{" "}
            <b>{pct(1 - probeLoss / Math.max(cushion, 1e-9), 0)}</b> of its buffer left.
          </>
        ) : (
          <>
            A <b>{pct(probeLoss)}</b> fall: Junior is wiped out and Senior holds{" "}
            <b>${probeBalance.toFixed(2)}</b> of every $100 — it is past the{" "}
            <b>{pct(cushion)}</b> cushion by <b>{pct(probeLoss - cushion)}</b>.
          </>
        )}{" "}
        <span style={{ color: T.C.muted }}>Move across the chart to try another fall.</span>
      </Caption>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. The Recovery Window
// ---------------------------------------------------------------------------

/**
 * What happens after Junior covers a loss. The amber band's width is bound to
 * the window length, so dragging 7 → 90 days physically stretches the freeze,
 * and the fork shows both endings — recovered, or Junior's claim written off.
 */
export function RecoveryWindowDiagram({ recoveryDays }: { recoveryDays: number }) {
  const perpetual = recoveryDays <= 0;
  const bandWidth = perpetual ? 0 : Math.min(0.52, 0.1 + (recoveryDays / 194) * 0.42);
  const left = PAD.left;
  const plotW = PLOT.w;
  const dropX = left + plotW * 0.26;
  const bandX = dropX;
  const bandW = plotW * bandWidth;
  const forkX = bandX + bandW;
  const midY = PAD.top + PLOT.h * 0.4;
  const dropY = PAD.top + PLOT.h * 0.72;

  return (
    <div>
      <svg {...svgProps} aria-label="What happens after Junior covers a loss">
        {/* the reference level Junior is trying to get back to */}
        <line
          x1={left}
          y1={midY}
          x2={left + plotW}
          y2={midY}
          stroke={T.C.border}
          strokeDasharray="3 3"
        />

        {!perpetual ? (
          <rect x={bandX} y={PAD.top} width={bandW} height={PLOT.h} fill={T.C.obsFill} fillOpacity={0.32} />
        ) : null}

        {/* normal operation, then the drawdown */}
        <polyline
          points={`${left},${midY} ${dropX},${midY} ${dropX + 10},${dropY}`}
          fill="none"
          stroke={T.C.juniorLine}
          strokeWidth={2.2}
        />

        {perpetual ? (
          <>
            <polyline
              points={`${dropX + 10},${dropY} ${left + plotW},${midY}`}
              fill="none"
              stroke={T.C.olive}
              strokeWidth={2.2}
            />
            <text x={left + plotW} y={midY - 10} textAnchor="end" fontSize={10} fill={T.C.olive}>
              No freeze — the pool keeps running
            </text>
          </>
        ) : (
          <>
            {/* recovered */}
            <polyline
              points={`${dropX + 10},${dropY} ${forkX},${midY} ${left + plotW},${midY - 6}`}
              fill="none"
              stroke={T.C.olive}
              strokeWidth={2.2}
            />
            <circle cx={forkX} cy={midY} r={3.5} fill={T.C.olive} />
            <text x={forkX + 8} y={midY - 8} fontSize={10} fill={T.C.olive}>
              Recovered — Junior made whole
            </text>

            {/* expired */}
            <polyline
              points={`${dropX + 10},${dropY} ${forkX},${dropY} ${left + plotW},${dropY}`}
              fill="none"
              stroke={T.C.juniorLine}
              strokeWidth={2.2}
              strokeDasharray="4 3"
            />
            <circle cx={forkX} cy={dropY} r={4} fill={T.C.danger} />
            <text x={forkX + 8} y={dropY + 15} fontSize={10} fill={T.C.danger}>
              Window expired — Junior&rsquo;s claim written off
            </text>

            <text
              x={bandX + bandW / 2}
              y={PAD.top + 12}
              textAnchor="middle"
              fontSize={9.5}
              fontFamily={T.MONO}
              fill={T.C.accent}
            >
              {`${recoveryDays}-day recovery window`}
            </text>
          </>
        )}

        <text x={left} y={PAD.top + PLOT.h + 22} fontSize={9.5} fill={T.C.muted}>
          normal operation
        </text>
      </svg>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7, marginTop: 8 }}>
        {[
          { label: "Senior redemptions", state: perpetual ? "open" : "paused" },
          { label: "Junior deposits", state: perpetual ? "open" : "paused" },
          { label: "Selling into the exit pool", state: "open" },
        ].map((chip) => (
          <div
            key={chip.label}
            style={{
              border: `1px solid ${chip.state === "open" ? T.tint.olive(0.32) : T.C.border}`,
              background: chip.state === "open" ? T.tint.olive(0.06) : T.tint.panel(0.7),
              padding: "7px 8px",
              fontSize: 10,
              lineHeight: 1.3,
              color: T.C.muted,
            }}
          >
            <b
              style={{
                display: "block",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: chip.state === "open" ? T.C.olive : T.C.text,
                marginBottom: 3,
              }}
            >
              {chip.state}
            </b>
            {chip.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. The Yield Split
// ---------------------------------------------------------------------------

/**
 * Where a dollar of strategy yield goes.
 *
 * The second bar is the point: Junior's slice looks tiny against Senior's, but
 * spread over a much smaller principal it is what produces the headline Junior
 * APY. Leverage, explained without the word or a formula.
 */
export function YieldSplitDiagram({
  sourceApy,
  seniorApy,
  juniorApy,
  liquidityApy,
  seniorSize,
  juniorSize,
  liquiditySize,
  cushion,
  exitShare,
}: {
  sourceApy: number;
  seniorApy: number;
  juniorApy: number;
  liquidityApy: number;
  seniorSize: number;
  juniorSize: number;
  liquiditySize: number;
  cushion: number;
  exitShare: number;
}) {
  const total = Math.max(sourceApy, 1e-9);
  // Points of the base yield each tranche accounts for, per dollar of Senior.
  const seniorPoints = Math.max(0, seniorApy);
  const juniorPoints = Math.max(0, (juniorApy * juniorSize) / Math.max(seniorSize, 1));
  const liquidityPoints = Math.max(0, (liquidityApy * liquiditySize) / Math.max(seniorSize, 1));
  const sum = seniorPoints + juniorPoints + liquidityPoints || 1;

  const segments = [
    { label: "Senior keeps", value: seniorPoints, apy: seniorApy, color: T.C.seniorLine, opacity: 0.85 },
    { label: "Junior", value: juniorPoints, apy: juniorApy, color: T.C.juniorLine, opacity: 0.8 },
    { label: "Exit pool", value: liquidityPoints, apy: liquidityApy, color: T.C.olive, opacity: 0.75 },
  ];

  const given = Math.max(0, sourceApy - seniorApy);

  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ ...T.miniMetric, flex: 1 }}>
            <span style={T.miniMetricLabel}>{s.label === "Senior keeps" ? "SENIOR" : s.label.toUpperCase()}</span>
            <b style={{ ...T.miniMetricValue, color: s.color, fontSize: 22 }}>
              {Number.isFinite(s.apy) ? pct(s.apy, 2) : "—"}
            </b>
            <small style={{ display: "block", color: T.C.muted, fontSize: 9.5, marginTop: 4 }}>
              per year
            </small>
          </div>
        ))}
      </div>

      {/* Where each point of the base yield lands */}
      <div
        style={{
          display: "flex",
          height: 44,
          border: `1px solid ${T.C.border}`,
          overflow: "hidden",
          background: T.tint.panel(0.7),
        }}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            style={{
              width: `${(s.value / sum) * 100}%`,
              background: s.color,
              opacity: s.opacity,
              transition: "width 180ms ease-out",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FBFAF7",
              fontSize: 10,
              fontFamily: T.MONO,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
            title={`${s.label}: ${pct(s.value, 2)} of the base yield`}
          >
            {s.value / sum > 0.13 ? pct(s.value, 1) : ""}
          </div>
        ))}
      </div>
      <div style={{ ...T.hint, marginTop: 5 }}>
        Every point of the <b>{pct(total, 2)}</b> your strategy makes, split by where it lands.
      </div>

      {/* The leverage bar */}
      <div style={{ marginTop: 12 }}>
        <div style={{ ...T.miniMetricLabel, marginBottom: 5 }}>PER $1 OF CAPITAL</div>
        <div style={{ display: "flex", height: 14, border: `1px solid ${T.C.border}`, overflow: "hidden" }}>
          {[
            { size: seniorSize, color: T.C.seniorLine, label: "Senior" },
            { size: juniorSize, color: T.C.juniorLine, label: "Junior" },
            { size: liquiditySize, color: T.C.olive, label: "Exit pool" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                width: `${(s.size / (seniorSize + juniorSize + liquiditySize)) * 100}%`,
                background: s.color,
                opacity: 0.8,
                transition: "width 180ms ease-out",
              }}
              title={`${s.label}: ${usdCompact(s.size)}`}
            />
          ))}
        </div>
        <div style={{ ...T.hint, marginTop: 5 }}>
          Junior is a thin slice of the capital, so the {pct(juniorPoints, 1)} of base yield it collects
          turns into <b>{Number.isFinite(juniorApy) ? pct(juniorApy, 1) : "—"}</b> on the money actually
          at risk.
        </div>
      </div>

      {/* The thesis of the whole product, in the user's own numbers. */}
      <div style={{ ...T.note, marginTop: 10, color: T.C.text }}>
        Senior gives up <b>{pct(given, 1)}</b> of yield. That buys a <b>{pct(cushion)}</b> loss cushion
        and the ability to sell <b>{pct(exitShare, 1)}</b> of a position for under a 1% discount, any
        day.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Capital stack (summary rail)
// ---------------------------------------------------------------------------

/** True-to-scale ST / JT / LT bar. The thin Junior sliver is the honest picture. */
export function CapitalStackBar({
  seniorSize,
  juniorSize,
  liquiditySize,
}: {
  seniorSize: number;
  juniorSize: number;
  liquiditySize: number;
}) {
  const total = seniorSize + juniorSize + liquiditySize || 1;
  const parts = [
    { key: "ST", size: seniorSize, color: T.C.seniorLine, label: "Senior" },
    { key: "JT", size: juniorSize, color: T.C.juniorLine, label: "Junior" },
    { key: "LT", size: liquiditySize, color: T.C.olive, label: "Exit pool" },
  ];
  return (
    <div>
      <div style={{ display: "flex", height: 10, border: `1px solid ${T.C.border}`, overflow: "hidden" }}>
        {parts.map((p) => (
          <div
            key={p.key}
            style={{
              width: `${(p.size / total) * 100}%`,
              background: p.color,
              opacity: 0.85,
              transition: "width 180ms ease-out",
            }}
            title={`${p.label} ${usdCompact(p.size)}`}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {parts.map((p) => (
          <span key={p.key} style={{ fontSize: 9, fontFamily: T.MONO, color: T.C.kpiLabel }}>
            {p.key} {usdCompact(p.size)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Exit ladder
// ---------------------------------------------------------------------------

export type ExitPoint = { sellNAV: number; executionPrice: number; slippage: number };

/** Price received against size sold. Exiting is always possible — only ever priced. */
export function ExitLadderDiagram({
  curve,
  seniorSize,
  referenceShare,
}: {
  curve: ExitPoint[];
  seniorSize: number;
  referenceShare: number;
}) {
  const [probeIndex, setProbeIndex] = useState<number | null>(null);
  if (curve.length < 2) return null;

  const maxSell = curve[curve.length - 1].sellNAV || 1;
  const minPrice = Math.min(...curve.map((p) => p.executionPrice), 0.98);

  const x = (sell: number) => PAD.left + (sell / maxSell) * PLOT.w;
  const y = (price: number) =>
    PAD.top + PLOT.h - ((price - minPrice) / (1 - minPrice || 1)) * PLOT.h;

  const line = curve.map((p) => `${x(p.sellNAV)},${y(p.executionPrice)}`).join(" ");
  const probe = curve[probeIndex ?? Math.floor(curve.length * 0.45)];
  const probeShare = probe.sellNAV / Math.max(seniorSize, 1);

  return (
    <div>
      <svg
        {...svgProps}
        aria-label="Price received against size sold"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const sell = Math.max(0, Math.min(1, (ratio * W - PAD.left) / PLOT.w)) * maxSell;
          let nearest = 0;
          for (let i = 0; i < curve.length; i += 1) {
            if (Math.abs(curve[i].sellNAV - sell) < Math.abs(curve[nearest].sellNAV - sell)) nearest = i;
          }
          setProbeIndex(nearest);
        }}
        onPointerLeave={() => setProbeIndex(null)}
      >
        <line x1={PAD.left} y1={PAD.top + PLOT.h} x2={PAD.left + PLOT.w} y2={PAD.top + PLOT.h} stroke={T.C.border} />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT.h} stroke={T.C.border} />

        {/* the 1% reference the exit-depth question is phrased against */}
        <line
          x1={PAD.left}
          y1={y(0.99)}
          x2={PAD.left + PLOT.w}
          y2={y(0.99)}
          stroke={T.C.accent}
          strokeDasharray="3 3"
          strokeOpacity={0.7}
        />
        <text x={PAD.left + 4} y={y(0.99) - 4} fontSize={9} fontFamily={T.MONO} fill={T.C.accent}>
          1% discount
        </text>

        <polyline points={line} fill="none" stroke={T.C.seniorLine} strokeWidth={2.2} />
        <circle cx={x(probe.sellNAV)} cy={y(probe.executionPrice)} r={4.5} fill={T.C.juniorLine} />

        <AxisLabel x={PAD.left - 6} y={y(1) + 3} anchor="end">$1.00</AxisLabel>
        <AxisLabel x={PAD.left - 6} y={PAD.top + PLOT.h} anchor="end">{perDollar(minPrice)}</AxisLabel>
        <text x={PAD.left + PLOT.w / 2} y={H - 6} textAnchor="middle" fontSize={9.5} fill={T.C.muted}>
          size sold in one go
        </text>
      </svg>

      <Caption>
        Selling <b>{pct(probeShare, 1)}</b> of a Senior position at once returns{" "}
        <b>{perDollar(probe.executionPrice)}</b> per $1 — a <b>{pct(probe.slippage, 2)}</b> discount.{" "}
        <span style={{ color: T.C.muted }}>
          Your target of {pct(referenceShare, 1)} clears under 1%. Bigger exits still go through, just
          cheaper — which is what makes it worth someone&rsquo;s while to take the other side.
        </span>
      </Caption>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Three tranches (hero)
// ---------------------------------------------------------------------------

/**
 * The mental-model anchor: base strategy → Senior, with Senior paying a risk
 * premium to Junior and a liquidity premium to the exit pool.
 *
 * Full size on step 1, then it collapses to a 40px strip where the box relevant
 * to the current step lights up — a persistent frame of reference for very
 * little vertical cost.
 */
export function TranchesDiagram({
  highlight,
  collapsed = false,
}: {
  /** Which side the current step is about. */
  highlight?: "senior" | "junior" | "liquidity" | "all";
  collapsed?: boolean;
}) {
  const on = (key: "senior" | "junior" | "liquidity"): boolean =>
    highlight === "all" || highlight === key;

  if (collapsed) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          border: `1px solid ${T.C.border}`,
          background: T.tint.panel(0.7),
          fontSize: 10.5,
        }}
      >
        <span style={{ ...T.miniMetricLabel, marginRight: 2 }}>YOUR STRATEGY</span>
        <span style={{ color: T.C.faint }}>→</span>
        {(
          [
            { key: "senior", label: "Senior", color: T.C.seniorLine },
            { key: "junior", label: "Junior", color: T.C.juniorLine },
            { key: "liquidity", label: "Exit pool", color: T.C.olive },
          ] as const
        ).map((box) => (
          <span
            key={box.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: on(box.key) ? T.C.text : T.C.faint,
              fontWeight: on(box.key) ? 600 : 400,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: on(box.key) ? box.color : T.C.border,
                display: "inline-block",
              }}
            />
            {box.label}
          </span>
        ))}
      </div>
    );
  }

  const BOX_W = 132;
  const BOX_H = 46;
  const strategyY = 100;
  const leftX = 18;
  const seniorX = 196;
  const rightX = 370;

  const box = (
    x: number,
    y: number,
    label: string,
    sub: string,
    color: string,
    active: boolean,
  ) => (
    <g key={label}>
      <rect
        x={x}
        y={y}
        width={BOX_W}
        height={BOX_H}
        fill={active ? T.C.cardBg : T.tint.panel(0.55)}
        stroke={active ? color : T.C.border}
        strokeWidth={active ? 1.6 : 1}
      />
      <text x={x + 10} y={y + 19} fontSize={11.5} fontWeight={600} fill={active ? T.C.text : T.C.muted}>
        {label}
      </text>
      <text x={x + 10} y={y + 34} fontSize={9.5} fill={T.C.muted}>
        {sub}
      </text>
    </g>
  );

  return (
    // Capped at its design width. Left to fill an 1180px column it renders at
    // 2.3× scale and dominates the page — this is an anchor, not the subject.
    <svg
      viewBox="0 0 520 200"
      width="100%"
      style={{ display: "block", maxWidth: 520 }}
      role="img"
      aria-label="Your strategy splits into Senior, Junior and an exit pool"
    >
      {/* strategy → senior */}
      <path
        d={`M ${leftX + BOX_W} ${strategyY + BOX_H / 2} H ${seniorX}`}
        stroke={T.C.accent}
        strokeWidth={1.4}
        fill="none"
      />
      {/* senior → junior (risk premium) */}
      <path
        d={`M ${seniorX + BOX_W / 2} ${strategyY} V 46 H ${rightX}`}
        stroke={T.C.juniorLine}
        strokeWidth={1.2}
        fill="none"
        strokeDasharray="3 3"
      />
      {/* senior → exit pool (liquidity premium) */}
      <path
        d={`M ${seniorX + BOX_W / 2} ${strategyY + BOX_H} V 168 H ${rightX}`}
        stroke={T.C.olive}
        strokeWidth={1.2}
        fill="none"
        strokeDasharray="3 3"
      />

      <text x={seniorX + BOX_W / 2 + 6} y={68} fontSize={9} fill={T.C.muted}>
        risk premium
      </text>
      <text x={seniorX + BOX_W / 2 + 6} y={160} fontSize={9} fill={T.C.muted}>
        liquidity premium
      </text>

      {box(leftX, strategyY, "Your strategy", "the yield you already run", T.C.strategyLine, true)}
      {box(seniorX, strategyY, "Senior", "protected principal", T.C.seniorLine, on("senior"))}
      {box(rightX, 23, "Junior", "takes losses first", T.C.juniorLine, on("junior"))}
      {box(rightX, 145, "Exit pool", "the way out, any day", T.C.olive, on("liquidity"))}
    </svg>
  );
}
