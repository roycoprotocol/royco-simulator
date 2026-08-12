"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2Chart, { type DayV2Point } from "@/components/day-v2/DayV2Chart";
import DayV2Comparison, {
  DAY_V2_TONE_DOT,
  type DayV2PositionBreakdown,
} from "@/components/day-v2/DayV2Comparison";
import DayV2Backtest from "@/components/day-v2/DayV2Backtest";
import DayV2Button from "@/components/day-v2/DayV2Button";
import DayV2CapitalStack from "@/components/day-v2/DayV2CapitalStack";
import DayV2Deployment from "@/components/day-v2/DayV2Deployment";
import DayV2Disclosure from "@/components/day-v2/DayV2Disclosure";
import DayV2DocsLink from "@/components/day-v2/DayV2DocsLink";
import DayV2Group from "@/components/day-v2/DayV2Group";
import DayV2Parameters from "@/components/day-v2/DayV2Parameters";
import DayV2Slider from "@/components/day-v2/DayV2Slider";
import DayV2ExitCost from "@/components/day-v2/DayV2ExitCost";
import DayV2LossWaterfall from "@/components/day-v2/DayV2LossWaterfall";
import DayV2MarketSelect from "@/components/day-v2/DayV2MarketSelect";
import DayV2SegmentedControl from "@/components/day-v2/DayV2SegmentedControl";
import DayV2Source from "@/components/day-v2/DayV2Source";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dayV2RangeStyle } from "@/components/day-v2/range";
import { dayV2EffectiveShares } from "@/components/day-v2/terms";
import { buildDayV2Query, type DayV2UrlState } from "@/components/day-v2/url-state";
import { buildDayYieldDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import { matchDayIssuerPreset } from "@/lib/day-simulator-template/issuer-presets";
import { dayPoolSeniorWeight } from "@/lib/day-simulator-template/capital-sizing";
import { DAY_ECLP_SIMULATION_LAMBDA } from "@/lib/day/engine/engine";
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
const CUSTOM_SOURCE_ID = "custom";
const clampDeployDiscount = (value: number) =>
  Math.min(5, Math.max(0.5, value));
const CUSTOM_SOURCE_MARKET = buildDayYieldDraftMarket({
  label: "Custom yield source",
  sourceApy: 0.12,
});

/**
 * The same three terms, sized for the bar that takes over once the input panel
 * has scrolled away. No note, no endpoints and a short label: it exists so a
 * figure 3000px down can be moved without scrolling back, not to teach anyone
 * what the control is, which the full panel already did.
 */
function CompactSlider({
  ariaLabel,
  display,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  ariaLabel: string;
  display: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
      <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
        {label}
      </span>
      <input
        aria-label={ariaLabel}
        className="day-v2-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        style={dayV2RangeStyle(value, min, max)}
        type="range"
        value={value}
      />
      <span className="w-[46px] shrink-0 text-right font-mono text-[13px] font-bold tabular-nums">
        {display}
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
  const deploying = mode === "deploy";
  const [customSource, setCustomSource] = useState(
    linked?.market === CUSTOM_SOURCE_ID ||
      !markets.some((candidate) => candidate.id === linked?.market),
  );
  const [marketId, setMarketId] = useState(initialMarket.id);
  // An imported source outranks the registry selection while it is loaded, so
  // every section below runs on the reader's own history.
  const [draftMarket, setDraftMarket] = useState<DayMarket | null>(null);
  // Whether the slim terms bar has taken over. Driven by a sentinel sitting
  // right below the three sliders rather than by the panel itself: on the deploy
  // tab the panel runs well past a viewport, so watching the whole thing would
  // leave the terms off screen and the bar still hidden.
  const termsEndRef = useRef<HTMLDivElement>(null);
  const [termsPinned, setTermsPinned] = useState(false);
  const selectedMarket =
    markets.find((candidate) => candidate.id === marketId) ?? initialMarket;
  // Importing history attaches a path to the Custom design; it must not replace
  // that design's market defaults. The current sliders remain the source of
  // truth and the imported draft contributes only identity, provenance and the
  // dated series.
  const market = draftMarket
    ? { ...draftMarket, defaults: CUSTOM_SOURCE_MARKET.defaults }
    : customSource
      ? CUSTOM_SOURCE_MARKET
      : selectedMarket;
  const defaults = market.defaults;
  // A few markets report in their own asset rather than dollars. Declared on
  // the market, so it follows an imported draft too.
  const returnUnit = customSource
    ? "units"
    : (market.customization.backtestDisplay?.returnUnit ?? "USD");
  const [coveragePct, setCoveragePct] = useState(
    linked?.coveragePct ?? defaults.coverage * 100,
  );
  const [liquidityPct, setLiquidityPct] = useState(
    linked?.liquidityPct ?? defaults.minLiquidity * 100,
  );
  const [sourceApyPct, setSourceApyPct] = useState(
    customSource
      ? (linked?.sourceApyPct ?? defaults.sourceApy * 100)
      : defaults.sourceApy * 100,
  );
  // The rest of the market's terms. They are real inputs to the engine and were
  // previously pinned at the market default with no way to see or move them.
  const [observationDays, setObservationDays] = useState(
    linked?.observationDays ?? defaults.observationDays,
  );
  const [bandPct, setBandPct] = useState(
    clampDeployDiscount(linked?.bandPct ?? defaults.eclpBandWidth * 100),
  );
  const [maintainCoverage, setMaintainCoverage] = useState(
    linked?.maintainCoverage ?? defaults.maintainCoverage,
  );
  // Null means "follow the requirement", which is the rule in `terms.ts`. A
  // number means the deployer has priced the tranche themselves.
  const [riskShareOverride, setRiskShareOverride] = useState<number | null>(
    linked?.riskSharePct ?? null,
  );
  const [liqShareOverride, setLiqShareOverride] = useState<number | null>(
    linked?.liqSharePct ?? null,
  );
  // The other two anchors of the yield-share curve. Null means "as the market
  // ships it", which is what every registry market wants until someone is
  // actually designing a curve.
  const [y0Override, setY0Override] = useState<number | null>(
    linked?.y0Pct ?? null,
  );
  const [y100Override, setY100Override] = useState<number | null>(
    linked?.y100Pct ?? null,
  );
  // The liquidity side has a curve of its own, keyed on a different
  // utilization. Only its target anchor was ever settable here.
  const [liqY0Override, setLiqY0Override] = useState<number | null>(
    linked?.liqY0Pct ?? null,
  );
  const [liqY100Override, setLiqY100Override] = useState<number | null>(
    linked?.liqY100Pct ?? null,
  );

  // Switching market adopts that market's own terms, so the sliders describe the
  // market on screen rather than carrying the previous one's numbers over.
  const adoptTerms = (next: DayMarket) => {
    setCoveragePct(next.defaults.coverage * 100);
    setLiquidityPct(next.defaults.minLiquidity * 100);
    setSourceApyPct(next.defaults.sourceApy * 100);
    setObservationDays(next.defaults.observationDays);
    setBandPct(clampDeployDiscount(next.defaults.eclpBandWidth * 100));
    setMaintainCoverage(next.defaults.maintainCoverage);
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
    setCustomSource(false);
    setDraftMarket(null);
    setMarketId(nextId);
    adoptTerms(next);
  };

  const selectSourceType = (nextCustom: boolean) => {
    if (nextCustom === customSource) return;
    setCustomSource(nextCustom);
    setDraftMarket(null);
    adoptTerms(nextCustom ? CUSTOM_SOURCE_MARKET : selectedMarket);
  };

  // Keeps the controls responsive while the engine re-runs, the same pattern the
  // main simulator uses after measuring input lag.
  const inputs = useDeferredValue({
    coveragePct,
    liquidityPct,
    sourceApyPct,
    observationDays,
    bandPct,
    maintainCoverage,
    riskShareOverride,
    liqShareOverride,
    y0Override,
    y100Override,
    liqY0Override,
    liqY100Override,
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
    let riskYieldShare =
      coverage <= 0
        ? 0
        : inputs.riskShareOverride === null
          ? derived.riskYieldShare
          : inputs.riskShareOverride / 100;
    let liquidityYieldShare =
      minLiquidity <= 0
        ? 0
        : inputs.liqShareOverride === null
          ? derived.liquidityYieldShare
          : inputs.liqShareOverride / 100;
    // The deploy flow rejects an active static curve whose target share is
    // zero. The controls move in 0.5-point steps, so that is the smallest
    // positive value either active curve can represent.
    if (coverage > 0) riskYieldShare = Math.max(0.005, riskYieldShare);
    if (minLiquidity > 0)
      liquidityYieldShare = Math.max(0.005, liquidityYieldShare);
    // The engine derives each contract cap as the highest point of its curve and
    // throws INVALID_YIELD_SHARE_CONFIG when the two caps exceed 100% together,
    // which would take the page down on a keystroke. Holding the whole risk
    // curve under what the liquidity curve leaves makes that unreachable rather
    // than merely unlikely. On jbbb this ceiling is 85%, on muga 64.3%.
    // Keep the liquidity side inside what the selected source's risk curve
    // leaves. The full resolved curves are handed to both the projection and
    // backtest below, so this one ceiling protects both runs.
    const marketRiskCurveMax = Math.max(
      defaults.riskYDM.y0,
      defaults.riskYDM.y100,
    );
    const liquidityCeiling = Math.max(0, 1 - marketRiskCurveMax);
    liquidityYieldShare = Math.min(liquidityYieldShare, liquidityCeiling);
    const requestedLiqY0 =
      minLiquidity <= 0
        ? 0
        : inputs.liqY0Override === null
          ? Math.min(defaults.liqYDM.y0, liquidityYieldShare)
          : inputs.liqY0Override / 100;
    const requestedLiqY100 =
      minLiquidity <= 0
        ? 0
        : inputs.liqY100Override === null
          ? Math.max(defaults.liqYDM.y100, liquidityYieldShare)
          : inputs.liqY100Override / 100;
    const liqY0 = Math.min(
      requestedLiqY0,
      liquidityYieldShare,
      liquidityCeiling,
    );
    const liqY100 = Math.min(
      Math.max(requestedLiqY100, liquidityYieldShare),
      liquidityCeiling,
    );
    // Each contract cap is the peak of its own curve, so the peak is what has
    // to clear the shared 100% budget, not the target anchor.
    const maxLiquidityCurve = Math.max(liqY0, liquidityYieldShare, liqY100);
    const riskCeiling = Math.max(0, 1 - maxLiquidityCurve);
    const cap = (value: number) => Math.min(value, riskCeiling);
    const resolvedRiskYieldShare = cap(riskYieldShare);
    // The static curve runs through (0% -> y0, 90% -> yTarget, 100% -> y100).
    // Left to the market, y0 is clamped so the curve never slopes down into its
    // own target: the deployment panel already displayed it that way while the
    // engine was handed the raw value, so the two disagreed below about 10%
    // coverage. Explicit anchors are normalized to the same deployable order;
    // the engine applies this rule too, and exporting the raw inverted values
    // would otherwise describe a different curve than the one it ran.
    const requestedY0 =
      coverage <= 0
        ? 0
        : cap(
            inputs.y0Override === null
              ? Math.min(defaults.riskYDM.y0, riskYieldShare)
              : inputs.y0Override / 100,
          );
    const requestedY100 =
      coverage <= 0
        ? 0
        : cap(
            inputs.y100Override === null
              ? Math.max(defaults.riskYDM.y100, riskYieldShare)
              : inputs.y100Override / 100,
          );
    const y0 = Math.min(requestedY0, resolvedRiskYieldShare);
    const y100 = Math.max(requestedY100, resolvedRiskYieldShare);
    return {
      coverage,
      minLiquidity,
      derived,
      riskYieldShare: resolvedRiskYieldShare,
      liquidityYieldShare,
      y0,
      y100,
      liqY0,
      liqY100,
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
    const zeroCurve = { mode: "static" as const, y0: 0, yTarget: 0, y100: 0 };
    const noPremiums = runDayTargetScenario({
      ...effective,
      riskYDM: zeroCurve,
      liqYDM: zeroCurve,
    });
    const riskOnly = runDayTargetScenario({
      ...effective,
      liqYDM: zeroCurve,
    });
    // Held rather than rebuilt, so the pool economics quoted to the reader are
    // the ones this run used and cannot drift from them.
    const cfg = buildDayMarketConfig(effective, terms);
    // Hoisted out of the explainer call so the capital stack the issuer is asked
    // to raise and the rates they are quoted are the same market, seeded once.
    const balances = buildDayInitialBalances(effective, terms);
    return {
      scenario: runDayTargetScenario(effective),
      noPremiums,
      riskOnly,
      balances,
      pool: {
        stableYield: cfg.stableYield,
        swapFeeBps: cfg.swapFeeBps,
        turnoverPerYear: cfg.poolTurnoverPerYear,
        concentration: DAY_ECLP_SIMULATION_LAMBDA,
        // Measured off this run's own config, so the split the capital stack
        // reports is the split the engine seeded.
        seniorWeight: dayPoolSeniorWeight(cfg),
      },
      explainer: buildDayExplainerMetrics(cfg, balances),
    };
  }, [defaults, inputs, resolved]);
  const scenario = model.scenario;

  const chartData = useMemo<DayV2Point[]>(() => {
    const grow = (apy: number, months: number) =>
      100 * (1 + apy) ** (months / 12);
    return Array.from({ length: 13 }, (_, month) => ({
      month,
      senior: grow(scenario.seniorApy, month),
      junior: grow(scenario.juniorApy, month),
      liquidity: grow(scenario.liquidityApy, month),
    }));
  }, [scenario]);

  const query = buildDayV2Query({
    market: customSource ? CUSTOM_SOURCE_ID : marketId,
    mode,
    coveragePct,
    liquidityPct,
    sourceApyPct,
    observationDays,
    bandPct,
    maintainCoverage,
    riskSharePct:
      riskShareOverride === null ? null : resolved.riskYieldShare * 100,
    liqSharePct:
      liqShareOverride === null ? null : resolved.liquidityYieldShare * 100,
    y0Pct: y0Override === null ? null : resolved.y0 * 100,
    y100Pct: y100Override === null ? null : resolved.y100 * 100,
    liqY0Pct: liqY0Override === null ? null : resolved.liqY0 * 100,
    liqY100Pct: liqY100Override === null ? null : resolved.liqY100 * 100,
  });
  // replaceState rather than a router push: this fires on every slider tick, and
  // a history entry per pixel of drag would make the back button useless.
  // replaceState rather than a router push: this fires on every slider tick, and
  // a history entry per pixel of drag would make the back button useless. It is
  // also why the link is read on the server instead of in an effect here.
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${query}`,
    );
  }, [query]);

  // `isIntersecting` alone would raise the bar when the sentinel is below the
  // fold too, i.e. before the reader has scrolled at all, so the sign of the
  // sentinel's own top is what decides it: above the viewport means the terms
  // are behind you.
  useEffect(() => {
    const node = termsEndRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setTermsPinned(
          !entry.isIntersecting && entry.boundingClientRect.top < 0,
        ),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Which named design the current terms are, if any. Tracked by comparison
  // rather than by remembering what was last clicked, so moving any slider
  // deselects the preset instead of leaving a stale label on a changed market.
  const matchedPresetId = matchDayIssuerPreset({
    coveragePct: inputs.coveragePct,
    minLiquidityPct: inputs.liquidityPct,
    eclpBandWidthPct: inputs.bandPct,
    riskSharePct: resolved.riskYieldShare * 100,
    liqSharePct: resolved.liquidityYieldShare * 100,
    observationDays: inputs.observationDays,
    maintainCoverage: inputs.maintainCoverage,
  });
  const curveOverridden =
    riskShareOverride !== null ||
    liqShareOverride !== null ||
    y0Override !== null ||
    y100Override !== null ||
    liqY0Override !== null ||
    liqY100Override !== null;
  const advancedChanged =
    curveOverridden ||
    Math.abs(observationDays - defaults.observationDays) > 1e-9 ||
    Math.abs(bandPct - defaults.eclpBandWidth * 100) > 1e-9;

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
      risk:
        coveragePct > 0
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
      role: "Supplies exit liquidity, paid a premium for it",
      holdsSource: false,
      ...breakdown("liquidityApy"),
      risk: "Holds Sr shares when Sr sells",
      funded: liquidityPct > 0,
    },
  ];

  return (
    // Capped rather than full-bleed. Past about 1400px the cards stop gaining
    // anything and the prose lines just get harder to track back to.
    <main className="royco-v2 mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="grid grid-cols-1 items-center gap-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-6 shadow-[0_8px_28px_-20px_rgba(23,25,31,0.45)] sm:px-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]">
            Royco Day · Market simulator
          </span>
          <h1 className="text-balance text-[clamp(30px,3.5vw,48px)] font-semibold leading-[1.02] tracking-[-0.03em]">
            One yield source, split into three positions.
          </h1>
          <p className="max-w-[62ch] text-[14px] leading-relaxed text-[var(--secondary)]">
            See how market terms change returns, protection, and exit liquidity
            for Sr, Jr, and SLP.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]">
            {deploying
              ? "Finalize a market design"
              : "Explore how the protocol works"}
          </span>
          <DayV2SegmentedControl
            ariaLabel="Simulation mode"
            className="w-full"
            onValueChange={setMode}
            options={[
              { label: "Simulate", value: "simulate" },
              { label: "Deploy", value: "deploy" },
            ]}
            size="lg"
            toggleOnSelected
            value={mode}
          />
          <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">
            Click either side to switch views. Your terms stay in place.
          </span>
        </div>
      </header>

      {/* One panel. Every input on the page is in here, on both tabs: the
          source, the three terms, the named designs, and on Deploy the rest of
          the market's parameters. It used to be five separate bands and a card
          three thousand pixels down, and a reader had no way to tell which of
          them the page would answer to. `--foundation` is the fill that already
          meant "you can move this", so the panel is the boundary: everything in
          it is an input, everything outside it is an answer. */}
      <section
        aria-labelledby="day-v2-inputs-heading"
        className="flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4 shadow-[0_6px_22px_-14px_rgba(23,25,31,0.4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              id="day-v2-inputs-heading"
            >
              Your inputs
            </h2>
            <p className="text-[11px] text-[var(--tertiary)]">
              Set the terms that drive the model.
            </p>
          </div>
          {draftMarket ? <Badge tone="caution">unverified import</Badge> : null}
        </div>

        <DayV2Group
          docs="tranching"
          docsLabel="How tranching works"
          index={1}
          subtitle="Enter a custom yield or choose a listed source"
          title="What you are modeling"
        >
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <DayV2SegmentedControl
              ariaLabel="Yield source type"
              onValueChange={(value) => selectSourceType(value === "custom")}
              options={[
                { label: "Custom yield", value: "custom" },
                { label: "Listed source", value: "listed" },
              ]}
              value={customSource ? "custom" : "listed"}
            />

            {customSource ? (
              <DayV2Slider
                display={pct(sourceApyPct / 100)}
                docs="dawn"
                label="Custom source yield"
                max={30}
                maxLabel="30%"
                min={0}
                minLabel="0%"
                note="net annual yield"
                onChange={setSourceApyPct}
                step={0.1}
                value={sourceApyPct}
              />
            ) : (
              <DayV2MarketSelect
                markets={markets}
                onChange={selectMarket}
                value={marketId}
              />
            )}
          </div>
        </DayV2Group>

        <DayV2Group
          docs="yieldSplit"
          docsLabel="How yield is split"
          index={2}
          subtitle="Set the minimum protection and exit-liquidity requirements"
          title="The terms you set"
        >
          {/* Three across rather than stacked in a half-width column. They are
              the answer to one question each and they belong on one line, which
              also lines them up with the three named designs underneath.
              Slider positions come from raw state, never from the deferred
              model, or the input fights the pointer: the value snaps back to a
              frame-old number while you are still dragging it. */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <DayV2Slider
              display={pct(coveragePct / 100)}
              label="Minimum coverage"
              max={25}
              maxLabel="25%"
              min={0}
              minLabel="0%"
              // Not "Jr per unit of Sr", which it never was: the Junior capital
              // that meets a 20% requirement at the target is 28.6% of Senior.
              // An issuer sizing a raise off the old caption came up 43% short.
              note="first-loss protection"
              docs="coverage"
              onChange={setCoveragePct}
              step={0.5}
              value={coveragePct}
            />
            <DayV2Slider
              display={pct(liquidityPct / 100)}
              label="Minimum liquidity"
              max={25}
              maxLabel="25%"
              min={0}
              minLabel="0%"
              // Same correction: a 10% liquidity requirement is met by a pool
              // worth 11.1% of Senior, not 10%.
              note="SLP requirement"
              docs="liquidity"
              onChange={setLiquidityPct}
              step={0.5}
              value={liquidityPct}
            />
          </div>

          {/* Watched, not stuck. The panel is far too tall to pin to the top, so
              a slim bar takes over once this scrolls away. It has to sit
              directly below the three sliders: gated on the panel instead, the
              deploy tab keeps it intersecting long after the terms have gone. */}
          <div aria-hidden="true" ref={termsEndRef} />
        </DayV2Group>

        {customSource ? (
          <DayV2Group
            index={3}
            subtitle="Optional · used for historical backtesting"
            title="Add price history"
          >
            {draftMarket ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
                <span className="text-[11px] leading-snug text-[var(--secondary)]">
                  <strong className="font-semibold">
                    {draftMarket.identity.marketName}
                  </strong>
                  {" · "}
                  {draftMarket.series.length.toLocaleString("en-US")}{" "}
                  observations
                  {" · "}
                  <span className="text-[var(--tertiary)]">
                    available in this tab only
                  </span>
                </span>
                <DayV2Button
                  className="text-[11.5px]"
                  onClick={() => setDraftMarket(null)}
                  size="inline"
                  variant="link"
                >
                  Remove
                </DayV2Button>
              </div>
            ) : null}
            <DayV2Source
              onImport={(next) => {
                setCustomSource(true);
                setDraftMarket(next);
              }}
            />
          </DayV2Group>
        ) : null}

        {deploying ? (
          <DayV2Disclosure
            description={
              <>
                Timing, maximum discount, and premium curves ·{" "}
                {advancedChanged
                  ? "custom settings"
                  : "recommended defaults applied"}
              </>
            }
            summary="Advanced market mechanics"
          >
            <DayV2Parameters
                bandPct={bandPct}
                ceilingPct={resolved.riskCeiling * 100}
                coveragePct={coveragePct}
                curveOverridden={curveOverridden}
                derivedLiqSharePct={resolved.derived.liquidityYieldShare * 100}
                derivedRiskSharePct={resolved.derived.riskYieldShare * 100}
                liqCeilingPct={resolved.liquidityCeiling * 100}
                liquidityPct={liquidityPct}
                liqShareOverridden={liqShareOverride !== null}
                liqSharePct={resolved.liquidityYieldShare * 100}
                liqY0Pct={resolved.liqY0 * 100}
                liqY100Pct={resolved.liqY100 * 100}
                observationDays={observationDays}
                onBandPct={setBandPct}
                onLiqSharePct={setLiqShareOverride}
                onLiqY0Pct={setLiqY0Override}
                onLiqY100Pct={setLiqY100Override}
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
                riskShareOverridden={riskShareOverride !== null}
                riskSharePct={resolved.riskYieldShare * 100}
                seniorShareOfCapital={
                  model.balances.st + model.balances.jt + model.balances.lt > 0
                    ? model.balances.st /
                      (model.balances.st +
                        model.balances.jt +
                        model.balances.lt)
                    : 1
                }
                sourceApy={source}
                startIndex={customSource ? 4 : 3}
                targetUtilization={DAY_TARGET_UTILIZATION}
                y0Pct={resolved.y0 * 100}
                y100Pct={resolved.y100 * 100}
            />
          </DayV2Disclosure>
        ) : null}
      </section>

      {/* The three terms, still reachable from anywhere on a 4000px page. The
          panel above cannot be sticky at 400px tall, let alone 1400 on the
          deploy tab, and the previous 150px sticky slab covered whatever it was
          parked over. This appears only once the panel has scrolled past, and
          drives the same state, so the two can never disagree. Hidden below
          `sm`, where it would swallow a phone viewport. */}
      <div
        className={`fixed inset-x-0 top-0 z-40 hidden border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--foundation)_92%,transparent)] shadow-[0_6px_20px_-12px_rgba(23,25,31,0.4)] backdrop-blur transition-[opacity,transform] duration-150 sm:block ${
          termsPinned
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-2 opacity-0"
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1440px] items-center gap-4 px-5 py-2 sm:px-8">
          <span className="hidden max-w-[22ch] shrink-0 truncate text-[11px] font-semibold text-[var(--secondary)] lg:block">
            {market.identity.marketName}
          </span>
          {customSource ? (
            <CompactSlider
              ariaLabel="Custom source yield quick control"
              display={pct(sourceApyPct / 100)}
              label="Yield"
              max={30}
              min={0}
              onChange={setSourceApyPct}
              step={0.1}
              value={sourceApyPct}
            />
          ) : null}
          <CompactSlider
            ariaLabel="Coverage quick control"
            display={pct(coveragePct / 100)}
            label="Minimum coverage"
            max={25}
            min={0}
            onChange={setCoveragePct}
            step={0.5}
            value={coveragePct}
          />
          <CompactSlider
            ariaLabel="Liquidity quick control"
            display={pct(liquidityPct / 100)}
            label="Minimum liquidity"
            max={25}
            min={0}
            onChange={setLiquidityPct}
            step={0.5}
            value={liquidityPct}
          />
        </div>
      </div>

      {/* The first thing the inputs answer, and the first thing that is not an
          input. It was unlabelled, which left no visible line between the cream
          controls above and the results below. */}
      <div className="-mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
          id="day-v2-positions-heading"
        >
          What each position earns at these terms
        </h2>
        <DayV2DocsLink label="Yield split" topic="yieldSplit" />
      </div>
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
            <CardHeader className="px-6 pb-4">
              <div className="flex items-center justify-between gap-2">
                {/* An eyebrow, not a title. The rate is the title here. */}
                <CardTitle
                  className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]"
                  level={3}
                >
                  {position.name}
                </CardTitle>
                {position.funded ? null : (
                  <Badge tone="neutral">not funded</Badge>
                )}
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
                  style={
                    position.funded ? undefined : { color: "var(--tertiary)" }
                  }
                >
                  {position.funded ? pct(position.apy) : "0.0%"}
                </span>
                <span className="text-[11px] text-[var(--tertiary)]">
                  a year
                </span>
              </div>
              <p className="border-t border-[var(--border-subtle)] pt-2 text-[12px] leading-relaxed text-[var(--secondary)]">
                {position.risk}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* The other half of the answer, and the half an issuer needs first. The
          page priced three legs without ever saying how much capital had to
          stand at each one, which is the question that decides whether a design
          can be raised at all. */}
      <DayV2CapitalStack
        defaults={defaults}
        poolSeniorWeight={model.pool.seniorWeight}
        balances={model.balances}
        coverage={resolved.coverage}
        minLiquidity={resolved.minLiquidity}
        targetUtilization={DAY_TARGET_UTILIZATION}
        unit={returnUnit}
      />

      <div className="-mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
          id="day-v2-risk-heading"
        >
          What can go wrong
        </h2>
        <DayV2DocsLink label="Protected exit" topic="protectedExit" />
      </div>
      {/* Losing money and getting out are the two ways a position goes wrong,
          and the projection above deliberately contains neither. They read
          better next to each other than either does alone. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <DayV2LossWaterfall
          metrics={model.explainer.coverage}
          unit={returnUnit}
        />
        <DayV2ExitCost
          assumptions={{
            bandPct: inputs.bandPct,
            concentration: model.pool.concentration,
            stableYield: model.pool.stableYield,
            swapFeeBps: model.pool.swapFeeBps,
            turnoverPerYear: model.pool.turnoverPerYear,
          }}
          metrics={model.explainer.liquidity}
          unit={returnUnit}
        />
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
              Compounded from the modeled annual rates above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayV2Chart data={chartData} unit={returnUnit} />
          </CardContent>
        </Card>

        <DayV2Comparison
          poolEconomics={model.pool}
          positions={positions as DayV2PositionBreakdown[]}
          shares={{
            coveragePct: inputs.coveragePct,
            curveOverridden,
            deploying,
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
        {market.series.length >= 3
          ? "Historical evidence"
          : "Add history to test the design"}
      </h2>
      {/* Shown in both flows when a history is being run. A deployer needs it
          more than anyone: the coverage restoration toggle lives in the
          parameters, and its single most important consequence, that outside
          capital funded Sr's result, is disclosed here. */}
      {/* Gated on the reader's choice only. A market with no dated history still
          renders: the component's own branch explains that the figures are a
          forward projection, and hiding it made the section vanish silently. */}
      <DayV2Backtest
        bandPct={inputs.bandPct}
        coveragePct={inputs.coveragePct}
        customSource={customSource}
        liqSharePct={resolved.liquidityYieldShare * 100}
        liquidityPct={inputs.liquidityPct}
        maintainCoverage={maintainCoverage}
        onMaintainCoverage={setMaintainCoverage}
        market={market}
        observationDays={inputs.observationDays}
        riskY0Pct={resolved.y0 * 100}
        riskY100Pct={resolved.y100 * 100}
        riskSharePct={resolved.riskYieldShare * 100}
        liqY0Pct={resolved.liqY0 * 100}
        liqY100Pct={resolved.liqY100 * 100}
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
              hasHistoricalSeries: market.series.length >= 3,
              variant: "v2",
            }}
            modeled={{
              seniorApy: scenario.seniorApy,
              juniorApy: scenario.juniorApy,
              liquidityApy: scenario.liquidityApy,
              coverageLossLimit: model.explainer.coverage.coverageLossLimit,
              referenceSellShareOfSenior:
                model.explainer.liquidity.referenceSellShareOfSenior,
              boundarySellShareOfSenior:
                model.explainer.liquidity.boundarySellShareOfSenior,
            }}
            terms={{
              coveragePct: inputs.coveragePct,
              minLiquidityPct: inputs.liquidityPct,
              eclpBandWidthPct: inputs.bandPct,
              riskSharePct: resolved.riskYieldShare * 100,
              liqSharePct: resolved.liquidityYieldShare * 100,
              riskY0Pct: resolved.y0 * 100,
              riskY100Pct: resolved.y100 * 100,
              liqY0Pct: resolved.liqY0 * 100,
              liqY100Pct: resolved.liqY100 * 100,
              observationDays: inputs.observationDays,
              sourceApyPct: inputs.sourceApyPct,
              // The export was sending market defaults for these three rather
              // than what the page ran: toggling coverage restoration produced
              // a file saying the opposite, and the yield-share cap ignored the
              // ceiling clamp the engine actually applied.
              maintainCoverage: inputs.maintainCoverage,
              y100SharePct: resolved.y100 * 100,
              poolConcentration: model.pool.concentration,
              presetId: matchedPresetId,
            }}
          />
        </>
      ) : (
        <DayV2Button
          className="self-start"
          onClick={() => setMode("deploy")}
          size="md"
          variant="primary"
        >
          Review modeled deployment parameters
        </DayV2Button>
      )}

      <p className="max-w-[70ch] text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        Educational simulator only. No securities are offered through this page.
        Forward projections are mechanism simulations, not forecasts or
        announced terms. Historical backtests use the selected source path and
        are not predictions.
      </p>
    </main>
  );
}
