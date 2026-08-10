"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2Chart, { type DayV2Point } from "@/components/day-v2/DayV2Chart";
import DayV2Comparison, { DayV2ToneDot, type DayV2PositionBreakdown } from "@/components/day-v2/DayV2Comparison";
import DayV2Backtest from "@/components/day-v2/DayV2Backtest";
import DayV2Deploy from "@/components/day-v2/DayV2Deploy";
import DayV2Deployment from "@/components/day-v2/DayV2Deployment";
import DayV2Parameters from "@/components/day-v2/DayV2Parameters";
import DayV2Presets from "@/components/day-v2/DayV2Presets";
import DayV2ExitCost from "@/components/day-v2/DayV2ExitCost";
import DayV2LossWaterfall from "@/components/day-v2/DayV2LossWaterfall";
import DayV2Source from "@/components/day-v2/DayV2Source";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { stake100 } from "@/components/day-v2/format";
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
    const liquidityYieldShare = inputs.liqShareOverride === null
      ? derived.liquidityYieldShare
      : inputs.liqShareOverride / 100;
    // The static curve runs through (0% -> y0, 90% -> yTarget, 100% -> y100).
    // yTarget is the share being set here, and once it drops below the market's
    // y0 the curve slopes down into the target, which is not a thing anyone is
    // choosing. The deployment panel already displayed y0 clamped this way while
    // the engine was handed the raw value, so the two disagreed below about 10%
    // coverage. Clamping here makes the modeled curve the displayed one.
    const y0 = Math.min(defaults.riskYDM.y0, riskYieldShare);
    const y100 = Math.max(defaults.riskYDM.y100, riskYieldShare);
    return { coverage, minLiquidity, derived, riskYieldShare, liquidityYieldShare, y0, y100 };
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
    return {
      scenario: runDayTargetScenario(effective),
      noPremiums,
      riskOnly,
      explainer: buildDayExplainerMetrics(
        buildDayMarketConfig(effective, terms),
        buildDayInitialBalances(effective, terms),
      ),
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
    <div className="royco-v2 mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-5 py-8 sm:px-8">
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
        <h1 className="max-w-[24ch] text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.05] tracking-[-0.02em]">
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
            key={position.short}
            className={position.funded ? undefined : "opacity-55"}
            style={position.funded ? undefined : { borderStyle: "dashed" }}
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2" level={3}>
                  <DayV2ToneDot tone={position.tone} />
                  {position.name}
                </CardTitle>
                {position.funded ? null : <Badge tone="neutral">not funded</Badge>}
              </div>
              <CardDescription>{position.holds}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                  {position.funded ? pct(position.apy) : "0.0%"}
                </span>
                <span className="text-[11px] text-[var(--tertiary)]">a year</span>
              </div>
              <p className="border-t border-[var(--border-subtle)] pt-2 text-[11.5px] leading-relaxed text-[var(--secondary)]">
                {position.risk}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* What the terms pay, from two angles: the shape over a year, and the
          split that produces it. Neither needs the full width, and read side by
          side the reader can check the curve against the table it comes from. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{stake100(returnUnit)} in each position, over a year</CardTitle>
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
          positions={positions as DayV2PositionBreakdown[]}
          source={source}
          unit={returnUnit}
        />
      </div>

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
        maintainCoverage={inputs.maintainCoverage}
        market={market}
        observationDays={inputs.observationDays}
        riskSharePct={resolved.riskYieldShare * 100}
        sourceApyPct={inputs.sourceApyPct}
      />

      {deploying ? (
        <>
          {/* Everything a deployer still has to set. Parameters that move the
              figures come first, then the checklist that does not. */}
          <DayV2Parameters
            bandPct={bandPct}
            derivedLiqSharePct={resolved.derived.liquidityYieldShare * 100}
            derivedRiskSharePct={resolved.derived.riskYieldShare * 100}
            liqSharePct={resolved.liquidityYieldShare * 100}
            liqShareOverridden={liqShareOverride !== null}
            maintainCoverage={maintainCoverage}
            observationDays={observationDays}
            onBandPct={setBandPct}
            onLiqSharePct={setLiqShareOverride}
            onMaintainCoverage={setMaintainCoverage}
            onObservationDays={setObservationDays}
            onResetLiqShare={() => setLiqShareOverride(null)}
            onResetRiskShare={() => setRiskShareOverride(null)}
            onRiskSharePct={setRiskShareOverride}
            riskSharePct={resolved.riskYieldShare * 100}
            riskShareOverridden={riskShareOverride !== null}
            targetUtilization={DAY_TARGET_UTILIZATION}
            y0={resolved.y0}
            y100={resolved.y100}
          />

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
