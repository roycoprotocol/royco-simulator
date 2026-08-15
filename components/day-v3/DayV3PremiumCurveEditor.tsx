"use client";

import { memo, useEffect, useRef, useState } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3Origin from "@/components/day-v3/DayV3Origin";
import DayV3Slider from "@/components/day-v3/DayV3Slider";
import { pct } from "@/components/day-v3/format";

export type DayV3PremiumCurveEditorProps = {
  curveOverridden: boolean;
  juniorEnabled?: boolean;
  validationIssues?: string[];
  index?: number;
  liqCapPct: number;
  liqY0Pct: number;
  liqY100Pct: number;
  liqYtPct: number;
  juniorModeledApy: number;
  onLiqYtPct: (value: number) => void;
  onResetCurve: () => void;
  onRiskYtPct: (value: number) => void;
  riskCapPct: number;
  riskY0Pct: number;
  riskY100Pct: number;
  riskYtPct: number;
  slpModeledApy: number;
  slpEnabled?: boolean;
  targetUtilization: number;
};

type CurveCardProps = {
  capPct: number;
  description: string;
  docs: "coverage" | "slpTranche";
  onYtPct: (value: number) => void;
  paidTo: "Jr" | "SLP";
  modeledApy: number;
  targetUtilization: number;
  title: string;
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
  onYtPct,
  paidTo,
  modeledApy,
  targetUtilization,
  title,
  y0Pct,
  y100Pct,
  ytPct,
}: CurveCardProps) {
  const simulationBudgetPct = Math.max(0, capPct);
  const targetPct = targetUtilization * 100;

  // These are UI bounds, not a second implementation of the yield model. The
  // parent supplies the resolved anchors and the remaining shared simulation
  // budget; this component only bounds the displayed target-share slider.
  const ytMin = Math.min(simulationBudgetPct, y0Pct);
  const ytMax = Math.max(ytMin, Math.min(simulationBudgetPct, y100Pct));

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-3"
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
          hint={`The share of Senior yield paid to ${paidTo} at the fixed comparison point.`}
          label={`${paidTo} share at ${targetPct.toFixed(0)}% utilization`}
          max={ytMax}
          maxLabel={pct(ytMax / 100)}
          min={ytMin}
          minLabel={pct(ytMin / 100)}
          onChange={onYtPct}
          size="sm"
          step={0.1}
          value={bounded(ytPct, ytMin, ytMax)}
        />
        <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-3">
          <span className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">
            Projected {paidTo} APY
            <DayV3Origin origin="derived" />
          </span>
          <strong className="font-mono text-[18px] leading-none tabular-nums">
            {pct(modeledApy)}
          </strong>
          <span className="text-[9.5px] text-[var(--tertiary)]">
            Updates from the shared accountant
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * V3's target-share editor for the two static premium curves.
 *
 * The parent owns every value, bound, callback, and reset decision. This
 * component displays only the operating-target shares and accountant-derived
 * returns; it does not derive a curve anchor, cap, return, or accountant input.
 */
function DayV3PremiumCurveEditor({
  curveOverridden,
  juniorEnabled = true,
  validationIssues = [],
  index = 4,
  liqCapPct,
  liqY0Pct,
  liqY100Pct,
  liqYtPct,
  juniorModeledApy,
  onLiqYtPct,
  onResetCurve,
  onRiskYtPct,
  riskCapPct,
  riskY0Pct,
  riskY100Pct,
  riskYtPct,
  slpModeledApy,
  slpEnabled = true,
  targetUtilization,
}: DayV3PremiumCurveEditorProps) {
  const [riskEditor, setRiskEditor] = useState({
    draft: riskYtPct,
    source: riskYtPct,
  });
  const [liqEditor, setLiqEditor] = useState({
    draft: liqYtPct,
    source: liqYtPct,
  });
  const onRiskYtPctRef = useRef(onRiskYtPct);
  const onLiqYtPctRef = useRef(onLiqYtPct);
  useEffect(() => {
    onRiskYtPctRef.current = onRiskYtPct;
  }, [onRiskYtPct]);
  useEffect(() => {
    onLiqYtPctRef.current = onLiqYtPct;
  }, [onLiqYtPct]);
  // Reset actions and linked URLs can replace the parent value. React's
  // documented adjusted-state pattern keeps the local drag draft in sync
  // without a second render caused by a setState-in-effect cycle.
  if (!Object.is(riskEditor.source, riskYtPct)) {
    setRiskEditor({ draft: riskYtPct, source: riskYtPct });
  }
  if (!Object.is(liqEditor.source, liqYtPct)) {
    setLiqEditor({ draft: liqYtPct, source: liqYtPct });
  }
  const riskDraftPct = riskEditor.draft;
  const liqDraftPct = liqEditor.draft;

  useEffect(() => {
    if (!juniorEnabled || Object.is(riskDraftPct, riskYtPct)) return;
    const timeout = window.setTimeout(
      () => onRiskYtPctRef.current(riskDraftPct),
      120,
    );
    return () => window.clearTimeout(timeout);
  }, [juniorEnabled, riskDraftPct, riskYtPct]);

  useEffect(() => {
    if (!slpEnabled || Object.is(liqDraftPct, liqYtPct)) return;
    const timeout = window.setTimeout(
      () => onLiqYtPctRef.current(liqDraftPct),
      120,
    );
    return () => window.clearTimeout(timeout);
  }, [liqDraftPct, liqYtPct, slpEnabled]);

  if (!juniorEnabled && !slpEnabled) {
    return null;
  }

  const activeCurveLabels = [
    ...(juniorEnabled ? ["Junior"] : []),
    ...(slpEnabled ? ["SLP"] : []),
  ];
  const activeCurveSummary = [
    ...(juniorEnabled ? [`Jr ${pct(riskDraftPct / 100)}`] : []),
    ...(slpEnabled ? [`SLP ${pct(liqDraftPct / 100)}`] : []),
  ].join(" · ");
  return (
    <DayV3Group
      // The reset belongs beside the docs link in the section footer. Sharing a
      // row with the intro paragraph left a wide empty band under the heading
      // before the reader had reached a single control.
      action={
        <DayV3Button
          disabled={!curveOverridden}
          onClick={onResetCurve}
          size="sm"
          variant="secondary"
        >
          Reset yield split
        </DayV3Button>
      }
      collapsible
      defaultOpen={false}
      docs="yieldSplit"
      docsLabel="Yield split"
      id="day-v3-premium-inputs"
      index={index}
      status={
        validationIssues.length === 0
          ? { label: "Set", tone: "complete" }
          : {
              label: "Needs input",
              tone: "incomplete",
              missing: [
                `Valid ${activeCurveLabels.join(" and ")} yield shares`,
              ],
            }
      }
      subtitle={`Compare how source yield is shared with ${activeCurveLabels.join(" and ")}`}
      summary={
        validationIssues.length === 0
          ? `${activeCurveSummary} at ${pct(targetUtilization)} utilization`
          : "Adjust the highlighted yield shares"
      }
      title="Yield split"
    >
      <p className="text-[10px] leading-snug text-[var(--tertiary)]">
        Adjust the share paid at the {pct(targetUtilization)} operating target.
        Each position&apos;s modeled APY updates beside it.
      </p>

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
        className={`grid grid-cols-1 items-start gap-3 ${juniorEnabled && slpEnabled ? "lg:grid-cols-2" : ""}`}
      >
        {juniorEnabled ? (
          <CurveCard
            capPct={riskCapPct}
            description="Sets the share of Senior yield paid to Junior as first-loss coverage is used."
            docs="coverage"
            onYtPct={(value) =>
              setRiskEditor((current) => ({ ...current, draft: value }))
            }
            paidTo="Jr"
            modeledApy={juniorModeledApy}
            targetUtilization={targetUtilization}
            title="Junior yield share"
            y0Pct={riskY0Pct}
            y100Pct={riskY100Pct}
            ytPct={riskDraftPct}
          />
        ) : null}
        {slpEnabled ? (
          <CurveCard
            capPct={liqCapPct}
            description="Sets the share of Senior yield paid to SLP as exit liquidity is used."
            docs="slpTranche"
            onYtPct={(value) =>
              setLiqEditor((current) => ({ ...current, draft: value }))
            }
            paidTo="SLP"
            modeledApy={slpModeledApy}
            targetUtilization={targetUtilization}
            title="SLP yield share"
            y0Pct={liqY0Pct}
            y100Pct={liqY100Pct}
            ytPct={liqDraftPct}
          />
        ) : null}
      </div>
    </DayV3Group>
  );
}

export default memo(DayV3PremiumCurveEditor);
