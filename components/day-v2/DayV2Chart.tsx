"use client";

import { memo } from "react";

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

// Recharts, matching the core app's charting convention rather than the original
// simulator's bespoke SVG. The curves compound the engine's own target-scenario
// rates, so this is a projection of those rates and nothing more: no path risk,
// no drawdown, which is why the caption says so plainly.
export type DayV2Point = {
  month: number;
  senior: number;
  junior: number;
  liquidity: number;
};

const TONES = {
  senior: "#1d4987",
  junior: "#8c5f3d",
  liquidity: "#01c555",
} as const;

function DayV2Chart({ data }: { data: DayV2Point[] }) {
  return (
    // An explicit height on the container, not the wrapper: inside a flex column
    // ResponsiveContainer resolves a percentage height against a parent that has
    // not sized itself yet and collapses the surface to a few pixels.
    <div style={{ width: "100%" }}>
      <ResponsiveContainer height={260} width="100%">
        <LineChart data={data} margin={{ bottom: 4, left: -18, right: 8, top: 8 }}>
          <CartesianGrid stroke="#e4e0d6" vertical={false} />
          <XAxis
            dataKey="month"
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={(month: number) => (month === 0 ? "now" : `${month}m`)}
            tickLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="#596270"
            tick={{ fontSize: 10 }}
            tickFormatter={(value: number) => `$${value.toFixed(0)}`}
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
            formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
            labelFormatter={(month: number) => (month === 0 ? "Today" : `Month ${month}`)}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {(
            [
              ["senior", "Sr"],
              ["junior", "Jr"],
              ["liquidity", "SLP"],
            ] as const
          ).map(([key, label]) => (
            <Line
              dataKey={key}
              dot={false}
              // The sliders re-render on every tick, which restarts the enter
              // animation and leaves the curves pinned at the baseline. A live
              // chart should track the controls, not replay an intro.
              isAnimationActive={false}
              key={key}
              name={label}
              stroke={TONES[key]}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(DayV2Chart);
