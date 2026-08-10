"use client";

import { memo, useDeferredValue } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DayV2YieldCurve from "@/components/day-v2/DayV2YieldCurve";
import { pct } from "@/components/day-v2/format";

/**
 * Every remaining term a real market takes. These were pinned at the market
 * default with no way to see or move them, which is fine for "what would I
 * earn" and useless for someone about to deploy. They are inputs, so they carry
 * the same foundation-panel treatment as the sliders above rather than looking
 * like the readouts around them.
 */
function Field({
  children,
  hint,
  label,
  value,
}: {
  children: React.ReactNode;
  hint: string;
  label: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
          {label}
        </span>
        <span className="font-mono text-[14px] font-bold tabular-nums">{value}</span>
      </span>
      {children}
      <span className="text-[10px] leading-snug text-[var(--tertiary)]">{hint}</span>
    </label>
  );
}

function Range({
  max,
  min,
  onChange,
  step,
  value,
}: {
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <input
      className="day-v2-range"
      max={max}
      min={min}
      onChange={(event) => onChange(Number(event.target.value))}
      step={step}
      type="range"
      value={value}
    />
  );
}

function DayV2Parameters({
  bandPct,
  derivedLiqSharePct,
  derivedRiskSharePct,
  liqSharePct,
  liqShareOverridden,
  maintainCoverage,
  observationDays,
  onBandPct,
  onLiqSharePct,
  onMaintainCoverage,
  onObservationDays,
  onResetLiqShare,
  onResetRiskShare,
  onRiskSharePct,
  riskSharePct,
  riskShareOverridden,
  targetUtilization,
  y0,
  y100,
}: {
  bandPct: number;
  derivedLiqSharePct: number;
  derivedRiskSharePct: number;
  liqSharePct: number;
  liqShareOverridden: boolean;
  maintainCoverage: boolean;
  observationDays: number;
  onBandPct: (value: number) => void;
  onLiqSharePct: (value: number) => void;
  onMaintainCoverage: (value: boolean) => void;
  onObservationDays: (value: number) => void;
  onResetLiqShare: () => void;
  onResetRiskShare: () => void;
  onRiskSharePct: (value: number) => void;
  riskSharePct: number;
  riskShareOverridden: boolean;
  targetUtilization: number;
  y0: number;
  y100: number;
}) {
  // Only the curve is deferred. The sliders keep their own raw values so they
  // stay glued to the pointer.
  const curve = useDeferredValue({ riskSharePct, targetUtilization, y0, y100 });
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Market parameters</CardTitle>
          <Badge tone="neutral">drives every figure</Badge>
        </div>
        <CardDescription>
          The rest of the terms the engine runs on. Unlike the deployment checklist
          below, moving any of these changes the numbers on this page.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4 sm:grid-cols-2">
          <Field
            hint="How long a loss has to persist before it is finalized against Jr"
            label="Observation period"
            value={`${observationDays} days`}
          >
            <Range max={194} min={7} onChange={onObservationDays} step={1} value={observationDays} />
          </Field>

          <Field
            hint="Width of the E-CLP pool's price band around NAV"
            label="Pool band"
            value={pct(bandPct / 100)}
          >
            <Range max={20} min={0.25} onChange={onBandPct} step={0.25} value={bandPct} />
          </Field>

          <Field
            hint={
              riskShareOverridden
                ? `Priced by hand. Following the requirement would pay ${pct(derivedRiskSharePct / 100)}`
                : "Follows coverage: a tranche is paid for what it supplies"
            }
            label="Jr yield share (YT)"
            value={pct(riskSharePct / 100)}
          >
            <Range max={80} min={0} onChange={onRiskSharePct} step={0.5} value={riskSharePct} />
          </Field>

          <Field
            hint={
              liqShareOverridden
                ? `Priced by hand. Following the requirement would pay ${pct(derivedLiqSharePct / 100)}`
                : "Follows liquidity, at half the rate Jr is paid for coverage"
            }
            label="SLP yield share"
            value={pct(liqSharePct / 100)}
          >
            <Range max={80} min={0} onChange={onLiqSharePct} step={0.5} value={liqSharePct} />
          </Field>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
              Coverage restoration
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {([["On", true], ["Off", false]] as const).map(([label, value]) => (
                <button
                  aria-pressed={maintainCoverage === value}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${
                    maintainCoverage === value
                      ? "border-transparent bg-[var(--foreground)] text-[var(--background)]"
                      : "border-[var(--border-subtle)] bg-[var(--card)] text-[var(--secondary)]"
                  }`}
                  key={label}
                  onClick={() => onMaintainCoverage(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
              {riskShareOverridden || liqShareOverridden ? (
                <button
                  className="ml-auto text-[11.5px] font-semibold underline underline-offset-2"
                  onClick={() => {
                    onResetRiskShare();
                    onResetLiqShare();
                  }}
                  type="button"
                >
                  Reprice both shares from the requirements
                </button>
              ) : null}
            </div>
            <span className="text-[10px] leading-snug text-[var(--tertiary)]">
              With it on, Jr is refilled from outside the market to hold coverage after a
              finalized loss. It is what makes Sr&apos;s backtest result look the way it does.
            </span>
          </div>
        </div>

        {/* How the YDM is set, shown rather than asserted. */}
        <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold">Yield-share curve (YDM)</h3>
            <Badge tone="neutral">static</Badge>
          </div>
          <p className="max-w-[70ch] text-[11.5px] leading-relaxed text-[var(--secondary)]">
            Every market here runs a static yield-share curve: piecewise-linear through
            three anchors, paying Jr{" "}
            <strong className="font-mono font-bold tabular-nums">{pct(y0)}</strong> of Sr&apos;s
            yield at zero utilization,{" "}
            <strong className="font-mono font-bold tabular-nums">{pct(riskSharePct / 100)}</strong>{" "}
            at the {pct(targetUtilization)} target, and{" "}
            <strong className="font-mono font-bold tabular-nums">{pct(y100)}</strong> at full
            utilization. This page models the market at its target, so the middle anchor is the
            one that binds and the other two describe what happens either side of it.
          </p>
          {/* The anchors beside the curve rather than under it. Full width the
              curve is mostly the flat run from Y0 to the target, which reads as
              a broken chart instead of the point: the share barely moves until
              utilization passes the target, then climbs hard. */}
          <div className="grid grid-cols-1 items-center gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3.5 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
            <div className="flex gap-5 lg:flex-col lg:gap-3">
              {([
                ["Y0", "at 0% used", y0],
                ["YT", `at the ${pct(targetUtilization)} target`, riskSharePct / 100],
                ["Y100", "at 100% used", y100],
              ] as const).map(([anchor, when, value], index) => (
                <div className="flex flex-col gap-0.5" key={anchor}>
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                    {anchor}
                  </span>
                  <span
                    className="font-mono text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums"
                    style={index === 1 ? { color: "var(--navy-emphasis)" } : undefined}
                  >
                    {pct(value)}
                  </span>
                  <span className="text-[10px] text-[var(--tertiary)]">{when}</span>
                </div>
              ))}
            </div>
            <DayV2YieldCurve
              target={curve.targetUtilization}
              y0={curve.y0}
              y100={curve.y100}
              yTarget={curve.riskSharePct / 100}
            />
          </div>
          <p className="text-[10px] leading-relaxed text-[var(--tertiary)]">
            Y0 and Y100 come from the market and are clamped so the curve never slopes down
            into its own target: setting a share below the market&apos;s Y0 lowers Y0 with it.
            Only an adaptive curve lets the target drift on its own, and no market here uses one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(DayV2Parameters);
