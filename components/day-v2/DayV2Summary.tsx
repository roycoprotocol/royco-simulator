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
import { dayV2RangeStyle } from "@/components/day-v2/range";
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

/**
 * A term the reader sets, drawn so it cannot be mistaken for a readout.
 *
 * The old control was a hairline track under a 15px number, which read as a
 * label with a rule under it. Three things fix that and all three are about
 * affordance rather than decoration: its own raised cell, so it is an object
 * you act on rather than a line of text; a filled track, so the handle has a
 * visible travelled distance behind it; and the endpoints spelled out, so the
 * range it can move through is on screen instead of implied.
 *
 * The fill treatment is shared with every other range on the page, so the deploy
 * parameters and the two exploration sliders inside the result cards read as the
 * same kind of object as these three.
 */
function Slider({
  label,
  display,
  max,
  maxLabel,
  min,
  minLabel,
  onChange,
  note,
  step,
  value,
}: {
  label: string;
  display: string;
  max: number;
  maxLabel: string;
  min: number;
  minLabel: string;
  onChange: (value: number) => void;
  note: string;
  step: number;
  value: number;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 transition-[border-color,box-shadow] hover:border-[var(--secondary)] focus-within:border-[var(--foreground)] focus-within:shadow-[0_2px_10px_-4px_rgba(23,25,31,0.24)]">
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
          {label}
          {/* Dropped only in the band where the three cells are side by side but
              still narrow, roughly 640 to 1024, where the note is what gets
              clipped. Stacked below that and wide above it, there is room. */}
          <span className="inline font-normal normal-case tracking-normal sm:hidden lg:inline">
            {" · "}
            {note}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {display}
        </span>
      </span>
      <span className="flex items-center gap-2.5">
        <span className="w-7 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-[var(--tertiary)]">
          {minLabel}
        </span>
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
        <span className="w-7 shrink-0 font-mono text-[9.5px] tabular-nums text-[var(--tertiary)]">
          {maxLabel}
        </span>
      </span>
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
  // Whether to run this market's real price path at all. Off, the page is a
  // pure forward projection at the stated rate and says so, instead of showing
  // a history the reader did not ask for.
  const [useHistory, setUseHistory] = useState(linked?.useHistory ?? true);
  const deploying = mode === "deploy";
  const [marketId, setMarketId] = useState(initialMarket.id);
  // An imported source outranks the registry selection while it is loaded, so
  // every section below runs on the reader's own history.
  const [draftMarket, setDraftMarket] = useState<DayMarket | null>(null);
  // The importer is opened from the source console rather than from a band of
  // its own, so the state that used to live inside it is lifted here.
  const [sourceOpen, setSourceOpen] = useState(false);
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
  const [y0Override, setY0Override] = useState<number | null>(linked?.y0Pct ?? null);
  const [y100Override, setY100Override] = useState<number | null>(linked?.y100Pct ?? null);
  // The liquidity side has a curve of its own, keyed on a different
  // utilization. Only its target anchor was ever settable here.
  const [liqY0Override, setLiqY0Override] = useState<number | null>(linked?.liqY0Pct ?? null);
  const [liqY100Override, setLiqY100Override] = useState<number | null>(linked?.liqY100Pct ?? null);

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
    setLiqY0Override(null);
    setLiqY100Override(null);
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
    setLiqY0Override(null);
    setLiqY100Override(null);
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
    y0Override, y100Override, liqY0Override, liqY100Override,
  });

  // One place decides what the engine is actually run with, so the panel that
  // displays the curve and the run that produces the numbers cannot disagree.
  const resolved = useMemo(() => {
    const coverage = inputs.coveragePct / 100;
    const minLiquidity = inputs.liquidityPct / 100;
    const derived = dayV2EffectiveShares(defaults, coverage, minLiquidity);
    // A requirement of zero pays zero, and that has to hold for a hand-priced
    // share too. `dayV2EffectiveShares` zeroes the derived path, but the
    // override bypassed it: at 0% coverage with the Jr share priced by hand,
    // the engine charged Sr 1.185pp for cover that does not exist and paid it
    // to nobody, because there is no Jr capital to receive it. Measured on
    // jbbb: Sr 5.529% correctly zeroed, 4.344% with the leak.
    const riskYieldShare = coverage <= 0
      ? 0
      : inputs.riskShareOverride === null
        ? derived.riskYieldShare
        : inputs.riskShareOverride / 100;
    let liquidityYieldShare = minLiquidity <= 0
      ? 0
      : inputs.liqShareOverride === null
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
    const liqY0 = minLiquidity <= 0 ? 0 : inputs.liqY0Override === null
      ? Math.min(defaults.liqYDM.y0, liquidityYieldShare)
      : inputs.liqY0Override / 100;
    const liqY100 = minLiquidity <= 0 ? 0 : inputs.liqY100Override === null
      ? Math.max(defaults.liqYDM.y100, liquidityYieldShare)
      : inputs.liqY100Override / 100;
    // Each contract cap is the peak of its own curve, so the peak is what has
    // to clear the shared 100% budget, not the target anchor.
    const maxLiquidityCurve = Math.max(liqY0, liquidityYieldShare, liqY100);
    const riskCeiling = Math.max(0, 1 - maxLiquidityCurve);
    const cap = (value: number) => Math.min(value, riskCeiling);
    // The static curve runs through (0% -> y0, 90% -> yTarget, 100% -> y100).
    // Left to the market, y0 is clamped so the curve never slopes down into its
    // own target: the deployment panel already displayed it that way while the
    // engine was handed the raw value, so the two disagreed below about 10%
    // coverage. Set deliberately, the reader's number is respected.
    const y0 = coverage <= 0 ? 0 : cap(inputs.y0Override === null
      ? Math.min(defaults.riskYDM.y0, riskYieldShare)
      : inputs.y0Override / 100);
    const y100 = coverage <= 0 ? 0 : cap(inputs.y100Override === null
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
      liqY0: Math.min(liqY0, liquidityCeiling),
      liqY100: Math.min(liqY100, liquidityCeiling),
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
      liqYDM: {
        ...defaults.liqYDM,
        y0: resolved.liqY0,
        yTarget: resolved.liquidityYieldShare,
        y100: resolved.liqY100,
      },
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
    y0Pct: y0Override,
    y100Pct: y100Override,
    liqY0Pct: liqY0Override,
    liqY100Pct: liqY100Override,
    useHistory,
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
      {/* The page's own rail: what this is, and which of the two jobs you are
          doing. Kept off the hero grid so the switch cannot be mistaken for one
          of the inputs beneath it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]">
          Royco Day · Market simulator
        </span>
        <div
          aria-label="What you are here to do"
          className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] p-0.5"
          role="group"
        >
          {([["Simulate", "simulate"], ["Deploy", "deploy"]] as const).map(([label, value]) => (
            <button
              aria-pressed={mode === value}
              className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-semibold ${
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

      {/* The hero, and the first half of the input console, side by side at equal
          width. Reading order is the page's own argument: the left says what the
          page does and draws the line between what you set and what it answers,
          and the right is the first thing you set, sitting on `--foundation`
          because on this page that fill already means "you can move this and the
          page answers". */}
      <header className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {/* Balanced rather than max-width capped: at 48px a character count
              that reads well at 1440px strands "risks." on a line of its own at
              1280px. */}
          <h1 className="text-balance text-[clamp(30px,3.5vw,48px)] font-semibold leading-[1.02] tracking-[-0.03em]">
            One yield source, split into three risks.
          </h1>
          <p className="max-w-[52ch] text-[14px] leading-relaxed text-[var(--secondary)]">
            <strong className="font-semibold text-[var(--foreground)]">
              {market.identity.marketName}
            </strong>{" "}
            earns{" "}
            <strong className="font-semibold text-[var(--foreground)]">{pct(source)}</strong> a
            year before it is split.{" "}
            {deploying
              ? "Set every parameter a real market takes, then hand the design to the deploy flow."
              : "Nothing on this page is fixed copy: change an input and every figure below is recomputed."}
          </p>
          {/* The boundary, stated rather than left to be inferred from styling.
              Six words each, because a reader who needs this reads it once. */}
          <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]">
                You set
              </dt>
              <dd className="text-[12.5px] leading-snug text-[var(--secondary)]">
                A yield source, the rate it earns, and how much cover and liquidity
                stand behind it.
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]">
                The model answers
              </dt>
              <dd className="text-[12.5px] leading-snug text-[var(--secondary)]">
                What Sr, Jr and SLP each earn, and what each stands to lose.
              </dd>
            </div>
          </dl>
        </div>

        {/* Everything about the source in one box, instead of a select in the
            corner, the same market name repeated in a card below it, and the
            import on a third band. The name used to appear three times above the
            fold and none of the three looked like the control. */}
        <section
          aria-labelledby="day-v2-source-heading"
          className="flex flex-col gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4 shadow-[0_6px_22px_-14px_rgba(23,25,31,0.4)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]"
              id="day-v2-source-heading"
            >
              Input 1 · What you are modeling
            </h2>
            {draftMarket ? <Badge tone="caution">unverified import</Badge> : null}
          </div>

          <label className="flex cursor-pointer flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold text-[var(--secondary)]">
              Yield source
            </span>
            <select
              aria-label="Yield source"
              className="w-full cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-3.5 py-2.5 text-[15px] font-semibold"
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
            {/* Grouped with an explicit locale: the count is rendered on the
                server too, and a locale-dependent separator would differ
                between the two and fail hydration. */}
            <span className="font-mono text-[11px] leading-snug tabular-nums text-[var(--tertiary)]">
              {market.series.length >= 3
                ? `${market.series.length.toLocaleString("en-US")} dated observations · ${market.series[0].date} to ${market.series[market.series.length - 1].date}`
                : "Published yield · no dated history"}
            </span>
          </label>

          {market.series.length >= 3 ? (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3.5">
              <span className="flex flex-col gap-0.5">
                <span className="text-[11.5px] font-semibold text-[var(--secondary)]">
                  Run its price history
                </span>
                <span className="max-w-[36ch] text-[10.5px] leading-snug text-[var(--tertiary)]">
                  Ignored, the page is a forward projection at the rate you set and the
                  backtest comes off
                </span>
              </span>
              <span
                aria-label="Run this source's price history"
                className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] p-0.5"
                role="group"
              >
                {([["Run it", true], ["Ignore", false]] as const).map(([label, value]) => (
                  <button
                    aria-pressed={useHistory === value}
                    className={`cursor-pointer rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                      useHistory === value
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "text-[var(--secondary)]"
                    }`}
                    key={label}
                    onClick={() => setUseHistory(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3.5">
            <span className="text-[11.5px] text-[var(--tertiary)]">
              {draftMarket
                ? "Running your own imported history."
                : "Or run this mechanism over your own dated price history."}
            </span>
            <span className="flex items-center gap-3">
              {draftMarket ? (
                <button
                  className="cursor-pointer text-[11.5px] font-semibold text-[var(--tertiary)] underline underline-offset-2"
                  onClick={() => {
                    setDraftMarket(null);
                    setSourceOpen(false);
                    adoptTerms(selectedMarket);
                  }}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
              <button
                aria-expanded={sourceOpen}
                className="cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-1.5 text-[11.5px] font-semibold"
                onClick={() => setSourceOpen((value) => !value)}
                type="button"
              >
                {sourceOpen ? "Close" : draftMarket ? "Replace source" : "Import a source"}
              </button>
            </span>
          </div>
        </section>
      </header>

      <DayV2Source
        onImport={(next) => {
          setDraftMarket(next);
          adoptTerms(next);
        }}
        onOpenChange={setSourceOpen}
        open={sourceOpen}
      />

      {/* The other half of the console, and the half that is moved constantly.
          It carries its own heading now: three unlabelled tracks in a cream bar
          were the page's real controls and nothing said so. It stays on screen,
          so coverage can be moved while reading the backtest 2600px down. Only
          from `sm`, where the three sliders are one row rather than a stack tall
          enough to swallow a phone screen. */}
      <section
        aria-labelledby="day-v2-terms-heading"
        className="z-20 flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-4 shadow-[0_1px_2px_rgba(23,25,31,0.04)] sm:sticky sm:top-3 sm:shadow-[0_8px_24px_-10px_rgba(23,25,31,0.32)]"
      >
        {/* Adjacent, not pushed to opposite ends of a 1400px bar: they are one
            sentence and the reader should not have to travel to finish it. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
          <h2
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]"
            id="day-v2-terms-heading"
          >
            Input 2 · The terms you set
          </h2>
          <p className="text-[11px] text-[var(--tertiary)]">
            Drag any of the three. Every figure below is recomputed from them.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Slider
            display={pct(sourceApyPct / 100)}
            label="Source yield"
            max={30}
            maxLabel="30%"
            min={0}
            minLabel="0%"
            note="before the split"
            onChange={setSourceApyPct}
            step={0.1}
            value={sourceApyPct}
          />
          <Slider
            display={pct(coveragePct / 100)}
            label="Coverage"
            max={25}
            maxLabel="25%"
            min={0}
            minLabel="0%"
            note="Jr per unit of Sr"
            onChange={setCoveragePct}
            step={0.5}
            value={coveragePct}
          />
          <Slider
            display={pct(liquidityPct / 100)}
            label="Liquidity"
            max={25}
            maxLabel="25%"
            min={0}
            minLabel="0%"
            note="pool depth for Sr"
            onChange={setLiquidityPct}
            step={0.5}
            value={liquidityPct}
          />
        </div>
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
            sourceApy={source}
            liqY0Pct={liqY0Override ?? resolved.liqY0 * 100}
            liqY100Pct={liqY100Override ?? resolved.liqY100 * 100}
            onLiqY0Pct={setLiqY0Override}
            onLiqY100Pct={setLiqY100Override}
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
              setLiqY0Override(null);
              setLiqY100Override(null);
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
              || liqY0Override !== null || liqY100Override !== null
            }
          />

        </>
      ) : null}

      <DayV2Presets activeId={activePresetId} onSelect={applyPreset} />

      {/* The first thing the inputs answer, and the first thing that is not an
          input. It was unlabelled, which left no visible line between the cream
          controls above and the results below. */}
      <h2
        className="-mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
        id="day-v2-positions-heading"
      >
        What each position earns at these terms
      </h2>
      {/* Three peers, scanned across: identical slots, so the eye compares the
          rate first and reads detail only if it wants to. */}
      <section
        aria-labelledby="day-v2-positions-heading"
        className="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
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
          side the reader can check the curve against the table it comes from.
          Equal columns, like the pair above it and like the hero: one grid used
          consistently is what makes the page read as a system rather than as a
          stack of differently proportioned slabs. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
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
          shares={{
            coveragePct: inputs.coveragePct,
            liquidityPct: inputs.liquidityPct,
            riskSharePct: resolved.riskYieldShare * 100,
            liqSharePct: resolved.liquidityYieldShare * 100,
            targetUtilization: DAY_TARGET_UTILIZATION,
            onOpenDeploy: () => setMode("deploy"),
          }}
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
      {/* Shown in both flows when a history is being run. A deployer needs it
          more than anyone: the coverage restoration toggle lives in the
          parameters, and its single most important consequence, that outside
          capital funded Sr's result, is disclosed here. */}
      {/* Gated on the reader's choice only. A market with no dated history still
          renders: the component's own branch explains that the figures are a
          forward projection, and hiding it made the section vanish silently. */}
      {useHistory ? (
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
      ) : null}

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
