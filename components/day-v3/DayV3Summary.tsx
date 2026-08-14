"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV3Chart, { type DayV3Point } from "@/components/day-v3/DayV3Chart";
import DayV3Comparison, {
  DAY_V3_TONE_DOT,
  type DayV3PoolCarryBreakdown,
  type DayV3PositionBreakdown,
} from "@/components/day-v3/DayV3Comparison";
import DayV3Backtest from "@/components/day-v3/DayV3Backtest";
import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3CapitalStack from "@/components/day-v3/DayV3CapitalStack";
import DayV3Deployment from "@/components/day-v3/DayV3Deployment";
import DayV3DeploymentPolicy from "@/components/day-v3/DayV3DeploymentPolicy";
import DayV3DeploymentTarget from "@/components/day-v3/DayV3DeploymentTarget";
import DayV3DesignOutcome, {
  type DayV3OutcomeSnapshot,
} from "@/components/day-v3/DayV3DesignOutcome";
import DayV3Disclosure from "@/components/day-v3/DayV3Disclosure";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3ExitCost from "@/components/day-v3/DayV3ExitCost";
import DayV3ExitModel from "@/components/day-v3/DayV3ExitModel";
import DayV3Group, {
  DayV3GroupAccordion,
} from "@/components/day-v3/DayV3Group";
import DayV3Hero from "@/components/day-v3/DayV3Hero";
import DayV3Goals, {
  DayV3OperationalFacts,
  type DayV3ExitView,
  type DayV3ProtectedExitView,
  type DayV3ProtectionView,
  type DayV3RecoveryView,
} from "@/components/day-v3/DayV3Goals";
import DayV3LossWaterfall from "@/components/day-v3/DayV3LossWaterfall";
import DayV3MarketSelect from "@/components/day-v3/DayV3MarketSelect";
import DayV3ModelGroup, {
  DayV3ModelAccordion,
} from "@/components/day-v3/DayV3ModelGroup";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import DayV3PremiumCurveEditor from "@/components/day-v3/DayV3PremiumCurveEditor";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import DayV3Source from "@/components/day-v3/DayV3Source";
import DayV3YieldModels from "@/components/day-v3/DayV3YieldModels";
import { useDayV3PoolDesign } from "@/components/day-v3/useDayV3PoolDesign";
import { useDayV3SimulationPoolDesign } from "@/components/day-v3/useDayV3SimulationPoolDesign";
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
  dayV3HandoffMarketId,
  dayV3MinimumLiquidityForPoolFunding,
  deriveDayV3StartingYieldCurvePolicy,
  deriveDayV3ProtectedExitBonus,
  normalizeDayV3Defaults,
  recommendDayV3Coverage,
  recommendDayV3ProtectedExitTrigger,
  runDayV3RecoveryAnalysis,
  runDayV3ProtectedExitScenarios,
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
  DayV3ExpiryPolicy,
  DayV3Goals as DayV3ResolvedGoals,
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
/** The two jobs this page does. Simulate answers what a position pays and
 *  what it stands to lose. Deploy is for someone who has to set every
 *  parameter a real market takes and hand it to the deploy flow. */
