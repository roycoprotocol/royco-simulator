"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV3Chart, { type DayV3Point } from "@/components/day-v3/DayV3Chart";
import DayV3Comparison, {
  DAY_V3_TONE_DOT,
  type DayV3PoolCarryBreakdown,
  type DayV3PositionBreakdown,
} from "@/components/day-v3/DayV3Comparison";
import DayV3CapitalStack from "@/components/day-v3/DayV3CapitalStack";
import { dayV3ButtonVariants } from "@/components/day-v3/DayV3Button";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3ExitCost from "@/components/day-v3/DayV3ExitCost";
import DayV3ExitModel from "@/components/day-v3/DayV3ExitModel";
import DayV3Group, {
  DayV3GroupAccordion,
} from "@/components/day-v3/DayV3Group";
import DayV3Hero from "@/components/day-v3/DayV3Hero";
import DayV3Goals, {
  type DayV3ExitView,
  type DayV3ProtectionView,
} from "@/components/day-v3/DayV3Goals";
import DayV3LossWaterfall from "@/components/day-v3/DayV3LossWaterfall";
import DayV3MarketSelect from "@/components/day-v3/DayV3MarketSelect";
import DayV3ModelGroup, {
  DayV3ModelAccordion,
} from "@/components/day-v3/DayV3ModelGroup";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import DayV3PremiumCurveEditor from "@/components/day-v3/DayV3PremiumCurveEditor";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import DayV3YieldModels from "@/components/day-v3/DayV3YieldModels";
import { useDayV3PoolDesign } from "@/components/day-v3/useDayV3PoolDesign";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildDayV3Query,
  DAY_V3_STARTER_DEFAULTS,
  dayV3MinimumLiquidityForPoolFunding,
  deriveDayV3StartingYieldCurvePolicy,
  normalizeDayV3Defaults,
  recommendDayV3Coverage,
  validateDayV3YieldCurveDesign,
  type DayV3StarterDefaultField,
  type DayV3UrlState,
} from "@/lib/day-v3";
import {
  createDayV3ModelSnapshot,
  dayV3ReturnDisplayState,
} from "@/lib/day-v3/model-state";
import {
  dayV3ActiveOverrides,
  EMPTY_DAY_V3_OVERRIDES,
} from "@/lib/day-v3/mode-model";
import {
  dayV3ExitInputReadiness,
  dayV3InputReadiness,
} from "@/lib/day-v3/input-readiness";
import type {
  DayV3Goals as DayV3PoolGoals,
  DayV3Overrides,
} from "@/lib/day-v3/types";
import { buildDayYieldDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import { dayPoolSeniorWeight } from "@/lib/day-simulator-template/capital-sizing";
import type { EclpParams } from "@/lib/day/engine/eclp";
import { DAY_ECLP_SIMULATION_LAMBDA } from "@/lib/day/engine/engine";
import { Sim } from "@/lib/day/engine/runner";
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
const DAY_TARGET_UTILIZATION = 0.9;
const CUSTOM_SOURCE_ID = "custom";
const CUSTOM_SOURCE_MARKET = buildDayYieldDraftMarket({
  label: "Custom yield source",
  sourceApy: 0.12,
});
export default function DayV3Summary({
  initialMarket,
  initialState,
  markets,
  starterDefaultFields = [],
}: {
  initialMarket: DayMarket;
  initialState?: DayV3UrlState;
  markets: readonly DayMarket[];
  starterDefaultFields?: readonly DayV3StarterDefaultField[];
}) {
  // Anything the link did not carry falls back to the market's own default, so
  // a partial or hand-edited link still describes a real market.
  const linked = initialState;
  const [manualOverrides, setManualOverrides] = useState<DayV3Overrides>({
    ...EMPTY_DAY_V3_OVERRIDES,
    ...linked?.overrides,
  });
  const [starterFields, setStarterFields] = useState<
    Set<DayV3StarterDefaultField>
  >(() => new Set(starterDefaultFields));
  const markStarterFieldEdited = (field: DayV3StarterDefaultField) => {
    setStarterFields((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  };
  const clearStarterFields = () => setStarterFields(new Set());
  // Only operating-target yield shares remain active. Legacy hidden overrides
  // still parse, but cannot change a displayed result.
  const activeManualOverrides = useMemo(
    () => dayV3ActiveOverrides(manualOverrides),
    [manualOverrides],
  );
  const [customSource, setCustomSource] = useState(
    linked?.market === CUSTOM_SOURCE_ID ||
      !markets.some((candidate) => candidate.id === linked?.market),
  );
  const [marketId, setMarketId] = useState(initialMarket.id);
  const selectedMarket =
    markets.find((candidate) => candidate.id === marketId) ?? initialMarket;
  const market = customSource ? CUSTOM_SOURCE_MARKET : selectedMarket;
  const defaults = useMemo(
    () => normalizeDayV3Defaults(market.defaults),
    [market.defaults],
  );
  // The custom design is normalized in dollars because every capital and exit
  // amount is quoted per $100 Senior.
  const returnUnit = customSource
    ? "USD"
    : (market.customization.backtestDisplay?.returnUnit ?? "USD");
  const [sourceApyPct, setSourceApyPct] = useState<number | null>(
    customSource ? (linked?.sourceApyPct ?? null) : defaults.sourceApy * 100,
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
  const modeledProtectedDrawdownPct = protectedDrawdownPct;
  const modeledImmediateExitSharePct = immediateExitSharePct;
  const protectionDisabled = modeledProtectedDrawdownPct === 0;
  const exitDisabled = modeledImmediateExitSharePct === 0;
  const [entryPointSettlementDays, setEntryPointSettlementDays] = useState<
    number | null
  >(linked?.entryPointSettlementDays ?? null);
  const [collateralToExitDays, setCollateralToExitDays] = useState<
    number | null
  >(linked?.collateralToExitDays ?? null);
  const [collateralToExitCostBps, setCollateralToExitCostBps] = useState<
    number | null
  >(linked?.collateralToExitCostBps ?? null);
  const deploymentTarget = linked?.target ?? DAY_V3_STARTER_DEFAULTS.target;
  const observationDays = recoveryDaysInput ?? 0;
  const maintainCoverage = false;
  // The merged simulator exposes only target yield shares. Legacy curve-shape
  // anchors stay inactive even when an old link contains them.
  const riskShareOverride = activeManualOverrides.jrYieldShareAtTargetPct;
  const liqShareOverride = activeManualOverrides.slpYieldShareAtTargetPct;
  const y0Override = activeManualOverrides.jrYieldShareAtZeroPct;
  const y100Override = activeManualOverrides.jrYieldShareAtFullPct;
  const liqY0Override = activeManualOverrides.slpYieldShareAtZeroPct;
  const liqY100Override = activeManualOverrides.slpYieldShareAtFullPct;
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
      // This is the shared template's disclosed simulation assumption. A live
      // RWA response replaces it atomically when the exit design resolves.
      swapFeeBps: defaults.swapFeeBps,
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
    setEntryPointSettlementDays(null);
    setCollateralToExitDays(null);
    setCollateralToExitCostBps(null);
    setManualOverrides(EMPTY_DAY_V3_OVERRIDES);
  };

  const selectMarket = (nextId: string) => {
    const next = markets.find((candidate) => candidate.id === nextId);
    if (!next) return;
    setCustomSource(false);
    setMarketId(nextId);
    adoptTerms(next);
  };

  const selectSourceType = (nextCustom: boolean) => {
    if (nextCustom === customSource) return;
    setCustomSource(nextCustom);
    adoptTerms(nextCustom ? CUSTOM_SOURCE_MARKET : selectedMarket);
    if (nextCustom) {
      setSourceApyPct(DAY_V3_STARTER_DEFAULTS.sourceApyPct);
      setProtectedDrawdownPct(DAY_V3_STARTER_DEFAULTS.protectedDrawdownPct);
      setRecoveryDaysInput(DAY_V3_STARTER_DEFAULTS.recoveryDays);
      setRecoveryMode(
        DAY_V3_STARTER_DEFAULTS.recoveryDays === 0 ? "none" : "window",
      );
      setImmediateExitSharePct(DAY_V3_STARTER_DEFAULTS.immediateExitSharePct);
      setMinimumProceedsPer100(DAY_V3_STARTER_DEFAULTS.minimumProceedsPer100);
      setEntryPointSettlementDays(
        DAY_V3_STARTER_DEFAULTS.entryPointSettlementDays,
      );
      setCollateralToExitDays(DAY_V3_STARTER_DEFAULTS.collateralToExitDays);
      setCollateralToExitCostBps(
        DAY_V3_STARTER_DEFAULTS.collateralToExitCostBps,
      );
    }
  };

  const resetYieldCurveOverrides = () => {
    setManualOverrides((current) => ({
      ...current,
      jrYieldShareAtZeroPct: null,
      jrYieldShareAtFullPct: null,
      slpYieldShareAtZeroPct: null,
      slpYieldShareAtFullPct: null,
      jrYieldShareAtTargetPct: null,
      slpYieldShareAtTargetPct: null,
    }));
  };

  const protectionRecommendation = useMemo(
    () =>
      modeledProtectedDrawdownPct === null
        ? null
        : recommendDayV3Coverage(simulationDefaults, {
            protectedDrawdownPct: modeledProtectedDrawdownPct,
          }),
    [modeledProtectedDrawdownPct, simulationDefaults],
  );
  const coveragePct = protectionDisabled
    ? 0
    : (activeManualOverrides.coveragePct ??
      (protectionRecommendation?.status === "recommended"
        ? (protectionRecommendation.coverage.value ?? 0)
        : 0));

  const poolDesignGoals = useMemo<DayV3PoolGoals | null>(() => {
    if (
      exitDisabled ||
      protectedDrawdownPct === null ||
      recoveryDaysInput === null ||
      immediateExitSharePct === null ||
      minimumProceedsPer100 === null ||
      entryPointSettlementDays === null ||
      collateralToExitDays === null ||
      collateralToExitCostBps === null
    ) {
      return null;
    }
    return {
      protectedDrawdownPct,
      recoveryDays: recoveryDaysInput,
      immediateExitSharePct,
      minimumProceedsPer100,
      entryPointSettlementDays,
      collateralToExitDays,
      collateralToExitCostBps,
      fixedTermGraceDays: 0,
      navUpdateDays: 1,
      target: deploymentTarget ?? DAY_V3_STARTER_DEFAULTS.target,
    };
  }, [
    collateralToExitCostBps,
    collateralToExitDays,
    deploymentTarget,
    entryPointSettlementDays,
    exitDisabled,
    immediateExitSharePct,
    minimumProceedsPer100,
    protectedDrawdownPct,
    recoveryDaysInput,
  ]);
  const poolDesignContext = useMemo(
    () =>
      sourceApyPct === null
        ? null
        : {
            sourceApyPct,
            exitAsset: null,
            exitAssetRateProvider: null,
            exitAssetYieldBearing: null,
          },
    [sourceApyPct],
  );
  const poolDesign = useDayV3PoolDesign(
    poolDesignGoals,
    poolDesignContext,
    true,
  );
  const activePoolDesign = poolDesign.design;
  const hasPoolOverride = [
    activeManualOverrides.minimumLiquidityPct,
    activeManualOverrides.maximumDiscountPct,
    activeManualOverrides.depthAtNav,
    activeManualOverrides.maximumPremiumPct,
    activeManualOverrides.poolCapitalPer100,
  ].some((value) => value !== null);
  const rawCanonicalPoolDesign =
    activePoolDesign.status === "resolved" ||
    activePoolDesign.status === "resolving"
      ? activePoolDesign.result
      : null;
  const canonicalEngineOverrides = useMemo<{
    swapFeeBps: number;
    eclpParams: EclpParams;
    stProtocolFee: number;
    jtProtocolFee: number;
    yieldShareProtocolFee: number;
    ltYieldShareProtocolFee: number;
  } | null>(() => {
    if (!rawCanonicalPoolDesign) return null;
    const raw = rawCanonicalPoolDesign.recommendation.eclp.params;
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
    const feeWad = (rawFee: string) => Number(BigInt(rawFee)) / 1e18;
    const fees = rawCanonicalPoolDesign.policy.protocolFees;
    const parsedFees = {
      stProtocolFee: feeWad(fees.stProtocolFeeWad),
      jtProtocolFee: feeWad(fees.jtProtocolFeeWad),
      yieldShareProtocolFee: feeWad(fees.jtYieldShareProtocolFeeWad),
      ltYieldShareProtocolFee: feeWad(fees.lptYieldShareProtocolFeeWad),
    };
    if (
      !Object.values(parsedFees).every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      )
    ) {
      return null;
    }
    return {
      swapFeeBps: rawCanonicalPoolDesign.policy.swapFeeBps,
      eclpParams: params,
      ...parsedFees,
    };
  }, [rawCanonicalPoolDesign]);
  const canonicalPoolDesign =
    rawCanonicalPoolDesign && !hasPoolOverride && canonicalEngineOverrides
      ? rawCanonicalPoolDesign
      : null;
  const canonicalPoolRecommendation =
    canonicalPoolDesign?.recommendation ?? null;
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
  // Never fill an unresolved exact pool with illustrative liquidity or fees.
  const liquidityPct = exitDisabled
    ? 0
    : liquidityRecommendation?.status === "recommended"
      ? (liquidityRecommendation.minimumLiquidity.value ?? 0)
      : 0;
  const effectiveBandPct = canonicalPoolRecommendation
    ? canonicalPoolRecommendation.fields.maximumDiscountBps.value / 100
    : defaults.eclpBandWidth * 100;

  // Defer one stable, complete accountant input rather than an inline object.
  // The former version deferred the terms but read the live E-CLP and fee
  // policy outside this snapshot. A newly resolved pool could therefore run
  // briefly with the previous 0% liquidity requirement (or a new goal with the
  // previous pool policy), producing combinations such as a funded SLP showing
  // 0.0% while the other two cards had already updated. Keeping the policy in
  // the same snapshot makes every displayed return one internally consistent
  // accountant run.
  const immediateModelInput = useMemo(
    () =>
      createDayV3ModelSnapshot(
        {
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
          immediateExitSharePct: modeledImmediateExitSharePct ?? 0,
          policyBasis:
            canonicalEngineOverrides !== null
              ? ("live" as const)
              : ("unresolved" as const),
        },
        canonicalEngineOverrides,
      ),
    [
      canonicalEngineOverrides,
      coveragePct,
      effectiveBandPct,
      liqShareOverride,
      liqY0Override,
      liqY100Override,
      liquidityPct,
      modeledImmediateExitSharePct,
      maintainCoverage,
      modeledSourceApyPct,
      observationDays,
      riskShareOverride,
      y0Override,
      y100Override,
    ],
  );
  // Keeps the controls responsive while the engine re-runs, the same pattern
  // the main simulator uses after measuring input lag.
  const inputs = useDeferredValue(immediateModelInput);
  const modelUpdating = inputs !== immediateModelInput;
  // A pool-dependent answer is displayed only after canonical policy resolves.
  const modeledReturnPolicyResolved = inputs.policyBasis !== "unresolved";
  const returnDisplayState = dayV3ReturnDisplayState({
    modelUpdating,
    sourceApyResolved: sourceApyPct !== null,
    returnPolicyResolved: modeledReturnPolicyResolved,
  });

  // One place decides what the engine is actually run with, so the panel that
  // displays the curve and the run that produces the numbers cannot disagree.
  const resolved = useMemo(() => {
    const coverage = inputs.coveragePct / 100;
    const minLiquidity = inputs.liquidityPct / 100;
    const startingPolicy = deriveDayV3StartingYieldCurvePolicy(
      simulationDefaults,
      {
      coveragePct: inputs.coveragePct,
      minimumLiquidityPct: inputs.liquidityPct,
      },
    );
    const manualCurveComplete = [
      inputs.y0Override,
      inputs.riskShareOverride,
      inputs.y100Override,
      inputs.liqY0Override,
      inputs.liqShareOverride,
      inputs.liqY100Override,
    ].every((value) => value !== null);
    const zero = { y0Pct: 0, yTargetPct: 0, y100Pct: 0 };
    const startingDesign = startingPolicy.design ?? {
      junior: zero,
      slp: zero,
    };
    const targetShareDesign = {
      junior: {
        ...startingDesign.junior,
        yTargetPct:
          inputs.riskShareOverride ?? startingDesign.junior.yTargetPct,
      },
      slp: {
        ...startingDesign.slp,
        yTargetPct:
          inputs.liqShareOverride ?? startingDesign.slp.yTargetPct,
      },
    };
    const design = manualCurveComplete
      ? {
          junior: {
            y0Pct: inputs.y0Override as number,
            yTargetPct: inputs.riskShareOverride as number,
            y100Pct: inputs.y100Override as number,
          },
          slp: {
            y0Pct: inputs.liqY0Override as number,
            yTargetPct: inputs.liqShareOverride as number,
            y100Pct: inputs.liqY100Override as number,
          },
        }
      : targetShareDesign;
    // A zero capital requirement always pays zero. This also prevents a stale
    // manual curve from charging Senior after the corresponding tranche is
    // removed. Every non-zero automatic anchor comes from the one complete
    // starting policy above; endpoints are no longer frozen template values.
    const junior = coverage > 0 ? design.junior : zero;
    const slp = minLiquidity > 0 ? design.slp : zero;
    const maxLiquidityCurve = Math.max(slp.y0Pct, slp.yTargetPct, slp.y100Pct);
    const maxJuniorCurve = Math.max(
      junior.y0Pct,
      junior.yTargetPct,
      junior.y100Pct,
    );
    return {
      coverage,
      minLiquidity,
      startingPolicy,
      riskYieldShare: junior.yTargetPct / 100,
      liquidityYieldShare: slp.yTargetPct / 100,
      y0: junior.y0Pct / 100,
      y100: junior.y100Pct / 100,
      liqY0: slp.y0Pct / 100,
      liqY100: slp.y100Pct / 100,
      riskCeiling: Math.max(0, 1 - maxLiquidityCurve / 100),
      liquidityCeiling: Math.max(0, 1 - maxJuniorCurve / 100),
    };
  }, [inputs, simulationDefaults]);

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
    const runWithoutPremiums = (
      carryOverrides: Partial<
        Pick<
          typeof effective,
          "sourceApy" | "stableYield" | "poolTurnoverPerYear"
        >
      > = {},
    ) =>
      runDayTargetScenario(
        {
          ...effective,
          ...carryOverrides,
          riskYDM: zeroCurve,
          liqYDM: zeroCurve,
        },
        {},
        inputs.engineOverrides ?? {},
      );
    const zeroPoolCarry = runWithoutPremiums({
      sourceApy: 0,
      stableYield: 0,
      poolTurnoverPerYear: 0,
    });
    const seniorShareCarryOnly = runWithoutPremiums({
      stableYield: 0,
      poolTurnoverPerYear: 0,
    });
    const seniorAndExitAssetCarry = runWithoutPremiums({
      poolTurnoverPerYear: 0,
    });
    const noPremiums = runWithoutPremiums();
    const riskOnly = runDayTargetScenario(
      {
        ...effective,
        liqYDM: zeroCurve,
      },
      {},
      inputs.engineOverrides ?? {},
    );
    // Held rather than rebuilt, so the pool economics quoted to the reader are
    // the ones this run used and cannot drift from them.
    const cfg = {
      ...buildDayMarketConfig(effective, terms),
      ...(inputs.engineOverrides ?? {}),
    };
    // Hoisted out of the explainer call so the capital stack the issuer is asked
    // to raise and the rates they are quoted are the same market, seeded once.
    const balances = buildDayInitialBalances(effective, terms);
    const opening = new Sim(cfg, balances);
    const openingSeniorNAV = opening.last().stEffectiveNAV;
    const requestedExitNAV =
      (openingSeniorNAV * inputs.immediateExitSharePct) / 100;
    const illustrativeExitQuote =
      opening.previewSecondarySell(requestedExitNAV);
    return {
      scenario: runDayTargetScenario(
        effective,
        {},
        inputs.engineOverrides ?? {},
      ),
      noPremiums,
      riskOnly,
      poolCarry: {
        seniorShareCarry:
          seniorShareCarryOnly.liquidityApy - zeroPoolCarry.liquidityApy,
        exitAssetCarry:
          seniorAndExitAssetCarry.liquidityApy -
          seniorShareCarryOnly.liquidityApy,
        swapFeeIncome:
          noPremiums.liquidityApy - seniorAndExitAssetCarry.liquidityApy,
      } satisfies DayV3PoolCarryBreakdown,
      balances,
      pool: {
        concentration: cfg.eclpParams?.lambda ?? DAY_ECLP_SIMULATION_LAMBDA,
        stableYield: cfg.stableYield,
        swapFeeBps: inputs.engineOverrides?.swapFeeBps ?? null,
        turnoverPerYear: cfg.poolTurnoverPerYear,
        // Measured off this run's own config, so the split the capital stack
        // reports is the split the engine seeded.
        seniorWeight: dayPoolSeniorWeight(cfg),
      },
      illustrativeExit: {
        openingSeniorNAV,
        quote: illustrativeExitQuote,
      },
      explainer: buildDayExplainerMetrics(cfg, balances),
    };
  }, [inputs, resolved, simulationDefaults]);
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
    mode: null,
    sourceApyPct,
    protectedDrawdownPct,
    recoveryDays: recoveryDaysInput,
    immediateExitSharePct,
    minimumProceedsPer100,
    entryPointSettlementDays,
    collateralToExitDays,
    collateralToExitCostBps,
    fixedTermGraceDays: null,
    navUpdateDays: null,
    depositDelaySeconds: null,
    depositExpirySeconds: null,
    withdrawalExpirySeconds: null,
    gateByOracleUpdate: null,
    maxReinvestmentSlippageBps: null,
    incentiveBudgetPer100: null,
    target: deploymentTarget,
    starterFields: [...starterFields],
    overrides: {
      coveragePct: manualOverrides.coveragePct,
      minimumLiquidityPct: manualOverrides.minimumLiquidityPct,
      maximumDiscountPct: manualOverrides.maximumDiscountPct,
      depthAtNav: manualOverrides.depthAtNav,
      maximumPremiumPct: manualOverrides.maximumPremiumPct,
      protectedExitThresholdPct: null,
      protectedExitBonusPct: manualOverrides.protectedExitBonusPct,
      poolCapitalPer100: manualOverrides.poolCapitalPer100,
      jrYieldShareAtZeroPct: manualOverrides.jrYieldShareAtZeroPct,
      jrYieldShareAtTargetPct: manualOverrides.jrYieldShareAtTargetPct,
      jrYieldShareAtFullPct: manualOverrides.jrYieldShareAtFullPct,
      slpYieldShareAtZeroPct: manualOverrides.slpYieldShareAtZeroPct,
      slpYieldShareAtTargetPct: manualOverrides.slpYieldShareAtTargetPct,
      slpYieldShareAtFullPct: manualOverrides.slpYieldShareAtFullPct,
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
  const yieldCurveValidation = validateDayV3YieldCurveDesign({
    junior: {
      y0Pct: resolved.y0 * 100,
      yTargetPct: resolved.riskYieldShare * 100,
      y100Pct: resolved.y100 * 100,
    },
    slp: {
      y0Pct: resolved.liqY0 * 100,
      yTargetPct: resolved.liquidityYieldShare * 100,
      y100Pct: resolved.liqY100 * 100,
    },
  });
  const startingCurveIssues = [
    ...(resolved.startingPolicy.status === "unresolved"
      ? resolved.startingPolicy.evidence
      : []),
    ...yieldCurveValidation.issues,
  ];
  const updateYieldCurveOverride = (
    field: keyof Pick<
      DayV3Overrides,
      | "jrYieldShareAtZeroPct"
      | "jrYieldShareAtTargetPct"
      | "jrYieldShareAtFullPct"
      | "slpYieldShareAtZeroPct"
      | "slpYieldShareAtTargetPct"
      | "slpYieldShareAtFullPct"
    >,
    value: number,
  ) => {
    setManualOverrides((current) => ({
      ...current,
      [field]: value,
    }));
  };
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
      holds: protectionDisabled
        ? "The strategy asset, with no first-loss buffer"
        : "The strategy asset, protected by Jr",
      role:
        protectionDisabled && exitDisabled
          ? "Holds the source directly"
          : protectionDisabled
            ? "Holds the source and pays for an exit"
            : exitDisabled
              ? "Holds the source and pays for cover"
              : "Holds the source, pays for cover and an exit",
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
      holds: protectionDisabled
        ? "No first-loss tranche is funded"
        : "First-loss coverage for Sr",
      role: protectionDisabled
        ? "Disabled by the issuer"
        : "Takes the first losses, paid a premium for it",
      holdsSource: true,
      ...breakdown("juniorApy"),
      risk: protectionDisabled
        ? "Senior absorbs losses from the first dollar"
        : "Absorbs the first losses, in full",
      // While the deferred accountant snapshot catches up, the rate is hidden
      // as updating. Do not simultaneously assert the stale funding state.
      funded: modelUpdating || resolved.coverage > 0,
    },
    {
      tone: "liquidity" as const,
      name: "SLP",
      short: "SLP",
      apy: scenario.liquidityApy,
      holds: exitDisabled
        ? "No immediate exit pool is funded"
        : "The pool Sr exits into",
      role: exitDisabled
        ? "Disabled by the issuer"
        : "Supplies exit liquidity, paid a premium for it",
      holdsSource: false,
      ...breakdown("liquidityApy"),
      risk: exitDisabled
        ? "No one-trade exit is promised"
        : "Holds Sr shares when Sr sells",
      funded: modelUpdating || resolved.minLiquidity > 0,
    },
  ];

  const protectionView: DayV3ProtectionView = protectionDisabled
    ? {
        coveragePct: 0,
        juniorPer100: 0,
        juniorApy: null,
        status: "disabled",
        message:
          "Senior protection is off. Minimum Coverage is 0%, no Junior capital is funded, and Senior absorbs source losses directly.",
      }
    : activeManualOverrides.coveragePct !== null
      ? {
          coveragePct: activeManualOverrides.coveragePct,
          juniorPer100: model.balances.jt,
          juniorApy:
            returnDisplayState === "ready"
              ? model.scenario.juniorApy * 100
              : null,
          status: "unresolved",
          message:
            "A manual Minimum Coverage override is active. It is modeled here but cannot be called a recommendation until it is revalidated against the selected protection level.",
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
                returnDisplayState === "ready"
                  ? model.scenario.juniorApy * 100
                  : null,
              status: "recommended",
            message: `${protectionRecommendation.reason}${returnDisplayState === "updating" ? " Recalculating the return with the current pool design…" : returnDisplayState === "ready" ? " Current market fees are included in the displayed return." : " Junior return remains unresolved until the exit design supplies every return input."}`,
            }
          : {
              coveragePct: null,
              juniorPer100: null,
              juniorApy: null,
              status: "infeasible",
              message: protectionRecommendation.reason,
            };

  const exitGoalsComplete = exitDisabled || poolDesignGoals !== null;
  const exitOverrides = activeManualOverrides;
  const canonicalExit = canonicalPoolDesign;
  const canonicalExitRecommendation = canonicalExit?.recommendation ?? null;
  const canonicalOutcomes = canonicalExitRecommendation?.outcomes ?? null;
  const liquidityResolved =
    liquidityRecommendation?.status === "recommended" &&
    liquidityRecommendation.minimumLiquidity.value !== null;
  const exitStatus: DayV3ExitView["status"] = exitDisabled
    ? "disabled"
    : !exitGoalsComplete
      ? "missing-goal"
      : hasPoolOverride
        ? "unresolved"
        : activePoolDesign.status === "infeasible"
          ? "infeasible"
          : activePoolDesign.status === "resolved" && liquidityResolved
            ? "recommended"
            : "unresolved";
  const exitView: DayV3ExitView = {
    status: exitStatus,
    message: exitDisabled
      ? "Immediate Senior exit is off. No SLP capital, pool quote, or E-CLP parameters are required for this scenario."
      : !exitGoalsComplete
        ? "Complete the Senior exit inputs above to resolve a pool design."
        : hasPoolOverride
          ? "This link contains manual pool overrides. Outcomes are withheld until the canonical service revalidates those exact fields."
          : activePoolDesign.status === "resolved" && !liquidityResolved
            ? (liquidityRecommendation?.reason ??
              "The pool was resolved, but its Minimum Liquidity mapping is unavailable.")
            : `${activePoolDesign.message}${canonicalOutcomes ? " Refill economics use the timing and stressed conversion cost entered above." : ""}`,
    sellablePer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.amountSellablePer100Senior ?? null),
    proceeds: exitDisabled
      ? 0
      : (canonicalOutcomes?.proceedsForPromisedExit ?? null),
    lowestPayoutPer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.lowestModeledPayoutPer100 ?? null),
    slpPer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.requiredPoolFundingPer100Senior ?? null),
    restockPoint: canonicalOutcomes?.restockEconomicFromSoldPct ?? null,
    restockOperationalHurdleBps:
      canonicalOutcomes?.restockOperationalHurdleBps ?? null,
    restockHurdleBps: canonicalOutcomes?.restockHurdleBps ?? null,
    restockMarginBps:
      canonicalOutcomes?.restockMarginAfterPromisedExitBps ?? null,
    minimumLiquidityPct: exitDisabled
      ? 0
      : (exitOverrides?.minimumLiquidityPct ??
        liquidityRecommendation?.minimumLiquidity.value ?? null),
    maximumDiscountPct:
      exitOverrides?.maximumDiscountPct ??
      (canonicalExitRecommendation
        ? canonicalExitRecommendation.fields.maximumDiscountBps.value / 100
        : null),
    lambda:
      exitOverrides?.depthAtNav ??
      canonicalExitRecommendation?.fields.depthAtNavLambda.value ?? null,
    maximumPremiumBps:
      exitOverrides?.maximumPremiumPct !== null &&
      exitOverrides?.maximumPremiumPct !== undefined
        ? exitOverrides.maximumPremiumPct * 100
        : (canonicalExitRecommendation?.fields.maximumPremiumBps.value ?? null),
    restingExitAssetPct:
      canonicalOutcomes?.exitAssetShareAtNavPct ?? null,
    restingSeniorPct:
      canonicalOutcomes?.seniorShareAtNavPct ?? null,
    swapFeeBps:
      canonicalExit?.policy.swapFeeBps ?? null,
    feeSource: canonicalExit
      ? `${canonicalExit.policy.templateName} on ${canonicalExit.policy.chainName}, block ${canonicalExit.policy.blockNumber}. Protocol fees: ST ${(Number(BigInt(canonicalExit.policy.protocolFees.stProtocolFeeWad)) / 1e16).toFixed(1)}%, JT ${(Number(BigInt(canonicalExit.policy.protocolFees.jtProtocolFeeWad)) / 1e16).toFixed(1)}%, JT premium ${(Number(BigInt(canonicalExit.policy.protocolFees.jtYieldShareProtocolFeeWad)) / 1e16).toFixed(1)}%, SLP premium ${(Number(BigInt(canonicalExit.policy.protocolFees.lptYieldShareProtocolFeeWad)) / 1e16).toFixed(1)}%. Resolved ${canonicalExit.policy.resolvedAt}`
      : null,
  };
  const displayedReturnState = returnDisplayState;
  const premiumCurveEditor =
    !protectionDisabled || !exitDisabled ? (
      <DayV3PremiumCurveEditor
        curveOverridden={curveOverridden}
        index={2}
        juniorEnabled={!protectionDisabled}
        juniorModeledApy={scenario.juniorApy}
        liqCapPct={resolved.liquidityCeiling * 100}
        liqY0Pct={resolved.liqY0 * 100}
        liqY100Pct={resolved.liqY100 * 100}
        liqYtPct={resolved.liquidityYieldShare * 100}
        onLiqYtPct={(value) =>
          updateYieldCurveOverride("slpYieldShareAtTargetPct", value)
        }
        onResetCurve={resetYieldCurveOverrides}
        onRiskYtPct={(value) =>
          updateYieldCurveOverride("jrYieldShareAtTargetPct", value)
        }
        riskCapPct={resolved.riskCeiling * 100}
        riskY0Pct={resolved.y0 * 100}
        riskY100Pct={resolved.y100 * 100}
        riskYtPct={resolved.riskYieldShare * 100}
        slpModeledApy={scenario.liquidityApy}
        slpEnabled={!exitDisabled}
        targetUtilization={DAY_TARGET_UTILIZATION}
        validationIssues={startingCurveIssues}
      />
    ) : null;
  const sourceReadiness = dayV3InputReadiness([
    { id: "source-yield", label: "Source yield", ready: sourceApyPct !== null },
  ]);
  const exitInputReadiness = dayV3ExitInputReadiness({
    enabled: !exitDisabled,
    exitSharePct: immediateExitSharePct,
    minimumProceedsPer100,
  });
  const advancedProtectionComplete = protectedDrawdownPct !== null;
  const advancedProtectionReady =
    advancedProtectionComplete &&
    (protectedDrawdownPct === 0 || recoveryDaysInput !== null);
  const advancedExitComplete =
    exitInputReadiness.complete &&
    (exitDisabled ||
      (entryPointSettlementDays !== null &&
        collateralToExitDays !== null &&
        collateralToExitCostBps !== null));
  const simulationSourceComplete = sourceApyPct !== null;
  const simulationCurveComplete = startingCurveIssues.length === 0;
  type ActiveSectionState = "confirmed" | "missing";
  const activeSectionStates: ActiveSectionState[] = [
    simulationSourceComplete ? "confirmed" : "missing",
    simulationCurveComplete ? "confirmed" : "missing",
    advancedProtectionReady ? "confirmed" : "missing",
    advancedExitComplete ? "confirmed" : "missing",
  ];
  const confirmedSectionCount = activeSectionStates.filter(
    (state) => state === "confirmed",
  ).length;
  const missingSectionCount = activeSectionStates.filter(
    (state) => state === "missing",
  ).length;
  const inputSteps = [
    {
      complete: simulationSourceComplete,
      detail: "Choose a listed source or enter a custom net yield.",
      id: "day-v3-source-inputs",
      label: "Choose the yield source",
    },
    {
      complete: simulationCurveComplete,
      detail: "Adjust the Junior and SLP shares paid at target utilization.",
      id: "day-v3-premium-inputs",
      label: "Adjust the yield split",
    },
    {
      complete: advancedProtectionReady,
      detail: "Choose the loss Senior should survive and how temporary losses are observed.",
      id: "day-v3-protection-inputs",
      label: "Set Senior protection",
    },
    {
      complete: advancedExitComplete,
      detail: "Choose the exit promise and the assumptions that determine whether the SLP can be refilled.",
      id: "day-v3-exit-inputs",
      label: "Set the Senior exit",
    },
  ];
  const nextInputStep = inputSteps.find((step) => !step.complete) ?? null;
  const defaultOpenInputId = nextInputStep?.id ?? null;

  return (
    // Capped rather than full-bleed. Past about 1400px the cards stop gaining
    // anything and the prose lines just get harder to track back to.
    <main className="royco-v3 mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
      <DayV3Hero />

      {/* One short questionnaire owns every visible model input. */}
      <section
        aria-labelledby="day-v3-inputs-heading"
        className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4 shadow-[0_6px_22px_-14px_rgba(23,25,31,0.4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              id="day-v3-inputs-heading"
            >
              Design the market
            </h2>
            <p className="text-[11px] text-[var(--tertiary)]">
              Set the yield split, protection, and immediate exit in one place.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-3">
          <strong className="font-mono text-[11.5px] tabular-nums text-[var(--secondary)]">
            {confirmedSectionCount} confirmed
          </strong>
          {missingSectionCount > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-[var(--red-emphasis)]">
              {missingSectionCount} missing
            </span>
          ) : null}
          <span aria-hidden="true" className="flex min-w-24 flex-1 gap-1.5 sm:max-w-36">
            {activeSectionStates.map((state, index) => (
              <span
                className={`h-1.5 flex-1 rounded-full ${state === "confirmed" ? "bg-[var(--theme-green)]" : "bg-[var(--border-subtle)]"}`}
                key={index}
              />
            ))}
          </span>
        </div>

        <DayV3GroupAccordion defaultOpenId={defaultOpenInputId}>
          <DayV3Group
            collapsible
            defaultOpen={false}
            docs="tranching"
            docsLabel="How tranching works"
            id="day-v3-source-inputs"
            impactHref="#day-v3-return-models"
            impactLabel="See return impact"
            index={1}
            key="yield-source"
            status={
              sourceReadiness.complete
                ? { label: "Confirmed", tone: "complete" }
                : {
                    label: "Missing",
                    tone: "incomplete",
                    missing: sourceReadiness.missing,
                  }
            }
            subtitle="Choose a listed source or enter a custom net yield"
            summary={`${sourceApyPct === null ? "Yield missing" : `${sourceApyPct.toFixed(1)}% net APY`} · ${customSource ? "custom source" : "listed source"}`}
            title="Yield source"
          >
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              <DayV3SegmentedControl
                ariaLabel="Yield source type"
                onValueChange={(value) => {
                  clearStarterFields();
                  selectSourceType(value === "custom");
                }}
                options={[
                  { label: "Custom yield", value: "custom" },
                  { label: "Listed source", value: "listed" },
                ]}
                value={customSource ? "custom" : "listed"}
              />

              {customSource ? (
                <DayV3NumberField
                  label="What net annual yield should the custom source model?"
                  max={30}
                  min={0}
                  note={
                    starterFields.has("source")
                      ? "An illustrative 8% starter yield is loaded so every model works immediately. Replace it with the source's actual net annual rate."
                      : "Enter the source's net annual rate. The three projected APYs update immediately."
                  }
                  onChange={(value) => {
                    markStarterFieldEdited("source");
                    setSourceApyPct(value);
                  }}
                  origin={
                    starterFields.has("source") ? "illustrative" : "your-answer"
                  }
                  placeholder="Enter yield"
                  presets={[
                    { label: "4%", value: 4 },
                    { label: "6%", value: 6 },
                    { label: "8%", value: 8 },
                    { label: "12%", value: 12 },
                  ]}
                  step={0.1}
                  suffix="% a year"
                  value={sourceApyPct}
                  required
                />
              ) : (
                <DayV3MarketSelect
                  markets={markets}
                  onChange={(value) => {
                    clearStarterFields();
                    selectMarket(value);
                  }}
                  value={marketId}
                />
              )}
            </div>
          </DayV3Group>
          {premiumCurveEditor}
          <DayV3Goals
            conversionCostBps={collateralToExitCostBps}
            conversionDays={collateralToExitDays}
            drawdownPct={protectedDrawdownPct}
            entryPointSettlementDays={entryPointSettlementDays}
            exit={exitView}
            exitSharePct={immediateExitSharePct}
            indexOffset={2}
            inputOrigins={{
              conversionCost: starterFields.has("conversion-cost")
                ? "illustrative"
                : "model-assumption",
              conversionDays: starterFields.has("conversion-days")
                ? "illustrative"
                : "source-fact",
              drawdown: starterFields.has("drawdown")
                ? "illustrative"
                : "your-answer",
              exitAmount: starterFields.has("exit-amount")
                ? "illustrative"
                : "your-answer",
              payout: starterFields.has("payout")
                ? "illustrative"
                : "your-answer",
              settlement: starterFields.has("settlement")
                ? "illustrative"
                : "your-answer",
            }}
            minimumProceedsPer100={minimumProceedsPer100}
            onConversionCostBps={(value) => {
              markStarterFieldEdited("conversion-cost");
              setCollateralToExitCostBps(value);
            }}
            onConversionDays={(value) => {
              markStarterFieldEdited("conversion-days");
              setCollateralToExitDays(value);
            }}
            onDrawdownPct={(value) => {
              markStarterFieldEdited("drawdown");
              if (value === 0) {
                markStarterFieldEdited("recovery");
                setRecoveryMode("none");
                setRecoveryDaysInput(0);
              }
              setProtectedDrawdownPct(value);
            }}
            onEntryPointSettlementDays={(value) => {
              markStarterFieldEdited("settlement");
              setEntryPointSettlementDays(value);
            }}
            onExitSharePct={(value) => {
              markStarterFieldEdited("exit-amount");
              if (value === 0) {
                setMinimumProceedsPer100(0);
              } else {
                setEntryPointSettlementDays((current) =>
                  current ?? DAY_V3_STARTER_DEFAULTS.entryPointSettlementDays,
                );
                setCollateralToExitDays((current) =>
                  current ?? DAY_V3_STARTER_DEFAULTS.collateralToExitDays,
                );
                setCollateralToExitCostBps((current) =>
                  current ?? DAY_V3_STARTER_DEFAULTS.collateralToExitCostBps,
                );
              }
              setImmediateExitSharePct(value);
            }}
            onMinimumProceedsPer100={(value) => {
              markStarterFieldEdited("payout");
              setMinimumProceedsPer100(value);
            }}
            onRecoveryDays={(value) => {
              markStarterFieldEdited("recovery");
              setRecoveryDaysInput(value);
            }}
            onRecoveryMode={(value) => {
              markStarterFieldEdited("recovery");
              setRecoveryMode(value);
              setRecoveryDaysInput(value === "none" ? 0 : null);
            }}
            onRetryPoolDesign={poolDesign.retry}
            onResetExit={() => {
              markStarterFieldEdited("exit-amount");
              markStarterFieldEdited("payout");
              markStarterFieldEdited("settlement");
              markStarterFieldEdited("conversion-days");
              markStarterFieldEdited("conversion-cost");
              setImmediateExitSharePct(null);
              setMinimumProceedsPer100(null);
              setEntryPointSettlementDays(null);
              setCollateralToExitDays(null);
              setCollateralToExitCostBps(null);
            }}
            onResetProtection={() => {
              markStarterFieldEdited("drawdown");
              markStarterFieldEdited("recovery");
              setProtectedDrawdownPct(null);
              setRecoveryDaysInput(null);
              setRecoveryMode(null);
            }}
            protection={protectionView}
            recoveryDays={recoveryDaysInput}
            recoveryMode={recoveryMode}
          />
        </DayV3GroupAccordion>
      </section>

      <section
        aria-labelledby="day-v3-positions-heading"
        className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] shadow-[0_6px_22px_-14px_rgba(23,25,31,0.4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2
            className="text-[13px] font-semibold tracking-[-0.01em]"
            id="day-v3-positions-heading"
          >
            Scenario returns at these terms
          </h2>
          <DayV3DocsLink label="Yield split" topic="yieldSplit" />
        </div>

        {/* Three peers, scanned across: identical slots, so the eye compares
            the rate first. The compact footer below keeps the terms attached
            without competing with these primary answers. */}
        <div className="grid grid-cols-3 border-y border-[var(--border-subtle)] md:hidden">
          {positions.map((position, index) => (
            <div
              className={`min-w-0 px-3 py-3 ${index === 0 ? "" : "border-l border-[var(--border-subtle)]"}`}
              key={`compact-${position.short}`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: DAY_V3_TONE_DOT[position.tone] }}
                />
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                  {position.name}
                </span>
              </div>
              <strong className="mt-1 block font-mono text-[22px] leading-none tabular-nums">
                {displayedReturnState === "updating"
                  ? "…"
                  : displayedReturnState === "ready" && position.funded
                    ? pct(position.apy)
                    : displayedReturnState === "ready"
                      ? "0.0%"
                      : "—"}
              </strong>
              <span className="mt-1 block truncate text-[9px] text-[var(--tertiary)]">
                {displayedReturnState === "ready" ? "per year" : "not ready"}
              </span>
            </div>
          ))}
        </div>
        <div className="hidden grid-cols-1 gap-3 px-4 pb-4 pt-2 md:grid md:grid-cols-3">
          {positions.map((position) => (
            <Card
              className="overflow-hidden px-0"
              key={position.short}
              style={position.funded ? undefined : { borderStyle: "dashed" }}
              weight={position.funded ? "primary" : "default"}
            >
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
                  <span
                    className="font-mono text-[clamp(34px,3.2vw,44px)] font-bold leading-[0.92] tracking-[-0.03em] tabular-nums"
                    style={
                      position.funded ? undefined : { color: "var(--tertiary)" }
                    }
                  >
                    {displayedReturnState === "updating"
                      ? "…"
                      : displayedReturnState === "ready" && position.funded
                        ? pct(position.apy)
                        : displayedReturnState === "ready"
                          ? "0.0%"
                          : "—"}
                  </span>
                  <span className="text-[11px] text-[var(--tertiary)]">
                    {displayedReturnState === "updating"
                      ? "updating model"
                      : displayedReturnState === "missing-source"
                        ? "enter source yield"
                        : displayedReturnState === "missing-policy"
                          ? activePoolDesign.status === "resolving"
                            ? "checking market terms"
                            : activePoolDesign.status === "infeasible"
                              ? "change exit design"
                              : "market terms unavailable"
                          : "a year"}
                  </span>
                </div>
                <p className="border-t border-[var(--border-subtle)] pt-2 text-[12px] leading-relaxed text-[var(--secondary)]">
                  {position.risk}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="border-t border-[var(--border-subtle)] px-5 py-3 text-[10.5px] leading-relaxed text-[var(--secondary)]">
          <strong className="font-semibold text-[var(--foreground)]">
            APY inputs:
          </strong>{" "}
          {sourceApyPct === null ? "source yield missing" : `${sourceApyPct.toFixed(1)}% source yield`} · Junior receives {(resolved.riskYieldShare * 100).toFixed(1)}% · SLP receives {(resolved.liquidityYieldShare * 100).toFixed(1)}% at 90% utilization.
        </div>
      </section>

      <section
        aria-labelledby="day-v3-models-heading"
        className="flex flex-col gap-4"
        data-accountant-source="runDayTargetScenario-and-buildDayExplainerMetrics"
      >
        <div className="flex flex-col gap-1 px-1 pb-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]">
            {inputs.policyBasis === "live"
              ? "Live market models"
              : "Market models"}
          </span>
          <h2
            className="text-[18px] font-semibold tracking-[-0.02em]"
            id="day-v3-models-heading"
          >
            See how these choices change the market
          </h2>
          <p className="max-w-[78ch] text-[11px] leading-relaxed text-[var(--secondary)]">
            Open a section for its charts and tables. The main answer stays in each collapsed row.
          </p>
        </div>

        {modelUpdating ? (
          <Card data-model-state="updating" weight="quiet">
            <CardHeader>
              <CardTitle className="text-[17px]">
                Updating every model…
              </CardTitle>
              <CardDescription>
                Rebuilding capital, stress, exit, and return models from one consistent accountant snapshot.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <DayV3ModelAccordion>
                <DayV3ModelGroup
                  id="day-v3-risk-models"
                  index={1}
                  preview={
                    protectionView.status === "missing-goal" &&
                    exitView.status === "missing-goal"
                      ? "Complete Senior protection and the exit promise above to size Junior and SLP capital."
                      : `${protectedDrawdownPct === null ? "Protection pending" : `${protectedDrawdownPct.toFixed(1)}% protection`} + ${immediateExitSharePct === null ? "exit pending" : `$${immediateExitSharePct.toFixed(1)} exit`} → ${protectionDisabled ? "$0 Junior" : `$${model.balances.jt.toFixed(1)} Junior`} + ${exitDisabled ? "$0 SLP" : `$${model.balances.lt.toFixed(1)} SLP`}`
                  }
                  title="Capital and protection"
                >
                  <DayV3CapitalStack
                    defaults={defaults}
                    poolSeniorWeight={model.pool.seniorWeight}
                    balances={model.balances}
                    coverage={resolved.coverage}
                    minLiquidity={resolved.minLiquidity}
                    targetUtilization={DAY_TARGET_UTILIZATION}
                    unit={returnUnit}
                  />
                  <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h3 className="mb-3 text-[13px] font-semibold">
                      Who absorbs a source loss
                    </h3>
                    <DayV3LossWaterfall
                      metrics={model.explainer.coverage}
                      unit={returnUnit}
                    />
                  </div>
                </DayV3ModelGroup>

                <DayV3ModelGroup
                  id="day-v3-exit-models"
                  index={2}
                  preview={
                    exitDisabled
                      ? "Immediate pool exit is off · no SLP or execution curve."
                      : exitView.status === "missing-goal"
                        ? "Complete both exit questions above to model capacity, proceeds, and pool depth."
                        : exitView.status === "infeasible"
                          ? "No feasible pool at the current exit size, payout floor, timing, and external spread assumption."
                          : exitView.status === "unresolved"
                            ? "Pool validation is unavailable · your inputs remain saved."
                            : exitView.status === "resolving"
                              ? "Checking the pool terms and rebuilding the exit curve…"
                              : `${immediateExitSharePct === null ? "Exit pending" : `$${immediateExitSharePct.toFixed(2)} selected sale`} → ${exitView.proceeds === null ? "proceeds pending" : `$${exitView.proceeds.toFixed(2)} proceeds`} → ${exitView.slpPer100 === null ? "SLP pending" : `$${exitView.slpPer100.toFixed(2)} SLP`}`
                  }
                  title="Senior exit and pool depth"
                >
                  <div
                    className="flex min-w-0 flex-col gap-4"
                    data-model-column="exit"
                  >
                    <DayV3ExitModel
                      exit={exitView}
                      minimumProceedsPer100={minimumProceedsPer100}
                      promisedExitSharePct={immediateExitSharePct}
                    />

                    {exitDisabled ? null : model.pool.swapFeeBps !== null ? (
                      <DayV3ExitCost
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
                    ) : (
                      <Card
                        data-prerequisite-state="exit-inputs"
                        weight="quiet"
                      >
                        <CardHeader>
                          <CardTitle className="text-[17px]">
                            Complete the exit setup above
                          </CardTitle>
                          <CardDescription>
                            {exitView.status === "infeasible"
                              ? "These exit terms do not produce a deployable pool. Change the inputs identified in the Senior exit section to redraw the curve."
                              : "Finish the Senior exit section and resolve its live template. The one-trade curve will appear here; V3 does not fill this space with dashes or a fallback pool."}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    )}
                  </div>
                </DayV3ModelGroup>

            <DayV3ModelGroup
              id="day-v3-return-models"
              index={3}
              preview={
                sourceApyPct === null
                  ? "Enter the source yield above to calculate Senior, Junior, and SLP APYs."
                  : displayedReturnState !== "ready"
                    ? "Complete the exit choices or retry market validation to inspect growth, composition, and premium curves."
                    : `${sourceApyPct.toFixed(1)}% source → Senior ${pct(scenario.seniorApy)} · Junior ${protectionDisabled ? "not funded" : pct(scenario.juniorApy)} · SLP ${exitDisabled ? "not funded" : pct(scenario.liquidityApy)}.`
              }
              title="How the returns are produced"
            >
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
                      Enter the custom source&apos;s net annual yield to
                      calculate return projections and their split across
                      Senior, Junior, and SLP.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : displayedReturnState !== "ready" ? (
                <Card data-model-state={displayedReturnState} weight="quiet">
                  <CardHeader>
                    <CardTitle>Return models are waiting for market terms</CardTitle>
                    <CardDescription>
                      Complete or revise the Senior exit above. Return charts do not use fallback fees or pool parameters.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                  <Card weight="quiet">
                    <CardHeader>
                      <CardTitle>Growth over a year</CardTitle>
                      <CardDescription>
                        Compounded from the scenario annual rates above.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DayV3Chart data={chartData} unit={returnUnit} />
                    </CardContent>
                  </Card>

                  <DayV3Comparison
                    poolCarry={model.poolCarry}
                    poolEconomics={{
                      seniorWeight: model.pool.seniorWeight,
                      stableYield: model.pool.stableYield,
                      swapFeeBps: model.pool.swapFeeBps,
                      turnoverPerYear: model.pool.turnoverPerYear,
                    }}
                    positions={positions as DayV3PositionBreakdown[]}
                    shares={{
                      coveragePct: inputs.coveragePct,
                      curveOverridden,
                      liquidityPct: inputs.liquidityPct,
                      riskSharePct: resolved.riskYieldShare * 100,
                      liqSharePct: resolved.liquidityYieldShare * 100,
                      targetUtilization: DAY_TARGET_UTILIZATION,
                    }}
                    source={source}
                    unit={returnUnit}
                  />
                </div>
              )}

              {displayedReturnState === "ready" ? (
                <DayV3YieldModels
                  curveOverridden={curveOverridden}
                  liquidity={{
                    y0: resolved.liqY0,
                    y100: resolved.liqY100,
                    yTarget: resolved.liquidityYieldShare,
                  }}
                  risk={{
                    y0: resolved.y0,
                    y100: resolved.y100,
                    yTarget: resolved.riskYieldShare,
                  }}
                  seniorShareOfCapital={
                    model.balances.st + model.balances.jt + model.balances.lt >
                    0
                      ? model.balances.st /
                        (model.balances.st +
                          model.balances.jt +
                          model.balances.lt)
                      : 1
                  }
                  sourceApy={source}
                  target={DAY_TARGET_UTILIZATION}
                />
              ) : null}
            </DayV3ModelGroup>

          </DayV3ModelAccordion>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4">
          <div className="min-w-0">
            <strong className="text-[13px] font-semibold">
              Ready to continue?
            </strong>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--secondary)]">
              Royco Deploy collects final contract policy and revalidates the
              live market before deployment.
            </p>
          </div>
          <a
            className={dayV3ButtonVariants({ size: "lg", variant: "primary" })}
            href="https://www.royco.org/deploy-market"
            rel="noreferrer"
            target="_blank"
          >
            Continue in Royco Deploy
          </a>
      </div>

      <p className="max-w-[70ch] text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        Educational simulator only. No securities are offered through this page.
        Forward projections are mechanism simulations, not forecasts or
        announced terms. Royco Deploy independently validates final market
        settings.
      </p>
    </main>
  );
}
