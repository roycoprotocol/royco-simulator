"use client";

import { useMemo, useState } from "react";

import {
  DAY_CURVE_MODEL_ANCHORS,
  DAY_CURVE_MODEL_DEFAULT,
  DAY_CURVE_MODEL_LABELS,
  DAY_CURVE_MODELS,
  type DayCurveModel,
} from "@/lib/day-simulator-template/deploy-fields";
import { cn } from "@/lib/utils";

type Curve = { y0: number; yTarget: number; y100: number };
export type Premium = "risk" | "liquidity";
type Pressure = "below" | "above";

export type DayV3PricingModelSelections = Record<Premium, DayCurveModel>;

export const DAY_V3_PRICING_MODEL_DEFAULTS: DayV3PricingModelSelections = {
  liquidity: DAY_CURVE_MODEL_DEFAULT,
  risk: DAY_CURVE_MODEL_DEFAULT,
};

const MODEL_SUMMARY: Record<DayCurveModel, string> = {
  STATIC_CURVE: "The three-anchor curve stays where Step 4 puts it.",
  ADAPTIVE_CURVE_V1:
    "The curve scales proportionally as utilization stays away from target.",
  ADAPTIVE_CURVE_V2:
    "The curve shifts vertically while its discount and premium slopes stay fixed.",
  FIXED: "One yield share applies at every utilization and does not adapt.",
};

const MODEL_CHANGE: Record<DayCurveModel, string> = {
  STATIC_CURVE: "No movement over time",
  ADAPTIVE_CURVE_V1: "Height and slopes scale together",
  ADAPTIVE_CURVE_V2: "All three anchors shift together",
  FIXED: "No utilization response",
};

const MODEL_GEOMETRY: Record<DayCurveModel, string> = {
  STATIC_CURVE: "The anchors and both slopes remain fixed over time.",
  ADAPTIVE_CURVE_V1:
    "Scales from a fixed 0% pivot: Y₉₀ and Y₁₀₀ move by the same multiplier, so both slopes change.",
  ADAPTIVE_CURVE_V2:
    "Translates vertically: Y₀, Y₉₀, and Y₁₀₀ move by the same amount, so both slopes stay parallel.",
  FIXED: "One horizontal share applies everywhere and remains fixed over time.",
};

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function dayV3PricingModelDisplayCurves(
  model: DayCurveModel,
  curve: Curve,
  pressure: Pressure,
) {
  const direction = pressure === "above" ? 1 : -1;
  const before =
    model === "ADAPTIVE_CURVE_V1"
      ? [0, curve.yTarget, curve.y100]
      : model === "FIXED"
        ? [curve.yTarget, curve.yTarget, curve.yTarget]
        : [curve.y0, curve.yTarget, curve.y100];

  if (model === "ADAPTIVE_CURVE_V1") {
    const scale =
      direction > 0
        ? Math.min(1.6, 1 / Math.max(...before))
        : 0.4;
    return { before, after: before.map((value) => value * scale) };
  }
  if (model === "ADAPTIVE_CURVE_V2") {
    // A directional illustration only. The production engine evolves Y90 with
    // exact integer math; this view merely shows that every point translates
    // by the same amount and therefore preserves both slopes.
    const desiredShift = Math.max(0.08, curve.yTarget * 0.6);
    const shift =
      direction > 0
        ? Math.min(desiredShift, 1 - Math.max(...before))
        : -Math.min(desiredShift, Math.min(...before));
    return {
      before,
      after: before.map((value) => value + shift),
    };
  }
  return { before, after: before };
}

