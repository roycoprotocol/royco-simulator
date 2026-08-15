"use client";

import { memo } from "react";

import { unitAmount, unitTick, type DayV3Unit } from "@/components/day-v3/format";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
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

/**
 * A stretch of history the market spent inside an Observation Period.
 *
 * A count alone hides the shape of the thing. JBBB records 146 of these across
 * its history and spends 63.6% of its life inside one, which "146" does not
 * say; ACRED's cluster in a single quarter and then stop. Drawn on the path,
 * both facts are the first thing a reader sees.
 *
 * `expired` marks the windows that ran to the full Observation Period without
 * the source recovering. Those are the consequential ones: the loss became
 * permanent for Junior, and its recovery claim was erased.
 */
export type DayV3BacktestBand = {
  start: string;
  end: string;
  /** Days the period actually ran, sampled at the series' own cadence. */
  days: number;
  /** The Observation Period the terms asked for. */
  targetDays: number;
  expired: boolean;
};

/**
 * How long a period ran, and against what.
 *
 * An expired period rarely lands exactly on its target: the series is sampled
 * at its own cadence, so a 7-day term is closed by the first reading at or past
 * day 7. Saying "7d" when the reading came at 12d hides which of the two
 * numbers the accountant used.
 */
const periodLength = (band: DayV3BacktestBand) =>
  band.expired && band.targetDays > 0 && band.days !== band.targetDays
    ? `${band.targetDays}d term, next reading at ${band.days}d`
    : `${band.days}d`;

const SERIES = [
  ["strategy", "Source", "#596270"],
  ["senior", "Sr", "#1d4987"],
  ["junior", "Jr", "#8c5f3d"],
  ["liquidity", "SLP", "#087a45"],
] as const;

function DayV3BacktestChart({
  bands = [],
  data,
  unit,
}: {
  bands?: DayV3BacktestBand[];
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
            content={(props) => {
              const { active, label, payload } = props as {
                active?: boolean;
                label?: string;
                payload?: ReadonlyArray<{
                  color?: string;
                  name?: string;
                  value?: number;
                }>;
              };
              if (!active || !payload?.length || typeof label !== "string") {
                return null;
              }
              // Which period this reading sits in. Shading says a band exists;
              // only this says what the band is and how long it ran.
              const band = bands.find(
                (item) => label >= item.start && label <= item.end,
              );
              return (
                <div
                  style={{
                    background: "#fcfbf8",
                    border: "1px solid #e4e0d6",
                    borderRadius: 8,
                    fontSize: 11,
                    padding: "6px 8px",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{label}</div>
                  {payload.map((entry) => (
                    <div key={entry.name} style={{ color: entry.color }}>
                      {entry.name}{" "}
                      {typeof entry.value === "number"
                        ? unitAmount(entry.value, unit)
                        : "—"}
                    </div>
                  ))}
                  {band ? (
                    <div
                      style={{
                        borderTop: "1px solid #e4e0d6",
                        color: band.expired ? "#8a6512" : "#596270",
                        marginTop: 4,
                        paddingTop: 4,
                      }}
                    >
                      {band.expired ? "Expired " : ""}Observation Period ·{" "}
                      {periodLength(band)}
                      <div style={{ color: "#596270", opacity: 0.8 }}>
                        {band.start} to {band.end}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        borderTop: "1px solid #e4e0d6",
                        color: "#596270",
                        marginTop: 4,
                        opacity: 0.8,
                        paddingTop: 4,
                      }}
                    >
                      No Observation Period open
                    </div>
                  )}
                </div>
              );
            }}
          />
          {/* Behind the lines, not over them: these are the conditions the
              path was produced under, and a band that dims the series it
              explains is worse than no band. A single-point window would draw
              nothing, so it is widened to the next reading. */}
          {bands
            .filter((band) => band.end > band.start)
            .map((band, index) => (
            <ReferenceArea
              fill={band.expired ? "#b4881f" : "#596270"}
              fillOpacity={band.expired ? 0.2 : 0.09}
              ifOverflow="extendDomain"
              key={`${band.start}-${band.end}-${index}`}
              stroke="none"
              x1={band.start}
              x2={band.end}
            />
          ))}
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
