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
  ceilingPct,
  curveOverridden,
  liqCeilingPct,
  derivedLiqSharePct,
  derivedRiskSharePct,
  liqSharePct,
  liqShareOverridden,
  observationDays,
  onBandPct,
  onLiqSharePct,
  onObservationDays,
  onResetCurve,
  onRiskSharePct,
  onY0Pct,
  onY100Pct,
  riskSharePct,
  riskShareOverridden,
  targetUtilization,
  y0Pct,
  y100Pct,
}: {
  bandPct: number;
  /** The highest any point of the risk curve may go before the engine rejects
   *  the config. Set by whatever the liquidity curve already claims. */
  ceilingPct: number;
  curveOverridden: boolean;
  /** What the market's own risk curve leaves for the SLP side. */
  liqCeilingPct: number;
  derivedLiqSharePct: number;
  derivedRiskSharePct: number;
  liqSharePct: number;
  liqShareOverridden: boolean;
  observationDays: number;
  onBandPct: (value: number) => void;
  onLiqSharePct: (value: number) => void;
  onObservationDays: (value: number) => void;
  onResetCurve: () => void;
  onRiskSharePct: (value: number) => void;
  onY0Pct: (value: number) => void;
  onY100Pct: (value: number) => void;
  riskSharePct: number;
  riskShareOverridden: boolean;
  targetUtilization: number;
  y0Pct: number;
  y100Pct: number;
}) {
  // Only the curve is deferred. The sliders keep their own raw values so they
  // stay glued to the pointer.
  const curve = useDeferredValue({ riskSharePct, targetUtilization, y0Pct, y100Pct });
  const shareMax = Math.min(80, Math.round(ceilingPct * 10) / 10);
  const liqMax = Math.min(80, Math.round(liqCeilingPct * 10) / 10);
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
            <Range max={shareMax} min={0} onChange={onRiskSharePct} step={0.5} value={Math.min(riskSharePct, shareMax)} />
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
            <Range max={liqMax} min={0} onChange={onLiqSharePct} step={0.5} value={Math.min(liqSharePct, liqMax)} />
          </Field>

          {curveOverridden ? (
            <div className="sm:col-span-2">
              <button
                className="text-[11.5px] font-semibold underline underline-offset-2"
                onClick={onResetCurve}
                type="button"
              >
                Reset the curve to this market&apos;s own
              </button>
            </div>
          ) : null}
        </div>

        {/* How the YDM is set, shown rather than asserted. */}
        <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold">Yield-share curve (YDM)</h3>
            <Badge tone="neutral">static</Badge>
          </div>
          <p className="max-w-[70ch] text-[11.5px] leading-relaxed text-[var(--secondary)]">
            A static yield-share curve, piecewise-linear through three anchors: what Jr is
            paid out of Sr&apos;s yield when the market is undrawn, at its{" "}
            {pct(targetUtilization)} target, and when it is fully drawn. This page models the
            market at its target, so YT is the anchor that binds and the other two describe
            what happens either side of it.
          </p>
          {/* The anchors are controls, not readouts. A deployer designing a
              curve sets all three; the target is the one this page models at,
              so it keeps the emphasis. */}
          <div className="grid grid-cols-1 items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3.5 lg:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <Field
                hint="Paid when nothing is drawn"
                label="Y0 at 0% used"
                value={pct(y0Pct / 100)}
              >
                <Range max={shareMax} min={0} onChange={onY0Pct} step={0.5} value={Math.min(y0Pct, shareMax)} />
              </Field>
              <Field
                hint="The anchor this page models at"
                label={`YT at the ${pct(targetUtilization)} target`}
                value={pct(riskSharePct / 100)}
              >
                <Range max={shareMax} min={0} onChange={onRiskSharePct} step={0.5} value={Math.min(riskSharePct, shareMax)} />
              </Field>
              <Field
                hint={`Paid when fully drawn. Capped at ${pct(ceilingPct / 100)} by the SLP curve`}
                label="Y100 at 100% used"
                value={pct(y100Pct / 100)}
              >
                <Range max={shareMax} min={0} onChange={onY100Pct} step={0.5} value={Math.min(y100Pct, shareMax)} />
              </Field>
            </div>
            <DayV2YieldCurve
              target={curve.targetUtilization}
              y0={curve.y0Pct / 100}
              y100={curve.y100Pct / 100}
              yTarget={curve.riskSharePct / 100}
            />
          </div>

          <p className="text-[10px] leading-relaxed text-[var(--tertiary)]">
            Left alone, Y0 and Y100 follow the market and are clamped so the curve never
            slopes down into its own target. No point may exceed{" "}
            <strong className="font-mono font-semibold tabular-nums">{pct(ceilingPct / 100)}</strong>,
            which is what the SLP curve leaves: the engine reads each contract cap off the
            highest point of its curve and rejects a config whose two caps exceed 100%
            together. Only an adaptive curve lets the target drift on its own, and no
            market here uses one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(DayV2Parameters);
