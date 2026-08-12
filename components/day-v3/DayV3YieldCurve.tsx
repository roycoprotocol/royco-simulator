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
/**
 * Three readings of one point on the curve, because the share alone is not
 * enough to act on and the single line this replaces tried to carry all of it
 * as one run-on sentence.
 *
 * The three answer three different questions. The share is what the curve
 * literally plots. The rate is what that share is worth per year, which is the
 * only form the reader can compare against anything else. The share of total
 * yield is what it comes to once the Junior and pool capital are counted in the
 * pot as well, which is always the smallest of the three and is the one people
 * assume the first number already is.
 */
function CurveTooltip({
  active,
  label,
  paidTo,
  payload,
  seniorShareOfCapital,
  sourceApy,
}: {
  active?: boolean;
  label?: number;
  paidTo: string;
  payload?: readonly { value: number }[];
  seniorShareOfCapital: number;
  sourceApy: number;
}) {
  if (!active || !payload?.length) return null;
  const sharePct = payload[0].value;
  const rows: [string, string][] = [
    ["Share of Sr's yield", `${sharePct.toFixed(1)}%`],
    // No currency symbol. This page runs markets quoted in ETH and BTC as well
    // as dollars, and the line this replaces said "per dollar of Sr" on all of
    // them.
    ["Additional yield", `${((sharePct / 100) * sourceApy * 100).toFixed(2)}% a year on Sr`],
    [
      "Share of total yield",
      `${(sharePct * seniorShareOfCapital).toFixed(1)}%`,
    ],
  ];
  return (
    <div className="rounded-lg border border-[#e4e0d6] bg-[#fcfbf8] px-2.5 py-2 text-[11px] shadow-[0_4px_14px_-8px_rgba(23,25,31,0.4)]">
      <p className="font-semibold text-[#17191f]">
        {paidTo} at {label}% utilization
      </p>
      <table className="mt-1">
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name}>
              <td className="pr-3 text-[10.5px] text-[#596270]">{name}</td>
              <td className="text-right font-mono text-[11px] font-semibold tabular-nums text-[#1d4987]">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[9.5px] leading-snug text-[#8a8f98]">
        Total yield counts Jr and the pool in the pot, not just Sr.
      </p>
    </div>
  );
}

function DayV3YieldCurve({
  paidTo,
  seniorShareOfCapital,
  sourceApy,
  target,
  y0,
  y100,
  yTarget,
}: {
  /** Who the share is paid to, for the tooltip's second line. */
  paidTo: string;
  /** Sr as a fraction of all the capital standing, so the share of Sr's yield
   *  can also be quoted against everything the market earns. */
  seniorShareOfCapital: number;
  /** The source rate, so a share can be quoted as a rate and not only a share. */
  sourceApy: number;
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
            content={
              <CurveTooltip
                paidTo={paidTo}
                seniorShareOfCapital={seniorShareOfCapital}
                sourceApy={sourceApy}
              />
            }
            cursor={{ stroke: "#c9c4b8", strokeDasharray: "3 3" }}
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

export default memo(DayV3YieldCurve);
