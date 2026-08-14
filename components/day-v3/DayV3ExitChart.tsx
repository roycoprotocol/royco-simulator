"use client";

import { memo } from "react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Every point is a `buildDayExplainerMetrics.liquidity` curve entry. This file
// positions the accountant's quotes and computes nothing.
export type DayV3ExitPoint = {
  sellNAV: number;
  bps: number;
};

const GREEN = "#0a3d3a";

function DayV3ExitChart({
  compactUsd,
  marker,
  points,
}: {
  compactUsd: (value: number) => string;
  marker: DayV3ExitPoint;
  points: DayV3ExitPoint[];
}) {
  return (
    // Height on the container, not a wrapper: ResponsiveContainer collapses
    // when it resolves a percentage against an unsized flex parent.
    <div style={{ width: "100%" }}>
      <ResponsiveContainer height={220} width="100%">
        <AreaChart data={points} margin={{ bottom: 4, left: -8, right: 10, top: 14 }}>
          <CartesianGrid stroke="#e4e0d6" vertical={false} />
          <XAxis
            dataKey="sellNAV"
            domain={[0, "dataMax"]}
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={compactUsd}
            tickLine={false}
            type="number"
          />
          <YAxis
            domain={[0, "auto"]}
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={(value: number) => `${value.toFixed(0)}bps`}
            tickLine={false}
            width={58}
          />
          <Tooltip
            contentStyle={{
              background: "#fcfbf8",
              border: "1px solid #e4e0d6",
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number) => [`${value.toFixed(1)} bps`, "Cost to exit"]}
            labelFormatter={(sellNAV: number) => `Selling ${compactUsd(sellNAV)}`}
          />
          <Area
            dataKey="bps"
            dot={false}
            fill={GREEN}
            fillOpacity={0.12}
            // Live chart: the enter animation would restart on every slider
            // tick and leave the curve pinned to the baseline.
            isAnimationActive={false}
            stroke={GREEN}
            strokeWidth={2}
            type="monotone"
          />
          <ReferenceDot
            fill="#17191f"
            r={4.5}
            stroke="#fcfbf8"
            strokeWidth={2}
            x={marker.sellNAV}
            y={marker.bps}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(DayV3ExitChart);
