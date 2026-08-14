"use client";

import { memo, useDeferredValue } from "react";

import { Badge } from "@/components/ui/badge";
import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3Disclosure from "@/components/day-v3/DayV3Disclosure";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3Slider from "@/components/day-v3/DayV3Slider";
import DayV3YieldCurve from "@/components/day-v3/DayV3YieldCurve";
import { pct } from "@/components/day-v3/format";

/**
 * Every remaining term a real market takes. These were pinned at the market
 * default with no way to see or move them, which is fine for "what would I
 * earn" and useless for someone about to deploy. They are inputs, so they sit
 * inside the one input panel on the deploy tab, and their own sub-panels invert
 * to `--card` because a raised well inside a `--foundation` box needs the
 * contrast to still read as a well.
 *
 * They are two numbered groups of that panel, not one undifferentiated tail.
 * The old single band was headed "And the rest of the market's parameters", a
 * title defined by what it is not, and it ran the observation period, the pool
 * band and both premium curves together under it. Timing and venue is one kind
 * of decision and how a premium is priced is another.
 *
 * Every control here is now the shared `DayV3Slider`. There used to be a local
 * `Field` plus `Range` pair drawing a third slider shape, so nine controls in
 * one panel read as three unrelated families.
 */

/**
 * The long explanation, folded away.
 *
 * This was eight lines of prose sitting above the two curve cards at 78ch,
 * spanning the left half and leaving the right half of the panel empty. It is
 * genuinely useful and genuinely not what a reader needs on first look, which is
 * exactly what a disclosure is for. The one-line summary stays visible.
 */
function Aside({
  children,
  summary,
}: {
  children: React.ReactNode;
  summary: string;
}) {
  return (
    <DayV3Disclosure summary={summary} variant="inline">
      <div className="max-w-[78ch] text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        {children}
      </div>
    </DayV3Disclosure>
  );
}

/**
 * Where a target anchor's default came from, said at the anchor rather than in
 * a note somewhere else. Until now the YT slider showed a number with no
 * account of itself: a reader could see 20% and had no way to learn it was the
 * coverage requirement priced at this market's own ratio, or that moving the
 * requirement would move it.
 *
 * The ratio is shown rather than asserted as 1x, because it is not always 1x.
 * `issuer-presets.ts` states the rule as Jr at 1x its requirement and SLP at
 * 0.5x, and twelve of the thirteen markets sit exactly there, but `muga` is a
 * reverse market pricing 6.7% coverage at 1.4%. `dayV3EffectiveShares` scales
 * from each market's OWN default for that reason, so the copy has to read the
 * ratio off the market too instead of restating the headline rule.
 */
function TargetBasis({
  derivedPct,
  overridden,
  requirementLabel,
  requirementPct,
  paid,
}: {
  derivedPct: number;
  overridden: boolean;
  requirementLabel: string;
  requirementPct: number;
  paid: string;
}) {
  const hasBasis = requirementPct > 0 && derivedPct > 0;
  const ratio = hasBasis ? derivedPct / requirementPct : null;
  const num = "font-mono font-semibold tabular-nums text-[var(--secondary)]";

  // One line. The first version of this note ran to three, wedged between two
  // sliders, and restated the requirement and the resulting share when both are
  // already on screen. The ratio is the only thing here a reader cannot see
  // elsewhere, so the ratio is what the line is about.
  return (
    <p className="text-[10px] leading-snug text-[var(--tertiary)]">
      {overridden ? (
        hasBasis ? (
          <>
            Priced by hand. The {requirementLabel} requirement would pay{" "}
            <strong className={num}>{pct(derivedPct / 100)}</strong>.
          </>
        ) : (
          <>
            Priced by hand. This market gives no {requirementLabel} basis to
            fall back to.
          </>
        )
      ) : ratio === null ? (
        <>
          This market ships {requirementLabel} at zero, so the requirement
          prices at nothing. Move this to pay {paid} anyway.
        </>
      ) : (
        <>
          Follows the {requirementLabel} requirement at{" "}
          <strong className={num}>{ratio.toFixed(2)}x</strong>. Move this to
          price {paid} by hand instead.
        </>
      )}
    </p>
  );
}

