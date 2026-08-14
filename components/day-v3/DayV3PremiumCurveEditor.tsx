"use client";

import { memo, useDeferredValue } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3Origin from "@/components/day-v3/DayV3Origin";
import DayV3Slider from "@/components/day-v3/DayV3Slider";
import DayV3YieldCurve from "@/components/day-v3/DayV3YieldCurve";
import { pct } from "@/components/day-v3/format";

export type DayV3PremiumCurveEditorProps = {
  curveOverridden: boolean;
  juniorEnabled?: boolean;
  ready: boolean;
  startingCurveBasis?: string;
  validationIssues?: string[];
  index?: number;
  liqCapPct: number;
  liqY0Pct: number;
  liqY100Pct: number;
  liqYtPct: number;
  juniorModeledApy: number;
  onLiqY0Pct: (value: number) => void;
  onLiqY100Pct: (value: number) => void;
  onLiqYtPct: (value: number) => void;
  onResetCurve: () => void;
  onRiskY0Pct: (value: number) => void;
  onRiskY100Pct: (value: number) => void;
  onRiskYtPct: (value: number) => void;
  riskCapPct: number;
  riskY0Pct: number;
  riskY100Pct: number;
  riskYtPct: number;
  slpModeledApy: number;
  slpEnabled?: boolean;
  starterDefaultsLoaded?: boolean;
  seniorShareOfCapital: number;
  sourceApy: number;
  targetUtilization: number;
};

type CurveCardProps = {
  capPct: number;
  description: string;
  docs: "coverage" | "slpTranche";
  onY0Pct: (value: number) => void;
  onY100Pct: (value: number) => void;
  onYtPct: (value: number) => void;
  paidTo: "Jr" | "SLP";
  modeledApy: number;
  overridden: boolean;
  seniorShareOfCapital: number;
  sourceApy: number;
  targetUtilization: number;
  title: string;
  utilizationLabel: "coverage" | "liquidity";
  y0Pct: number;
  y100Pct: number;
  ytPct: number;
};

