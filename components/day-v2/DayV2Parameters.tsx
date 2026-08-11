"use client";

import { memo, useDeferredValue } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2YieldCurve from "@/components/day-v2/DayV2YieldCurve";
import { pct } from "@/components/day-v2/format";
import { dayV2RangeStyle } from "@/components/day-v2/range";

/**
 * Every remaining term a real market takes. These were pinned at the market
 * default with no way to see or move them, which is fine for "what would I
 * earn" and useless for someone about to deploy. They are inputs, so they sit
 * inside the one input panel on the deploy tab, and their own sub-panels invert
 * to `--card` because a raised well inside a `--foundation` box needs the
 * contrast to still read as a well.
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
      style={dayV2RangeStyle(value, min, max)}
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
  sourceApy,
  liqY0Pct,
  liqY100Pct,
  onLiqY0Pct,
  onLiqY100Pct,
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
  /** The source rate, so the curves can quote a share as a rate. */
  sourceApy: number;
  liqY0Pct: number;
  liqY100Pct: number;
  onLiqY0Pct: (value: number) => void;
  onLiqY100Pct: (value: number) => void;
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
  const curve = useDeferredValue({
    liqSharePct, liqY0Pct, liqY100Pct, riskSharePct, targetUtilization, y0Pct, y100Pct,
  });
  const shareMax = Math.min(80, Math.round(ceilingPct * 10) / 10);
  const liqMax = Math.min(80, Math.round(liqCeilingPct * 10) / 10);
  return (
    // No card of its own. These move the figures on this page exactly the way
    // the three terms do, so on the deploy tab they are a third region of the
    // one input panel rather than a separate slab four hundred pixels below
    // it. The declared checklist is the thing that is genuinely different, and
    // it stays outside because moving it changes nothing here.
    <div className="flex flex-col gap-5 border-t border-[var(--border-subtle)] pt-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]">
            And the rest of the market&apos;s parameters
          </h3>
          <Badge tone="neutral">every figure below</Badge>
        </div>
        <p className="max-w-[86ch] text-[11.5px] leading-relaxed text-[var(--secondary)]">
          The rest of the terms the engine runs on. Unlike the deployment checklist
          further down, moving any of these changes the numbers on this page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 sm:grid-cols-2">
        <Field
          hint="How long a loss has to persist before it is finalized against Jr"
          label="Observation period"
          value={`${observationDays} days`}
        >
          <Range max={194} min={7} onChange={onObservationDays} step={1} value={observationDays} />
        </Field>

        <Field
          hint="How far the pool price may move from NAV before the Sr side is exhausted. The pool is a Balancer E-CLP weighted 90% exit asset to 10% Sr shares at the peg, and this sets its lower price bound directly."
          label="Pool band"
          value={pct(bandPct / 100)}
        >
          <Range max={20} min={0.25} onChange={onBandPct} step={0.25} value={bandPct} />
        </Field>

        {curveOverridden ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:col-span-2">
            <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">
              {riskShareOverridden || liqShareOverridden
                ? `Priced by hand. Following the requirements would pay Jr ${pct(derivedRiskSharePct / 100)} and SLP ${pct(derivedLiqSharePct / 100)} at target.`
                : "The curve shape has been changed from this market's own."}
            </span>
            <button
              className="text-[11.5px] font-semibold underline underline-offset-2"
              onClick={onResetCurve}
              type="button"
            >
              Reset to this market&apos;s own
            </button>
          </div>
        ) : null}
      </div>

      {/* Two curves, not one. The accountant runs a yield-share model on
          each side, keyed on a different utilization, with its own target.
          Showing a single curve labelled "the YDM" hid the liquidity one and
          left its shape unsettable. */}
      <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[13px] font-semibold">Yield-share models</h3>
          <p className="max-w-[78ch] text-[11.5px] leading-relaxed text-[var(--secondary)]">
            Each side is priced by its own model. A model takes one number, how hard that
            side is being worked, and returns the share of Sr&apos;s yield that side is
            paid. Utilization is the requirement divided by the capital actually standing
            behind it, so {pct(targetUtilization)} means the supplier is carrying about{" "}
            {pct(1 / targetUtilization - 1)} more than the market asks of it right now.
            Every figure on this page is read at the {pct(targetUtilization)} target on
            both curves, which is why the target anchor is the one that sets the rates and
            the other two anchors move them by less than a tenth of a point. They still
            have to be set: they decide what a position earns once utilization leaves the
            target, and the contract takes each cap from the highest point of its curve.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {([
            {
              anchors: [
                ["Y0", "Jr share at 0% used", y0Pct, onY0Pct],
                ["YT", `Jr share at the ${pct(targetUtilization)} target`, riskSharePct, onRiskSharePct],
                ["Y100", "Jr share at 100% used", y100Pct, onY100Pct],
              ],
              caption: "Coverage utilization is the coverage requirement divided by the Jr capital standing behind it. It rises when Sr grows or Jr is drawn down.",
              ceiling: shareMax,
              curveY0: curve.y0Pct,
              curveY100: curve.y100Pct,
              curveYT: curve.riskSharePct,
              paid: "Jr",
              title: "Coverage model",
            },
            {
              anchors: [
                ["Y0", "SLP share at 0% used", liqY0Pct, onLiqY0Pct],
                ["YT", `SLP share at the ${pct(targetUtilization)} target`, liqSharePct, onLiqSharePct],
                ["Y100", "SLP share at 100% used", liqY100Pct, onLiqY100Pct],
              ],
              caption: "Liquidity utilization is the liquidity requirement divided by the pool NAV backing it. It rises when Sr grows or the pool is drawn down.",
              ceiling: liqMax,
              curveY0: curve.liqY0Pct,
              curveY100: curve.liqY100Pct,
              curveYT: curve.liqSharePct,
              paid: "SLP",
              title: "Liquidity model",
            },
          ] as const).map((model) => (
            <div
              className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5"
              key={model.title}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[12px] font-semibold">{model.title}</h4>
                <Badge tone="neutral">static curve</Badge>
              </div>
              <p className="text-[10.5px] leading-snug text-[var(--tertiary)]">
                {model.caption}
              </p>
              <div className="flex flex-col gap-2.5">
                {model.anchors.map(([anchor, hint, value, onChange]) => (
                  <Field
                    hint={hint}
                    key={anchor}
                    label={anchor}
                    value={pct(value / 100)}
                  >
                    <Range
                      max={model.ceiling}
                      min={0}
                      onChange={onChange}
                      step={0.5}
                      value={Math.min(value, model.ceiling)}
                    />
                  </Field>
                ))}
              </div>
              <DayV2YieldCurve
                paidTo={model.paid}
                sourceApy={sourceApy}
                target={curve.targetUtilization}
                y0={model.curveY0 / 100}
                y100={model.curveY100 / 100}
                yTarget={model.curveYT / 100}
              />
              <p className="text-[10px] leading-snug text-[var(--tertiary)]">
                The page reads this curve at the {pct(targetUtilization)} target, so{" "}
                <strong className="font-mono font-semibold tabular-nums">
                  {pct(model.curveYT / 100)}
                </strong>{" "}
                of Sr&apos;s yield goes to {model.paid}, and that is where {model.paid}
                &apos;s rate above comes from. Y0 and Y100 shape what happens either side
                of the target, so they barely move the figures here.
              </p>
            </div>
          ))}
        </div>

        <p className="max-w-[78ch] text-[10px] leading-relaxed text-[var(--tertiary)]">
          No point on either curve may exceed{" "}
          <strong className="font-mono font-semibold tabular-nums">{pct(ceilingPct / 100)}</strong>{" "}
          and{" "}
          <strong className="font-mono font-semibold tabular-nums">{pct(liqCeilingPct / 100)}</strong>{" "}
          respectively: the contract reads each cap off the highest point of its own curve
          and rejects a market whose two caps exceed 100% together. Left alone, the anchors
          follow the market and are clamped so a curve never slopes down into its own
          target. Only an adaptive model lets a target drift on its own, and no market here
          uses one.
        </p>
      </div>
    </div>
  );
}

export default memo(DayV2Parameters);
