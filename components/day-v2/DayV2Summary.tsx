"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2Chart, { type DayV2Point } from "@/components/day-v2/DayV2Chart";
import DayV2Comparison, {
  DAY_V2_TONE_DOT,
  type DayV2PositionBreakdown,
} from "@/components/day-v2/DayV2Comparison";
import DayV2Backtest from "@/components/day-v2/DayV2Backtest";
import DayV2Deploy from "@/components/day-v2/DayV2Deploy";
import DayV2Deployment from "@/components/day-v2/DayV2Deployment";
import DayV2Parameters from "@/components/day-v2/DayV2Parameters";
import DayV2Presets from "@/components/day-v2/DayV2Presets";
import DayV2ExitCost from "@/components/day-v2/DayV2ExitCost";
import DayV2LossWaterfall from "@/components/day-v2/DayV2LossWaterfall";
import DayV2Source from "@/components/day-v2/DayV2Source";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dayV2EffectiveShares } from "@/components/day-v2/terms";
import { buildDayV2Query, type DayV2UrlState } from "@/components/day-v2/url-state";
import {
  matchDayIssuerPreset,
  type DayIssuerPreset,
} from "@/lib/day-simulator-template/issuer-presets";
import { buildDayExplainerMetrics } from "@/lib/day-simulator-template/explainer";
import type { DayMarket } from "@/lib/day-simulator-template/market";
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
  runDayTargetScenario,
  type DayEditableTerms,
} from "@/lib/day-simulator-template/runtime";

// The accountant is not reimplemented here. Every number on this page comes from
// `runDayTargetScenario`, the same target-scenario entry point the interactive
// simulator uses, so v2 and /day-sim can never disagree.
/** The two jobs this page does. Simulate answers what a position pays and
 *  what it stands to lose. Deploy is for someone who has to set every
 *  parameter a real market takes and hand it to the deploy flow. */
type DayV2Mode = "simulate" | "deploy";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const DAY_TARGET_UTILIZATION = 0.9;

function Slider({
  label,
  display,
  max,
  min,
  onChange,
  note,
  step,
  value,
}: {
  label: string;
  display: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  note: string;
  step: number;
  value: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
          {label}
        </span>
        <span className="font-mono text-[15px] font-bold tabular-nums">{display}</span>
      </span>
      <input
        className="day-v2-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="text-[10px] leading-snug text-[var(--tertiary)]">{note}</span>
    </label>
  );
}