const bounded = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function CurveCard({
  capPct,
  description,
  docs,
  onY0Pct,
  onY100Pct,
  onYtPct,
  paidTo,
  modeledApy,
  overridden,
  seniorShareOfCapital,
  sourceApy,
  targetUtilization,
  title,
  utilizationLabel,
  y0Pct,
  y100Pct,
  ytPct,
}: CurveCardProps) {
  const preview = useDeferredValue({ y0Pct, y100Pct, ytPct });
  const simulationBudgetPct = Math.max(0, capPct);
  const targetPct = targetUtilization * 100;

  // These are UI bounds, not a second implementation of the yield model. The
  // parent supplies the resolved anchors and the remaining shared simulation
  // budget; this component only keeps the three sliders in their displayed
  // left-to-right order.
  const y0Max = Math.min(simulationBudgetPct, ytPct);
  const ytMin = Math.min(simulationBudgetPct, y0Pct);
  const ytMax = Math.max(ytMin, Math.min(simulationBudgetPct, y100Pct));
  const y100Min = Math.min(simulationBudgetPct, ytPct);

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5"
      data-premium-curve={paidTo.toLowerCase()}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold">{title}</h4>
          <p className="mt-1 text-[10.5px] leading-snug text-[var(--tertiary)]">
            {description}
          </p>
        </div>
        <DayV3DocsLink label={`${paidTo} premium`} topic={docs} />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <DayV3Slider
          display={pct(ytPct / 100)}
          hint={`The share paid at the market's ${pct(targetUtilization)} utilization target.`}
          label={`At ${targetPct.toFixed(0)}% ${utilizationLabel} utilization (YT)`}
          max={ytMax}
          maxLabel={pct(ytMax / 100)}
          min={ytMin}
          minLabel={pct(ytMin / 100)}
          onChange={onYtPct}
          size="sm"
          step={0.0001}
          value={bounded(ytPct, ytMin, ytMax)}
        />
        <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2.5">
          <span className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">
            Modeled {paidTo} return
            <DayV3Origin origin="derived" />
          </span>
          <strong className="mt-3 font-mono text-[22px] leading-none tabular-nums">
            {pct(modeledApy)}
          </strong>
          <span className="mt-1 text-[9.5px] text-[var(--tertiary)]">
            Updates from the shared accountant
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
        <div>
          <h5 className="text-[12px] font-semibold">Curve shape anchors</h5>
          <p className="mt-0.5 text-[10.5px] text-[var(--tertiary)]">
            Set the shares paid at zero and full utilization.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DayV3Slider
            display={pct(y0Pct / 100)}
            hint={`The share paid when none of the ${utilizationLabel} is being used.`}
            label={`No ${utilizationLabel} used (Y0)`}
            max={y0Max}
            maxLabel={pct(y0Max / 100)}
            min={0}
            minLabel="0%"
            onChange={onY0Pct}
            size="sm"
            step={0.0001}
            value={bounded(y0Pct, 0, y0Max)}
          />
          <DayV3Slider
            display={pct(y100Pct / 100)}
            hint={`The share paid when all of the ${utilizationLabel} is being used.`}
            label={`All ${utilizationLabel} used (Y100)`}
            max={simulationBudgetPct}
            maxLabel={pct(simulationBudgetPct / 100)}
            min={y100Min}
            minLabel={pct(y100Min / 100)}
            onChange={onY100Pct}
            size="sm"
            step={0.0001}
            value={bounded(y100Pct, y100Min, simulationBudgetPct)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
          <p className="text-[10px] leading-snug text-[var(--tertiary)]">
            Slider maximum: {simulationBudgetPct.toFixed(1)}% of Senior yield.
            Y100 is a full-utilization anchor, not a deployment hard cap.
          </p>
          <span className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
            Current curve preview
            <DayV3Origin
              origin={overridden ? "manual-override" : "recommended"}
            />
          </span>
        </div>
        <DayV3YieldCurve
          paidTo={paidTo}
          seniorShareOfCapital={seniorShareOfCapital}
          sourceApy={sourceApy}
          target={targetUtilization}
          y0={preview.y0Pct / 100}
          y100={preview.y100Pct / 100}
          yTarget={preview.ytPct / 100}
        />
      </div>
    </section>
  );
}

/**
 * V3's deploy-only editor for the two static premium curves.
 *
 * The parent owns every value, cap, callback, and reset decision. This
 * component draws those values and forwards changes; it does not derive an
 * anchor, a cap, a return, or any accountant input.
 */
