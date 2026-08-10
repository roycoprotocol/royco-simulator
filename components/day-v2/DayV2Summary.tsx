"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2Chart, { type DayV2Point } from "@/components/day-v2/DayV2Chart";
import DayV2Comparison, { DayV2ToneDot, type DayV2PositionBreakdown } from "@/components/day-v2/DayV2Comparison";
import DayV2Backtest from "@/components/day-v2/DayV2Backtest";
import DayV2Deploy from "@/components/day-v2/DayV2Deploy";
import DayV2Deployment from "@/components/day-v2/DayV2Deployment";
import DayV2ExitCost from "@/components/day-v2/DayV2ExitCost";
import DayV2LossWaterfall from "@/components/day-v2/DayV2LossWaterfall";
import DayV2Source from "@/components/day-v2/DayV2Source";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { stake100 } from "@/components/day-v2/format";
import { dayV2EffectiveShares } from "@/components/day-v2/terms";
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
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

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
  markets,
}: {
  initialMarket: DayMarket;
  markets: readonly DayMarket[];
}) {
  // How much of the mechanism to show. Simple answers "what would I earn, and
  // what would I lose". Advanced adds the history, the venue parameters and the
  // deployer's checklist, which are questions you only ask once you have an
  // answer to the first one.
  const [advanced, setAdvanced] = useState(false);
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
  const [coveragePct, setCoveragePct] = useState(defaults.coverage * 100);
  const [liquidityPct, setLiquidityPct] = useState(defaults.minLiquidity * 100);
  const [sourceApyPct, setSourceApyPct] = useState(defaults.sourceApy * 100);

  // Switching market adopts that market's own terms, so the sliders describe the
  // market on screen rather than carrying the previous one's numbers over.
  const adoptTerms = (next: DayMarket) => {
    setCoveragePct(next.defaults.coverage * 100);
    setLiquidityPct(next.defaults.minLiquidity * 100);
    setSourceApyPct(next.defaults.sourceApy * 100);
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
  const inputs = useDeferredValue({ coveragePct, liquidityPct, sourceApyPct });

  const model = useMemo(() => {
    const coverage = inputs.coveragePct / 100;
    const minLiquidity = inputs.liquidityPct / 100;
    // A tranche is paid in proportion to what it is asked to supply, so the
    // share moves with the requirement rather than staying pinned while the
    // slider moves. See `dayV2EffectiveShares` for why it scales from each
    // market's own default instead of applying the flat constant.
    const shares = dayV2EffectiveShares(defaults, coverage, minLiquidity);
    const effective = {
      ...defaults,
      coverage,
      minLiquidity,
      sourceApy: inputs.sourceApyPct / 100,
      riskYDM: { ...defaults.riskYDM, yTarget: shares.riskYieldShare },
      liqYDM: { ...defaults.liqYDM, yTarget: shares.liquidityYieldShare },
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
  }, [defaults, inputs]);
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
          aria-label="Detail level"
          className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] p-0.5"
          role="group"
        >
          {([["Simple", false], ["Advanced", true]] as const).map(([label, value]) => (
            <button
              aria-pressed={advanced === value}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
                advanced === value
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--secondary)]"
              }`}
              key={label}
              onClick={() => setAdvanced(value)}
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
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--secondary)]">
          This market earns{" "}
          <strong className="font-semibold text-[var(--foreground)]">{pct(source)}</strong> a year
          before it is split. Move the terms below and every figure updates.
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
          section where the price path actually happened. */}
      {advanced ? (
        <>
      <DayV2Backtest
        coveragePct={inputs.coveragePct}
        liquidityPct={inputs.liquidityPct}
        market={market}
        sourceApyPct={inputs.sourceApyPct}
      />

      {/* The deepest detail on the page, and the only section that asks the
          reader for input rather than giving them a number. It goes last. */}
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
          eclpBandWidthPct: defaults.eclpBandWidth * 100,
          riskSharePct: dayV2EffectiveShares(defaults, inputs.coveragePct / 100, inputs.liquidityPct / 100).riskYieldShare * 100,
          liqSharePct: dayV2EffectiveShares(defaults, inputs.coveragePct / 100, inputs.liquidityPct / 100).liquidityYieldShare * 100,
          observationDays: defaults.observationDays,
          sourceApyPct: inputs.sourceApyPct,
        }}
      />
        </>
      ) : (
        <button
          className="self-start rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3.5 py-2 text-[12px] font-semibold"
          onClick={() => setAdvanced(true)}
          type="button"
        >
          Show the history, venue terms, and deployment checklist
        </button>
      )}

      {/* Shown at both depths. A reader who stayed in Simple has still designed
          a market, and the ask is the same one. */}
      <DayV2Deploy
        coverage={inputs.coveragePct / 100}
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