function CurveDiagram({
  curve,
  model,
  pressure,
}: {
  curve: Curve;
  model: DayCurveModel;
  pressure: Pressure;
}) {
  const { after, before } = dayV3PricingModelDisplayCurves(
    model,
    curve,
    pressure,
  );
  const max = Math.max(0.05, ...before, ...after) * 1.18;
  const x = [22, 224, 246];
  const y = (value: number) => 116 - (value / max) * 88;
  const points = (values: number[]) =>
    values.map((value, index) => `${x[index]},${y(value)}`).join(" ");
  const bandPoints = [
    ...before.map((value, index) => `${x[index]},${y(value)}`),
    ...after
      .map((value, index) => `${x[index]},${y(value)}`)
      .reverse(),
  ].join(" ");
  const changed = after.some(
    (value, index) => Math.abs(value - before[index]) > 0.000001,
  );
  const movementArrows =
    model === "ADAPTIVE_CURVE_V1"
      ? [
          { x: x[1], from: before[1], to: after[1] },
          { x: x[2], from: before[2], to: after[2] },
        ]
        : [];

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 pb-2 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-[var(--tertiary)]">
        <span>Share of Senior yield</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <i className="h-0.5 w-4 bg-[var(--foreground)]" /> Starting shape
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-0 w-4 border-t border-dashed border-[#1d6f5f]" /> Later under sustained pressure
          </span>
          {model === "ADAPTIVE_CURVE_V2" ? (
            <span className="font-semibold text-[#1d6f5f]">
              Whole curve moves {pressure === "below" ? "down" : "up"}
            </span>
          ) : null}
        </span>
      </div>
      <svg
        aria-label={`${DAY_CURVE_MODEL_LABELS[model]} directional curve illustration over time`}
        className="mt-1 h-[148px] w-full overflow-visible"
        role="img"
        viewBox="0 0 268 148"
      >
        <defs>
          <marker
            id={`day-v3-curve-time-arrow-${model}-${pressure}`}
            markerHeight="6"
            markerWidth="6"
            orient="auto"
            refX="5"
            refY="3"
            viewBox="0 0 6 6"
          >
            <path d="M0 0 6 3 0 6Z" fill="#1d6f5f" />
          </marker>
        </defs>
        <line stroke="var(--border-subtle)" x1="22" x2="246" y1="116" y2="116" />
        <line stroke="var(--border-subtle)" strokeDasharray="3 4" x1="224" x2="224" y1="18" y2="116" />
        <polyline
          fill="none"
          points={points(before)}
          stroke="var(--foreground)"
          strokeLinejoin="round"
          strokeWidth="2.25"
        />
        {changed ? (
          <>
            <polygon fill="#1d6f5f" opacity="0.08" points={bandPoints} />
            <polyline
              fill="none"
              points={points(after)}
              stroke="#1d6f5f"
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
            {model === "ADAPTIVE_CURVE_V1"
              ? movementArrows.map((arrow, index) => (
                <line
                  key={`movement-${index}`}
                  markerEnd={`url(#day-v3-curve-time-arrow-${model}-${pressure})`}
                  opacity="0.8"
                  stroke="#1d6f5f"
                  strokeWidth="1.25"
                  x1={arrow.x}
                  x2={arrow.x}
                  y1={y(arrow.from)}
                  y2={y(arrow.to)}
                />
                ))
              : null}
            {model === "ADAPTIVE_CURVE_V1" ? (
              <>
                <circle
                  cx={x[0]}
                  cy={y(before[0])}
                  fill="none"
                  r="6"
                  stroke="#1d6f5f"
                  strokeWidth="1.25"
                />
                <text fill="#1d6f5f" fontSize="8" x="29" y="108">
                  fixed pivot
                </text>
              </>
            ) : null}
          </>
        ) : null}
        {before.map((value, index) => (
          <circle
            cx={x[index]}
            cy={y(value)}
            fill="var(--card)"
            key={`${x[index]}-${value}`}
            r="3"
            stroke="var(--foreground)"
            strokeWidth="1.5"
          />
        ))}
        <text fill="var(--tertiary)" fontSize="9" textAnchor="middle" x="22" y="130">0%</text>
        <text fill="var(--tertiary)" fontSize="9" textAnchor="end" x="220" y="130">90%</text>
        <text fill="var(--tertiary)" fontSize="9" textAnchor="start" x="241" y="130">100%</text>
        <text fill="var(--secondary)" fontSize="9.5" fontWeight="600" textAnchor="middle" x="134" y="146">Utilization</text>
      </svg>
      <p className="border-t border-[var(--border-subtle)] pt-2 text-[9.5px] leading-snug text-[var(--secondary)]">
        {MODEL_GEOMETRY[model]}
      </p>
    </div>
  );
}

