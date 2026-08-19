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
  onLiqY0Pct: (value: number) => void;
  onLiqY100Pct: (value: number) => void;
  onResetCurve: () => void;
  onRiskY0Pct: (value: number) => void;
  onRiskY100Pct: (value: number) => void;
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
  onY0Pct: (value: number) => void;
  onY100Pct: (value: number) => void;
  paidTo: "Jr" | "SLP";
  modeledApy: number;
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
  onY0Pct,
  onY100Pct,
  paidTo,
  modeledApy,
  title,
  y0Pct,
  y100Pct,
  ytPct,
}: CurveCardProps) {
  const simulationBudgetPct = Math.max(0, capPct);
  // These are input bounds, not another curve evaluator. The contract requires
  // Y0 <= YT <= Y100. YT remains the contract-configured fixed kink anchor;
  // this streamlined editor exposes only the two endpoint controls. Curve
  // evaluation stays in the shared Day accountant.
  const y0Max = Math.min(simulationBudgetPct, Math.max(0, ytPct));
  const y100Min = Math.min(simulationBudgetPct, Math.max(0, ytPct));

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
        <div className="flex min-w-0 flex-col gap-2">
          <DayV3Slider
            display={pct(y0Pct / 100)}
            hint={`The share of Senior yield paid to ${paidTo} when its utilization is 0%.`}
            label={`${paidTo} Y0 · 0% utilization`}
            max={y0Max}
            maxLabel={pct(y0Max / 100)}
            min={0}
            minLabel="0.0%"
            onChange={onY0Pct}
            size="sm"
            step={0.1}
            value={bounded(y0Pct, 0, y0Max)}
          />
          <DayV3Slider
            display={pct(y100Pct / 100)}
            hint={`The share of Senior yield paid to ${paidTo} when its utilization reaches 100%.`}
            label={`${paidTo} Y100 · 100% utilization`}
            max={simulationBudgetPct}
            maxLabel={pct(simulationBudgetPct / 100)}
            min={y100Min}
            minLabel={pct(y100Min / 100)}
            onChange={onY100Pct}
            size="sm"
            step={0.1}
            value={bounded(y100Pct, y100Min, simulationBudgetPct)}
          />
        </div>
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
 * V3's endpoint editor for the two static premium curves.
 *
 * The parent owns every value, bound, callback, and reset decision. This
 * component displays the contract's configurable Y0 and Y100 endpoints plus
 * accountant-derived returns. The configured YT kink stays in the parent and
 * is still passed to the accountant; this component does not evaluate either
 * curve or derive a return.
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
  onLiqY0Pct,
  onLiqY100Pct,
  onResetCurve,
  onRiskY0Pct,
  onRiskY100Pct,
  riskCapPct,
  riskY0Pct,
  riskY100Pct,
  riskYtPct,
  slpModeledApy,
  slpEnabled = true,
  targetUtilization,
}: DayV3PremiumCurveEditorProps) {
  const [riskEditor, setRiskEditor] = useState({
    draft: { y0: riskY0Pct, yt: riskYtPct, y100: riskY100Pct },
    source: { y0: riskY0Pct, yt: riskYtPct, y100: riskY100Pct },
  });
  const [liqEditor, setLiqEditor] = useState({
    draft: { y0: liqY0Pct, yt: liqYtPct, y100: liqY100Pct },
    source: { y0: liqY0Pct, yt: liqYtPct, y100: liqY100Pct },
  });
  const onRiskY0PctRef = useRef(onRiskY0Pct);
  const onRiskY100PctRef = useRef(onRiskY100Pct);
  const onLiqY0PctRef = useRef(onLiqY0Pct);
  const onLiqY100PctRef = useRef(onLiqY100Pct);
  useEffect(() => {
    onRiskY0PctRef.current = onRiskY0Pct;
  }, [onRiskY0Pct]);
  useEffect(() => {
    onRiskY100PctRef.current = onRiskY100Pct;
  }, [onRiskY100Pct]);
  useEffect(() => {
    onLiqY0PctRef.current = onLiqY0Pct;
  }, [onLiqY0Pct]);
  useEffect(() => {
    onLiqY100PctRef.current = onLiqY100Pct;
  }, [onLiqY100Pct]);
  // Reset actions and linked URLs can replace the parent value. React's
  // documented adjusted-state pattern keeps the local drag draft in sync
  // without a second render caused by a setState-in-effect cycle.
  const riskSource = { y0: riskY0Pct, yt: riskYtPct, y100: riskY100Pct };
  const liqSource = { y0: liqY0Pct, yt: liqYtPct, y100: liqY100Pct };
  if (
    !Object.is(riskEditor.source.y0, riskSource.y0) ||
    !Object.is(riskEditor.source.yt, riskSource.yt) ||
    !Object.is(riskEditor.source.y100, riskSource.y100)
  ) {
    setRiskEditor({ draft: riskSource, source: riskSource });
  }
  if (
    !Object.is(liqEditor.source.y0, liqSource.y0) ||
    !Object.is(liqEditor.source.yt, liqSource.yt) ||
    !Object.is(liqEditor.source.y100, liqSource.y100)
  ) {
    setLiqEditor({ draft: liqSource, source: liqSource });
  }
  const riskDraft = riskEditor.draft;
  const liqDraft = liqEditor.draft;

  useEffect(() => {
    if (!juniorEnabled || Object.is(riskDraft.y0, riskY0Pct)) return;
    const timeout = window.setTimeout(() => onRiskY0PctRef.current(riskDraft.y0), 120);
    return () => window.clearTimeout(timeout);
  }, [juniorEnabled, riskDraft.y0, riskY0Pct]);

  useEffect(() => {
    if (!juniorEnabled || Object.is(riskDraft.y100, riskY100Pct)) return;
    const timeout = window.setTimeout(() => onRiskY100PctRef.current(riskDraft.y100), 120);
    return () => window.clearTimeout(timeout);
  }, [juniorEnabled, riskDraft.y100, riskY100Pct]);

  useEffect(() => {
    if (!slpEnabled || Object.is(liqDraft.y0, liqY0Pct)) return;
    const timeout = window.setTimeout(() => onLiqY0PctRef.current(liqDraft.y0), 120);
    return () => window.clearTimeout(timeout);
  }, [liqDraft.y0, liqY0Pct, slpEnabled]);

  useEffect(() => {
    if (!slpEnabled || Object.is(liqDraft.y100, liqY100Pct)) return;
    const timeout = window.setTimeout(() => onLiqY100PctRef.current(liqDraft.y100), 120);
    return () => window.clearTimeout(timeout);
  }, [liqDraft.y100, liqY100Pct, slpEnabled]);

  if (!juniorEnabled && !slpEnabled) {
    return null;
  }

  const activeCurveLabels = [
    ...(juniorEnabled ? ["Junior"] : []),
    ...(slpEnabled ? ["SLP"] : []),
  ];
  const activeCurveSummary = [
    ...(juniorEnabled
      ? [`Jr ${pct(riskDraft.y0 / 100)} / ${pct(riskDraft.y100 / 100)}`]
      : []),
    ...(slpEnabled
      ? [`SLP ${pct(liqDraft.y0 / 100)} / ${pct(liqDraft.y100 / 100)}`]
      : []),
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
          ? `${activeCurveSummary} · Y0 / Y100`
          : "Adjust the highlighted yield shares"
      }
      title="Yield split"
    >
      <p className="text-[10px] leading-snug text-[var(--tertiary)]">
        Set the yield-share endpoints at 0% and 100% utilization. The
        contract&apos;s fixed {pct(targetUtilization)} kink remains configured in
        the market, and each position&apos;s modeled APY updates beside the controls.
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
            onY0Pct={(value) =>
              setRiskEditor((current) => ({
                ...current,
                draft: { ...current.draft, y0: value },
              }))
            }
            onY100Pct={(value) =>
              setRiskEditor((current) => ({
                ...current,
                draft: { ...current.draft, y100: value },
              }))
            }
            paidTo="Jr"
            modeledApy={juniorModeledApy}
            title="Junior risk yield curve"
            y0Pct={riskDraft.y0}
            y100Pct={riskDraft.y100}
            ytPct={riskDraft.yt}
          />
        ) : null}
        {slpEnabled ? (
          <CurveCard
            capPct={liqCapPct}
            description="Sets the share of Senior yield paid to SLP as exit liquidity is used."
            docs="slpTranche"
            onY0Pct={(value) =>
              setLiqEditor((current) => ({
                ...current,
                draft: { ...current.draft, y0: value },
              }))
            }
            onY100Pct={(value) =>
              setLiqEditor((current) => ({
                ...current,
                draft: { ...current.draft, y100: value },
              }))
            }
            paidTo="SLP"
            modeledApy={slpModeledApy}
            title="SLP liquidity yield curve"
            y0Pct={liqDraft.y0}
            y100Pct={liqDraft.y100}
            ytPct={liqDraft.yt}
          />
        ) : null}
      </div>
    </DayV3Group>
  );
}

export default memo(DayV3PremiumCurveEditor);