export default function DayV2Summary({
  initialMarket,
  initialState,
  markets,
}: {
  initialMarket: DayMarket;
  initialState?: DayV2UrlState;
  markets: readonly DayMarket[];
}) {
  // Anything the link did not carry falls back to the market's own default, so
  // a partial or hand-edited link still describes a real market.
  const linked = initialState;
  // How much of the mechanism to show. Simple answers "what would I earn, and
  // what would I lose", and stops there. Deploy is the other job: someone who
  // has decided and now has to set every parameter a real market takes. The two
  // share one model, so the figures never disagree between them.
  const [mode, setMode] = useState<DayV2Mode>(linked?.mode ?? "simulate");
  const deploying = mode === "deploy";
  const [marketId, setMarketId] = useState(initialMarket.id);
  // An imported source outranks the registry selection while it is loaded, so
  // every section below runs on the reader's own history.
  const [draftMarket, setDraftMarket] = useState<DayMarket | null>(null);
  const selectedMarket = markets.find((candidate) => candidate.id === marketId) ?? initialMarket;
  const market = draftMarket ?? selectedMarket;
  const defaults = market.defaults;
  // A few markets report in their own asset rather than dollars. Declared on
  // the market, so it follows an imported draft too.
  const returnUnit = market.customization.backtestDisplay?.returnUnit ?? "USD";
  const [coveragePct, setCoveragePct] = useState(linked?.coveragePct ?? defaults.coverage * 100);
  const [liquidityPct, setLiquidityPct] = useState(linked?.liquidityPct ?? defaults.minLiquidity * 100);
  const [sourceApyPct, setSourceApyPct] = useState(linked?.sourceApyPct ?? defaults.sourceApy * 100);
  // The rest of the market's terms. They are real inputs to the engine and were
  // previously pinned at the market default with no way to see or move them.
  const [observationDays, setObservationDays] = useState(linked?.observationDays ?? defaults.observationDays);
  const [bandPct, setBandPct] = useState(linked?.bandPct ?? defaults.eclpBandWidth * 100);
  const [maintainCoverage, setMaintainCoverage] = useState(linked?.maintainCoverage ?? defaults.maintainCoverage);
  // Null means "follow the requirement", which is the rule in `terms.ts`. A
  // number means the deployer has priced the tranche themselves.
  const [riskShareOverride, setRiskShareOverride] = useState<number | null>(linked?.riskSharePct ?? null);
  const [liqShareOverride, setLiqShareOverride] = useState<number | null>(linked?.liqSharePct ?? null);
  // The other two anchors of the yield-share curve. Null means "as the market
  // ships it", which is what every registry market wants until someone is
  // actually designing a curve.
  const [y0Override, setY0Override] = useState<number | null>(null);
  const [y100Override, setY100Override] = useState<number | null>(null);

  // Switching market adopts that market's own terms, so the sliders describe the
  // market on screen rather than carrying the previous one's numbers over.
  const adoptTerms = (next: DayMarket) => {
    setCoveragePct(next.defaults.coverage * 100);
    setLiquidityPct(next.defaults.minLiquidity * 100);
    setSourceApyPct(next.defaults.sourceApy * 100);
    setObservationDays(next.defaults.observationDays);
    setBandPct(next.defaults.eclpBandWidth * 100);
    setMaintainCoverage(next.defaults.maintainCoverage);
    setRiskShareOverride(null);
    setLiqShareOverride(null);
    setY0Override(null);
    setY100Override(null);
  };

  // An issuer preset is a complete design, not two slider positions, so it sets
  // the band and the observation period too. Applying only the parts /v2 used
  // to expose would put a preset's name on a market that is not that preset.
  const applyPreset = (preset: DayIssuerPreset) => {
    const values = preset.values;
    setCoveragePct(values.coveragePct);
    setLiquidityPct(values.minLiquidityPct);
    setObservationDays(values.observationDays);
    setBandPct(values.eclpBandWidthPct);
    setMaintainCoverage(values.maintainCoverage);
    // The presets' own shares land exactly on the requirement-derived rule for
    // every market, so following the rule reproduces them rather than pinning
    // numbers that would then be stale if a slider moved.
    setRiskShareOverride(null);
    setLiqShareOverride(null);
    setY0Override(null);
    setY100Override(null);
  };

  const selectMarket = (nextId: string) => {
    const next = markets.find((candidate) => candidate.id === nextId);
    if (!next) return;
    // Choosing a registry market is a decision to stop looking at the import.
    setDraftMarket(null);
    setMarketId(nextId);
    adoptTerms(next);
  };

  // Keeps the controls responsive while the engine re-runs, the same pattern the
  // main simulator uses after measuring input lag.
  const inputs = useDeferredValue({
    coveragePct, liquidityPct, sourceApyPct,
    observationDays, bandPct, maintainCoverage, riskShareOverride, liqShareOverride,
    y0Override, y100Override,
  });

  // One place decides what the engine is actually run with, so the panel that
  // displays the curve and the run that produces the numbers cannot disagree.
  const resolved = useMemo(() => {
    const coverage = inputs.coveragePct / 100;
    const minLiquidity = inputs.liquidityPct / 100;
    const derived = dayV2EffectiveShares(defaults, coverage, minLiquidity);
    const riskYieldShare = inputs.riskShareOverride === null
      ? derived.riskYieldShare
      : inputs.riskShareOverride / 100;
    let liquidityYieldShare = inputs.liqShareOverride === null
      ? derived.liquidityYieldShare
      : inputs.liqShareOverride / 100;
    // The engine derives each contract cap as the highest point of its curve and
    // throws INVALID_YIELD_SHARE_CONFIG when the two caps exceed 100% together,
    // which would take the page down on a keystroke. Holding the whole risk
    // curve under what the liquidity curve leaves makes that unreachable rather
    // than merely unlikely. On jbbb this ceiling is 85%, on muga 64.3%.
    // The backtest runner builds its own config from the market's own y0 and
    // y100 rather than the curve set here, so the liquidity share has to stay
    // under what *that* curve leaves or the history throws while the projection
    // is fine. Found by slamming every slider to its maximum, which is the only
    // corner where it bites.
    const marketRiskCurveMax = Math.max(defaults.riskYDM.y0, defaults.riskYDM.y100);
    const liquidityCeiling = Math.max(0, 1 - marketRiskCurveMax);
    liquidityYieldShare = Math.min(liquidityYieldShare, liquidityCeiling);
    const maxLiquidityCurve = Math.max(
      defaults.liqYDM.y0,
      liquidityYieldShare,
      defaults.liqYDM.y100,
    );
    const riskCeiling = Math.max(0, 1 - maxLiquidityCurve);
    const cap = (value: number) => Math.min(value, riskCeiling);
    // The static curve runs through (0% -> y0, 90% -> yTarget, 100% -> y100).
    // Left to the market, y0 is clamped so the curve never slopes down into its
    // own target: the deployment panel already displayed it that way while the
    // engine was handed the raw value, so the two disagreed below about 10%
    // coverage. Set deliberately, the reader's number is respected.
    const y0 = cap(inputs.y0Override === null
      ? Math.min(defaults.riskYDM.y0, riskYieldShare)
      : inputs.y0Override / 100);
    const y100 = cap(inputs.y100Override === null
      ? Math.max(defaults.riskYDM.y100, riskYieldShare)
      : inputs.y100Override / 100);
    return {
      coverage,
      minLiquidity,
      derived,
      riskYieldShare: cap(riskYieldShare),
      liquidityYieldShare,
      y0,
      y100,
      riskCeiling,
      liquidityCeiling,
    };
  }, [defaults, inputs]);

  const model = useMemo(() => {
    const { coverage, minLiquidity } = resolved;
    const effective = {
      ...defaults,
      coverage,
      minLiquidity,
      sourceApy: inputs.sourceApyPct / 100,
      observationDays: inputs.observationDays,
      eclpBandWidth: inputs.bandPct / 100,
      maintainCoverage: inputs.maintainCoverage,
      riskYDM: {
        ...defaults.riskYDM,
        y0: resolved.y0,
        yTarget: resolved.riskYieldShare,
        y100: resolved.y100,
      },
      liqYDM: { ...defaults.liqYDM, yTarget: resolved.liquidityYieldShare },
    };
    // The same terms `runDayTargetScenario` assembles for itself. Building them
    // once here means the rates and the loss waterfall are two readings of one
    // market rather than two markets that happen to share sliders.
    const terms: DayEditableTerms = {
      coverage,
      minLiquidity,
      eclpBandWidth: effective.eclpBandWidth,
      observationDays: effective.observationDays,
      riskYieldShare: effective.riskYDM.yTarget,
      liquidityYieldShare: effective.liqYDM.yTarget,
    };
    // Where each position's yield comes from, measured by switching each
    // premium off and re-running. Differences between engine runs, so the
    // components sum to the engine's own totals rather than approximating them.
    const noPremiums = runDayTargetScenario(effective, {
      riskYieldShare: 0,
      liquidityYieldShare: 0,
    });
    const riskOnly = runDayTargetScenario(effective, {
      riskYieldShare: terms.riskYieldShare,
      liquidityYieldShare: 0,
    });
    // Held rather than rebuilt, so the pool economics quoted to the reader are
    // the ones this run used and cannot drift from them.
    const cfg = buildDayMarketConfig(effective, terms);
    return {
      scenario: runDayTargetScenario(effective),
      noPremiums,
      riskOnly,
      pool: {
        stableYield: cfg.stableYield,
        swapFeeBps: cfg.swapFeeBps,
        turnoverPerYear: cfg.poolTurnoverPerYear,
      },
      explainer: buildDayExplainerMetrics(cfg, buildDayInitialBalances(effective, terms)),
    };
  }, [defaults, inputs, resolved]);
  const scenario = model.scenario;

  const chartData = useMemo<DayV2Point[]>(() => {
    const grow = (apy: number, months: number) => 100 * (1 + apy) ** (months / 12);
    return Array.from({ length: 13 }, (_, month) => ({
      month,
      senior: grow(scenario.seniorApy, month),
      junior: grow(scenario.juniorApy, month),
      liquidity: grow(scenario.liquidityApy, month),
    }));
  }, [scenario]);

  const query = buildDayV2Query({
    market: marketId,
    mode,
    coveragePct,
    liquidityPct,
    sourceApyPct,
    observationDays,
    bandPct,
    maintainCoverage,
    riskSharePct: riskShareOverride,
    liqSharePct: liqShareOverride,
  });
  // replaceState rather than a router push: this fires on every slider tick, and
  // a history entry per pixel of drag would make the back button useless.
  // replaceState rather than a router push: this fires on every slider tick, and
  // a history entry per pixel of drag would make the back button useless. It is
  // also why the link is read on the server instead of in an effect here.
  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [query]);

  // Which named design the current terms are, if any. Tracked by comparison
  // rather than by remembering what was last clicked, so moving any slider
  // deselects the preset instead of leaving a stale label on a changed market.
  const activePresetId = matchDayIssuerPreset({
    coveragePct: inputs.coveragePct,
    minLiquidityPct: inputs.liquidityPct,
    eclpBandWidthPct: inputs.bandPct,
    riskSharePct: resolved.riskYieldShare * 100,
    liqSharePct: resolved.liquidityYieldShare * 100,
    observationDays: inputs.observationDays,
    maintainCoverage: inputs.maintainCoverage,
  });

  const liveDerived = dayV2EffectiveShares(defaults, coveragePct / 100, liquidityPct / 100);

  const source = inputs.sourceApyPct / 100;
  const breakdown = (key: "seniorApy" | "juniorApy" | "liquidityApy") => ({
    base: model.noPremiums[key],
    riskDelta: model.riskOnly[key] - model.noPremiums[key],
    liqDelta: model.scenario[key] - model.riskOnly[key],
  });
  const positions = [
    {
      tone: "senior" as const,
      name: "Sr",
      short: "Sr",
      apy: scenario.seniorApy,
      holds: "The strategy asset, protected by Jr",
      role: "Holds the source, pays for cover and an exit",
      holdsSource: true,
      ...breakdown("seniorApy"),
      risk: coveragePct > 0
        ? "Loses value only after Jr is exhausted"
        : "Unprotected. No Jr capital stands in front of it",
      funded: true,
    },
    {
      tone: "junior" as const,
      name: "Jr",
      short: "Jr",
      apy: scenario.juniorApy,
      holds: "First-loss coverage for Sr",
      role: "Takes the first losses, paid a premium for it",
      holdsSource: true,
      ...breakdown("juniorApy"),
      risk: "Absorbs the first losses, in full",
      funded: coveragePct > 0,
    },
    {
      tone: "liquidity" as const,
      name: "SLP",
      short: "SLP",
      apy: scenario.liquidityApy,
      holds: "The pool Sr exits into",
      role: "Supplies the exit pool, paid a premium for it",
      holdsSource: false,
      ...breakdown("liquidityApy"),
      risk: "Holds Sr shares when Sr sells",
      funded: liquidityPct > 0,
    },
  ];

  return (
    // Capped rather than full-bleed. Past about 1400px the cards stop gaining
    // anything and the prose lines just get harder to track back to.
    <div className="royco-v2 mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
            Yield source
          </span>
          <select
            aria-label="Yield source"
            className="w-full max-w-[420px] rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-[13px] font-medium"
            onChange={(event) => selectMarket(event.target.value)}
            value={draftMarket ? "__draft" : marketId}
          >
            {draftMarket ? (
              <option value="__draft">{draftMarket.identity.marketName} (imported)</option>
            ) : null}
            {markets.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.identity.marketName}
              </option>
            ))}
          </select>
        </label>
        <div
          aria-label="What you are here to do"
          className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] p-0.5"
          role="group"
        >
          {([["Simulate", "simulate"], ["Deploy", "deploy"]] as const).map(([label, value]) => (
            <button
              aria-pressed={mode === value}
              className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold ${
                mode === value
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--secondary)]"
              }`}
              key={label}
              onClick={() => setMode(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        </div>
        <h1 className="max-w-[26ch] text-[clamp(26px,2.6vw,36px)] font-semibold leading-[1.06] tracking-[-0.02em]">
          One yield source, split into three risks.
        </h1>
        <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-[var(--secondary)]">
          This market earns{" "}
          <strong className="font-semibold text-[var(--foreground)]">{pct(source)}</strong> a year
          before it is split.{" "}
          {deploying
            ? "Set every parameter a real market takes, then hand the design to the deploy flow."
            : "Move the terms below and every figure updates."}
        </p>
      </header>

      <DayV2Source
        activeDraft={draftMarket}
        onClear={() => {
          setDraftMarket(null);
          adoptTerms(selectedMarket);
        }}
        onImport={(next) => {
          setDraftMarket(next);
          adoptTerms(next);
        }}
      />

      {/* Controls first, because this is a simulator: the reader should meet the
          thing they can change before the numbers it changes. And they stay:
          stuck to the top, coverage can be moved while reading the backtest or
          the waterfall, which is the whole point of the page. Only from `sm`,
          where the three sliders are one row rather than a stack tall enough to
          swallow a phone screen. */}
      <section
        aria-labelledby="day-v2-terms-heading"
        className="z-20 grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4 shadow-[0_1px_2px_rgba(23,25,31,0.04)] sm:sticky sm:top-3 sm:grid-cols-3 sm:shadow-[0_6px_20px_-8px_rgba(23,25,31,0.28)]"
      >
        <h2 className="sr-only" id="day-v2-terms-heading">
          Terms
        </h2>
        <Slider
          display={pct(sourceApyPct / 100)}
          label="Source yield"
          max={30}
          min={0}
          note="Before the split"
          onChange={setSourceApyPct}
          step={0.1}
          value={sourceApyPct}
        />
        <Slider
          display={pct(coveragePct / 100)}
          label="Coverage"
          max={25}
          min={0}
          note="Jr per unit of Sr"
          onChange={setCoveragePct}
          step={0.5}
          value={coveragePct}
        />
        <Slider
          display={pct(liquidityPct / 100)}
          label="Liquidity"
          max={25}
          min={0}
          note="Pool depth for Sr"
          onChange={setLiquidityPct}
          step={0.5}
          value={liquidityPct}
        />
      </section>

      {deploying ? (
        <>
          {/* First, not last. A deployer is here to set these, and they were
              rendering roughly three thousand pixels below the fold. */}
          {/* Slider positions come from raw state, never from the deferred
              model, or the input fights the pointer: the value snaps back to a
              frame-old number while you are still dragging it. */}
          <DayV2Parameters
            bandPct={bandPct}
            ceilingPct={resolved.riskCeiling * 100}
            liqCeilingPct={resolved.liquidityCeiling * 100}
            derivedLiqSharePct={resolved.derived.liquidityYieldShare * 100}
            derivedRiskSharePct={resolved.derived.riskYieldShare * 100}
            liqSharePct={liqShareOverride ?? liveDerived.liquidityYieldShare * 100}
            liqShareOverridden={liqShareOverride !== null}
            observationDays={observationDays}
            onBandPct={setBandPct}
            onLiqSharePct={setLiqShareOverride}
            onObservationDays={setObservationDays}
            onResetCurve={() => {
              setRiskShareOverride(null);
              setLiqShareOverride(null);
              setY0Override(null);
              setY100Override(null);
            }}
            onRiskSharePct={setRiskShareOverride}
            onY0Pct={setY0Override}
            onY100Pct={setY100Override}
            riskSharePct={riskShareOverride ?? liveDerived.riskYieldShare * 100}
            riskShareOverridden={riskShareOverride !== null}
            targetUtilization={DAY_TARGET_UTILIZATION}
            y0Pct={y0Override ?? resolved.y0 * 100}
            y100Pct={y100Override ?? resolved.y100 * 100}
            curveOverridden={
              riskShareOverride !== null || liqShareOverride !== null
              || y0Override !== null || y100Override !== null
            }
          />

        </>
      ) : null}

      <DayV2Presets activeId={activePresetId} onSelect={applyPreset} />

      {/* Three peers, scanned across: identical slots, so the eye compares the
          rate first and reads detail only if it wants to. */}
      <section
        aria-labelledby="day-v2-positions-heading"
        className="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        <h2 className="sr-only" id="day-v2-positions-heading">
          Positions
        </h2>
        {positions.map((position) => (
          <Card
            className="overflow-hidden px-0"
            key={position.short}
            style={position.funded ? undefined : { borderStyle: "dashed" }}
            weight={position.funded ? "primary" : "default"}
          >
            {/* The tone as a rule across the top rather than a dot beside the
                name. It is the only chroma above the fold and it binds the
                three cards into one object the eye reads as a set. */}
            <div
              aria-hidden="true"
              style={{
                background: position.funded
                  ? DAY_V2_TONE_DOT[position.tone]
                  : `color-mix(in srgb, ${DAY_V2_TONE_DOT[position.tone]} 30%, transparent)`,
                height: 3,
              }}
            />
            <CardHeader className="px-6">
              <div className="flex items-center justify-between gap-2">
                {/* An eyebrow, not a title. The rate is the title here. */}
                <CardTitle
                  className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]"
                  level={3}
                >
                  {position.name}
                </CardTitle>
                {position.funded ? null : <Badge tone="neutral">not funded</Badge>}
              </div>
              <CardDescription>{position.holds}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-6">
              <div className="flex items-baseline gap-1.5">
                {/* Never faded. An unfunded position sets the rate in tertiary
                    rather than dropping the whole card to 55% opacity, which
                    took a 44px number to about 2.5:1 against the page. */}
                <span
                  className="font-mono text-[clamp(34px,3.2vw,44px)] font-bold leading-[0.92] tracking-[-0.03em] tabular-nums"
                  style={position.funded ? undefined : { color: "var(--tertiary)" }}
                >
                  {position.funded ? pct(position.apy) : "0.0%"}
                </span>
                <span className="text-[11px] text-[var(--tertiary)]">a year</span>
              </div>
              <p className="border-t border-[var(--border-subtle)] pt-2 text-[12px] leading-relaxed text-[var(--secondary)]">
                {position.risk}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <h2
        className="-mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
        id="day-v2-risk-heading"
      >
        What can go wrong
      </h2>
      {/* Losing money and getting out are the two ways a position goes wrong,
          and the projection above deliberately contains neither. They read
          better next to each other than either does alone. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <DayV2LossWaterfall metrics={model.explainer.coverage} unit={returnUnit} />
        <DayV2ExitCost metrics={model.explainer.liquidity} />
      </div>

      {/* Everything above is a projection at the stated terms. This is the one
          section where the price path actually happened. It belongs to the
          simulate job: it answers "what would this have done", not "what do I
          set". */}
      <h2
        className="-mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
        id="day-v2-pays-heading"
      >
        Where the rates come from
      </h2>
      {/* What the terms pay, from two angles: the shape over a year, and the
          split that produces it. Neither needs the full width, and read side by
          side the reader can check the curve against the table it comes from. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card weight="quiet">
          <CardHeader>
            <CardTitle>Growth over a year</CardTitle>
            <CardDescription>
              Each line compounds that position&apos;s rate above. It shows what the
              terms pay, not what a bad year does to them: there is no drawdown in
              this projection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayV2Chart data={chartData} />
          </CardContent>
        </Card>

        <DayV2Comparison
          poolEconomics={model.pool}
          positions={positions as DayV2PositionBreakdown[]}
          source={source}
          unit={returnUnit}
        />
      </div>

      <h2
        className="-mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
        id="day-v2-history-heading"
      >
        What actually happened
      </h2>
      {/* Shown in both flows. A deployer needs it more than anyone: the coverage
          restoration toggle lives in the parameters below, and its single most
          important consequence, that outside capital funded Sr's result, is
          disclosed here. Splitting a control from its consequence would hide
          the thing the control is for. */}
      <DayV2Backtest
        bandPct={inputs.bandPct}
        coveragePct={inputs.coveragePct}
        liqSharePct={resolved.liquidityYieldShare * 100}
        liquidityPct={inputs.liquidityPct}
        maintainCoverage={maintainCoverage}
        onMaintainCoverage={setMaintainCoverage}
        market={market}
        observationDays={inputs.observationDays}
        riskSharePct={resolved.riskYieldShare * 100}
        sourceApyPct={inputs.sourceApyPct}
      />

      {deploying ? (
        <>
          {/* Everything a deployer still has to set. Parameters that move the
              figures come first, then the checklist that does not. */}
          <DayV2Deployment
            defaults={defaults}
            market={{
              id: market.id,
              name: market.identity.marketName,
              asset: market.identity.displayAssetName,
              variant: "v2",
            }}
            modeled={{
              seniorApy: scenario.seniorApy,
              juniorApy: scenario.juniorApy,
              liquidityApy: scenario.liquidityApy,
              coverageLossLimit: model.explainer.coverage.coverageLossLimit,
              referenceSellShareOfSenior: model.explainer.liquidity.referenceSellShareOfSenior,
              boundarySellShareOfSenior: model.explainer.liquidity.boundarySellShareOfSenior,
            }}
            terms={{
              coveragePct: inputs.coveragePct,
              minLiquidityPct: inputs.liquidityPct,
              eclpBandWidthPct: inputs.bandPct,
              riskSharePct: resolved.riskYieldShare * 100,
              liqSharePct: resolved.liquidityYieldShare * 100,
              observationDays: inputs.observationDays,
              sourceApyPct: inputs.sourceApyPct,
              // The export was sending market defaults for these three rather
              // than what the page ran: toggling coverage restoration produced
              // a file saying the opposite, and the yield-share cap ignored the
              // ceiling clamp the engine actually applied.
              maintainCoverage: inputs.maintainCoverage,
              y100SharePct: resolved.y100 * 100,
              presetId: activePresetId,
            }}
          />
        </>
      ) : (
        <button
          className="self-start rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3.5 py-2 text-[12px] font-semibold"
          onClick={() => setMode("deploy")}
          type="button"
        >
          Set every parameter and get this ready to deploy
        </button>
      )}

      {/* Shown in both flows. Someone who only simulated has still designed a
          market, and the ask is the same one. */}
      <DayV2Deploy
        coverage={inputs.coveragePct / 100}
        query={query}
        liquidity={inputs.liquidityPct / 100}
        seniorApy={scenario.seniorApy}
        sourceApy={source}
      />

      <p className="max-w-[70ch] text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        Educational simulator only. No securities are offered through this page.
        Figures are mechanism simulations at the target utilization, not
        historical backtests, forecasts, or announced terms.
      </p>
    </div>
  );
}