export default function DayV3PricingModelExplorer({
  liquidity,
  risk,
  modelSelections,
  onModelSelectionsChange,
}: {
  liquidity: Curve;
  risk: Curve;
  /** Optional controlled state so the selected contract shapes can be shared/exported. */
  modelSelections?: DayV3PricingModelSelections;
  onModelSelectionsChange?: (selections: DayV3PricingModelSelections) => void;
}) {
  const [premium, setPremium] = useState<Premium>("risk");
  const [uncontrolledModels, setUncontrolledModels] =
    useState<DayV3PricingModelSelections>(DAY_V3_PRICING_MODEL_DEFAULTS);
  const [pressure, setPressure] = useState<Pressure>("above");
  const models = modelSelections ?? uncontrolledModels;
  const model = models[premium];
  const curve = premium === "risk" ? risk : liquidity;
  const displayedAnchors = useMemo(
    () => [
      ["Y₀", pct(curve.y0)],
      ["Y₉₀", pct(curve.yTarget)],
      ["Y₁₀₀", pct(curve.y100)],
    ],
    [curve],
  );

  return (
    <div
      className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
      data-model-source="royco-registered-ydm-shapes"
    >
      <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-4">
        <div>
          <strong className="text-[13.5px] font-semibold">Choose a curve to inspect</strong>
          <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--secondary)]">
            Junior risk and SLP liquidity use independent copies of the same registered model types.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--foundation)] p-1" role="group" aria-label="Premium to inspect">
          {(["risk", "liquidity"] as const).map((value) => (
            <button
              aria-pressed={premium === value}
              className={cn(
                "rounded-md px-2 py-2 text-[10.5px] font-semibold transition-colors",
                premium === value
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--secondary)] hover:text-[var(--foreground)]",
              )}
              key={value}
              onClick={() => setPremium(value)}
              type="button"
            >
              {value === "risk" ? "Junior risk" : "SLP liquidity"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {DAY_CURVE_MODELS.map((value) => (
            <button
              aria-pressed={model === value}
              className={cn(
                "min-h-[68px] rounded-lg border px-3 py-2 text-left transition-colors",
                model === value
                  ? "border-2 border-[var(--foreground)] bg-[var(--foreground)] text-[var(--card)] shadow-md ring-2 ring-[var(--foreground)] ring-offset-1 ring-offset-[var(--card)]"
                  : "border-[var(--border-subtle)] hover:bg-[var(--foundation)]",
              )}
              key={value}
              onClick={() => {
                const next = { ...models, [premium]: value };
                if (modelSelections === undefined) setUncontrolledModels(next);
                onModelSelectionsChange?.(next);
              }}
              type="button"
            >
              <span className="block text-[10.5px] font-semibold leading-tight">
                {DAY_CURVE_MODEL_LABELS[value]}
              </span>
              <span
                className={cn(
                  "mt-1 block text-[9.5px] leading-snug",
                  model === value
                    ? "text-[var(--card)]"
                    : "text-[var(--tertiary)]",
                )}
              >
                {MODEL_CHANGE[value]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
              {premium === "risk" ? "Junior risk premium" : "SLP liquidity premium"}
            </span>
            <h4 className="mt-1 text-[14px] font-semibold">{DAY_CURVE_MODEL_LABELS[model]}</h4>
            <p className="mt-1 max-w-[58ch] text-[10.5px] leading-relaxed text-[var(--secondary)]">
              {MODEL_SUMMARY[model]}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-[var(--foundation)] p-1" role="group" aria-label="Utilization pressure">
            {(["below", "above"] as const).map((value) => (
              <button
                aria-pressed={pressure === value}
                className={cn(
                  "rounded-md px-2 py-1.5 text-[9.5px] font-semibold",
                  pressure === value
                    ? "bg-[var(--card)] shadow-sm"
                    : "text-[var(--secondary)]",
                )}
                key={value}
                onClick={() => setPressure(value)}
                type="button"
              >
                {value === "above" ? "Above target" : "Below target"}
              </button>
            ))}
          </div>
        </div>

        <CurveDiagram curve={curve} model={model} pressure={pressure} />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">Model inputs</span>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--secondary)]">
              {DAY_CURVE_MODEL_ANCHORS[model].join(" · ")}
              {model === "ADAPTIVE_CURVE_V1"
                ? ". Y₀ remains visible from Step 4 but this shape starts from zero."
                : model === "FIXED"
                  ? ". This illustration uses Y₉₀ as the fixed share."
                  : "."}
            </p>
          </div>
          <dl className="flex gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2">
            {displayedAnchors.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[9px] text-[var(--tertiary)]">{label}</dt>
                <dd className="font-mono text-[10.5px] font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="border-t border-[var(--border-subtle)] pt-2 text-[9.5px] leading-relaxed text-[var(--tertiary)]">
          Directional illustration, not a forecast. Step 4 remains the source of Y₀, Y₉₀, and Y₁₀₀; Royco Deploy confirms model availability and adaptive speed before deployment.
        </p>
      </section>
    </div>
  );
}
