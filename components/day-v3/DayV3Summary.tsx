"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV3Chart, { type DayV3Point } from "@/components/day-v3/DayV3Chart";
import DayV3Comparison, {
  DAY_V3_TONE_DOT,
  type DayV3PositionBreakdown,
} from "@/components/day-v3/DayV3Comparison";
import DayV3Backtest from "@/components/day-v3/DayV3Backtest";
import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3CapitalStack from "@/components/day-v3/DayV3CapitalStack";
import DayV3Deployment from "@/components/day-v3/DayV3Deployment";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3Goals, {
  DayV3OperationalFacts,
  type DayV3ExitView,
  type DayV3ProtectedExitView,
  type DayV3ProtectionView,
  type DayV3RecoveryView,
} from "@/components/day-v3/DayV3Goals";
import DayV3LossWaterfall from "@/components/day-v3/DayV3LossWaterfall";
import DayV3MarketSelect from "@/components/day-v3/DayV3MarketSelect";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import DayV3Source from "@/components/day-v3/DayV3Source";
import { useDayV3PoolDesign } from "@/components/day-v3/useDayV3PoolDesign";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dayV3EffectiveShares } from "@/components/day-v3/terms";
import {
  buildDayV3Query,
  dayV3MinimumLiquidityForPoolFunding,
  deriveDayV3ProtectedExitBonus,
  normalizeDayV3Defaults,
  recommendDayV3Coverage,
  recommendDayV3ProtectedExitTrigger,
  runDayV3RecoveryAnalysis,
  runDayV3ProtectedExitScenarios,
  type DayV3UrlState,
} from "@/lib/day-v3";
import type {
  DayV3Goals as DayV3ResolvedGoals,
  DayV3Overrides,
} from "@/lib/day-v3/types";
import { buildDayYieldDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import { dayPoolSeniorWeight } from "@/lib/day-simulator-template/capital-sizing";
import { DAY_ECLP_SIMULATION_LAMBDA } from "@/lib/day/engine/engine";
import type { EclpParams } from "@/lib/day/engine/eclp";
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
type DayV3Mode = "simulate" | "deploy";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const DAY_TARGET_UTILIZATION = 0.9;
const CUSTOM_SOURCE_ID = "custom";
const clampDeployDiscount = (value: number) =>
  Math.min(5, Math.max(0.5, value));
const CUSTOM_SOURCE_MARKET = buildDayYieldDraftMarket({
  label: "Custom yield source",
  sourceApy: 0.12,
});
const EMPTY_DAY_V3_OVERRIDES: DayV3Overrides = {
  coveragePct: null,
  minimumLiquidityPct: null,
  maximumDiscountPct: null,
  depthAtNav: null,
  maximumPremiumPct: null,
  protectedExitThresholdPct: null,
  protectedExitBonusPct: null,
  poolCapitalPer100: null,
};

export default function DayV3Summary({
  initialMarket,
  initialState,
  markets,
}: {
  initialMarket: DayMarket;
  initialState?: DayV3UrlState;
  markets: readonly DayMarket[];
}) {
  // Anything the link did not carry falls back to the market's own default, so
  // a partial or hand-edited link still describes a real market.
  const linked = initialState;
  const [manualOverrides, setManualOverrides] = useState<DayV3Overrides>({
    ...EMPTY_DAY_V3_OVERRIDES,
    ...linked?.overrides,
  });
  const hasManualOverrides = Object.values(manualOverrides).some(
    (value) => value !== null,
  );
  // How much of the mechanism to show. Simple answers "what would I earn, and
  // what would I lose", and stops there. Deploy is the other job: someone who
  // has decided and now has to set every parameter a real market takes. The two
  // share one model, so the figures never disagree between them.
  const [mode, setMode] = useState<DayV3Mode>(linked?.mode ?? "simulate");
  const deploying = mode === "deploy";
  const [customSource, setCustomSource] = useState(
    linked?.market === CUSTOM_SOURCE_ID ||
      !markets.some((candidate) => candidate.id === linked?.market),
  );
  const [marketId, setMarketId] = useState(initialMarket.id);
  // An imported source outranks the registry selection while it is loaded, so
  // every section below runs on the reader's own history.
  const [draftMarket, setDraftMarket] = useState<DayMarket | null>(null);
  const selectedMarket =
    markets.find((candidate) => candidate.id === marketId) ?? initialMarket;
  // Importing history attaches a path to the Custom design; it must not replace
  // that design's market defaults. The current sliders remain the source of
  // truth and the imported draft contributes only identity, provenance and the
  // dated series.
  const market = useMemo(
    () =>
      draftMarket
        ? { ...draftMarket, defaults: CUSTOM_SOURCE_MARKET.defaults }
        : customSource
          ? CUSTOM_SOURCE_MARKET
          : selectedMarket,
    [customSource, draftMarket, selectedMarket],
  );
  const defaults = useMemo(
    () => normalizeDayV3Defaults(market.defaults),
    [market.defaults],
  );
  // A few markets report in their own asset rather than dollars. Declared on
  // the market, so it follows an imported draft too.
  const returnUnit = customSource
    ? "units"
    : (market.customization.backtestDisplay?.returnUnit ?? "USD");
  const [sourceApyPct, setSourceApyPct] = useState<number | null>(
    linked?.sourceApyPct ?? (customSource ? null : defaults.sourceApy * 100),
  );
  const [protectedDrawdownPct, setProtectedDrawdownPct] = useState<
    number | null
  >(linked?.protectedDrawdownPct ?? null);
  const [recoveryDaysInput, setRecoveryDaysInput] = useState<number | null>(
    linked?.recoveryDays ?? null,
  );
  const [recoveryMode, setRecoveryMode] = useState<"none" | "window" | null>(
    linked?.recoveryDays === null || linked?.recoveryDays === undefined
      ? null
      : linked.recoveryDays === 0
        ? "none"
        : "window",
  );
  const [immediateExitSharePct, setImmediateExitSharePct] = useState<
    number | null
  >(linked?.immediateExitSharePct ?? null);
  const [minimumProceedsPer100, setMinimumProceedsPer100] = useState<
    number | null
  >(linked?.minimumProceedsPer100 ?? null);
  const [redemptionDays, setRedemptionDays] = useState<number | null>(
    linked?.redemptionDays ?? null,
  );
  const [navUpdateDays, setNavUpdateDays] = useState<number | null>(
    linked?.navUpdateDays ?? null,
  );
  const [deploymentTarget, setDeploymentTarget] = useState(
    linked?.target ?? null,
  );
  const [incentiveBudgetPer100, setIncentiveBudgetPer100] = useState<
    number | null
  >(manualOverrides.protectedExitBonusPct);
  const [protectedExitThresholdOverride, setProtectedExitThresholdOverride] =
    useState<number | null>(manualOverrides.protectedExitThresholdPct);
  // The accountant receives zero while the issuer has not made a recovery-time
  // decision. The unresolved state stays visible in the goal panel and export.
  const [observationDays, setObservationDays] = useState(
    linked?.recoveryDays ?? 0,
  );
  const [bandPct, setBandPct] = useState(
    clampDeployDiscount(
      manualOverrides.maximumDiscountPct ?? defaults.eclpBandWidth * 100,
    ),
  );
  const [maintainCoverage, setMaintainCoverage] = useState(false);
  // Null means "follow the requirement", which is the rule in `terms.ts`. A
  // number means the deployer has priced the tranche themselves.
  const [riskShareOverride, setRiskShareOverride] = useState<number | null>(
    null,
  );
  const [liqShareOverride, setLiqShareOverride] = useState<number | null>(null);
  // The other two anchors of the yield-share curve. Null means "as the market
  // ships it", which is what every registry market wants until someone is
  // actually designing a curve.
  const [y0Override, setY0Override] = useState<number | null>(null);
  const [y100Override, setY100Override] = useState<number | null>(null);
  // The liquidity side has a curve of its own, keyed on a different
  // utilization. Only its target anchor was ever settable here.
  const [liqY0Override, setLiqY0Override] = useState<number | null>(null);
  const [liqY100Override, setLiqY100Override] = useState<number | null>(null);
  const modeledSourceApyPct = sourceApyPct ?? 0;
  const simulationDefaults = useMemo(
    () => ({
      ...defaults,
      sourceApy: modeledSourceApyPct / 100,
      // V3 does not ask an issuer to forecast exit-asset yield or annual pool
      // turnover, so neither is silently inherited from a market template.
      // The live template fee still prices canonical execution quotes; with no
      // volume forecast it contributes no speculative fee income to SLP APY.
      stableYield: 0,
      poolTurnoverPerYear: 0,
    }),
    [defaults, modeledSourceApyPct],
  );

  // Switching market adopts that market's own terms, so the sliders describe the
  // market on screen rather than carrying the previous one's numbers over.
  const adoptTerms = (next: DayMarket) => {
    setSourceApyPct(next.defaults.sourceApy * 100);
    setProtectedDrawdownPct(null);
    setRecoveryDaysInput(null);
    setRecoveryMode(null);
    setImmediateExitSharePct(null);
    setMinimumProceedsPer100(null);
    setRedemptionDays(null);
    setNavUpdateDays(null);
    setIncentiveBudgetPer100(null);
    setProtectedExitThresholdOverride(null);
    setManualOverrides(EMPTY_DAY_V3_OVERRIDES);
    setObservationDays(0);
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
    if (nextCustom) setSourceApyPct(null);
  };

  const clearManualOverrides = () => {
    setManualOverrides(EMPTY_DAY_V3_OVERRIDES);
    setProtectedExitThresholdOverride(null);
    setIncentiveBudgetPer100(null);
  };

  const protectionRecommendation = useMemo(
    () =>
      protectedDrawdownPct === null
        ? null
        : recommendDayV3Coverage(simulationDefaults, { protectedDrawdownPct }),
    [protectedDrawdownPct, simulationDefaults],
  );
  const coveragePct =
    manualOverrides.coveragePct ??
    (protectionRecommendation?.status === "recommended"
      ? (protectionRecommendation.coverage.value ?? 0)
      : 0);

  const chooseRecoveryMode = (next: "none" | "window") => {
    setRecoveryMode(next);
    if (next === "none") {
      setRecoveryDaysInput(0);
      setObservationDays(0);
      return;
    }
    setRecoveryDaysInput(null);
    setObservationDays(0);
  };

  const changeRecoveryDays = (next: number | null) => {
    const valid =
      next === null ? null : Math.min(194, Math.max(0, Math.round(next)));
    setRecoveryDaysInput(valid);
    setObservationDays(valid ?? 0);
  };

  const poolDesignGoals = useMemo<DayV3ResolvedGoals | null>(() => {
    if (
      protectedDrawdownPct === null ||
      recoveryDaysInput === null ||
      immediateExitSharePct === null ||
      minimumProceedsPer100 === null ||
      redemptionDays === null ||
      navUpdateDays === null ||
      deploymentTarget === null
    ) {
      return null;
    }
    return {
      protectedDrawdownPct,
      recoveryDays: recoveryDaysInput,
      immediateExitSharePct,
      minimumProceedsPer100,
      redemptionDays,
      navUpdateDays,
      target: deploymentTarget,
    };
  }, [
    deploymentTarget,
    immediateExitSharePct,
    minimumProceedsPer100,
    navUpdateDays,
    protectedDrawdownPct,
    recoveryDaysInput,
    redemptionDays,
  ]);
  const poolDesign = useDayV3PoolDesign(poolDesignGoals);
  const hasPoolOverride = [
    manualOverrides.minimumLiquidityPct,
    manualOverrides.maximumDiscountPct,
    manualOverrides.depthAtNav,
    manualOverrides.maximumPremiumPct,
    manualOverrides.poolCapitalPer100,
  ].some((value) => value !== null);
  const canonicalPoolDesign =
    poolDesign.design.status === "resolved" && !hasPoolOverride
      ? poolDesign.design.result
      : null;
  const canonicalPoolRecommendation =
    canonicalPoolDesign?.recommendation ?? null;
  const canonicalEngineOverrides = useMemo<{
    swapFeeBps: number;
    eclpParams: EclpParams;
  } | null>(() => {
    if (!canonicalPoolDesign) return null;
    const raw = canonicalPoolDesign.recommendation.eclp.params;
    const fromWad = (value: string) => Number(value) / 1e18;
    const params: EclpParams = {
      alpha: fromWad(raw.alpha),
      beta: fromWad(raw.beta),
      c: fromWad(raw.c),
      s: fromWad(raw.s),
      lambda: fromWad(raw.lambda),
    };
    if (
      !Object.values(params).every(Number.isFinite) ||
      params.alpha <= 0 ||
      params.beta <= params.alpha ||
      params.lambda <= 0
    ) {
      return null;
    }
    return {
      swapFeeBps: canonicalPoolDesign.policy.swapFeeBps,
      eclpParams: params,
    };
  }, [canonicalPoolDesign]);
  const liquidityRecommendation = useMemo(
    () =>
      canonicalPoolRecommendation
        ? dayV3MinimumLiquidityForPoolFunding(defaults, {
            poolFundingPer100Senior:
              canonicalPoolRecommendation.outcomes
                .requiredPoolFundingPer100Senior,
            coveragePct,
          })
        : null,
    [canonicalPoolRecommendation, coveragePct, defaults],
  );
  const liquidityPct =
    manualOverrides.minimumLiquidityPct ??
    (liquidityRecommendation?.status === "recommended"
      ? (liquidityRecommendation.minimumLiquidity.value ?? 0)
      : 0);
  const effectiveBandPct =
    manualOverrides.maximumDiscountPct ??
    (canonicalPoolRecommendation
      ? canonicalPoolRecommendation.fields.maximumDiscountBps.value / 100
      : bandPct);

  // Keeps the controls responsive while the engine re-runs, the same pattern the
  // main simulator uses after measuring input lag.
  const inputs = useDeferredValue({
    coveragePct,
    liquidityPct,
    sourceApyPct: modeledSourceApyPct,
    observationDays,
    bandPct: effectiveBandPct,
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
    const derived = dayV3EffectiveShares(defaults, coverage, minLiquidity);
    // A requirement of zero pays zero, and that has to hold for a hand-priced
    // share too. `dayV3EffectiveShares` zeroes the derived path, but the
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

  const v3BacktestTerms = useMemo(
    () => ({
      coveragePct: inputs.coveragePct,
      minLiquidityPct: inputs.liquidityPct,
      eclpBandWidthPct: inputs.bandPct,
      riskSharePct: resolved.riskYieldShare * 100,
      riskY0Pct: resolved.y0 * 100,
      riskY100Pct: resolved.y100 * 100,
      liqSharePct: resolved.liquidityYieldShare * 100,
      liqY0Pct: resolved.liqY0 * 100,
      liqY100Pct: resolved.liqY100 * 100,
    }),
    [inputs, resolved],
  );

  const recoveryAnalysis = useMemo(
    () =>
      runDayV3RecoveryAnalysis({
        defaults: simulationDefaults,
        series: market.series,
        terms: v3BacktestTerms,
        omitInitialZeroReturnPeriod:
          market.customization.forwardTest?.omitInitialZeroReturnPeriod ===
          true,
        monthlyBaselineDate: market.series[0]?.date,
      }),
    [market, simulationDefaults, v3BacktestTerms],
  );

  const protectedExitTrigger = useMemo(
    () =>
      recoveryDaysInput === null
        ? null
        : recommendDayV3ProtectedExitTrigger({
            defaults: simulationDefaults,
            series: market.series,
            terms: v3BacktestTerms,
            recoveryDays: recoveryDaysInput,
          }),
    [market.series, recoveryDaysInput, simulationDefaults, v3BacktestTerms],
  );
  const protectedExitThresholdPct =
    protectedExitThresholdOverride ??
    protectedExitTrigger?.trigger.value ??
    null;
  const bonusBudget = incentiveBudgetPer100;
  const protectedExitBonus = useMemo(
    () => deriveDayV3ProtectedExitBonus(bonusBudget, protectedExitThresholdPct),
    [bonusBudget, protectedExitThresholdPct],
  );
  const protectedExitScenarios = useMemo(
    () =>
      protectedExitThresholdPct !== null &&
      protectedExitBonus.status === "ready" &&
      protectedExitBonus.bonus.value !== null &&
      recoveryDaysInput !== null &&
      coveragePct > 0
        ? runDayV3ProtectedExitScenarios({
            defaults: simulationDefaults,
            coveragePct,
            protectedExitThresholdPct,
            bonusPct: protectedExitBonus.bonus.value,
            recoveryDays: recoveryDaysInput,
            minimumLiquidityPct: liquidityPct,
          })
        : null,
    [
      coveragePct,
      liquidityPct,
      protectedExitBonus,
      protectedExitThresholdPct,
      recoveryDaysInput,
      simulationDefaults,
    ],
  );
  const protectedExitComparisons = useMemo(() => {
    if (
      protectedExitThresholdPct !== null ||
      recoveryDaysInput === null ||
      coveragePct <= 0
    ) {
      return [];
    }
    const thresholds = [
      ...new Set(
        [0.25, 0.5, 0.75].map((share) =>
          Math.max(0.01, Math.floor(coveragePct * share * 100) / 100),
        ),
      ),
    ].filter((threshold) => threshold < coveragePct);
    return thresholds.flatMap((thresholdPct) => {
      const result = runDayV3ProtectedExitScenarios({
        defaults: simulationDefaults,
        coveragePct,
        protectedExitThresholdPct: thresholdPct,
        bonusPct: 0,
        recoveryDays: recoveryDaysInput,
        minimumLiquidityPct: liquidityPct,
      });
      if (result.status !== "ready") return [];
      const full = result.scenarios.find(
        (scenario) => scenario.redeemedSeniorPct === 100,
      );
      return full
        ? [
            {
              thresholdPct,
              activationStressPct: result.activationStressPct,
              payoutPer100: full.payoutPer100,
              juniorUsedPer100: full.juniorConsumedPer100,
              remainingCoveragePct: full.remainingCoveragePct,
            },
          ]
        : [];
    });
  }, [
    coveragePct,
    liquidityPct,
    protectedExitThresholdPct,
    recoveryDaysInput,
    simulationDefaults,
  ]);

  const model = useMemo(() => {
    const { coverage, minLiquidity } = resolved;
    const effective = {
      ...simulationDefaults,
      coverage,
      minLiquidity,
      sourceApy: inputs.sourceApyPct / 100,
      observationDays: inputs.observationDays,
      eclpBandWidth: inputs.bandPct / 100,
      maintainCoverage: inputs.maintainCoverage,
      riskYDM: {
        ...simulationDefaults.riskYDM,
        y0: resolved.y0,
        yTarget: resolved.riskYieldShare,
        y100: resolved.y100,
      },
      liqYDM: {
        ...simulationDefaults.liqYDM,
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
    const noPremiums = runDayTargetScenario(
      {
        ...effective,
        riskYDM: zeroCurve,
        liqYDM: zeroCurve,
      },
      {},
      canonicalEngineOverrides ?? {},
    );
    const riskOnly = runDayTargetScenario(
      {
        ...effective,
        liqYDM: zeroCurve,
      },
      {},
      canonicalEngineOverrides ?? {},
    );
    // Held rather than rebuilt, so the pool economics quoted to the reader are
    // the ones this run used and cannot drift from them.
    const cfg = {
      ...buildDayMarketConfig(effective, terms),
      ...(canonicalEngineOverrides ?? {}),
    };
    // Hoisted out of the explainer call so the capital stack the issuer is asked
    // to raise and the rates they are quoted are the same market, seeded once.
    const balances = buildDayInitialBalances(effective, terms);
    return {
      scenario: runDayTargetScenario(
        effective,
        {},
        canonicalEngineOverrides ?? {},
      ),
      noPremiums,
      riskOnly,
      balances,
      pool: {
        stableYield: cfg.stableYield,
        swapFeeBps: cfg.swapFeeBps,
        turnoverPerYear: cfg.poolTurnoverPerYear,
        concentration:
          canonicalEngineOverrides?.eclpParams.lambda ??
          DAY_ECLP_SIMULATION_LAMBDA,
        // Measured off this run's own config, so the split the capital stack
        // reports is the split the engine seeded.
        seniorWeight: dayPoolSeniorWeight(cfg),
      },
      explainer: buildDayExplainerMetrics(cfg, balances),
    };
  }, [canonicalEngineOverrides, inputs, resolved, simulationDefaults]);
  const scenario = model.scenario;

  const chartData = useMemo<DayV3Point[]>(() => {
    const grow = (apy: number, months: number) =>
      100 * (1 + apy) ** (months / 12);
    return Array.from({ length: 13 }, (_, month) => ({
      month,
      senior: grow(scenario.seniorApy, month),
      junior: grow(scenario.juniorApy, month),
      liquidity: grow(scenario.liquidityApy, month),
    }));
  }, [scenario]);

  const query = buildDayV3Query({
    market: customSource ? CUSTOM_SOURCE_ID : marketId,
    mode,
    sourceApyPct,
    protectedDrawdownPct,
    recoveryDays: recoveryDaysInput,
    immediateExitSharePct,
    minimumProceedsPer100,
    redemptionDays,
    navUpdateDays,
    target: deploymentTarget,
    overrides: {
      coveragePct: manualOverrides.coveragePct,
      minimumLiquidityPct: manualOverrides.minimumLiquidityPct,
      maximumDiscountPct: manualOverrides.maximumDiscountPct,
      depthAtNav: manualOverrides.depthAtNav,
      maximumPremiumPct: manualOverrides.maximumPremiumPct,
      protectedExitThresholdPct: protectedExitThresholdOverride,
      protectedExitBonusPct: incentiveBudgetPer100,
      poolCapitalPer100: manualOverrides.poolCapitalPer100,
    },
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

  const curveOverridden =
    riskShareOverride !== null ||
    liqShareOverride !== null ||
    y0Override !== null ||
    y100Override !== null ||
    liqY0Override !== null ||
    liqY100Override !== null;
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

  const protectionView: DayV3ProtectionView =
    manualOverrides.coveragePct !== null
      ? {
          coveragePct: manualOverrides.coveragePct,
          juniorPer100: model.balances.jt,
          juniorApy:
            sourceApyPct === null ? null : model.scenario.juniorApy * 100,
          status: "unresolved",
          message:
            "A manual Minimum Coverage override is active. It is modeled here but cannot be called a recommendation until it is revalidated against the protection goal.",
        }
      : protectedDrawdownPct === null || protectionRecommendation === null
        ? {
            coveragePct: null,
            juniorPer100: null,
            juniorApy: null,
            status: "missing-goal",
            message:
              "Choose a drawdown to calculate the smallest coverage requirement through the shared accountant.",
          }
        : protectionRecommendation.status === "recommended"
          ? {
              coveragePct: protectionRecommendation.coverage.value,
              juniorPer100:
                protectionRecommendation.capital?.juniorPer100 ?? null,
              juniorApy:
                sourceApyPct === null ||
                protectionRecommendation.projectedApy.junior === null
                  ? null
                  : protectionRecommendation.projectedApy.junior * 100,
              status: "recommended",
              message: protectionRecommendation.reason,
            }
          : {
              coveragePct: null,
              juniorPer100: null,
              juniorApy: null,
              status: "infeasible",
              message: protectionRecommendation.reason,
            };

  const exitGoalsComplete = poolDesignGoals !== null;
  const exitOverrides = manualOverrides;
  const canonicalExit = canonicalPoolDesign;
  const canonicalExitRecommendation = canonicalExit?.recommendation ?? null;
  const canonicalOutcomes = canonicalExitRecommendation?.outcomes ?? null;
  const liquidityResolved =
    liquidityRecommendation?.status === "recommended" &&
    liquidityRecommendation.minimumLiquidity.value !== null;
  const exitStatus: DayV3ExitView["status"] = !exitGoalsComplete
    ? "missing-goal"
    : hasPoolOverride
      ? "unresolved"
      : poolDesign.design.status === "resolving"
        ? "resolving"
        : poolDesign.design.status === "infeasible"
          ? "infeasible"
          : poolDesign.design.status === "resolved" && liquidityResolved
            ? "recommended"
            : "unresolved";
  const exitView: DayV3ExitView = {
    status: exitStatus,
    message: !exitGoalsComplete
      ? "Complete protection, operating facts, both exit goals, and a deployment target to resolve a pool design."
      : hasPoolOverride
        ? "This link contains manual pool overrides. Outcomes are withheld until the canonical service revalidates those exact fields."
        : poolDesign.design.status === "resolved" && !liquidityResolved
          ? (liquidityRecommendation?.reason ??
            "The canonical pool was resolved, but its Minimum Liquidity mapping remains unresolved.")
          : poolDesign.design.message,
    sellablePer100: canonicalOutcomes?.amountSellablePer100Senior ?? null,
    proceeds: canonicalOutcomes?.proceedsForPromisedExit ?? null,
    lowestPayoutPer100: canonicalOutcomes?.lowestModeledPayoutPer100 ?? null,
    slpPer100: canonicalOutcomes?.requiredPoolFundingPer100Senior ?? null,
    restockPoint: canonicalOutcomes?.restockEconomicFromSoldPct ?? null,
    minimumLiquidityPct:
      exitOverrides?.minimumLiquidityPct ??
      liquidityRecommendation?.minimumLiquidity.value ??
      null,
    maximumDiscountPct:
      exitOverrides?.maximumDiscountPct ??
      (canonicalExitRecommendation
        ? canonicalExitRecommendation.fields.maximumDiscountBps.value / 100
        : null),
    lambda:
      exitOverrides?.depthAtNav ??
      canonicalExitRecommendation?.fields.depthAtNavLambda.value ??
      null,
    maximumPremiumBps:
      exitOverrides?.maximumPremiumPct !== null &&
      exitOverrides?.maximumPremiumPct !== undefined
        ? exitOverrides.maximumPremiumPct * 100
        : (canonicalExitRecommendation?.fields.maximumPremiumBps.value ?? null),
    exitAssetSeedPct: canonicalOutcomes?.exitAssetShareAtNavPct ?? null,
    seniorSeedPct: canonicalOutcomes?.seniorShareAtNavPct ?? null,
    swapFeeBps: canonicalExit?.policy.swapFeeBps ?? null,
    feeSource: canonicalExit
      ? `${canonicalExit.policy.templateName} on ${canonicalExit.policy.chainName}, block ${canonicalExit.policy.blockNumber} · ${canonicalExit.policy.resolvedAt}`
      : null,
  };
  const protectedExitView: DayV3ProtectedExitView = {
    thresholdPct: protectedExitThresholdPct,
    bonusPct: protectedExitBonus.bonus.value,
    status:
      protectedExitThresholdPct !== null &&
      protectedExitBonus.status === "ready" &&
      protectedExitScenarios?.status === "ready"
        ? "scenario-ready"
        : "unresolved",
    message: [
      protectedExitThresholdOverride !== null
        ? "The trigger is a manual override and must be revalidated by deployment."
        : protectedExitTrigger?.reason,
      protectedExitBonus.reason,
      protectedExitScenarios?.reason,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" "),
    activationStressPct:
      protectedExitScenarios?.status === "ready"
        ? protectedExitScenarios.activationStressPct
        : null,
    comparisons: protectedExitComparisons,
    scenarios:
      protectedExitScenarios?.status === "ready"
        ? protectedExitScenarios.scenarios.map((scenario) => ({
            redeemedPct: scenario.redeemedSeniorPct,
            payoutPer100: scenario.payoutPer100,
            bonusPaidPer100: scenario.bonusPaidPer100,
            bonusPaidPctOfRedemption: scenario.bonusPaidPctOfRedemption,
            onChainBonusCapPer100: scenario.onChainBonusCapPer100,
            onChainBonusCapPctOfRedemption:
              scenario.onChainBonusCapPctOfRedemption,
            juniorUsedPer100: scenario.juniorConsumedPer100,
            remainingCoveragePct: scenario.remainingCoveragePct,
            capped: scenario.wasCapped,
          }))
        : [],
  };
  const recoveryView: DayV3RecoveryView = {
    status: recoveryAnalysis.status,
    suggestedDays: recoveryAnalysis.field.value,
    recoveredEpisodeCount: recoveryAnalysis.recoveredEpisodeCount,
    observedDays: recoveryAnalysis.episodes
      .filter((episode) => episode.recovered && episode.days !== null)
      .map((episode) => episode.days as number),
    message: recoveryAnalysis.field.evidence.join(" "),
  };
  const deploymentPanel = (
    <DayV3Deployment
      exit={exitView}
      goals={{
        protectedDrawdownPct,
        recoveryDays: recoveryDaysInput,
        immediateExitSharePct,
        minimumProceedsPer100,
        redemptionDays,
        navUpdateDays,
        target: deploymentTarget,
      }}
      market={{
        id: market.id,
        name: market.identity.marketName,
        asset: market.identity.displayAssetName,
      }}
      poolDesign={canonicalExit}
      protectedExit={protectedExitView}
      protection={protectionView}
      sourceApyPct={sourceApyPct}
    />
  );

  return (
    // Capped rather than full-bleed. Past about 1400px the cards stop gaining
    // anything and the prose lines just get harder to track back to.
    <main className="royco-v3 mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="grid grid-cols-1 items-center gap-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-6 shadow-[0_8px_28px_-20px_rgba(23,25,31,0.45)] sm:px-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tertiary)]">
            Royco Day · Goal-driven market design
          </span>
          <h1 className="text-balance text-[clamp(30px,3.5vw,48px)] font-semibold leading-[1.02] tracking-[-0.03em]">
            Start with the promise. Derive the parameters.
          </h1>
          <p className="max-w-[62ch] text-[14px] leading-relaxed text-[var(--secondary)]">
            Tell us how much downside Senior should withstand and what an exit
            should deliver. V3 turns those outcomes into a market design per 100
            Senior.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]">
            {deploying
              ? "Finalize a market design"
              : "Explore how the protocol works"}
          </span>
          <DayV3SegmentedControl
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
        aria-labelledby="day-v3-inputs-heading"
        className="flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4 shadow-[0_6px_22px_-14px_rgba(23,25,31,0.4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              id="day-v3-inputs-heading"
            >
              Design goals
            </h2>
            <p className="text-[11px] text-[var(--tertiary)]">
              Describe the issuer promise; deployment terms are derived below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasManualOverrides ? (
              <>
                <Badge tone="caution">manual overrides active</Badge>
                <DayV3Button
                  onClick={clearManualOverrides}
                  size="sm"
                  variant="secondary"
                >
                  Clear overrides
                </DayV3Button>
              </>
            ) : null}
            {draftMarket ? (
              <Badge tone="caution">unverified import</Badge>
            ) : null}
          </div>
        </div>

        <DayV3Group
          docs="tranching"
          docsLabel="How tranching works"
          index={1}
          subtitle="Enter a custom yield or choose a listed source"
          title="What you are modeling"
        >
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <DayV3SegmentedControl
              ariaLabel="Yield source type"
              onValueChange={(value) => selectSourceType(value === "custom")}
              options={[
                { label: "Custom yield", value: "custom" },
                { label: "Listed source", value: "listed" },
              ]}
              value={customSource ? "custom" : "listed"}
            />

            {customSource ? (
              <label className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
                <span className="text-[12.5px] font-semibold leading-snug">
                  What net annual yield should the custom source model?
                </span>
                <span className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2 focus-within:border-[var(--foreground)]">
                  <input
                    className="min-w-0 flex-1 bg-transparent font-mono text-[20px] font-bold leading-none tabular-nums outline-none placeholder:font-sans placeholder:text-[13px] placeholder:font-normal placeholder:text-[var(--tertiary)]"
                    inputMode="decimal"
                    max={30}
                    min={0}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === "") {
                        setSourceApyPct(null);
                        return;
                      }
                      const next = Number(raw);
                      setSourceApyPct(
                        Number.isFinite(next) && next >= 0 && next <= 30
                          ? next
                          : null,
                      );
                    }}
                    placeholder="Enter yield"
                    step={0.1}
                    type="number"
                    value={sourceApyPct ?? ""}
                  />
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--tertiary)]">
                    % a year
                  </span>
                </span>
                <span className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                  No yield is assumed for a custom source. Enter its net annual
                  rate to enable return projections and deployment handoff.
                </span>
              </label>
            ) : (
              <DayV3MarketSelect
                markets={markets}
                onChange={selectMarket}
                value={marketId}
              />
            )}
          </div>
          {customSource ? (
            <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-[12px] font-semibold">
                  Add price history{" "}
                  <span className="font-normal text-[var(--tertiary)]">
                    · optional
                  </span>
                </strong>
                <span className="text-[10.5px] text-[var(--tertiary)]">
                  Used for recovery evidence and historical backtesting
                </span>
              </div>
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
                  <DayV3Button
                    className="text-[11.5px]"
                    onClick={() => setDraftMarket(null)}
                    size="inline"
                    variant="link"
                  >
                    Remove
                  </DayV3Button>
                </div>
              ) : null}
              <DayV3Source
                onImport={(next) => {
                  setCustomSource(true);
                  setDraftMarket(next);
                }}
              />
            </div>
          ) : null}
          <DayV3OperationalFacts
            navUpdateDays={navUpdateDays}
            onNavUpdateDays={setNavUpdateDays}
            onRedemptionDays={setRedemptionDays}
            redemptionDays={redemptionDays}
          />
        </DayV3Group>

        <DayV3Goals
          drawdownPct={protectedDrawdownPct}
          exit={exitView}
          exitSharePct={immediateExitSharePct}
          incentiveBudgetPer100={incentiveBudgetPer100}
          minimumProceedsPer100={minimumProceedsPer100}
          onDrawdownPct={setProtectedDrawdownPct}
          onExitSharePct={setImmediateExitSharePct}
          onIncentiveBudgetPer100={setIncentiveBudgetPer100}
          onMinimumProceedsPer100={setMinimumProceedsPer100}
          onProtectedExitThreshold={setProtectedExitThresholdOverride}
          onRecoveryDays={changeRecoveryDays}
          onRecoveryMode={chooseRecoveryMode}
          onTarget={setDeploymentTarget}
          protectedExit={protectedExitView}
          protectedExitThresholdOverride={protectedExitThresholdOverride}
          protection={protectionView}
          recovery={recoveryView}
          recoveryDays={recoveryDaysInput}
          recoveryMode={recoveryMode}
          selectedTarget={deploymentTarget}
          targetMessage={poolDesign.inventory.message}
          targets={poolDesign.inventory.targets}
        />
      </section>

      {deploying ? deploymentPanel : null}

      {/* The first thing the inputs answer, and the first thing that is not an
          input. It was unlabelled, which left no visible line between the cream
          controls above and the results below. */}
      <div className="-mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
          id="day-v3-positions-heading"
        >
          What each position earns at these terms
        </h2>
        <DayV3DocsLink label="Yield split" topic="yieldSplit" />
      </div>
      {/* Three peers, scanned across: identical slots, so the eye compares the
          rate first and reads detail only if it wants to. */}
      <section
        aria-labelledby="day-v3-positions-heading"
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
                  ? DAY_V3_TONE_DOT[position.tone]
                  : `color-mix(in srgb, ${DAY_V3_TONE_DOT[position.tone]} 30%, transparent)`,
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
                  {sourceApyPct === null
                    ? "—"
                    : position.funded
                      ? pct(position.apy)
                      : "0.0%"}
                </span>
                <span className="text-[11px] text-[var(--tertiary)]">
                  {sourceApyPct === null ? "enter source yield" : "a year"}
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
      <DayV3CapitalStack
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
          id="day-v3-risk-heading"
        >
          What can go wrong
        </h2>
        <DayV3DocsLink label="Protected exit" topic="protectedExit" />
      </div>
      {/* Losing money and getting out are the two ways a position goes wrong,
          and the projection above deliberately contains neither. They read
          better next to each other than either does alone. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <DayV3LossWaterfall
          metrics={model.explainer.coverage}
          unit={returnUnit}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">Exit cost and depth</CardTitle>
            <CardDescription>
              Resolved from the issuer’s exit promise against the selected live
              deployment template.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <span className="font-mono text-[28px] font-bold leading-none tabular-nums">
              {exitView.status === "recommended" &&
              exitView.sellablePer100 !== null
                ? `${exitView.sellablePer100.toFixed(2)} Senior / 100`
                : exitView.status === "resolving"
                  ? "Resolving…"
                  : exitView.status === "infeasible"
                    ? "Promise is infeasible"
                    : "Unresolved"}
            </span>
            <p className="max-w-[60ch] text-[12px] leading-relaxed text-[var(--secondary)]">
              {exitView.status === "recommended"
                ? `${exitView.proceeds?.toFixed(2) ?? "—"} proceeds for the promised sale; lowest modeled payout ${exitView.lowestPayoutPer100?.toFixed(2) ?? "—"} per 100. Requires ${exitView.slpPer100?.toFixed(2) ?? "—"} SLP per 100 Senior.`
                : exitView.message}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Everything above is a projection at the stated terms. This is the one
          section where the price path actually happened. It belongs to the
          simulate job: it answers "what would this have done", not "what do I
          set". */}
      <h2
        className="-mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
        id="day-v3-pays-heading"
      >
        Where the rates come from
      </h2>
      {/* What the terms pay, from two angles: the shape over a year, and the
          split that produces it. Neither needs the full width, and read side by
          side the reader can check the curve against the table it comes from.
          Equal columns, like the pair above it and like the hero: one grid used
          consistently is what makes the page read as a system rather than as a
          stack of differently proportioned slabs. */}
      {sourceApyPct === null ? (
        <Card weight="quiet">
          <CardHeader>
            <CardTitle>Source yield required</CardTitle>
            <CardDescription>
              Enter the custom source&apos;s net annual yield to calculate
              return projections and their split across Senior, Junior, and SLP.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <Card weight="quiet">
            <CardHeader>
              <CardTitle>Growth over a year</CardTitle>
              <CardDescription>
                Compounded from the modeled annual rates above.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DayV3Chart data={chartData} unit={returnUnit} />
            </CardContent>
          </Card>

          <DayV3Comparison
            poolEconomics={{
              stableYield: model.pool.stableYield,
              swapFeeBps: canonicalPoolDesign?.policy.swapFeeBps ?? null,
              turnoverPerYear: model.pool.turnoverPerYear,
            }}
            positions={positions as DayV3PositionBreakdown[]}
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
      )}

      <h2
        className="-mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]"
        id="day-v3-history-heading"
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
      {sourceApyPct === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]" level={3}>
              Historical backtest
            </CardTitle>
            <CardDescription>
              Enter the custom source yield before running its dated price
              history. V3 does not substitute a yield.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : recoveryDaysInput === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]" level={3}>
              Historical backtest
            </CardTitle>
            <CardDescription>
              Choose whether temporary drawdowns receive recovery time before
              running the historical design. V3 does not silently model 0 days.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <DayV3Backtest
          bandPct={inputs.bandPct}
          coveragePct={inputs.coveragePct}
          customSource={customSource}
          liqSharePct={resolved.liquidityYieldShare * 100}
          liquidityPct={inputs.liquidityPct}
          maintainCoverage={maintainCoverage}
          onMaintainCoverage={setMaintainCoverage}
          poolConfigOverrides={canonicalEngineOverrides ?? {}}
          market={market}
          observationDays={inputs.observationDays}
          riskY0Pct={resolved.y0 * 100}
          riskY100Pct={resolved.y100 * 100}
          riskSharePct={resolved.riskYieldShare * 100}
          liqY0Pct={resolved.liqY0 * 100}
          liqY100Pct={resolved.liqY100 * 100}
          sourceApyPct={inputs.sourceApyPct}
        />
      )}

      {!deploying ? (
        <DayV3Button
          className="self-start"
          onClick={() => setMode("deploy")}
          size="md"
          variant="primary"
        >
          Review deployment handoff
        </DayV3Button>
      ) : null}

      <p className="max-w-[70ch] text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        Educational simulator only. No securities are offered through this page.
        Forward projections are mechanism simulations, not forecasts or
        announced terms. Historical backtests use the selected source path and
        are not predictions.
      </p>
    </main>
  );
}
