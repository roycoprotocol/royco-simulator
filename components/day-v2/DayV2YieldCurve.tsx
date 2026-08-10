"use client";

import { memo } from "react";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The yield-share curve the engine actually runs, drawn rather than described.
 *
 * Every registry market is a `static` YDM, which the engine defines as
 * piecewise-linear through three anchors: 0% utilization pays Y0, the 90%
 * target pays YT, and 100% pays Y100. YT is the only one this page sets from a
 * requirement, and the target is where the modeled scenario sits, so YT is the
 * number that binds and the other two describe what happens either side of it.
 */
function DayV2YieldCurve({
  target,
  y0,
  y100,
  yTarget,
}: {
  target: number;
  y0: number;
  y100: number;
  yTarget: number;
}) {
  const data = [
    { utilization: 0, share: y0 * 100 },
    { utilization: target * 100, share: yTarget * 100 },
    { utilization: 100, share: y100 * 100 },
  ];
  return (
    <div style={{ width: "100%" }}>
      <ResponsiveContainer height={150} width="100%">
        <LineChart data={data} margin={{ bottom: 4, left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#e4e0d6" strokeDasharray="2 4" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="utilization"
            domain={[0, 100]}
            tick={{ fill: "#596270", fontSize: 10 }}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            tick={{ fill: "#596270", fontSize: 10 }}
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            tickLine={false}
            width={38}
          />
          <ReferenceLine
            label={{
              fill: "#596270",
              fontSize: 9.5,
              position: "insideTopLeft",
              value: "target",
            }}
            stroke="#596270"
            strokeDasharray="3 3"
            x={target * 100}
          />
          <Tooltip
            contentStyle={{
              background: "#fcfbf8",
              border: "1px solid #e4e0d6",
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number) => [`${value.toFixed(1)}% of Sr yield`, "Jr is paid"]}
            labelFormatter={(value: number) => `At ${value}% utilization`}
          />
          {/* Linear, because the curve genuinely is piecewise-linear between the
              three anchors. A smoothed spline would draw a shape the engine
              never evaluates. */}
          <Line
            dataKey="share"
            dot={{ fill: "#1d4987", r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
            stroke="#1d4987"
            strokeWidth={2}
            type="linear"
          />
          <ReferenceDot
            fill="#feb901"
            r={4.5}
            stroke="#17191f"
            strokeWidth={1.5}
            x={target * 100}
            y={yTarget * 100}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(DayV2YieldCurve);
