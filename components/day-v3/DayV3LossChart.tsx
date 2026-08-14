"use client";

import { memo } from "react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { stake100, unitAmount, unitTick, type DayV3Unit } from "@/components/day-v3/format";

// Recharts, matching the core app's charting convention. Every point plotted
// here is a `buildDayExplainerMetrics` output, so this file only positions
// numbers the accountant already produced.
export type DayV3LossPoint = {
  loss: number;
  senior: number;
};

const JUNIOR = "#8c5f3d";
const SENIOR = "#1d4987";

function DayV3LossChart({
  limit,
  marker,
  maxLoss,
  minSr,
  points,
  showLimit,
  unit,
}: {
  limit: number;
  marker: DayV3LossPoint;
  maxLoss: number;
  minSr: number;
  points: DayV3LossPoint[];
  showLimit: boolean;
  unit: DayV3Unit;
}) {
  const floor = Math.max(0, Math.floor(minSr / 10) * 10);
  return (
    // The height lives on the container, not a wrapper: inside a flex column
    // ResponsiveContainer resolves a percentage height against a parent that
    // has not sized itself yet and collapses to a few pixels.
    <div style={{ width: "100%" }}>
      <ResponsiveContainer height={200} width="100%">
        <AreaChart data={points} margin={{ bottom: 4, left: -14, right: 10, top: 14 }}>
          <CartesianGrid stroke="#e4e0d6" vertical={false} />
          <XAxis
            dataKey="loss"
            domain={[0, maxLoss]}
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={(loss: number) => `${(loss * 100).toFixed(0)}%`}
            tickLine={false}
            type="number"
          />
          <YAxis
            domain={[floor, 100]}
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={(value: number) => unitTick(value, unit)}
            tickLine={false}
            width={52}
          />
          {/* The two zones of the waterfall, read left to right in the order
              losses are actually absorbed. */}
          {showLimit ? (
            <ReferenceArea fill={JUNIOR} fillOpacity={0.08} x1={0} x2={limit} />
          ) : null}
          <ReferenceArea fill={SENIOR} fillOpacity={0.07} x1={showLimit ? limit : 0} x2={maxLoss} />
          {showLimit ? (
            <ReferenceLine
              label={{
                fill: "#4b5260",
                fontSize: 10,
                position: "insideTopRight",
                value: "Jr exhausted",
              }}
              stroke="#8c5f3d"
              strokeDasharray="4 3"
              x={limit}
            />
          ) : null}
          <Tooltip
            contentStyle={{
              background: "#fcfbf8",
              border: "1px solid #e4e0d6",
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number) => [`${unitAmount(value, unit)} per ${stake100(unit)}`, "Sr"]}
            labelFormatter={(loss: number) => `Source falls ${(loss * 100).toFixed(1)}%`}
          />
          <Area
            dataKey="senior"
            dot={false}
            fill={SENIOR}
            fillOpacity={0.14}
            // The curve is genuinely piecewise linear with a corner at the
            // coverage limit. A monotone spline would round that corner away,
            // and the corner is the whole point of the chart.
            // The sliders re-render on every tick, which restarts the enter
            // animation and leaves the area pinned to the baseline.
            isAnimationActive={false}
            stroke={SENIOR}
            strokeWidth={2}
            type="linear"
          />
          <ReferenceDot
            fill="#17191f"
            r={4.5}
            stroke="#fcfbf8"
            strokeWidth={2}
            x={marker.loss}
            y={marker.senior}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(DayV3LossChart);