type DayV3Mode = "simulate" | "deploy";

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
  const hasManualOverrides = Object.values(manualOverrides).some(
    (value) => value !== null,
  );
  // How much of the mechanism to show. Simple answers "what would I earn, and
  // what would I lose", and stops there. Deploy is the other job: someone who
  // has decided and now has to set every parameter a real market takes. The two
  // share one model, so the figures never disagree between them.
  const [mode, setMode] = useState<DayV3Mode>(linked?.mode ?? "simulate");
  const deploying = mode === "deploy";
  const [starterFields, setStarterFields] = useState<
    Set<DayV3StarterDefaultField>
  >(() => new Set(starterDefaultFields));
  const starterScenarioActive = starterFields.size > 0;
  const markStarterFieldEdited = (field: DayV3StarterDefaultField) => {
    setStarterFields((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  };
  const clearStarterFields = () => setStarterFields(new Set());
  // Deploy-only overrides stay in the URL and component state when the reader
  // switches views, but they must not silently change a Simulate result after
  // their controls disappear. Simulate is derived only from its visible goals.
  const activeManualOverrides = useMemo(
    () => dayV3ActiveOverrides(deploying, manualOverrides),
    [deploying, manualOverrides],
  );
  const hasActiveManualOverrides = deploying && hasManualOverrides;
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
  // the market, so it follows an imported draft too. The goal-driven custom
  // design is normalized in dollars because its pool promises, capital stack,
  // and deployment handoff are all stated as exit-asset value per $100 Senior.
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
  const protectionDisabled = protectedDrawdownPct === 0;
  const exitDisabled = immediateExitSharePct === 0;
  const [entryPointSettlementDays, setEntryPointSettlementDays] = useState<
    number | null
  >(linked?.entryPointSettlementDays ?? null);
  const [collateralToExitDays, setCollateralToExitDays] = useState<
    number | null
  >(linked?.collateralToExitDays ?? null);
  const [collateralToExitCostBps, setCollateralToExitCostBps] = useState<
    number | null
  >(linked?.collateralToExitCostBps ?? null);
  const [fixedTermGraceDays, setFixedTermGraceDays] = useState<number | null>(
    linked?.fixedTermGraceDays ?? null,
  );
  const [navUpdateDays, setNavUpdateDays] = useState<number | null>(
    linked?.navUpdateDays ?? null,
  );
  const [depositDelaySeconds, setDepositDelaySeconds] = useState<number | null>(
    linked?.depositDelaySeconds ?? null,
  );
  const [depositExpirySeconds, setDepositExpirySeconds] =
    useState<DayV3ExpiryPolicy | null>(linked?.depositExpirySeconds ?? null);
  const [withdrawalExpirySeconds, setWithdrawalExpirySeconds] =
    useState<DayV3ExpiryPolicy | null>(linked?.withdrawalExpirySeconds ?? null);
  const [gateByOracleUpdate, setGateByOracleUpdate] = useState<boolean | null>(
    linked?.gateByOracleUpdate ?? null,
  );
  const [maxReinvestmentSlippageBps, setMaxReinvestmentSlippageBps] = useState<
    number | null
  >(linked?.maxReinvestmentSlippageBps ?? null);
  const [deploymentTarget, setDeploymentTarget] = useState(
    linked?.target ?? null,
  );
  const [incentiveBudgetPer100, setIncentiveBudgetPer100] = useState<
    number | null
  >(linked?.incentiveBudgetPer100 ?? null);
  const [protectedExitThresholdOverride, setProtectedExitThresholdOverride] =
    useState<number | null>(manualOverrides.protectedExitThresholdPct);
  // The accountant receives zero while the issuer has not made a recovery-time
  // decision. The unresolved state stays visible in the goal panel and export.
  const [observationDays, setObservationDays] = useState(
    linked?.recoveryDays ?? 0,
  );
  const [maintainCoverage, setMaintainCoverage] = useState(false);
  const chooseJuniorSupport = (enabled: boolean) => {
    markStarterFieldEdited("drawdown");
    markStarterFieldEdited("recovery");
    markStarterFieldEdited("grace");
    if (!enabled) {
      setProtectedDrawdownPct(0);
      setRecoveryMode("none");
      setRecoveryDaysInput(0);
      setObservationDays(0);
      setFixedTermGraceDays(0);
      setIncentiveBudgetPer100(0);
      setProtectedExitThresholdOverride(null);
      setManualOverrides((current) => ({
        ...current,
        coveragePct: null,
        protectedExitThresholdPct: null,
        protectedExitBonusPct: null,
        jrYieldShareAtZeroPct: null,
        jrYieldShareAtTargetPct: null,
        jrYieldShareAtFullPct: null,
      }));
      return;
    }
    if (protectedDrawdownPct === null || protectedDrawdownPct === 0) {
      setProtectedDrawdownPct(15);
      setRecoveryMode("none");
      setRecoveryDaysInput(0);
      setObservationDays(0);
      setFixedTermGraceDays(0);
    }
  };
  const chooseSlpSupport = (enabled: boolean) => {
    markStarterFieldEdited("exit-amount");
    markStarterFieldEdited("payout");
    markStarterFieldEdited("conversion-days");
    markStarterFieldEdited("conversion-cost");
    if (!enabled) {
      setImmediateExitSharePct(0);
      setMinimumProceedsPer100(0);
      setCollateralToExitDays(null);
      setCollateralToExitCostBps(null);
      setMaxReinvestmentSlippageBps(null);
      setManualOverrides((current) => ({
        ...current,
        minimumLiquidityPct: null,
        maximumDiscountPct: null,
        depthAtNav: null,
        maximumPremiumPct: null,
        poolCapitalPer100: null,
        slpYieldShareAtZeroPct: null,
        slpYieldShareAtTargetPct: null,
        slpYieldShareAtFullPct: null,
      }));
      return;
    }
    if (immediateExitSharePct === null || immediateExitSharePct === 0) {
      setImmediateExitSharePct(10);
      setMinimumProceedsPer100(95);
      setCollateralToExitDays(0);
      setCollateralToExitCostBps(50);
    }
  };
  // Yield curves are Deploy inputs. They stay in URL state across a mode
  // switch, while `activeManualOverrides` prevents hidden Deploy values from
  // changing the deliberately minimal Simulate model.
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
      // Simulate always has a visible starter pool. This is the shared Day
      // template's illustrative fee assumption, not a deployment fee: a live
      // RWA response replaces it atomically when available, while Deploy
      // remains unresolved until that response exists.
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
    setFixedTermGraceDays(null);
    setNavUpdateDays(null);
    setDepositDelaySeconds(null);
    setDepositExpirySeconds(null);
    setWithdrawalExpirySeconds(null);
    setGateByOracleUpdate(null);
    setMaxReinvestmentSlippageBps(null);
    setIncentiveBudgetPer100(null);
    setProtectedExitThresholdOverride(null);
    setManualOverrides(EMPTY_DAY_V3_OVERRIDES);
    setObservationDays(0);
    setMaintainCoverage(next.defaults.maintainCoverage);
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
    if (nextCustom) {
      setSourceApyPct(DAY_V3_STARTER_DEFAULTS.sourceApyPct);
    }
  };

  const clearManualOverrides = () => {
    setManualOverrides(EMPTY_DAY_V3_OVERRIDES);
    setProtectedExitThresholdOverride(null);
  };

  const resetYieldCurveOverrides = () => {
    setManualOverrides((current) => ({
      ...current,
      jrYieldShareAtZeroPct: null,
      jrYieldShareAtTargetPct: null,
      jrYieldShareAtFullPct: null,
      slpYieldShareAtZeroPct: null,
      slpYieldShareAtTargetPct: null,
      slpYieldShareAtFullPct: null,
    }));
  };

  const protectionRecommendation = useMemo(
    () =>
      protectedDrawdownPct === null
        ? null
        : recommendDayV3Coverage(simulationDefaults, { protectedDrawdownPct }),
    [protectedDrawdownPct, simulationDefaults],
  );
  const coveragePct = protectionDisabled
    ? 0
    : (activeManualOverrides.coveragePct ??
      (protectionRecommendation?.status === "recommended"
        ? (protectionRecommendation.coverage.value ?? 0)
        : 0));

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
      exitDisabled ||
      protectedDrawdownPct === null ||
      recoveryDaysInput === null ||
      immediateExitSharePct === null ||
      minimumProceedsPer100 === null ||
      entryPointSettlementDays === null ||
      fixedTermGraceDays === null ||
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
      entryPointSettlementDays,
      collateralToExitDays,
      collateralToExitCostBps,
      fixedTermGraceDays,
      navUpdateDays,
      target: deploymentTarget,
    };
  }, [
    deploymentTarget,
    collateralToExitCostBps,
    collateralToExitDays,
    entryPointSettlementDays,
    exitDisabled,
    fixedTermGraceDays,
    immediateExitSharePct,
    minimumProceedsPer100,
    navUpdateDays,
    protectedDrawdownPct,
    recoveryDaysInput,
  ]);
  const poolDesignContext = useMemo(
    () =>
      sourceApyPct === null
        ? null
        : {
            sourceApyPct,
            // Dawn does not know the deployment draft's exit token yet. RWA
            // supplies and validates this context again before applying terms.
            exitAsset: null,
            exitAssetRateProvider: null,
            exitAssetYieldBearing: null,
          },
    [sourceApyPct],
  );
  const poolDesign = useDayV3PoolDesign(
    deploying ? poolDesignGoals : null,
    deploying ? poolDesignContext : null,
    deploying,
  );
  const simulationPoolDesignGoals = useMemo(
    () =>
      exitDisabled ||
      protectedDrawdownPct === null ||
      immediateExitSharePct === null ||
      minimumProceedsPer100 === null
        ? null
        : {
            protectedDrawdownPct,
            // Recovery timing does not size the exit pool. The simulation
            // service still requires the schema field, so unresolved timing is
            // sent as a neutral transport value and remains visibly unresolved
            // everywhere recovery or history is modeled.
            recoveryDays: recoveryDaysInput ?? 0,
            immediateExitSharePct,
            minimumProceedsPer100,
          },
    [
      immediateExitSharePct,
      exitDisabled,
      minimumProceedsPer100,
      protectedDrawdownPct,
      recoveryDaysInput,
    ],
  );
  const simulationPoolDesign = useDayV3SimulationPoolDesign(
    deploying ? null : simulationPoolDesignGoals,
    deploying ? null : sourceApyPct,
  );
  const activePoolDesign = deploying ? poolDesign.design : simulationPoolDesign;
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
  // Deploy starts with the same visible, non-exported modeling basis as
  // Simulate while the companion RWA service resolves the selected template.
  // This keeps the inputs and return models useful without smuggling a
  // fallback fee or pool design into the deployment handoff.
  const illustrativeDeployDefaultsActive =
    deploying && !hasPoolOverride && canonicalEngineOverrides === null;
  const deploymentCanonicalPoolDesign =
    deploying && poolDesign.design.status === "resolved" && !hasPoolOverride
      ? poolDesign.design.result
      : null;
  const deploymentYieldTarget =
    deploymentCanonicalPoolDesign?.policy ??
    (poolDesign.inventory.status === "ready"
      ? (poolDesign.inventory.targets.find(
          (target) =>
            deploymentTarget !== null &&
            target.chainId === deploymentTarget.chainId &&
            target.templateId === deploymentTarget.templateId,
        ) ?? null)
      : null);
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
  // Pool overrides are export-only until the canonical service revalidates
  // them. Both views may display the shared Day template's clearly labeled
  // starter liquidity while that service is unavailable, but Deploy never
  // exports it as a resolved pool term.
  const liquidityPct = exitDisabled
    ? 0
    : liquidityRecommendation?.status === "recommended"
      ? (liquidityRecommendation.minimumLiquidity.value ?? 0)
      : deploying && !illustrativeDeployDefaultsActive
        ? 0
        : defaults.minLiquidity * 100;
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
          immediateExitSharePct: immediateExitSharePct ?? 0,
          policyBasis:
            canonicalEngineOverrides !== null
              ? ("live" as const)
              : illustrativeDeployDefaultsActive || !deploying
                ? ("illustrative" as const)
                : ("unresolved" as const),
        },
        canonicalEngineOverrides,
      ),
    [
      canonicalEngineOverrides,
      coveragePct,
      deploying,
      effectiveBandPct,
      liqShareOverride,
      liqY0Override,
      liqY100Override,
      liquidityPct,
      immediateExitSharePct,
      illustrativeDeployDefaultsActive,
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
  // The starter policy comes from the shared Day template and is labeled as
  // illustrative everywhere it is shown. Deploy still requires canonical
  // live policy before any displayed answer can enter the handoff.
  const modeledReturnPolicyResolved = inputs.policyBasis !== "unresolved";
  const returnDisplayState = dayV3ReturnDisplayState({
    modelUpdating,
    sourceApyResolved: sourceApyPct !== null,
    returnPolicyResolved: modeledReturnPolicyResolved,
  });
  const simulationPromiseComplete =
    protectedDrawdownPct !== null &&
    immediateExitSharePct !== null &&
    minimumProceedsPer100 !== null;

  // One place decides what the engine is actually run with, so the panel that
  // displays the curve and the run that produces the numbers cannot disagree.
  const resolved = useMemo(() => {
    const coverage = inputs.coveragePct / 100;
    const minLiquidity = inputs.liquidityPct / 100;
    const startingPolicy = deriveDayV3StartingYieldCurvePolicy(defaults, {
      coveragePct: inputs.coveragePct,
      minimumLiquidityPct: inputs.liquidityPct,
    });
    const manualCurveComplete = [
      inputs.y0Override,
      inputs.riskShareOverride,
      inputs.y100Override,
      inputs.liqY0Override,
      inputs.liqShareOverride,
      inputs.liqY100Override,
    ].every((value) => value !== null);
    const zero = { y0Pct: 0, yTargetPct: 0, y100Pct: 0 };
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
      : (startingPolicy.design ?? { junior: zero, slp: zero });
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
  const activeProtectedExitThresholdOverride = deploying
    ? protectedExitThresholdOverride
    : null;
  const protectedExitThresholdPct =
    activeProtectedExitThresholdOverride ??
    protectedExitTrigger?.trigger.value ??
    null;
  const bonusBudget = deploying ? incentiveBudgetPer100 : null;
  const protectedExitBonus = useMemo(() => {
    const manualBonusPct = activeManualOverrides.protectedExitBonusPct;
    const result = deriveDayV3ProtectedExitBonus(
      manualBonusPct ?? bonusBudget,
      protectedExitThresholdPct,
    );
    return manualBonusPct !== null && result.bonus.value !== null
      ? {
          ...result,
          bonus: {
            ...result.bonus,
            origin: "manual-override" as const,
            evidence: [
              `The link manually overrides the deployable bonus rate to ${manualBonusPct}%.`,
            ],
          },
          reason:
            "A manual Protected Exit bonus override is active and must be revalidated by deployment.",
        }
      : result;
  }, [
    bonusBudget,
    activeManualOverrides.protectedExitBonusPct,
    protectedExitThresholdPct,
  ]);
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
        swapFeeBps:
          inputs.engineOverrides?.swapFeeBps ??
          (inputs.policyBasis === "illustrative" ? cfg.swapFeeBps : null),
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
    mode,
    sourceApyPct,
    protectedDrawdownPct,
    recoveryDays: recoveryDaysInput,
    immediateExitSharePct,
    minimumProceedsPer100,
    entryPointSettlementDays,
    collateralToExitDays,
    collateralToExitCostBps,
    fixedTermGraceDays,
    navUpdateDays,
    depositDelaySeconds,
    depositExpirySeconds,
    withdrawalExpirySeconds,
    gateByOracleUpdate,
    maxReinvestmentSlippageBps,
    incentiveBudgetPer100,
    target: deploymentTarget,
    starterFields: [...starterFields],
    overrides: {
      coveragePct: manualOverrides.coveragePct,
      minimumLiquidityPct: manualOverrides.minimumLiquidityPct,
      maximumDiscountPct: manualOverrides.maximumDiscountPct,
      depthAtNav: manualOverrides.depthAtNav,
      maximumPremiumPct: manualOverrides.maximumPremiumPct,
      protectedExitThresholdPct: protectedExitThresholdOverride,
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
  const startingCurveBasis = curveOverridden
    ? "These six anchors are issuer-edited. Reset recalculates the starting curves from the current Minimum Coverage and Minimum Liquidity."
    : resolved.startingPolicy.status === "resolved"
      ? `Starting floor: Junior YT matches ${inputs.coveragePct.toFixed(2)}% Minimum Coverage at ${(resolved.riskYieldShare * 100).toFixed(2)}%; SLP YT matches ${inputs.liquidityPct.toFixed(2)}% Minimum Liquidity at ${(resolved.liquidityYieldShare * 100).toFixed(2)}%. This capital-parity floor removes the prior 2× uplift; use the accountant-derived returns beside the controls to decide whether more compensation is needed. Y0 and Y100 retain the selected source's shape.${resolved.startingPolicy.budgetScale !== null && resolved.startingPolicy.budgetScale < 1 ? " Above-target segments are proportionally compressed to fit the shared 100% modeling budget." : ""}`
      : resolved.startingPolicy.evidence.join(" ");
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
      // A curve is one six-anchor input. On the first edit, preserve the other
      // five resolved anchors so the URL remains complete and reload-safe.
      jrYieldShareAtZeroPct: current.jrYieldShareAtZeroPct ?? resolved.y0 * 100,
      jrYieldShareAtTargetPct:
        current.jrYieldShareAtTargetPct ?? resolved.riskYieldShare * 100,
      jrYieldShareAtFullPct:
        current.jrYieldShareAtFullPct ?? resolved.y100 * 100,
      slpYieldShareAtZeroPct:
        current.slpYieldShareAtZeroPct ?? resolved.liqY0 * 100,
      slpYieldShareAtTargetPct:
        current.slpYieldShareAtTargetPct ?? resolved.liquidityYieldShare * 100,
      slpYieldShareAtFullPct:
        current.slpYieldShareAtFullPct ?? resolved.liqY100 * 100,
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
                returnDisplayState === "ready"
                  ? model.scenario.juniorApy * 100
                  : null,
              status: "recommended",
              message: `${protectionRecommendation.reason}${returnDisplayState === "updating" ? " Recalculating the return with the current pool design…" : returnDisplayState === "ready" ? (inputs.engineOverrides !== null ? " Live policy protocol fees are included in the displayed return." : " The displayed return uses the illustrative simulation starter policy; Deploy replaces it with live template terms.") : " Junior return remains unresolved until a source yield and live policy supply every return input."}`,
            }
          : {
              coveragePct: null,
              juniorPer100: null,
              juniorApy: null,
              status: "infeasible",
              message: protectionRecommendation.reason,
            };

  const exitGoalsComplete = deploying
    ? exitDisabled || poolDesignGoals !== null
    : exitDisabled ||
      (simulationPoolDesignGoals !== null && sourceApyPct !== null);
  const exitOverrides = activeManualOverrides;
  const canonicalExit = canonicalPoolDesign;
  const canonicalExitRecommendation = canonicalExit?.recommendation ?? null;
  const canonicalOutcomes = canonicalExitRecommendation?.outcomes ?? null;
  const liquidityResolved =
    liquidityRecommendation?.status === "recommended" &&
    liquidityRecommendation.minimumLiquidity.value !== null;
  const illustrativeExitActive =
    !exitDisabled &&
    exitGoalsComplete &&
    !hasPoolOverride &&
    canonicalExitRecommendation === null &&
    activePoolDesign.status !== "infeasible";
  const illustrativeBoundary = model.explainer.liquidity.boundaryQuote;
  const illustrativeSeniorNAV = model.illustrativeExit.openingSeniorNAV;
  const illustrativePer100 = (value: number) =>
    illustrativeSeniorNAV > 0 ? (value / illustrativeSeniorNAV) * 100 : 0;
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
            : illustrativeExitActive
              ? "illustrative"
              : "unresolved";
  const exitView: DayV3ExitView = {
    status: exitStatus,
    message: exitDisabled
      ? "Immediate Senior exit is off. No SLP capital, pool quote, or E-CLP parameters are required for this scenario."
      : !exitGoalsComplete
        ? deploying
          ? "Complete protection, operating facts, both exit goals, and a deployment target to resolve a pool design."
          : "Set the source yield, protection goal, and both exit goals to run the models. Recovery timing is optional in Simulate."
        : hasPoolOverride
          ? "This link contains manual pool overrides. Outcomes are withheld until the canonical service revalidates those exact fields."
          : illustrativeExitActive
            ? `Illustrative starter loaded: ${liquidityPct.toFixed(1)}% minimum liquidity, ${effectiveBandPct.toFixed(1)}% maximum discount, and ${simulationDefaults.swapFeeBps} bps execution assumption.${activePoolDesign.status === "resolving" ? " Checking the selected live template now." : " The selected live template is unavailable."} These values are excluded from the deployment handoff until live validation succeeds.`
            : activePoolDesign.status === "resolved" && !liquidityResolved
              ? (liquidityRecommendation?.reason ??
                "The canonical pool was resolved, but its Minimum Liquidity mapping remains unresolved.")
              : `${activePoolDesign.message}${illustrativeExitActive ? " Illustrative starter values remain visible below; they are excluded from the deployment handoff until the live template validates them." : ""}${canonicalOutcomes ? (canonicalOutcomes.restockEconomicFromSoldPct === null ? " The immediate pool quote is resolved; restock remains outside Simulate until conversion time and cost are supplied in Deploy." : " Restock economics use the issuer-supplied conversion assumptions and remain a scenario, not a guarantee.") : ""}`,
    sellablePer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.amountSellablePer100Senior ??
        (illustrativeExitActive
          ? illustrativePer100(illustrativeBoundary.filledNAV)
          : null)),
    proceeds: exitDisabled
      ? 0
      : (canonicalOutcomes?.proceedsForPromisedExit ??
        (illustrativeExitActive
          ? illustrativePer100(model.illustrativeExit.quote.stableOutNAV)
          : null)),
    lowestPayoutPer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.lowestModeledPayoutPer100 ??
        (illustrativeExitActive
          ? illustrativeBoundary.executionPrice * 100
          : null)),
    slpPer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.requiredPoolFundingPer100Senior ??
        (illustrativeExitActive
          ? illustrativePer100(model.balances.lt)
          : null)),
    restockPoint: canonicalOutcomes?.restockEconomicFromSoldPct ?? null,
    restockOperationalHurdleBps:
      canonicalOutcomes?.restockOperationalHurdleBps ?? null,
    restockHurdleBps: canonicalOutcomes?.restockHurdleBps ?? null,
    restockMarginBps:
      canonicalOutcomes?.restockMarginAfterPromisedExitBps ?? null,
    minimumLiquidityPct: exitDisabled
      ? 0
      : (exitOverrides?.minimumLiquidityPct ??
        liquidityRecommendation?.minimumLiquidity.value ??
        (illustrativeExitActive ? liquidityPct : null)),
    maximumDiscountPct:
      exitOverrides?.maximumDiscountPct ??
      (canonicalExitRecommendation
        ? canonicalExitRecommendation.fields.maximumDiscountBps.value / 100
        : illustrativeExitActive
          ? effectiveBandPct
          : null),
    lambda:
      exitOverrides?.depthAtNav ??
      canonicalExitRecommendation?.fields.depthAtNavLambda.value ??
      (illustrativeExitActive ? model.pool.concentration : null),
    maximumPremiumBps:
      exitOverrides?.maximumPremiumPct !== null &&
      exitOverrides?.maximumPremiumPct !== undefined
        ? exitOverrides.maximumPremiumPct * 100
        : (canonicalExitRecommendation?.fields.maximumPremiumBps.value ?? null),
    restingExitAssetPct:
      canonicalOutcomes?.exitAssetShareAtNavPct ??
      (illustrativeExitActive ? (1 - model.pool.seniorWeight) * 100 : null),
    restingSeniorPct:
      canonicalOutcomes?.seniorShareAtNavPct ??
      (illustrativeExitActive ? model.pool.seniorWeight * 100 : null),
    swapFeeBps:
      canonicalExit?.policy.swapFeeBps ??
      (illustrativeExitActive ? simulationDefaults.swapFeeBps : null),
    feeSource: canonicalExit
      ? `${canonicalExit.policy.templateName} on ${canonicalExit.policy.chainName}, block ${canonicalExit.policy.blockNumber}. Protocol fees: ST ${(Number(BigInt(canonicalExit.policy.protocolFees.stProtocolFeeWad)) / 1e16).toFixed(1)}%, JT ${(Number(BigInt(canonicalExit.policy.protocolFees.jtProtocolFeeWad)) / 1e16).toFixed(1)}%, JT premium ${(Number(BigInt(canonicalExit.policy.protocolFees.jtYieldShareProtocolFeeWad)) / 1e16).toFixed(1)}%, SLP premium ${(Number(BigInt(canonicalExit.policy.protocolFees.lptYieldShareProtocolFeeWad)) / 1e16).toFixed(1)}%. Resolved ${canonicalExit.policy.resolvedAt}`
      : null,
  };
  // Deploy may use the illustrative starter policy to keep inputs responsive,
  // but it must not present those returns as answers for a canonical design
  // that is unresolved or infeasible. Simulate is explicitly allowed to show
  // the disclosed illustrative basis; Deploy is not.
  const deployDesignBlocksReturns =
    deploying &&
    !exitDisabled &&
    exitView.status !== "recommended" &&
    exitView.status !== "disabled";
  const displayedReturnState = modelUpdating
    ? ("updating" as const)
    : deployDesignBlocksReturns
      ? ("missing-policy" as const)
      : returnDisplayState;
  const outcomeBasis: DayV3OutcomeSnapshot["basis"] =
    sourceApyPct === null ||
    protectedDrawdownPct === null ||
    immediateExitSharePct === null ||
    (!exitDisabled && minimumProceedsPer100 === null)
      ? "incomplete"
      : deployDesignBlocksReturns
        ? activePoolDesign.status === "infeasible"
          ? "blocked"
          : activePoolDesign.status === "resolving"
            ? "checking"
            : activePoolDesign.status === "unresolved"
              ? "unavailable"
              : "incomplete"
        : protectionDisabled && exitDisabled
          ? "direct"
          : inputs.policyBasis === "live"
            ? "live"
            : "illustrative";
  const designOutcome = useMemo<DayV3OutcomeSnapshot>(
    () => ({
      sourceApyPct,
      protectedDrawdownPct,
      coveragePct: protectionView.coveragePct,
      juniorPer100: protectionView.juniorPer100,
      immediateExitSharePct,
      minimumProceedsPer100,
      slpPer100: exitView.slpPer100,
      proceeds: exitView.proceeds,
      seniorApyPct:
        displayedReturnState === "ready" ? scenario.seniorApy * 100 : null,
      juniorApyPct:
        displayedReturnState === "ready" && !protectionDisabled
          ? scenario.juniorApy * 100
          : protectionDisabled
            ? 0
            : null,
      slpApyPct:
        displayedReturnState === "ready" && !exitDisabled
          ? scenario.liquidityApy * 100
          : exitDisabled
            ? 0
            : null,
      basis: outcomeBasis,
      message:
        outcomeBasis === "blocked"
          ? exitView.message
          : outcomeBasis === "checking"
            ? "Refreshing the selected template fee and canonical E-CLP policy. Deployment returns stay hidden until the response matches the current goals."
            : outcomeBasis === "unavailable"
              ? `${exitView.message} Your issuer inputs remain saved; V3 does not substitute a fallback pool or fee.`
              : outcomeBasis === "incomplete"
                ? "Complete the open issuer decisions above. V3 will size the capital, resolve the exit design, and update every model from the same terms."
                : outcomeBasis === "live"
                  ? "The capital, exit, and return outcomes below use the selected template's refreshed fee and canonical E-CLP policy."
                  : outcomeBasis === "direct"
                    ? "Junior protection and the immediate SLP exit are both off; Senior holds the modeled source directly."
                    : "These outcomes use the disclosed V3 simulation policy. Deploy replaces the pool and fee fields with live validated policy before handoff.",
    }),
    [
      displayedReturnState,
      exitDisabled,
      exitView.message,
      exitView.proceeds,
      exitView.slpPer100,
      immediateExitSharePct,
      minimumProceedsPer100,
      outcomeBasis,
      protectedDrawdownPct,
      protectionDisabled,
      protectionView.coveragePct,
      protectionView.juniorPer100,
      scenario.juniorApy,
      scenario.liquidityApy,
      scenario.seniorApy,
      sourceApyPct,
    ],
  );
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
      activeProtectedExitThresholdOverride !== null
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
        entryPointSettlementDays,
        collateralToExitDays,
        collateralToExitCostBps,
        fixedTermGraceDays,
        navUpdateDays,
        target: deploymentTarget,
      }}
      market={{
        id: dayV3HandoffMarketId(customSource, market.id),
        name: market.identity.marketName,
        asset: market.identity.displayAssetName,
      }}
      poolDesign={deploymentCanonicalPoolDesign}
      yieldTarget={deploymentYieldTarget}
      protectedExit={protectedExitView}
      protection={protectionView}
      deploymentPolicy={{
        depositDelaySeconds,
        depositExpirySeconds,
        withdrawalExpirySeconds,
        gateByOracleUpdate,
        maxReinvestmentSlippageBps,
      }}
      sourceApyPct={sourceApyPct}
      starterValuesConfirmed={!starterScenarioActive}
      yieldCurveDesign={{
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
      }}
      yieldCurvePolicyResolved={deploymentYieldTarget !== null}
    />
  );
  const premiumCurveEditor =
    deploying && (!protectionDisabled || !exitDisabled) ? (
    <DayV3PremiumCurveEditor
      curveOverridden={curveOverridden}
      index={7}
      juniorEnabled={!protectionDisabled}
      juniorModeledApy={scenario.juniorApy}
      startingCurveBasis={startingCurveBasis}
      liqCapPct={resolved.liquidityCeiling * 100}
      liqY0Pct={resolved.liqY0 * 100}
      liqY100Pct={resolved.liqY100 * 100}
      liqYtPct={resolved.liquidityYieldShare * 100}
      onLiqY0Pct={(value) =>
        updateYieldCurveOverride("slpYieldShareAtZeroPct", value)
      }
      onLiqY100Pct={(value) =>
        updateYieldCurveOverride("slpYieldShareAtFullPct", value)
      }
      onLiqYtPct={(value) =>
        updateYieldCurveOverride("slpYieldShareAtTargetPct", value)
      }
      onResetCurve={resetYieldCurveOverrides}
      onRiskY0Pct={(value) =>
        updateYieldCurveOverride("jrYieldShareAtZeroPct", value)
      }
      onRiskY100Pct={(value) =>
        updateYieldCurveOverride("jrYieldShareAtFullPct", value)
      }
      onRiskYtPct={(value) =>
        updateYieldCurveOverride("jrYieldShareAtTargetPct", value)
      }
      riskCapPct={resolved.riskCeiling * 100}
      riskY0Pct={resolved.y0 * 100}
      riskY100Pct={resolved.y100 * 100}
      riskYtPct={resolved.riskYieldShare * 100}
      ready={
        startingCurveIssues.length === 0 &&
        (exitView.status === "recommended" || exitView.status === "disabled")
      }
      starterDefaultsLoaded={
        startingCurveIssues.length === 0 &&
        inputs.policyBasis === "illustrative"
      }
      slpModeledApy={scenario.liquidityApy}
      slpEnabled={!exitDisabled}
      seniorShareOfCapital={
        model.balances.st + model.balances.jt + model.balances.lt > 0
          ? model.balances.st /
            (model.balances.st + model.balances.jt + model.balances.lt)
          : 1
      }
      sourceApy={source}
      targetUtilization={DAY_TARGET_UTILIZATION}
      validationIssues={startingCurveIssues}
    />
    ) : null;
  const sourceReadiness = dayV3InputReadiness([
    { id: "source-yield", label: "Source yield", ready: sourceApyPct !== null },
  ]);
  const deploymentSetupRequirements = [
    {
      id: "target",
      label: "Deployment target",
      ready: deploymentTarget !== null && !starterFields.has("target"),
    },
    {
      id: "settlement",
      label: "Withdrawal settlement delay",
      ready:
        entryPointSettlementDays !== null && !starterFields.has("settlement"),
    },
    ...(!exitDisabled
      ? [
          {
            id: "conversion-days",
            label: "Collateral conversion time",
            ready:
              collateralToExitDays !== null &&
              !starterFields.has("conversion-days"),
          },
          {
            id: "conversion-cost",
            label: "Collateral conversion cost",
            ready:
              collateralToExitCostBps !== null &&
              !starterFields.has("conversion-cost"),
          },
        ]
      : []),
    ...(!protectionDisabled
      ? [
          {
            id: "grace",
            label: "Recovery activation",
            ready: fixedTermGraceDays !== null && !starterFields.has("grace"),
          },
        ]
      : []),
    {
      id: "nav",
      label: "NAV refresh cadence",
      ready: navUpdateDays !== null && !starterFields.has("nav"),
    },
  ];
  const deploymentSetupReadiness = dayV3InputReadiness(
    deploymentSetupRequirements,
  );
  const requestPolicyReadiness = dayV3InputReadiness([
    {
      id: "deposit-delay",
      label: "Deposit settlement delay",
      ready:
        depositDelaySeconds !== null && !starterFields.has("deposit-delay"),
    },
    {
      id: "deposit-expiry",
      label: "Deposit execution window",
      ready: depositExpirySeconds !== null,
    },
    {
      id: "withdrawal-expiry",
      label: "Withdrawal execution window",
      ready: withdrawalExpirySeconds !== null,
    },
    {
      id: "price-gate",
      label: "Post-request oracle gate",
      ready: gateByOracleUpdate !== null && !starterFields.has("price-gate"),
    },
    ...(!exitDisabled
      ? [
          {
            id: "reinvestment",
            label: "Reinvestment slippage ceiling",
            ready: maxReinvestmentSlippageBps !== null,
          },
        ]
      : []),
  ]);
  const deploymentStructureComplete =
    protectedDrawdownPct !== null && immediateExitSharePct !== null;
  const deploymentProtectionComplete =
    protectedDrawdownPct !== null &&
    recoveryDaysInput !== null &&
    !starterFields.has("drawdown") &&
    !starterFields.has("recovery") &&
    (protectionView.status === "recommended" ||
      protectionView.status === "disabled");
  const exitInputReadiness = dayV3ExitInputReadiness({
    enabled: !exitDisabled,
    exitSharePct: immediateExitSharePct,
    minimumProceedsPer100,
  });
  const deploymentExitComplete =
    exitInputReadiness.complete &&
    !starterFields.has("exit-amount") &&
    !starterFields.has("payout");
  const deploymentCurveComplete = startingCurveIssues.length === 0;
  const deploymentProtectedExitComplete =
    protectionDisabled || protectedExitView.status === "scenario-ready";
  const simulationSourceComplete = sourceApyPct !== null;
  const simulationProtectionComplete =
    protectedDrawdownPct !== null &&
    (protectionView.status === "recommended" ||
      protectionView.status === "disabled");
  const simulationExitComplete =
    exitView.status === "recommended" ||
    exitView.status === "illustrative" ||
    exitView.status === "disabled";
  const activeSectionCompletion = deploying
    ? [
        sourceReadiness.complete,
        deploymentStructureComplete,
        deploymentSetupReadiness.complete,
        requestPolicyReadiness.complete,
        ...(!protectionDisabled ? [deploymentProtectionComplete] : []),
        ...(!exitDisabled ? [deploymentExitComplete] : []),
        ...(!protectionDisabled || !exitDisabled
          ? [deploymentCurveComplete]
          : []),
        ...(protectionDisabled ? [] : [deploymentProtectedExitComplete]),
      ]
    : [
        simulationSourceComplete,
        simulationProtectionComplete,
        simulationExitComplete,
      ];
  const completedActiveSections =
    activeSectionCompletion.filter(Boolean).length;
  const inputSteps = deploying
    ? [
        {
          complete: sourceReadiness.complete,
          detail: sourceReadiness.complete ? undefined : "Enter the net source yield.",
          id: "day-v3-source-inputs",
          label: "Choose the yield source",
        },
        {
          complete: deploymentStructureComplete,
          detail: "Choose whether Senior needs Junior protection, an SLP exit pool, or both.",
          id: "day-v3-market-structure-inputs",
          label: "Choose the market structure",
        },
        {
          complete: deploymentSetupReadiness.complete,
          detail: `${deploymentSetupReadiness.missing.length} ${deploymentSetupReadiness.missing.length === 1 ? "answer" : "answers"} needed`,
          id: "day-v3-deployment-setup-inputs",
          label: "Complete market operations",
        },
        {
          complete: requestPolicyReadiness.complete,
          detail: `${requestPolicyReadiness.missing.length} ${requestPolicyReadiness.missing.length === 1 ? "answer" : "answers"} needed`,
          id: "day-v3-request-policy-inputs",
          label: "Set the request policy",
        },
        ...(!protectionDisabled
          ? [
              {
                complete: deploymentProtectionComplete,
                detail:
                  "Choose the loss Senior should survive and its recovery window.",
                id: "day-v3-protection-inputs",
                label: "Review Senior protection",
              },
            ]
          : []),
        ...(!exitDisabled
          ? [
              {
                complete: deploymentExitComplete,
                detail: "Choose the immediate exit amount and minimum payout.",
                id: "day-v3-exit-inputs",
                label: "Review the Senior exit",
              },
            ]
          : []),
        ...(!protectionDisabled || !exitDisabled
          ? [
              {
                complete: deploymentCurveComplete,
                detail: `Review how ${!protectionDisabled && !exitDisabled ? "Junior and SLP share" : !protectionDisabled ? "Junior shares" : "SLP shares"} Senior yield.`,
                id: "day-v3-premium-inputs",
                label: "Review the yield split",
              },
            ]
          : []),
        ...(!protectionDisabled
          ? [
              {
                complete: deploymentProtectedExitComplete,
                detail: "Set the required trigger; the bonus is optional.",
                id: "day-v3-protected-exit-inputs",
                label: "Complete Protected Exit",
              },
            ]
          : []),
      ]
    : [
        {
          complete: simulationSourceComplete,
          detail: "Choose a listed source or enter a custom net yield.",
          id: "day-v3-source-inputs",
          label: "Choose the yield source",
        },
        {
          complete: simulationProtectionComplete,
          detail: "Choose the one-time loss Senior should survive.",
          id: "day-v3-protection-inputs",
          label: "Review Senior protection",
        },
        {
          complete: simulationExitComplete,
          detail: "Choose how much can sell and the minimum payout.",
          id: "day-v3-exit-inputs",
          label: "Review the Senior exit",
        },
      ];
  const nextInputStep = inputSteps.find((step) => !step.complete) ?? null;
  const defaultOpenInputId = starterScenarioActive
    ? "day-v3-source-inputs"
    : nextInputStep?.id ?? null;

  return (
    // Capped rather than full-bleed. Past about 1400px the cards stop gaining
    // anything and the prose lines just get harder to track back to.
    <main className="royco-v3 mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
      <DayV3Hero mode={mode} onModeChange={setMode} />

      {/* Simulate asks only for the goals that directly move the models. Deploy
          adds the operational facts and mappings required to hand off a real
          market. Parent-owned state survives the view switch. */}
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
              {deploying ? "Market design inputs" : "Quick simulation"}
            </h2>
            <p className="text-[11px] text-[var(--tertiary)]">
              {deploying
                ? "Complete the operating facts and deployment terms."
                : "Set the source, protection, and exit promise; then inspect the models."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveManualOverrides ? (
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-3">
          <strong className="font-mono text-[11.5px] tabular-nums text-[var(--secondary)]">
            {starterScenarioActive
              ? deploying
                ? `${completedActiveSections}/${activeSectionCompletion.length} confirmed`
                : "Example loaded · review 3 choices"
              : `${completedActiveSections}/${activeSectionCompletion.length} complete`}
          </strong>
          {starterScenarioActive ? (
            <Badge tone="neutral">illustrative starter</Badge>
          ) : null}
          <span aria-hidden="true" className="flex min-w-24 flex-1 gap-1.5 sm:max-w-36">
            {activeSectionCompletion.map((complete, index) => (
              <span
                className={`h-1.5 flex-1 rounded-full ${complete ? "bg-[var(--theme-green)]" : "bg-[var(--border-subtle)]"}`}
                key={index}
              />
            ))}
          </span>
          {deploying && starterScenarioActive ? (
            <DayV3Button
              className="ml-auto"
              onClick={clearStarterFields}
              size="sm"
              variant="secondary"
            >
              Confirm starter values
            </DayV3Button>
          ) : null}
        </div>

        <DayV3GroupAccordion
          defaultOpenId={defaultOpenInputId}
          guidedTarget={nextInputStep}
          key={deploying ? "deploy" : "simulate"}
        >
          <DayV3Group
            collapsible
            defaultOpen={false}
            docs="tranching"
            docsLabel="How tranching works"
            id="day-v3-source-inputs"
            index={1}
            key={deploying ? "deploy-source" : "simulate-source"}
            status={
              sourceReadiness.complete
                ? { label: "Complete", tone: "complete" }
                : {
                    label: "Incomplete",
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
                      : "Enter the source's net annual rate to update return projections and the deployment handoff."
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
            {customSource ? (
              <DayV3Disclosure
                className="border-t border-[var(--border-subtle)] pt-3"
                description="Adds recovery evidence and a historical backtest"
                summary={
                  draftMarket
                    ? `Historical data · ${draftMarket.series.length.toLocaleString("en-US")} observations`
                    : "Historical data · optional"
                }
                variant="inline"
              >
                <div className="flex w-full min-w-0 flex-col gap-3 sm:min-w-[min(760px,calc(100vw-64px))]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
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
                      markStarterFieldEdited("source");
                      setCustomSource(true);
                      setDraftMarket(next);
                    }}
                  />
                </div>
              </DayV3Disclosure>
            ) : null}
          </DayV3Group>

          {deploying ? (
            <DayV3Group
              collapsible
              defaultOpen={false}
              id="day-v3-market-structure-inputs"
              index={2}
              status={
                deploymentStructureComplete
                  ? { label: "Complete", tone: "complete" }
                  : {
                      label: "Incomplete",
                      tone: "incomplete",
                      missing: ["Junior choice", "SLP choice"],
                    }
              }
              subtitle="Decide whether Senior needs loss protection, immediate liquidity, or both"
              summary={`${protectionDisabled ? "No Junior" : "Junior protection"} · ${exitDisabled ? "No SLP" : "SLP exit pool"}`}
              title="Market structure"
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5">
                  <div>
                    <h4 className="text-[12.5px] font-semibold leading-tight">
                      Does Senior need Junior first-loss protection?
                    </h4>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                      Choose no to remove coverage, recovery timing, Protected
                      Exit, and every Junior premium question below.
                    </p>
                  </div>
                  <DayV3SegmentedControl
                    ariaLabel="Junior support required"
                    onValueChange={(value) =>
                      chooseJuniorSupport(value === "yes")
                    }
                    options={[
                      { label: "Use Junior", value: "yes" },
                      { label: "No Junior", value: "no" },
                    ]}
                    value={
                      protectedDrawdownPct === null
                        ? ""
                        : protectionDisabled
                          ? "no"
                          : "yes"
                    }
                  />
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5">
                  <div>
                    <h4 className="text-[12.5px] font-semibold leading-tight">
                      Does Senior need an immediate SLP exit pool?
                    </h4>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                      Choose no to remove exit sizing, conversion, restocking,
                      reinvestment, and every SLP premium question below.
                    </p>
                  </div>
                  <DayV3SegmentedControl
                    ariaLabel="SLP support required"
                    onValueChange={(value) =>
                      chooseSlpSupport(value === "yes")
                    }
                    options={[
                      { label: "Use an SLP", value: "yes" },
                      { label: "No SLP", value: "no" },
                    ]}
                    value={
                      immediateExitSharePct === null
                        ? ""
                        : exitDisabled
                          ? "no"
                          : "yes"
                    }
                  />
                </div>
              </div>
            </DayV3Group>
          ) : null}

          {deploying ? (
            <DayV3Group
              collapsible
              defaultOpen={false}
              id="day-v3-deployment-setup-inputs"
              index={3}
              status={
                deploymentSetupReadiness.complete
                  ? { label: "Complete", tone: "complete" }
                  : {
                      label: "Incomplete",
                      tone: "incomplete",
                      missing: deploymentSetupReadiness.missing,
                    }
              }
              subtitle="Set where the market deploys and how redemption, conversion, and NAV updates work"
              summary={
                deploymentSetupReadiness.complete
                  ? "Target, settlement, conversion, and NAV cadence set"
                  : `${deploymentSetupReadiness.missing.length} required ${deploymentSetupReadiness.missing.length === 1 ? "answer" : "answers"}`
              }
              title="Market operations"
            >
              <DayV3DeploymentTarget
                message={poolDesign.inventory.message}
                onTarget={(value) => {
                  markStarterFieldEdited("target");
                  setDeploymentTarget(value);
                }}
                selected={deploymentTarget}
                targets={poolDesign.inventory.targets}
              />
              <DayV3OperationalFacts
                collateralToExitCostBps={collateralToExitCostBps}
                collateralToExitDays={collateralToExitDays}
                entryPointSettlementDays={entryPointSettlementDays}
                fixedTermGraceDays={fixedTermGraceDays}
                navUpdateDays={navUpdateDays}
                onCollateralToExitCostBps={(value) => {
                  markStarterFieldEdited("conversion-cost");
                  setCollateralToExitCostBps(value);
                }}
                onCollateralToExitDays={(value) => {
                  markStarterFieldEdited("conversion-days");
                  setCollateralToExitDays(value);
                }}
                onEntryPointSettlementDays={(value) => {
                  markStarterFieldEdited("settlement");
                  setEntryPointSettlementDays(value);
                }}
                onFixedTermGraceDays={(value) => {
                  markStarterFieldEdited("grace");
                  setFixedTermGraceDays(value);
                }}
                onNavUpdateDays={(value) => {
                  markStarterFieldEdited("nav");
                  setNavUpdateDays(value);
                }}
                origins={{
                  collateralToExitCost: starterFields.has("conversion-cost")
                    ? "illustrative"
                    : "source-fact",
                  collateralToExitDays: starterFields.has("conversion-days")
                    ? "illustrative"
                    : "source-fact",
                  entryPointSettlement: starterFields.has("settlement")
                    ? "illustrative"
                    : "your-answer",
                  fixedTermGrace: starterFields.has("grace")
                    ? "illustrative"
                    : "your-answer",
                  navUpdate: starterFields.has("nav")
                    ? "illustrative"
                    : "source-fact",
                }}
                seniorProtectionEnabled={!protectionDisabled}
                slpEnabled={!exitDisabled}
              />
            </DayV3Group>
          ) : null}

          {deploying ? (
            <DayV3Group
              collapsible
              defaultOpen={false}
              id="day-v3-request-policy-inputs"
              index={4}
              status={
                requestPolicyReadiness.complete
                  ? { label: "Complete", tone: "complete" }
                  : {
                      label: "Incomplete",
                      tone: "incomplete",
                      missing: requestPolicyReadiness.missing,
                    }
              }
              subtitle="Set request timing, price freshness, and reinvestment limits"
              summary={
                requestPolicyReadiness.complete
                  ? "Settlement and reinvestment policy set"
                  : `${requestPolicyReadiness.missing.length} required ${requestPolicyReadiness.missing.length === 1 ? "answer" : "answers"}`
              }
              title="Request policy"
            >
              <DayV3DeploymentPolicy
                depositDelaySeconds={depositDelaySeconds}
                depositExpirySeconds={depositExpirySeconds}
                gateByOracleUpdate={gateByOracleUpdate}
                maxReinvestmentSlippageBps={maxReinvestmentSlippageBps}
                onDepositDelaySeconds={(value) => {
                  markStarterFieldEdited("deposit-delay");
                  setDepositDelaySeconds(value);
                }}
                onDepositExpirySeconds={setDepositExpirySeconds}
                onGateByOracleUpdate={(value) => {
                  markStarterFieldEdited("price-gate");
                  setGateByOracleUpdate(value);
                }}
                onMaxReinvestmentSlippageBps={setMaxReinvestmentSlippageBps}
                onWithdrawalExpirySeconds={setWithdrawalExpirySeconds}
                recoveryDays={recoveryDaysInput}
                slpEnabled={!exitDisabled}
                withdrawalDelayDays={entryPointSettlementDays}
                withdrawalExpirySeconds={withdrawalExpirySeconds}
              />
            </DayV3Group>
          ) : null}

          <DayV3Goals
            deploying={deploying}
            drawdownPct={protectedDrawdownPct}
            exit={exitView}
            exitSharePct={immediateExitSharePct}
            incentiveBudgetPer100={incentiveBudgetPer100}
            indexOffset={deploying ? 3 : 0}
            inputOrigins={{
              drawdown: starterFields.has("drawdown")
                ? "illustrative"
                : "your-answer",
              exitAmount: starterFields.has("exit-amount")
                ? "illustrative"
                : "your-answer",
              incentive: starterFields.has("incentive")
                ? "illustrative"
                : "your-answer",
              payout: starterFields.has("payout")
                ? "illustrative"
                : "your-answer",
              recovery: starterFields.has("recovery")
                ? "illustrative"
                : "your-answer",
            }}
            minimumProceedsPer100={minimumProceedsPer100}
            onDrawdownPct={(value) => {
              markStarterFieldEdited("drawdown");
              if (value === 0) {
                markStarterFieldEdited("grace");
                setManualOverrides((current) => ({
                  ...current,
                  coveragePct: null,
                  protectedExitThresholdPct: null,
                  protectedExitBonusPct: null,
                  jrYieldShareAtZeroPct: null,
                  jrYieldShareAtTargetPct: null,
                  jrYieldShareAtFullPct: null,
                }));
                setFixedTermGraceDays(0);
                setIncentiveBudgetPer100(0);
                setProtectedExitThresholdOverride(null);
              }
              setProtectedDrawdownPct(value);
            }}
            onExitSharePct={(value) => {
              markStarterFieldEdited("exit-amount");
              if (value === 0) {
                markStarterFieldEdited("conversion-days");
                markStarterFieldEdited("conversion-cost");
                setManualOverrides((current) => ({
                  ...current,
                  minimumLiquidityPct: null,
                  maximumDiscountPct: null,
                  depthAtNav: null,
                  maximumPremiumPct: null,
                  poolCapitalPer100: null,
                  slpYieldShareAtZeroPct: null,
                  slpYieldShareAtTargetPct: null,
                  slpYieldShareAtFullPct: null,
                }));
                setCollateralToExitDays(null);
                setCollateralToExitCostBps(null);
                setMaxReinvestmentSlippageBps(null);
              }
              setImmediateExitSharePct(value);
            }}
            onIncentiveBudgetPer100={(value) => {
              markStarterFieldEdited("incentive");
              setIncentiveBudgetPer100(value);
            }}
            onMinimumProceedsPer100={(value) => {
              markStarterFieldEdited("payout");
              setMinimumProceedsPer100(value);
            }}
            onRetryPoolDesign={deploying ? poolDesign.retry : undefined}
            onProtectedExitThreshold={(value) => {
              setProtectedExitThresholdOverride(value);
            }}
            onRecoveryDays={(value) => {
              markStarterFieldEdited("recovery");
              changeRecoveryDays(value);
            }}
            onRecoveryMode={(value) => {
              markStarterFieldEdited("recovery");
              chooseRecoveryMode(value);
            }}
            onResetExit={() => {
              markStarterFieldEdited("exit-amount");
              markStarterFieldEdited("payout");
              setImmediateExitSharePct(null);
              setMinimumProceedsPer100(null);
            }}
            onResetProtection={() => {
              markStarterFieldEdited("drawdown");
              markStarterFieldEdited("recovery");
              setProtectedDrawdownPct(null);
              setRecoveryMode(null);
              setRecoveryDaysInput(null);
              setObservationDays(0);
            }}
            premiumCurveEditor={premiumCurveEditor}
            protectedExit={protectedExitView}
            protectedExitThresholdOverride={protectedExitThresholdOverride}
            protection={protectionView}
            recovery={recoveryView}
            recoveryDays={recoveryDaysInput}
            recoveryMode={recoveryMode}
            showExitSection={!deploying || !exitDisabled}
            showInlineFeatureControls={!deploying}
            showProtectionSection={!deploying || !protectionDisabled}
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
                          ? deploying
                            ? deployDesignBlocksReturns
                              ? activePoolDesign.status === "resolving"
                                ? "checking live policy"
                                : activePoolDesign.status === "infeasible"
                                  ? "change exit design"
                                  : "live policy unavailable"
                              : "select live template"
                            : simulationPromiseComplete
                              ? "live policy needs retry"
                              : "complete exit promise"
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

        <DayV3DesignOutcome current={designOutcome} />
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
              : "Illustrative market models"}
          </span>
          <h2
            className="text-[18px] font-semibold tracking-[-0.02em]"
            id="day-v3-models-heading"
          >
            See how these goals change the market
          </h2>
          <p className="max-w-[78ch] text-[11px] leading-relaxed text-[var(--secondary)]">
            Open a section for its charts and tables. The main answer stays in
            each collapsed row.
          </p>
        </div>

        {modelUpdating ? (
          <Card data-model-state="updating" weight="quiet">
            <CardHeader>
              <CardTitle className="text-[17px]">
                Updating every model…
              </CardTitle>
              <CardDescription>
                Rebuilding the capital stack, stress paths, pool quotes,
                redemption scenarios, returns, and historical test from one
                consistent accountant snapshot. Previous values are hidden while
                the new live policy result is applied.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <DayV3ModelAccordion>
            {/* The other half of the answer, and the half an issuer needs first. The
            page priced three legs without ever saying how much capital had to
            stand at each one, which is the question that decides whether a design
            can be raised at all. */}
            <DayV3ModelGroup
              id="day-v3-capital-models"
              index={1}
              preview={
                protectionView.status === "missing-goal" &&
                exitView.status === "missing-goal"
                  ? "Complete Senior protection and the exit promise above to size Junior and SLP capital."
                  : `Per $100 Senior: ${protectionDisabled ? "$0 Junior" : `$${model.balances.jt.toFixed(1)} Junior`} · ${exitDisabled ? "$0 SLP" : `$${model.balances.lt.toFixed(1)} SLP`}`
              }
              title="Capital required to open"
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
            </DayV3ModelGroup>

            <DayV3ModelGroup
              id="day-v3-risk-models"
              index={2}
              preview={
                protectionView.status === "missing-goal"
                  ? "Complete Senior protection above to model who absorbs a source loss."
                  : protectionDisabled
                    ? "No Junior protection · Senior absorbs losses from the first dollar."
                    : `Junior absorbs a ${pct(model.explainer.coverage.coverageLossLimit)} source fall before Senior loses value.`
              }
              title="Loss protection"
            >
              {/* Losing money and getting out are the two ways a position goes wrong,
          and the projection above deliberately contains neither. They read
          better next to each other than either does alone. */}
              <DayV3LossWaterfall
                metrics={model.explainer.coverage}
                unit={returnUnit}
              />
            </DayV3ModelGroup>

            <DayV3ModelGroup
              id="day-v3-exit-models"
              index={3}
              preview={
                exitDisabled
                  ? "Immediate pool exit is off · no SLP or execution curve."
                  : exitView.status === "missing-goal"
                    ? "Complete both exit questions above to model capacity, proceeds, and pool depth."
                    : exitView.status === "infeasible"
                      ? "No feasible pool at the current exit size, payout floor, timing, and conversion cost."
                      : exitView.status === "unresolved"
                        ? "Live pool validation is unavailable · your inputs remain saved."
                        : exitView.status === "resolving"
                          ? "Checking the live pool policy and rebuilding the exit curve…"
                          : `${exitView.sellablePer100 === null ? "Capacity pending" : `$${exitView.sellablePer100.toFixed(2)} sellable`} · ${exitView.proceeds === null ? "proceeds pending" : `$${exitView.proceeds.toFixed(2)} proceeds`} · ${exitView.slpPer100 === null ? "SLP pending" : `$${exitView.slpPer100.toFixed(2)} SLP`}`
              }
              title="Senior exit and pool depth"
            >
              <div
                className="flex min-w-0 flex-col gap-4"
                data-model-column="exit"
              >
                <DayV3ExitModel
                  deploying={deploying}
                  exit={exitView}
                  minimumProceedsPer100={minimumProceedsPer100}
                  policyProvenance={
                    canonicalExit
                      ? `${canonicalExit.policy.templateName} · ${canonicalExit.policy.chainName} · block ${canonicalExit.policy.blockNumber} · refreshed ${new Date(canonicalExit.policy.resolvedAt).toLocaleString()}`
                      : null
                  }
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
                  <Card data-prerequisite-state="exit-inputs" weight="quiet">
                    <CardHeader>
                      <CardTitle className="text-[17px]">
                        Complete the exit setup above
                      </CardTitle>
                      <CardDescription>
                        {exitView.status === "infeasible"
                          ? "The canonical solver completed, but this promise has no deployable pool. Change the inputs identified in Section 3 to redraw the curve."
                          : deploying
                            ? "Finish Section 3 and resolve its live template. The one-trade curve will appear here; V3 does not fill this space with dashes or a fallback pool."
                            : "Finish the two exit questions in Section 3. The one-trade curve will appear here from the disclosed simulation policy."}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </div>
            </DayV3ModelGroup>

            {/* Everything above is a projection at the stated terms. This is the one
          section where the price path actually happened. It belongs to the
          simulate job: it answers "what would this have done", not "what do I
          set". */}
            <DayV3ModelGroup
              id="day-v3-return-models"
              index={4}
              preview={
                sourceApyPct === null
                  ? "Enter the source yield above to break down how each position earns its return."
                  : displayedReturnState !== "ready"
                    ? "Complete the pool promise or restore live policy to inspect growth, composition, and premium curves."
                    : `One-year model: Senior ${pct(scenario.seniorApy)} · Junior ${protectionDisabled ? "not funded" : pct(scenario.juniorApy)} · SLP ${exitDisabled ? "not funded" : pct(scenario.liquidityApy)}.`
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
                    <CardTitle>
                      Return models are waiting for live policy
                    </CardTitle>
                    <CardDescription>
                      {deploying
                        ? deployDesignBlocksReturns
                          ? "Resolve the binding exit-design issue above before V3 shows deployment return figures. Illustrative starter returns are intentionally withheld here."
                          : "Select and resolve a live deployment template before V3 shows growth, yield composition, or premium curves."
                        : simulationPromiseComplete
                          ? "The live simulation policy has not resolved yet. Retry after the service reconnects; your inputs and last valid model remain in place."
                          : "Complete the protection and exit promise to resolve the live simulation policy for return models."}{" "}
                      It will not plot returns using fallback fees or pool
                      parameters.
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

            <DayV3ModelGroup
              id="day-v3-history-models"
              index={5}
              preview={
                market.series.length < 3
                  ? "Add dated NAV or price history in the source section. That is the only missing input for a backtest."
                  : recoveryDaysInput === null
                    ? "History is loaded · choose recovery timing above to run it through the current market design."
                    : displayedReturnState !== "ready"
                      ? "History is loaded · resolve the current pool policy to run the backtest."
                      : `${market.series.length.toLocaleString()} dated observations ready · open to inspect the historical result.`
              }
              title="Historical evidence"
            >
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
                      Add the net source yield in Section 1. Your dated history
                      stays in place; no other historical input is required.
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
                      Your historical data is ready. Choose recovery timing in
                      Section 2 so the backtest knows when a temporary drawdown
                      becomes a permanent Junior loss.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : displayedReturnState !== "ready" ? (
                <Card data-model-state={displayedReturnState}>
                  <CardHeader>
                    <CardTitle className="text-[17px]" level={3}>
                      Historical backtest
                    </CardTitle>
                    <CardDescription>
                      {deploying
                        ? "Resolve the live deployment template before V3 runs return history."
                        : "The live simulation policy must resolve before V3 runs return history."}{" "}
                      No fallback fee or pool policy is used.
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
                  poolConfigOverrides={inputs.engineOverrides ?? {}}
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
            </DayV3ModelGroup>
          </DayV3ModelAccordion>
        )}
      </section>

      {deploying ? deploymentPanel : null}

      <p className="max-w-[70ch] text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        Educational simulator only. No securities are offered through this page.
        Forward projections are mechanism simulations, not forecasts or
        announced terms. Historical backtests use the selected source path and
        are not predictions.
      </p>
    </main>
  );
}