function DayV3Parameters({
  bandPct,
  ceilingPct,
  coveragePct,
  curveOverridden,
  liqCeilingPct,
  liquidityPct,
  seniorShareOfCapital,
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
  startIndex = 3,
  targetUtilization,
  y0Pct,
  y100Pct,
}: {
  bandPct: number;
  /** The highest any point of the risk curve may go before the engine rejects
   *  the config. Set by whatever the liquidity curve already claims. */
  ceilingPct: number;
  /** The live coverage requirement, which is what the Jr target anchor is
   *  derived from. Shown at the anchor so the number can account for itself. */
  coveragePct: number;
  curveOverridden: boolean;
  /** What the market's own risk curve leaves for the SLP side. */
  liqCeilingPct: number;
  /** The live liquidity requirement, the SLP target anchor's own basis. */
  liquidityPct: number;
  /** Sr as a fraction of all capital standing, for the curve tooltip's third
   *  reading: the same share quoted against everything the market earns. */
  seniorShareOfCapital: number;
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
  /** First numbered group, so an optional source-import step can come before it. */
  startIndex?: number;
  targetUtilization: number;
  y0Pct: number;
  y100Pct: number;
}) {
  // Only the curve is deferred. The sliders keep their own raw values so they
  // stay glued to the pointer.
  const curve = useDeferredValue({
    liqSharePct,
    liqY0Pct,
    liqY100Pct,
    riskSharePct,
    targetUtilization,
    y0Pct,
    y100Pct,
  });
  const shareMax = Math.min(80, Math.round(ceilingPct * 10) / 10);
  const liqMax = Math.min(80, Math.round(liqCeilingPct * 10) / 10);
  return (
    // No card of its own. These move the figures on this page exactly the way
    // the three terms do, so on the deploy tab they are further regions of the
    // one input panel rather than a separate slab four hundred pixels below
    // it. The declared checklist is the thing that is genuinely different, and
    // it stays outside because moving it changes nothing here.
    <>
      <DayV3Group
        deployOnly
        docs="marketStates"
        docsLabel="Market states"
        index={startIndex}
        subtitle="Set loss timing and the modeled exit range"
        title="Timing and the venue"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <DayV3Slider
            display={`${observationDays} days`}
            docs="observation"
            hint="The historical backtest uses this window: recovery inside it erases the drawdown; expiry realizes the loss against Jr."
            label="Observation period"
            max={194}
            maxLabel="194"
            min={0}
            minLabel="0"
            onChange={onObservationDays}
            step={1}
            value={observationDays}
          />
          <DayV3Slider
            display={pct(bandPct / 100)}
            docs="slpTranche"
            hint="A simulation control only. Deployment derives premium and depth, then separately resolves reinvestment slippage and genesis liquidity."
            label="Maximum discount"
            max={5}
            maxLabel="5%"
            min={0.5}
            minLabel="0.5%"
            onChange={onBandPct}
            step={0.25}
            value={Math.min(5, Math.max(0.5, bandPct))}
          />
        </div>
      </DayV3Group>

      <DayV3Group
        deployOnly
        docs="yieldSplit"
        docsLabel="Yield split"
        index={startIndex + 1}
        subtitle="Set the Jr and SLP shares of Sr yield"
        title="How the premiums are priced"
      >
        {/* Two curves, not one. The accountant runs a yield-share model on
          each side, keyed on a different utilization, with its own target.
          Showing a single curve labelled "the YDM" hid the liquidity one and
          left its shape unsettable. */}
        <div className="flex flex-col gap-3">
          {/* One visible line, the rest behind a disclosure. The eight-line
            version of this stood between the reader and the controls it was
            describing, half-width, with the panel's right half left empty. */}
          <Aside
            summary={`Each side is priced by its own curve, read at the ${pct(targetUtilization)} target`}
          >
            Each curve converts utilization into a share of Sr yield. The rates
            on this page use YT at {pct(targetUtilization)} utilization; Y0 and
            Y100 set the behavior away from that target, and the curve&apos;s
            highest point becomes its cap.
          </Aside>

          {curveOverridden ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">
                {riskShareOverridden || liqShareOverridden
                  ? `Priced by hand. Following the requirements would pay Jr ${pct(derivedRiskSharePct / 100)} and SLP ${pct(derivedLiqSharePct / 100)} at target.`
                  : "The curve shape has been changed from this market's own."}
              </span>
              <DayV3Button
                className="text-[11.5px]"
                onClick={onResetCurve}
                size="inline"
                variant="link"
              >
                Reset to this market&apos;s own
              </DayV3Button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(
              [
                {
                  caption:
                    "Coverage utilization rises when Sr grows or Jr is drawn down.",
                  ceiling: shareMax,
                  contractCeiling: ceilingPct,
                  docs: "coverage",
                  onYt: onRiskSharePct,
                  shaping: [
                    ["Y0", "at 0% used", y0Pct, onY0Pct, 0, riskSharePct],
                    [
                      "Y100",
                      "at 100% used",
                      y100Pct,
                      onY100Pct,
                      riskSharePct,
                      shareMax,
                    ],
                  ],
                  yt: riskSharePct,
                  curveY0: curve.y0Pct,
                  curveY100: curve.y100Pct,
                  curveYT: curve.riskSharePct,
                  derivedPct: derivedRiskSharePct,
                  overridden: riskShareOverridden,
                  paid: "Jr",
                  requirementLabel: "coverage",
                  requirementPct: coveragePct,
                  title: "Coverage model",
                },
                {
                  caption:
                    "Liquidity utilization rises when Sr grows or the pool is drawn down.",
                  ceiling: liqMax,
                  contractCeiling: liqCeilingPct,
                  docs: "slpTranche",
                  onYt: onLiqSharePct,
                  shaping: [
                    ["Y0", "at 0% used", liqY0Pct, onLiqY0Pct, 0, liqSharePct],
                    [
                      "Y100",
                      "at 100% used",
                      liqY100Pct,
                      onLiqY100Pct,
                      liqSharePct,
                      liqMax,
                    ],
                  ],
                  yt: liqSharePct,
                  curveY0: curve.liqY0Pct,
                  curveY100: curve.liqY100Pct,
                  curveYT: curve.liqSharePct,
                  derivedPct: derivedLiqSharePct,
                  overridden: liqShareOverridden,
                  paid: "SLP",
                  requirementLabel: "liquidity",
                  requirementPct: liquidityPct,
                  title: "Liquidity model",
                },
              ] as const
            ).map((model) => (
              <div
                className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5"
                key={model.title}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-[12px] font-semibold">{model.title}</h4>
                  <span className="flex items-baseline gap-2">
                    <Badge tone="neutral">static curve</Badge>
                    <DayV3DocsLink
                      label={`${model.paid} premium`}
                      topic={model.docs}
                    />
                  </span>
                </div>
                <p className="text-[10.5px] leading-snug text-[var(--tertiary)]">
                  {model.caption}
                </p>
                {/* YT first, then the two shaping anchors. It is the one that
                  sets every rate on the page and the only one derived from
                  another control, so it leads and the other two follow it
                  rather than sandwiching it. */}
                <div className="flex flex-col gap-2">
                  <DayV3Slider
                    display={pct(model.yt / 100)}
                    hint={`The share ${model.paid} is paid at the ${pct(targetUtilization)} target, which is where every figure on this page is read.`}
                    label="YT"
                    max={
                      model.requirementPct > 0
                        ? Math.min(model.ceiling, model.curveY100)
                        : 0
                    }
                    maxLabel={`${model.requirementPct > 0 ? Math.min(model.ceiling, model.curveY100) : 0}%`}
                    min={
                      model.requirementPct > 0
                        ? Math.max(0.5, model.curveY0)
                        : 0
                    }
                    minLabel={`${model.requirementPct > 0 ? Math.max(0.5, model.curveY0) : 0}%`}
                    note="sets the rate"
                    onChange={model.onYt}
                    step={0.5}
                    value={Math.min(model.yt, model.ceiling)}
                  />
                  <TargetBasis
                    derivedPct={model.derivedPct}
                    overridden={model.overridden}
                    paid={model.paid}
                    requirementLabel={model.requirementLabel}
                    requirementPct={model.requirementPct}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {model.shaping.map(
                      ([anchor, note, value, onChange, min, max]) => (
                        <DayV3Slider
                          display={pct(value / 100)}
                          key={anchor}
                          label={anchor}
                          max={model.requirementPct > 0 ? max : 0}
                          maxLabel={`${model.requirementPct > 0 ? max : 0}%`}
                          min={model.requirementPct > 0 ? min : 0}
                          minLabel={`${model.requirementPct > 0 ? min : 0}%`}
                          note={note}
                          onChange={onChange}
                          size="sm"
                          step={0.5}
                          value={Math.min(value, model.ceiling)}
                        />
                      ),
                    )}
                  </div>
                  {/* The contract ceiling and the slider's stop are two different
                    numbers and must not be conflated. `ceiling` is
                    `min(80, contractCeiling)`, so on this market's coverage
                    curve the contract allows 85% while the slider stops at 80.
                    An earlier draft of this line quoted the slider's stop and
                    attributed it to the contract, which is a claim about the
                    chain that the chain does not make. */}
                  <p className="text-[10px] leading-snug text-[var(--tertiary)]">
                    The curve&apos;s peak is its cap. Jr and SLP caps must total
                    100% or less, leaving this side a{" "}
                    <strong className="font-mono font-semibold tabular-nums text-[var(--secondary)]">
                      {pct(model.contractCeiling / 100)}
                    </strong>{" "}
                    ceiling.
                    {model.ceiling < model.contractCeiling - 0.05 ? (
                      <>
                        {" "}
                        These sliders stop at{" "}
                        <strong className="font-mono font-semibold tabular-nums text-[var(--secondary)]">
                          {pct(model.ceiling / 100)}
                        </strong>
                        , which is this page&apos;s own limit rather than the
                        contract&apos;s.
                      </>
                    ) : null}
                  </p>
                </div>
                <DayV3YieldCurve
                  paidTo={model.paid}
                  seniorShareOfCapital={seniorShareOfCapital}
                  sourceApy={sourceApy}
                  target={curve.targetUtilization}
                  y0={model.curveY0 / 100}
                  y100={model.curveY100 / 100}
                  yTarget={model.curveYT / 100}
                />
              </div>
            ))}
          </div>
        </div>
      </DayV3Group>
    </>
  );
}

export default memo(DayV3Parameters);
