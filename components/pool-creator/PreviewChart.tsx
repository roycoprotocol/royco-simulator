"use client";

// The backtest chart. Recharts, loaded through the same SSR-guarded dynamic
// import every other simulator in this repo uses.

import dynamic from "next/dynamic";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as T from "@/components/pool-creator/tokens";
import { Callout, Card, Eyebrow, MiniMetric, Prose, SourceNote } from "@/components/pool-creator/primitives";
import type { PoolModel } from "@/components/pool-creator/usePoolModel";
import { pct } from "@/lib/pool-creator/format";

const ResponsiveContainerNoSSR = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);

type TooltipPayload = { name?: string; value?: number; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: T.C.cardBg,
        border: `1px solid ${T.C.border}`,
        padding: "8px 10px",
        fontSize: 11,
      }}
    >
      <div style={{ fontFamily: T.MONO, color: T.C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span style={{ ...T.num }}>{entry.value?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

const SERIES = [
  { key: "strategy", name: "Base strategy", color: T.C.strategyLine },
  { key: "senior", name: "Senior", color: T.C.seniorLine },
  { key: "junior", name: "Junior", color: T.C.juniorLine },
  { key: "liquidity", name: "Exit pool", color: T.C.olive },
] as const;

export function PreviewChart({ model }: { model: PoolModel }) {
  const { preview } = model;

  if (preview.error && preview.rows.length === 0) {
    return (
      <Card>
        <Eyebrow>Backtest</Eyebrow>
        <Callout tone="danger">
          The accountant could not run this configuration: {preview.error}
        </Callout>
      </Card>
    );
  }

  return (
    <Card>
      <Eyebrow>Backtest</Eyebrow>
      <Prose>
        Your strategy&rsquo;s own history, run through the market you just configured. All four lines
        start at 100 so they can be compared directly.
      </Prose>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "0 2px 8px" }}>
        {SERIES.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 16, height: 2, background: s.color, display: "inline-block" }} />
            {s.name}
          </span>
        ))}
      </div>

      <div style={{ width: "100%", minWidth: 0, height: 320 }}>
        <ResponsiveContainerNoSSR width="100%" height="100%">
          <LineChart data={preview.rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.C.border} />
            {preview.recoveryWindows.map((window) => (
              <ReferenceArea
                key={window.startDate}
                x1={window.startDate}
                x2={window.endDate}
                fill={T.C.obsFill}
                fillOpacity={0.3}
              />
            ))}
            <ReferenceLine y={100} stroke={T.C.faint} strokeDasharray="2 2" />
            <XAxis
              dataKey="date"
              tick={{ fill: T.C.kpiLabel, fontSize: 10 }}
              minTickGap={36}
              stroke={T.C.border}
            />
            <YAxis
              tick={{ fill: T.C.kpiLabel, fontSize: 10 }}
              width={48}
              stroke={T.C.border}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<ChartTooltip />} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainerNoSSR>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 7, marginTop: 10 }}>
        <MiniMetric label="BASE STRATEGY" value={fmt(preview.strategyApy)} note="over this window" />
        <MiniMetric label="SENIOR" value={fmt(preview.seniorApy)} color={T.C.seniorLine} note="over this window" />
        <MiniMetric label="JUNIOR" value={fmt(preview.juniorApy)} color={T.C.juniorLine} note="over this window" />
        <MiniMetric label="EXIT POOL" value={fmt(preview.liquidityApy)} color={T.C.olive} note="over this window" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7, marginTop: 7 }}>
        <MiniMetric label="STRATEGY WORST FALL" value={fmt(preview.strategyMaxDrawdown)} />
        <MiniMetric
          label="SENIOR WORST FALL"
          value={fmt(preview.seniorMaxDrawdown)}
          color={preview.seniorMaxDrawdown < -0.0001 ? T.C.danger : T.C.olive}
        />
        <MiniMetric label="RECOVERY WINDOWS" value={String(preview.recoveryWindows.length)} note="amber bands above" />
      </div>

      {preview.error ? (
        <div style={{ marginTop: 10 }}>
          <Callout tone="danger">
            The backtest stopped early: {preview.error}. The chart shows everything up to that point.
          </Callout>
        </div>
      ) : null}

      <SourceNote>
        Simulator outputs are mechanism simulations, not historical backtests, forecasts, or an
        announced product.
      </SourceNote>
    </Card>
  );
}

const fmt = (value: number): string => (Number.isFinite(value) ? pct(value, 2) : "—");
