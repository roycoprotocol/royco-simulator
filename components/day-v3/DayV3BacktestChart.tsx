"use client";

import { memo } from "react";

import { unitAmount, unitTick, type DayV3Unit } from "@/components/day-v3/format";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Plots `runDayHistoricalBacktest().chart`, which is already indexed to 100 at
// the window's first point by the shared runner. Nothing is rescaled here.
export type DayV3BacktestPoint = {
  date: string;
  senior: number;
  junior: number;
  liquidity: number;
  strategy: number;
};

const SERIES = [
  ["strategy", "Source", "#596270"],
  ["senior", "Sr", "#1d4987"],
  ["junior", "Jr", "#8c5f3d"],
  ["liquidity", "SLP", "#087a45"],
] as const;

function DayV3BacktestChart({
  data,
  unit,
}: {
  data: DayV3BacktestPoint[];
  unit: DayV3Unit;
}) {
  return (
    <div style={{ width: "100%" }}>
      <ResponsiveContainer height={205} width="100%">
        <LineChart data={data} margin={{ bottom: 4, left: -18, right: 10, top: 8 }}>
          <CartesianGrid stroke="#e4e0d6" vertical={false} />
          <XAxis
            dataKey="date"
            minTickGap={48}
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={(date: string) => date.slice(0, 7)}
            tickLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={(value: number) => unitTick(value, unit)}
            tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{
              background: "#fcfbf8",
              border: "1px solid #e4e0d6",
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number, name: string) => [unitAmount(value, unit), name]}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {SERIES.map(([key, label, color]) => (
            <Line
              dataKey={key}
              dot={false}
              // The window and the terms both re-render this chart, and the
              // enter animation would leave the lines pinned to the baseline.
              isAnimationActive={false}
              key={key}
              name={label}
              stroke={color}
              strokeWidth={key === "strategy" ? 1.5 : 2}
              strokeDasharray={key === "strategy" ? "4 3" : undefined}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(DayV3BacktestChart);