function DayV3PremiumCurveEditor({
  curveOverridden,
  juniorEnabled = true,
  ready,
  startingCurveBasis,
  validationIssues = [],
  index = 4,
  liqCapPct,
  liqY0Pct,
  liqY100Pct,
  liqYtPct,
  juniorModeledApy,
  onLiqY0Pct,
  onLiqY100Pct,
  onLiqYtPct,
  onResetCurve,
  onRiskY0Pct,
  onRiskY100Pct,
  onRiskYtPct,
  riskCapPct,
  riskY0Pct,
  riskY100Pct,
  riskYtPct,
  slpModeledApy,
  slpEnabled = true,
  starterDefaultsLoaded = false,
  seniorShareOfCapital,
  sourceApy,
  targetUtilization,
}: DayV3PremiumCurveEditorProps) {
  const activeCurveLabels = [
    ...(juniorEnabled ? ["Junior"] : []),
    ...(slpEnabled ? ["SLP"] : []),
  ];
  const activeCurveSummary = [
    ...(juniorEnabled ? [`Jr ${pct(riskYtPct / 100)}`] : []),
    ...(slpEnabled ? [`SLP ${pct(liqYtPct / 100)}`] : []),
  ].join(" · ");
  return (
    <DayV3Group
      collapsible
      defaultOpen={false}
      deployOnly
      docs="yieldSplit"
      docsLabel="Yield split"
      id="day-v3-premium-inputs"
      index={index}
      status={
        validationIssues.length === 0
          ? { label: "Complete", tone: "complete" }
          : {
              label: "Incomplete",
              tone: "incomplete",
              missing: [`Valid ${activeCurveLabels.join(" and ")} curve anchors`],
            }
      }
      subtitle={`Set how Senior yield is shared with ${activeCurveLabels.join(" and ")}`}
      summary={
        validationIssues.length === 0
          ? `${curveOverridden ? "Custom" : "Suggested"} ${activeCurveLabels.length === 1 ? "curve" : "curves"} · ${activeCurveSummary} at ${pct(targetUtilization)}`
          : starterDefaultsLoaded
            ? `Illustrative defaults loaded · ${activeCurveSummary} at ${pct(targetUtilization)}`
            : juniorEnabled && slpEnabled
              ? `Waiting for the exit-pool result · Jr ${pct(riskYtPct / 100)} · SLP pending`
              : `Waiting for the required capital result · ${activeCurveSummary}`
      }
      title="Yield split"
    >
      {!ready && validationIssues.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-[10.5px] leading-relaxed text-[var(--secondary)]">
          Your six YDM anchors are complete. Live pool validation is handled
          separately and may still block the deployment handoff.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-[78ch] space-y-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
          <p>
            Start from the capital-parity floor at the {pct(targetUtilization)} operating target, then adjust only if the accountant-derived Junior or SLP return is too low for the capital and risk being supplied.
            The zero- and full-utilization anchors below set each curve&apos;s
            shape. Source APY changes modeled returns, not these yield-share
            percentages.
          </p>
          {startingCurveBasis ? <p>{startingCurveBasis}</p> : null}
        </div>
        <DayV3Button
          disabled={!curveOverridden}
          onClick={onResetCurve}
          size="sm"
          variant="secondary"
        >
          Reset to suggested curves
        </DayV3Button>
      </div>

      {validationIssues.length > 0 ? (
        <div
          aria-live="polite"
          className="rounded-xl border px-4 py-3 text-[11px] leading-relaxed"
          role="status"
          style={{
            background:
              "color-mix(in srgb, var(--theme-gold) 10%, transparent)",
            borderColor:
              "color-mix(in srgb, var(--theme-gold) 45%, transparent)",
            color: "var(--gold-emphasis)",
          }}
        >
          {validationIssues.join(" ")}
        </div>
      ) : null}

      <div
        className={`grid grid-cols-1 items-start gap-4 ${juniorEnabled && slpEnabled ? "xl:grid-cols-2" : ""}`}
      >
        {juniorEnabled ? (
        <CurveCard
          capPct={riskCapPct}
          description="Sets the share of Senior yield paid to Junior as first-loss coverage is used."
          docs="coverage"
          onY0Pct={onRiskY0Pct}
          onY100Pct={onRiskY100Pct}
          onYtPct={onRiskYtPct}
          paidTo="Jr"
          modeledApy={juniorModeledApy}
          overridden={curveOverridden}
          seniorShareOfCapital={seniorShareOfCapital}
          sourceApy={sourceApy}
          targetUtilization={targetUtilization}
          title="Junior premium curve"
          utilizationLabel="coverage"
          y0Pct={riskY0Pct}
          y100Pct={riskY100Pct}
          ytPct={riskYtPct}
        />
        ) : null}
        {slpEnabled ? (
        <CurveCard
          capPct={liqCapPct}
          description="Sets the share of Senior yield paid to SLP as exit liquidity is used."
          docs="slpTranche"
          onY0Pct={onLiqY0Pct}
          onY100Pct={onLiqY100Pct}
          onYtPct={onLiqYtPct}
          paidTo="SLP"
          modeledApy={slpModeledApy}
          overridden={curveOverridden}
          seniorShareOfCapital={seniorShareOfCapital}
          sourceApy={sourceApy}
          targetUtilization={targetUtilization}
          title="SLP premium curve"
          utilizationLabel="liquidity"
          y0Pct={liqY0Pct}
          y100Pct={liqY100Pct}
          ytPct={liqYtPct}
        />
        ) : null}
      </div>
    </DayV3Group>
  );
}

export default memo(DayV3PremiumCurveEditor);
