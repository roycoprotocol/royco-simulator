"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV3Backtest from "@/components/day-v3/DayV3Backtest";
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
import DayV3RestockCheck, {
  type DayV3RestockView,
} from "@/components/day-v3/DayV3RestockCheck";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import DayV3Source from "@/components/day-v3/DayV3Source";
import DayV3YieldModels from "@/components/day-v3/DayV3YieldModels";
import { useDayV3SimulationPoolDesign } from "@/components/day-v3/useDayV3SimulationPoolDesign";
import {
  Card,
  CardContent,
  CardNote,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildDayV3Query,
  boundDayV3YieldShareAtTarget,
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
  dayV3IllustrativeExitMetrics,
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
import {
  dayV3QuoteDiscountBps,
  dayV3RestockCheck,
  dayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";
import type { DayV3Overrides } from "@/lib/day-v3/types";
import type { DayV3SimulationPoolDesignGoals } from "@/lib/day-v3/simulation-pool-design";
import { buildDayYieldDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import {
  dayCapitalAtUtilization,
  dayPoolSeniorWeight,
} from "@/lib/day-simulator-template/capital-sizing";
import type { EclpParams } from "@/lib/day/engine/eclp";
import { DAY_ECLP_SIMULATION_LAMBDA } from "@/lib/day/engine/engine";
import { Sim } from "@/lib/day/engine/runner";
import {
  buildDayExplainerMetrics,
  type DayExplainerMetrics,
} from "@/lib/day-simulator-template/explainer";
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
/** Royco's own Senior-tranche USDC vault, the quote asset a Day pool opens on. */
const DAY_V3_DEFAULT_QUOTE_ASSET = "sr-srRoyUSDC";
const DAY_V3_DEFAULT_QUOTE_ASSET_YIELD_PCT = 4;
/** No volume forecast until an issuer makes one, which is where V3 has always
 *  started. The backtest used to disagree and assume the template's own 8x. */
const DAY_V3_DEFAULT_POOL_TURNOVER = 0;
const CUSTOM_SOURCE_MARKET = buildDayYieldDraftMarket({
  label: "Custom yield source",
  sourceApy: 0.12,
});
/**
 * Everything the shared accountant runs with instead of the market's own
 * config. Every key is optional because this object is spread over that
 * config: a key present and `undefined` erases a real value, so a partial
 * override must omit what it does not replace.
 */
type DayV3EngineOverrides = Partial<{
  swapFeeBps: number;
  eclpParams: EclpParams;
  stProtocolFee: number;
  jtProtocolFee: number;
  yieldShareProtocolFee: number;
  ltYieldShareProtocolFee: number;
}>;
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
  const [importedMarket, setImportedMarket] = useState<DayMarket | null>(null);
  const selectedMarket =
    markets.find((candidate) => candidate.id === marketId) ?? initialMarket;
  const market = customSource
    ? (importedMarket ?? CUSTOM_SOURCE_MARKET)
    : selectedMarket;
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
  // What Senior is sold for, and what that asset earns while the SLP holds it.
  // Both are issuer answers, never inherited from a market template: the pool's
  // quote side used to be modeled at a flat zero with no way to say otherwise.
  const [quoteAssetLabel, setQuoteAssetLabel] = useState(
    linked?.quoteAssetLabel ?? DAY_V3_DEFAULT_QUOTE_ASSET,
  );
  const [quoteAssetYieldPct, setQuoteAssetYieldPct] = useState<number | null>(
    linked?.quoteAssetYieldPct ?? DAY_V3_DEFAULT_QUOTE_ASSET_YIELD_PCT,
  );
  // Annual swap volume as a multiple of pool value. The forward model pinned
  // this at zero while the backtest quietly ran the market template's 8x, so
  // the projection and the history priced the same pool differently.
  const [poolTurnoverPerYear, setPoolTurnoverPerYear] = useState<number | null>(
    linked?.poolTurnoverPerYear ?? DAY_V3_DEFAULT_POOL_TURNOVER,
  );
  // What the pool charges to trade. Null is the only honest default: it means
  // the live template's own fee decides, with the market's declared fee
  // standing in until that template resolves. Naming a number here would
  // invent a fee policy the issuer never chose.
  const [swapFeeBps, setSwapFeeBps] = useState<number | null>(
    linked?.swapFeeBps ?? null,
  );
  const feeOverridden = swapFeeBps !== null;
  // An outside desk's terms. These describe who might arbitrage the pool back
  // to NAV; they price nothing in the market itself and never gate a result.
  const [marketMakerCostOfCapitalPct, setMarketMakerCostOfCapitalPct] =
    useState<number | null>(linked?.marketMakerCostOfCapitalPct ?? 12);
  const [redemptionDays, setRedemptionDays] = useState<number | null>(
    linked?.redemptionDays ?? 7,
  );
  const modeledProtectedDrawdownPct = protectedDrawdownPct;
  const modeledImmediateExitSharePct = immediateExitSharePct;
  const protectionEnabled = (modeledProtectedDrawdownPct ?? 0) > 0;
  const exitEnabled = (modeledImmediateExitSharePct ?? 0) > 0;
  const protectionDisabled = modeledProtectedDrawdownPct === 0;
  const exitDisabled = modeledImmediateExitSharePct === 0;
  const observationDays = recoveryDaysInput ?? 0;
  const [maintainCoverage, setMaintainCoverage] = useState(false);
  // The merged simulator exposes only target yield shares. Legacy curve-shape
  // anchors stay inactive even when an old link contains them.
  const riskShareOverride = activeManualOverrides.jrYieldShareAtTargetPct;
  const liqShareOverride = activeManualOverrides.slpYieldShareAtTargetPct;
  const y0Override = activeManualOverrides.jrYieldShareAtZeroPct;
  const y100Override = activeManualOverrides.jrYieldShareAtFullPct;
  const liqY0Override = activeManualOverrides.slpYieldShareAtZeroPct;
  const liqY100Override = activeManualOverrides.slpYieldShareAtFullPct;
  const modeledSourceApyPct = sourceApyPct ?? 0;
  const modeledQuoteAssetYieldPct = quoteAssetYieldPct ?? 0;
  const modeledPoolTurnover = poolTurnoverPerYear ?? 0;
  const simulationDefaults = useMemo(
    () => ({
      ...defaults,
      sourceApy: modeledSourceApyPct / 100,
      // The quote asset's yield is the issuer's own answer in the Senior exit
      // section, never a rate inherited from a market template. It was pinned
      // at zero here, which is right for a plain stablecoin and silently wrong
      // for anything that accrues.
      stableYield: modeledQuoteAssetYieldPct / 100,
      // Annual swap volume is the issuer's forecast too. At zero the live
      // template fee still prices canonical execution quotes but contributes
      // no speculative fee income to SLP APY.
      poolTurnoverPerYear: modeledPoolTurnover,
      // The shared template's disclosed simulation assumption, unless the
      // issuer stated their own fee. A live RWA response replaces the
      // assumption atomically when the exit design resolves; it cannot replace
      // the issuer's answer, which is why that answer is applied here as well
      // as through `engineOverrides`.
      swapFeeBps: swapFeeBps ?? defaults.swapFeeBps,
    }),
    [
      defaults,
      modeledPoolTurnover,
      modeledQuoteAssetYieldPct,
      modeledSourceApyPct,
      swapFeeBps,
    ],
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
    // The quote asset belongs to the exit design, not to the source, so it is
    // cleared with the rest of the exit rather than carried across markets.
    setQuoteAssetLabel(DAY_V3_DEFAULT_QUOTE_ASSET);
    setQuoteAssetYieldPct(DAY_V3_DEFAULT_QUOTE_ASSET_YIELD_PCT);
    setPoolTurnoverPerYear(DAY_V3_DEFAULT_POOL_TURNOVER);
    // A fee is a property of the pool being designed, so it is released with
    // the rest of the exit rather than carried onto the next market.
    setSwapFeeBps(null);
    setImportedMarket(null);
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

  const poolDesignGoals = useMemo<DayV3SimulationPoolDesignGoals | null>(() => {
    if (
      exitDisabled ||
      protectedDrawdownPct === null ||
      immediateExitSharePct === null ||
      minimumProceedsPer100 === null
    ) {
      return null;
    }
    return {
      protectedDrawdownPct,
      // Recovery timing changes loss realization, not the forward APY. Until
      // the issuer chooses an observation mode, the pool quote can still be
      // checked using immediate realization without mutating the visible goal.
      recoveryDays: recoveryDaysInput ?? 0,
      immediateExitSharePct,
      minimumProceedsPer100,
    };
  }, [
    exitDisabled,
    immediateExitSharePct,
    minimumProceedsPer100,
    protectedDrawdownPct,
    recoveryDaysInput,
  ]);
  const activePoolDesign = useDayV3SimulationPoolDesign(
    poolDesignGoals,
    sourceApyPct,
  );
  // A hand-set fee belongs in this gate. The canonical service solves the pool
  // at the template's own fee and cannot be asked to solve it at another one:
  // its request body is key-restricted, and its parser asserts that the
  // returned fee, its `template-policy` origin, and the restock fee all equal
  // the live policy. Reporting those outcomes beside a different fee would
  // attribute a result to a pool that was never priced.
  const hasPoolOverride =
    [
      activeManualOverrides.minimumLiquidityPct,
      activeManualOverrides.maximumDiscountPct,
      activeManualOverrides.depthAtNav,
      activeManualOverrides.maximumPremiumPct,
      activeManualOverrides.poolCapitalPer100,
    ].some((value) => value !== null) || feeOverridden;
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
  // What the pool is actually priced at, in the order that wins: the issuer's
  // own fee, then the live template's, then the market's declared assumption.
  const modeledSwapFeeBps =
    swapFeeBps ??
    rawCanonicalPoolDesign?.policy.swapFeeBps ??
    defaults.swapFeeBps;
  // Built by OMITTING keys rather than setting them `undefined`. Both the
  // structural run and the backtest merge this by spread, so an `undefined`
  // `eclpParams` would erase the market's own curve instead of leaving it be.
  // Overrides that redraw the curve itself, as opposed to policy sitting on top
  // of it. A hand-set fee is policy: the template's geometry is still the right
  // geometry, it is just being charged differently. A hand-set maximum discount,
  // depth or premium IS the geometry, and the canonical `eclpParams` would win
  // the spread below and silently discard it — the reader would drag "maximum
  // discount" from 1% to 20% and watch every quote on the page stay put.
  const hasCurveOverride =
    activeManualOverrides.maximumDiscountPct !== null ||
    activeManualOverrides.depthAtNav !== null ||
    activeManualOverrides.maximumPremiumPct !== null;
  const engineOverrides = useMemo<DayV3EngineOverrides | null>(() => {
    if (!canonicalEngineOverrides && !feeOverridden) return null;
    const canonical = canonicalEngineOverrides ?? {};
    const canonicalPolicy = Object.fromEntries(
      Object.entries(canonical).filter(([key]) => key !== "eclpParams"),
    );
    return {
      ...(hasCurveOverride ? canonicalPolicy : canonical),
      ...(feeOverridden ? { swapFeeBps: swapFeeBps as number } : {}),
    } as DayV3EngineOverrides;
  }, [canonicalEngineOverrides, feeOverridden, hasCurveOverride, swapFeeBps]);
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
  // Scenario APYs must remain available even when the canonical pool service
  // is offline. The selected source's explicit starting Minimum Liquidity is
  // therefore the disclosed comparison basis. Exact E-CLP sizing remains a
  // separate result and never silently replaces this return-model denominator.
  const liquidityPct = exitDisabled
    ? 0
    : defaults.minLiquidity * 100;
  // The band IS the pool's maximum discount — when the template resolves this
  // reads its `maximumDiscountBps` directly. The fallback used the market's own
  // fixed `eclpBandWidth`, so with no live template the payout floor shaped
  // nothing: an issuer could drag it from $99 to $50 and the pool, the exit
  // curve and the arbitrage economics would not move at all. Measured on the
  // shared engine, the band moves the deepest fill exactly as you would expect
  // — 1% band gives 0.60% discount, 5% gives 2.63%, 20% gives 10.59% — so the
  // floor the issuer set is the honest local band.
  const floorBandPct =
    exitEnabled && minimumProceedsPer100 !== null
      ? Math.min(99, Math.max(0.01, 100 - minimumProceedsPer100))
      : defaults.eclpBandWidth * 100;
  const effectiveBandPct = canonicalPoolRecommendation
    ? canonicalPoolRecommendation.fields.maximumDiscountBps.value / 100
    : floorBandPct;
  // The maximum discount the engine ACTUALLY priced, which is not always the one
  // above. `canonicalPoolRecommendation` is withheld by any pool override
  // including a hand-set fee, but the canonical `eclpParams` keep pricing unless
  // the override was to the curve — so a page that read `effectiveBandPct` there
  // named the payout floor's band beside quotes taken off the template's curve.
  const pricedBand: {
    pct: number;
    source: "live-template" | "payout-floor" | "your-answer";
  } =
    activeManualOverrides.maximumDiscountPct !== null
      ? { pct: activeManualOverrides.maximumDiscountPct, source: "your-answer" }
      : canonicalEngineOverrides && rawCanonicalPoolDesign && !hasCurveOverride
        ? {
            pct:
              rawCanonicalPoolDesign.recommendation.fields.maximumDiscountBps
                .value / 100,
            source: "live-template",
          }
        : { pct: floorBandPct, source: "payout-floor" };

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
          quoteAssetYieldPct: modeledQuoteAssetYieldPct,
          poolTurnoverPerYear: modeledPoolTurnover,
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
          // A model priced at the issuer's own fee is not the live market,
          // however live the rest of the policy behind it is.
          policyBasis: feeOverridden
            ? ("issuer-fee" as const)
            : canonicalEngineOverrides !== null
              ? ("live" as const)
              : ("unresolved" as const),
        },
        engineOverrides,
      ),
    [
      canonicalEngineOverrides,
      coveragePct,
      effectiveBandPct,
      engineOverrides,
      feeOverridden,
      liqShareOverride,
      liqY0Override,
      liqY100Override,
      liquidityPct,
      modeledImmediateExitSharePct,
      maintainCoverage,
      modeledPoolTurnover,
      modeledQuoteAssetYieldPct,
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
  const returnDisplayState = dayV3ReturnDisplayState({
    modelUpdating,
    sourceApyResolved: sourceApyPct !== null,
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
        yTargetPct: boundDayV3YieldShareAtTarget({
          targetPct:
            inputs.riskShareOverride ?? startingDesign.junior.yTargetPct,
          y0Pct: startingDesign.junior.y0Pct,
          y100Pct: startingDesign.junior.y100Pct,
        }),
      },
      slp: {
        ...startingDesign.slp,
        yTargetPct: boundDayV3YieldShareAtTarget({
          targetPct:
            inputs.liqShareOverride ?? startingDesign.slp.yTargetPct,
          y0Pct: startingDesign.slp.y0Pct,
          y100Pct: startingDesign.slp.y100Pct,
        }),
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

  // Capital sizing, loss absorption, and pool depth do not depend on how yield
  // is split. Keeping them in a separate shared-engine run prevents a yield
  // slider tick from rebuilding the expensive stress and exit explainers.
  const structuralModel = useMemo(() => {
    const coverage = inputs.coveragePct / 100;
    const minLiquidity = inputs.liquidityPct / 100;
    // `eclpBandWidth` is deliberately NOT overwritten here. `buildDayMarketConfig`
    // keeps a market's declared `eclpParams` only while the requested band still
    // equals the declared one, and it reads both sides off the object passed as
    // `defaults`. Overwriting the band here made it compare the request against
    // a copy of itself, so the guard never fired and the declared curve was
    // always retained: on the 12 registry markets that ship one, a $10 sale
    // priced at 56.8 bps whether the payout floor was $99 or $50. Only the
    // custom draft, which declares no curve, ever responded.
    const effective = {
      ...simulationDefaults,
      coverage,
      minLiquidity,
      sourceApy: inputs.sourceApyPct / 100,
      stableYield: inputs.quoteAssetYieldPct / 100,
      poolTurnoverPerYear: inputs.poolTurnoverPerYear,
      observationDays: inputs.observationDays,
      maintainCoverage: inputs.maintainCoverage,
    };
    const terms: DayEditableTerms = {
      coverage,
      minLiquidity,
      eclpBandWidth: inputs.bandPct / 100,
      observationDays: effective.observationDays,
      riskYieldShare: effective.riskYDM.yTarget,
      liquidityYieldShare: effective.liqYDM.yTarget,
    };
    const cfg = {
      ...buildDayMarketConfig(effective, terms),
      ...(inputs.engineOverrides ?? {}),
    };
    const sized = { ...effective, eclpBandWidth: terms.eclpBandWidth };
    const balances = buildDayInitialBalances(sized, terms);
    const opening = new Sim(cfg, balances);
    const openingSeniorNAV = opening.last().stEffectiveNAV;
    const requestedExitNAV =
      (openingSeniorNAV * inputs.immediateExitSharePct) / 100;
    return {
      balances,
      pool: {
        concentration: cfg.eclpParams?.lambda ?? DAY_ECLP_SIMULATION_LAMBDA,
        stableYield: cfg.stableYield,
        // The shared engine always prices the illustrative pool with the
        // disclosed simulation fee. A canonical response replaces it through
        // `engineOverrides`; service availability must not erase a valid local
        // quote and the entire exit-cost curve.
        swapFeeBps: cfg.swapFeeBps,
        turnoverPerYear: cfg.poolTurnoverPerYear,
        seniorWeight: dayPoolSeniorWeight(cfg),
      },
      illustrativeExit: {
        openingSeniorNAV,
        quote: opening.previewSecondarySell(requestedExitNAV),
      },
      explainer: buildDayExplainerMetrics(cfg, balances),
      // Coverage is read at 100% utilization, where Junior has no operating
      // headroom left. The opening stack above carries headroom above the
      // requirement, so drawing the loss path on it overstates protection by
      // the size of that headroom. Liquidity stays on the opening pool, which
      // is the pool a seller actually trades into.
      //
      // A design can be legal at the 90% target and unbuildable at the
      // boundary. A $100 payout floor asks the pool for zero price impact, the
      // band collapses, and `newMarket` rejects the stack because it cannot
      // meet its own liquidity requirement — measured: fine at a 0.1% band,
      // throws at 0.01%. That is a real answer about the design, so it is
      // caught and reported rather than taking the page down.
      // Junior at the boundary, the pool left on its opening stack.
      //
      // `dayCapitalAtUtilization` inverts `liquidityUtilizationWad` against the
      // raw deposit, but `newMarket` re-values that deposit through the E-CLP.
      // For every market that declares a curve the two disagree by about 14
      // parts per million, so a stack solved at exactly 100% liquidity
      // utilization computes to 1.0000144 and is rejected — which silently cost
      // 12 of the 13 markets their entire loss waterfall. Coverage utilization
      // is what this model reads and the pool leg does not enter it, so the
      // pool keeps the admissible opening size and Junior alone is taken to the
      // boundary. Measured: 13 of 13 markets build.
      coverageExplainer: ((): DayExplainerMetrics["coverage"] | null => {
        try {
          const boundary = dayCapitalAtUtilization(sized, terms, 1);
          return buildDayExplainerMetrics(cfg, {
            st: boundary.st,
            jt: boundary.jt,
            lt: balances.lt,
          }).coverage;
        } catch {
          return null;
        }
      })(),
    };
  }, [
    inputs.bandPct,
    inputs.coveragePct,
    inputs.engineOverrides,
    inputs.immediateExitSharePct,
    inputs.liquidityPct,
    inputs.maintainCoverage,
    inputs.observationDays,
    inputs.poolTurnoverPerYear,
    inputs.quoteAssetYieldPct,
    inputs.sourceApyPct,
    simulationDefaults,
  ]);

  const baseReturnTerms = useMemo(
    () => ({
      ...simulationDefaults,
      coverage: inputs.coveragePct / 100,
      minLiquidity: inputs.liquidityPct / 100,
      sourceApy: inputs.sourceApyPct / 100,
      stableYield: inputs.quoteAssetYieldPct / 100,
      poolTurnoverPerYear: inputs.poolTurnoverPerYear,
      observationDays: inputs.observationDays,
      eclpBandWidth: inputs.bandPct / 100,
      // `runDayTargetScenario` derives its own terms from this object, so the
      // band can never differ from itself there and the curve guard can never
      // fire. Dropping the declared curve is the only way to make the return
      // model price the same pool the exit model does; the engine then derives
      // one from the band, exactly as it does for a market that declares none.
      eclpParams:
        Math.abs(inputs.bandPct / 100 - simulationDefaults.eclpBandWidth) < 1e-12
          ? simulationDefaults.eclpParams
          : undefined,
      maintainCoverage: inputs.maintainCoverage,
    }),
    [
      inputs.bandPct,
      inputs.coveragePct,
      inputs.liquidityPct,
      inputs.maintainCoverage,
      inputs.observationDays,
      inputs.poolTurnoverPerYear,
      inputs.quoteAssetYieldPct,
      inputs.sourceApyPct,
      simulationDefaults,
    ],
  );
  const zeroCurve = useMemo(
    () => ({ mode: "static" as const, y0: 0, yTarget: 0, y100: 0 }),
    [],
  );
  const baseReturns = useMemo(() => {
    const runWithoutPremiums = (
      carryOverrides: Partial<
        Pick<
          typeof baseReturnTerms,
          "sourceApy" | "stableYield" | "poolTurnoverPerYear"
        >
      > = {},
    ) =>
      runDayTargetScenario(
        {
          ...baseReturnTerms,
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
    return {
      noPremiums,
      poolCarry: {
        seniorShareCarry:
          seniorShareCarryOnly.liquidityApy - zeroPoolCarry.liquidityApy,
        exitAssetCarry:
          seniorAndExitAssetCarry.liquidityApy -
          seniorShareCarryOnly.liquidityApy,
        swapFeeIncome:
          noPremiums.liquidityApy - seniorAndExitAssetCarry.liquidityApy,
      } satisfies DayV3PoolCarryBreakdown,
    };
  }, [baseReturnTerms, inputs.engineOverrides, zeroCurve]);
  const riskOnly = useMemo(
    () =>
      runDayTargetScenario(
        {
          ...baseReturnTerms,
          riskYDM: {
            ...simulationDefaults.riskYDM,
            y0: resolved.y0,
            yTarget: resolved.riskYieldShare,
            y100: resolved.y100,
          },
          liqYDM: zeroCurve,
        },
        {},
        inputs.engineOverrides ?? {},
      ),
    [
      baseReturnTerms,
      inputs.engineOverrides,
      resolved.riskYieldShare,
      resolved.y0,
      resolved.y100,
      simulationDefaults.riskYDM,
      zeroCurve,
    ],
  );
  const scenario = useMemo(
    () =>
      runDayTargetScenario(
        {
          ...baseReturnTerms,
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
        },
        {},
        inputs.engineOverrides ?? {},
      ),
    [
      baseReturnTerms,
      inputs.engineOverrides,
      resolved.liqY0,
      resolved.liqY100,
      resolved.liquidityYieldShare,
      resolved.riskYieldShare,
      resolved.y0,
      resolved.y100,
      simulationDefaults.liqYDM,
      simulationDefaults.riskYDM,
    ],
  );
  const model = useMemo(
    () => ({
      scenario,
      noPremiums: baseReturns.noPremiums,
      riskOnly,
      poolCarry: baseReturns.poolCarry,
      ...structuralModel,
    }),
    [baseReturns, riskOnly, scenario, structuralModel],
  );
  // Nothing in the contract refills the exit pool. It comes back only when an
  // outside desk is paid enough to buy the discounted Senior and redeem it, so
  // the issuer's own exit terms decide whether capacity ever returns.
  const restockHurdle = useMemo(
    () =>
      marketMakerCostOfCapitalPct === null || redemptionDays === null
        ? null
        : dayV3RestockHurdle({
            costOfCapitalPct: marketMakerCostOfCapitalPct,
            redemptionDays,
            seniorApyPct: scenario.seniorApy * 100,
            swapFeeBps: model.pool.swapFeeBps,
          }),
    [
      marketMakerCostOfCapitalPct,
      model.pool.swapFeeBps,
      redemptionDays,
      scenario.seniorApy,
    ],
  );
  // Same omission rule as `engineOverrides`: the backtest merges this over the
  // market's config by spread. A fee-only override that also wrote
  // `eclpParams: undefined` would run the history on a different pool than the
  // projection above it.
  const backtestConfigOverrides = useMemo(() => {
    const overrides: { eclpParams?: EclpParams; swapFeeBps?: number } = {};
    if (inputs.engineOverrides?.eclpParams !== undefined) {
      overrides.eclpParams = inputs.engineOverrides.eclpParams;
    }
    if (inputs.engineOverrides?.swapFeeBps !== undefined) {
      overrides.swapFeeBps = inputs.engineOverrides.swapFeeBps;
    }
    return overrides;
  }, [inputs.engineOverrides]);

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

  const visibleStarterFields = [...starterFields].filter((field) =>
    ["source", "drawdown", "recovery", "exit-amount", "payout"].includes(
      field,
    ),
  );

  const query = buildDayV3Query({
    market: customSource ? CUSTOM_SOURCE_ID : marketId,
    mode: null,
    sourceApyPct,
    protectedDrawdownPct,
    recoveryDays: recoveryDaysInput,
    immediateExitSharePct,
    minimumProceedsPer100,
    quoteAssetLabel,
    quoteAssetYieldPct,
    poolTurnoverPerYear,
    swapFeeBps,
    marketMakerCostOfCapitalPct,
    redemptionDays,
    // Legacy links still parse these fields, but the simulator no longer asks
    // for deployment-only refill assumptions or writes them into new links.
    entryPointSettlementDays: null,
    collateralToExitDays: null,
    collateralToExitCostBps: null,
    fixedTermGraceDays: null,
    navUpdateDays: null,
    depositDelaySeconds: null,
    depositExpirySeconds: null,
    withdrawalExpirySeconds: null,
    gateByOracleUpdate: null,
    maxReinvestmentSlippageBps: null,
    incentiveBudgetPer100: null,
    target: null,
    starterFields: visibleStarterFields,
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
      holds: !protectionEnabled
        ? "The strategy asset, with no first-loss buffer"
        : "The strategy asset, protected by Jr",
      role:
        !protectionEnabled && !exitEnabled
          ? "Holds the source directly"
          : !protectionEnabled
            ? "Holds the source and pays for an exit"
            : !exitEnabled
              ? "Holds the source and pays for cover"
              : "Holds the source, pays for cover and an exit",
      holdsSource: true,
      ...breakdown("seniorApy"),
      risk:
        coveragePct > 0
          ? "Loses value only after Jr is exhausted"
          : "Unprotected. No Jr capital stands in front of it",
      funded: true,
      pending: false,
    },
    {
      tone: "junior" as const,
      name: "Jr",
      short: "Jr",
      apy: scenario.juniorApy,
      holds: !protectionEnabled
        ? "No first-loss tranche is funded"
        : "First-loss coverage for Sr",
      role: !protectionEnabled
        ? "Disabled by the issuer"
        : "Takes the first losses, paid a premium for it",
      holdsSource: true,
      ...breakdown("juniorApy"),
      risk: !protectionEnabled
        ? "Senior absorbs losses from the first dollar"
        : "Absorbs the first losses, in full",
      funded: resolved.coverage > 0,
      pending: false,
    },
    {
      tone: "liquidity" as const,
      name: "SLP",
      short: "SLP",
      apy: scenario.liquidityApy,
      holds: !exitEnabled
        ? "No immediate exit pool is funded"
        : "The pool Sr exits into",
      role: !exitEnabled
        ? "Disabled by the issuer"
        : "Supplies exit liquidity, paid a premium for it",
      holdsSource: false,
      ...breakdown("liquidityApy"),
      risk: !exitEnabled
        ? "No one-trade exit is configured"
        : canonicalEngineOverrides === null
          ? "Uses the disclosed illustrative SLP capital basis"
          : "Holds Sr shares when Sr sells",
      funded: resolved.minLiquidity > 0,
      pending: false,
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
            message: `${protectionRecommendation.reason}${feeOverridden ? ` The displayed return is priced at the ${swapFeeBps} bps pool fee set above, not the live market's.` : canonicalEngineOverrides ? " Current market fees are included in the displayed return." : " The forward return remains visible while exact pool terms are being checked."}`,
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
  const illustrativeExitMetrics = dayV3IllustrativeExitMetrics({
    boundaryQuote: model.explainer.liquidity.boundaryQuote,
    openingSeniorNAV: model.illustrativeExit.openingSeniorNAV,
    selectedQuote: model.illustrativeExit.quote,
  });
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
            : illustrativeExitMetrics !== null
              ? "illustrative"
              : activePoolDesign.status === "resolving"
                ? "resolving"
                : "unresolved";
  const exitView: DayV3ExitView = {
    status: exitStatus,
    message: exitDisabled
      ? "Immediate Senior exit is off. No SLP capital, pool quote, or E-CLP parameters are required for this scenario."
      : !exitGoalsComplete
        ? "Choose an exit amount and payout to check the exact pool design. Forward APYs remain available in the meantime."
        : hasPoolOverride
          ? feeOverridden
            ? `This design charges a hand-set ${swapFeeBps} bps swap fee. The canonical pool outcomes are withheld because they were solved at the live template's own fee, which this page cannot ask it to change. Every model below is priced at ${swapFeeBps} bps.`
            : "This link contains manual pool overrides. Outcomes are withheld until the canonical service revalidates those exact fields."
          : activePoolDesign.status === "resolved" && !liquidityResolved
            ? (liquidityRecommendation?.reason ??
              "The pool was resolved, but its Minimum Liquidity mapping is unavailable.")
            : activePoolDesign.status === "resolving"
              ? "Checking pool sizing."
              : "",
    sellablePer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.amountSellablePer100Senior ??
        illustrativeExitMetrics?.sellablePer100Senior ?? null),
    proceeds: exitDisabled
      ? 0
      : (canonicalOutcomes?.proceedsForPromisedExit ??
        illustrativeExitMetrics?.proceedsPer100Senior ?? null),
    lowestPayoutPer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.lowestModeledPayoutPer100 ??
        illustrativeExitMetrics?.lowestPayoutPer100 ?? null),
    slpPer100: exitDisabled
      ? 0
      : (canonicalOutcomes?.requiredPoolFundingPer100Senior ??
        model.balances.lt),
    restockPoint: canonicalOutcomes?.restockEconomicFromSoldPct ?? null,
    restockOperationalHurdleBps:
      canonicalOutcomes?.restockOperationalHurdleBps ?? null,
    restockHurdleBps: canonicalOutcomes?.restockHurdleBps ?? null,
    restockMarginBps:
      canonicalOutcomes?.restockMarginAfterPromisedExitBps ?? null,
    minimumLiquidityPct: exitDisabled
      ? 0
      : (exitOverrides?.minimumLiquidityPct ??
        liquidityRecommendation?.minimumLiquidity.value ?? liquidityPct),
    maximumDiscountPct:
      exitOverrides?.maximumDiscountPct ??
      (canonicalExitRecommendation
        ? canonicalExitRecommendation.fields.maximumDiscountBps.value / 100
        : effectiveBandPct),
    lambda:
      exitOverrides?.depthAtNav ??
      canonicalExitRecommendation?.fields.depthAtNavLambda.value ??
      model.pool.concentration,
    maximumPremiumBps:
      exitOverrides?.maximumPremiumPct !== null &&
      exitOverrides?.maximumPremiumPct !== undefined
        ? exitOverrides.maximumPremiumPct * 100
        : (canonicalExitRecommendation?.fields.maximumPremiumBps.value ?? null),
    restingExitAssetPct:
      canonicalOutcomes?.exitAssetShareAtNavPct ?? null,
    restingSeniorPct:
      canonicalOutcomes?.seniorShareAtNavPct ?? null,
    swapFeeBps: canonicalExit?.policy.swapFeeBps ?? model.pool.swapFeeBps,
    // A hand-set fee is never attributed to a template or to product policy,
    // and the template's own fee is named beside it whenever it is known, so
    // the reader can see exactly what was replaced and by how much.
    feeSource: feeOverridden
      ? `Issuer-set pool swap fee: ${modeledSwapFeeBps} bps. ${
          rawCanonicalPoolDesign
            ? `The live ${rawCanonicalPoolDesign.policy.templateName} template on ${rawCanonicalPoolDesign.policy.chainName} charges ${rawCanonicalPoolDesign.policy.swapFeeBps} bps at block ${rawCanonicalPoolDesign.policy.blockNumber}.`
            : `The live template has not resolved, so its own fee is unknown; without this answer the market's declared ${defaults.swapFeeBps} bps would apply.`
        }`
      : canonicalExit
        ? `${canonicalExit.policy.templateName} on ${canonicalExit.policy.chainName}, block ${canonicalExit.policy.blockNumber}. Protocol fees: ST ${(Number(BigInt(canonicalExit.policy.protocolFees.stProtocolFeeWad)) / 1e16).toFixed(1)}%, JT ${(Number(BigInt(canonicalExit.policy.protocolFees.jtProtocolFeeWad)) / 1e16).toFixed(1)}%, JT premium ${(Number(BigInt(canonicalExit.policy.protocolFees.jtYieldShareProtocolFeeWad)) / 1e16).toFixed(1)}%, SLP premium ${(Number(BigInt(canonicalExit.policy.protocolFees.lptYieldShareProtocolFeeWad)) / 1e16).toFixed(1)}%. Resolved ${canonicalExit.policy.resolvedAt}`
        : null,
  };
  // Both discounts come from one engine run against one pool: the deepest fill
  // it can do, and the fill the promised exit takes. That is what an
  // arbitrageur trades against, it responds to the payout floor through the
  // band above, and the two can never describe different markets.
  const restockView: DayV3RestockView = {
    check:
      restockHurdle === null || exitDisabled
        ? null
        : dayV3RestockCheck({
            hurdle: restockHurdle,
            selectedDiscountBps: dayV3QuoteDiscountBps(
              model.illustrativeExit.quote,
            ),
            worstCaseDiscountBps: dayV3QuoteDiscountBps(
              model.explainer.liquidity.boundaryQuote,
            ),
          }),
    hurdle: restockHurdle,
    maximumDiscountPct: pricedBand.pct,
    maximumDiscountSource: pricedBand.source,
    selectedCurveInputPer100: model.illustrativeExit.quote.effectiveInputNAV,
    selectedProceedsPer100: model.illustrativeExit.quote.stableOutNAV,
    // `previewSecondarySell` clamps to what the pool can absorb, so on a sale
    // larger than the pool the quote prices the fillable slice. Calling that
    // "the exit you promised" told the reader an exit had been arbitraged that
    // the pool never took in the first place.
    selectedFilledPer100:
      modeledImmediateExitSharePct === null ||
      model.illustrativeExit.openingSeniorNAV <= 0
        ? null
        : (model.illustrativeExit.quote.filledNAV /
            model.illustrativeExit.openingSeniorNAV) *
          100,
    selectedUnfilledPer100:
      modeledImmediateExitSharePct === null ||
      model.illustrativeExit.openingSeniorNAV <= 0
        ? null
        : (model.illustrativeExit.quote.unfilledNAV /
            model.illustrativeExit.openingSeniorNAV) *
          100,
    policyBasis: inputs.policyBasis,
    selectedSalePer100: modeledImmediateExitSharePct,
    unit: returnUnit,
  };

  const displayedReturnState = returnDisplayState;
  const premiumCurveEditor =
    protectionEnabled || exitEnabled ? (
      <DayV3PremiumCurveEditor
        curveOverridden={curveOverridden}
        index={4}
        juniorEnabled={protectionEnabled}
        juniorModeledApy={scenario.juniorApy}
        liqCapPct={resolved.liquidityCeiling * 100}
        liqY0Pct={resolved.liqY0 * 100}
        liqY100Pct={resolved.liqY100 * 100}
        liqYtPct={boundDayV3YieldShareAtTarget({
          targetPct:
            liqShareOverride ?? resolved.liquidityYieldShare * 100,
          y0Pct: resolved.liqY0 * 100,
          y100Pct: resolved.liqY100 * 100,
        })}
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
        riskYtPct={boundDayV3YieldShareAtTarget({
          targetPct: riskShareOverride ?? resolved.riskYieldShare * 100,
          y0Pct: resolved.y0 * 100,
          y100Pct: resolved.y100 * 100,
        })}
        slpModeledApy={scenario.liquidityApy}
        slpEnabled={exitEnabled}
        slpCapitalPer100={model.balances.lt}
        slpMinimumLiquidityPct={liquidityPct}
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
  const advancedExitComplete = exitInputReadiness.complete;
  const simulationSourceComplete = sourceApyPct !== null;
  const simulationCurveComplete = startingCurveIssues.length === 0;
  const yieldSplitVisible = protectionEnabled || exitEnabled;
  const inputSteps = [
    {
      complete: simulationSourceComplete,
      detail: "Choose a listed source or enter a custom net yield.",
      id: "day-v3-source-inputs",
      label: "Choose the yield source",
    },
    {
      complete: advancedProtectionReady,
      detail: "Choose the loss Senior should survive and how temporary losses are observed.",
      id: "day-v3-protection-inputs",
      label: "Set Senior protection",
    },
    {
      complete: advancedExitComplete,
      detail: "Choose the immediate exit amount and minimum payout.",
      id: "day-v3-exit-inputs",
      label: "Set the Senior exit",
    },
    ...(yieldSplitVisible
      ? [
          {
            complete: simulationCurveComplete,
            detail:
              "Set how Senior yield is shared with each active supporting tranche.",
            id: "day-v3-premium-inputs",
            label: "Adjust the yield split",
          },
        ]
      : []),
  ];
  const nextInputStep = inputSteps.find((step) => !step.complete) ?? null;
  const defaultOpenInputId = nextInputStep?.id ?? null;

  return (
    // Capped well inside a laptop viewport. At 1440px a two-column input row
    // gave each control a 644px cell to hold three characters, so every field
    // read as a banner. At 1180px a cell is about 545px, which is a control
    // with its label and its note on one comfortable measure.
    <main className="royco-v3 mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 py-6">
      <DayV3Hero />

      {/* One short questionnaire owns every visible model input. */}
      <section
        aria-labelledby="day-v3-inputs-heading"
        className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-4 shadow-[0_6px_22px_-14px_rgba(23,25,31,0.4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              id="day-v3-inputs-heading"
            >
              Design the market
            </h2>
            <p className="text-[11px] text-[var(--tertiary)]">
              Choose the source, protection, and exit; then set the yield split for the active tranches.
            </p>
          </div>
        </div>

        <DayV3GroupAccordion defaultOpenId={defaultOpenInputId}>
          <DayV3Group
            collapsible
            defaultOpen={false}
            docs="tranching"
            docsLabel="How tranching works"
            id="day-v3-source-inputs"
            index={1}
            key="yield-source"
            status={
              sourceReadiness.complete
                ? { label: "Set", tone: "complete" }
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
            {customSource ? (
              <div className="flex flex-col gap-3">
                <DayV3Source
                  onImport={(nextMarket) => {
                    setImportedMarket(nextMarket);
                    setSourceApyPct(nextMarket.defaults.sourceApy * 100);
                  }}
                />
              </div>
            ) : null}
          </DayV3Group>
          <DayV3Goals
            drawdownPct={protectedDrawdownPct}
            exit={exitView}
            exitSharePct={immediateExitSharePct}
            indexOffset={1}
            inputOrigins={{
              drawdown: starterFields.has("drawdown")
                ? "illustrative"
                : "your-answer",
              exitAmount: starterFields.has("exit-amount")
                ? "illustrative"
                : "your-answer",
              payout: starterFields.has("payout")
                ? "illustrative"
                : "your-answer",
            }}
            minimumProceedsPer100={minimumProceedsPer100}
            onDrawdownPct={(value) => {
              markStarterFieldEdited("drawdown");
              if (value === 0) {
                markStarterFieldEdited("recovery");
                setRecoveryMode("none");
                setRecoveryDaysInput(0);
              }
              setProtectedDrawdownPct(value);
            }}
            onExitSharePct={(value) => {
              markStarterFieldEdited("exit-amount");
              if (value === 0) {
                setMinimumProceedsPer100(0);
              }
              setImmediateExitSharePct(value);
            }}
            onMinimumProceedsPer100={(value) => {
              markStarterFieldEdited("payout");
              setMinimumProceedsPer100(value);
            }}
            onQuoteAssetLabel={setQuoteAssetLabel}
            onPoolTurnoverPerYear={setPoolTurnoverPerYear}
            onQuoteAssetYieldPct={setQuoteAssetYieldPct}
            onRecoveryDays={(value) => {
              markStarterFieldEdited("recovery");
              setRecoveryDaysInput(value);
            }}
            onRecoveryMode={(value) => {
              markStarterFieldEdited("recovery");
              setRecoveryMode(value);
              setRecoveryDaysInput(value === "none" ? 0 : null);
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
              setRecoveryDaysInput(null);
              setRecoveryMode(null);
            }}
            onSwapFeeBps={setSwapFeeBps}
            protection={protectionView}
            poolTurnoverPerYear={poolTurnoverPerYear}
            quoteAssetLabel={quoteAssetLabel}
            quoteAssetYieldPct={quoteAssetYieldPct}
            recoveryDays={recoveryDaysInput}
            recoveryMode={recoveryMode}
            swapFeeBps={swapFeeBps}
          />
          {premiumCurveEditor}
        </DayV3GroupAccordion>
      </section>

      <section
        aria-labelledby="day-v3-positions-heading"
        className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] shadow-[0_6px_22px_-14px_rgba(23,25,31,0.4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <div className="flex items-center gap-2">
            <h2
              className="text-[13px] font-semibold tracking-[-0.01em]"
              id="day-v3-positions-heading"
            >
              Scenario returns at these terms
            </h2>
            {modelUpdating ? <Badge tone="neutral">updating</Badge> : null}
          </div>
          <DayV3DocsLink label="Yield split" topic="yieldSplit" />
        </div>
        <p aria-live="polite" className="sr-only" role="status">
          {!modelUpdating && displayedReturnState === "ready"
            ? `Scenario returns updated. Senior ${pct(positions[0].apy)}. Junior ${positions[1].funded ? pct(positions[1].apy) : "off"}. SLP ${positions[2].funded ? pct(positions[2].apy) : "off"}.`
            : modelUpdating
              ? "Scenario returns updating."
              : "Enter a source yield to calculate scenario returns."}
        </p>

        {/* Three peers, scanned across: identical slots, so the eye compares
            the rate first. The compact footer below keeps the terms attached
            without competing with these primary answers. */}
        <div className="grid grid-cols-3 border-y border-[var(--border-subtle)] md:hidden">
          {positions.map((position, index) => (
            <div
              className={`min-w-0 px-3 py-3 ${index === 0 ? "" : "border-l border-[var(--border-subtle)]"}`}
              key={`compact-${position.short}`}
            >
              <div className="flex items-center gap-1">
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
                {displayedReturnState === "ready" && position.funded
                    ? pct(position.apy)
                    : displayedReturnState === "ready" && position.pending
                      ? "—"
                    : displayedReturnState === "ready"
                      ? "0.0%"
                      : "—"}
              </strong>
              <span className="mt-1 block truncate text-[9px] text-[var(--tertiary)]">
                {displayedReturnState === "ready"
                  ? position.pending
                    ? "validating"
                    : position.funded
                      ? "per year"
                      : "off"
                  : "not ready"}
              </span>
            </div>
          ))}
        </div>
        <div className="hidden grid-cols-1 gap-3 px-4 pb-4 pt-0 md:grid md:grid-cols-3">
          {positions.map((position) => (
            <Card
              className="overflow-hidden"
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
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle
                    className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]"
                    level={3}
                  >
                    {position.name}
                  </CardTitle>
                  {position.funded ? null : (
                    <Badge tone="neutral">
                      {position.pending ? "validating" : "not funded"}
                    </Badge>
                  )}
                </div>
                <CardNote>{position.holds}</CardNote>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-mono text-[clamp(34px,3.2vw,44px)] font-bold leading-[0.92] tracking-[-0.03em] tabular-nums"
                    style={
                      position.funded ? undefined : { color: "var(--tertiary)" }
                    }
                  >
                    {displayedReturnState === "ready" && position.funded
                        ? pct(position.apy)
                        : displayedReturnState === "ready" && position.pending
                          ? "—"
                        : displayedReturnState === "ready"
                          ? "0.0%"
                          : "—"}
                  </span>
                  <span className="text-[11px] text-[var(--tertiary)]">
                    {position.pending
                        ? "complete exit inputs"
                        : displayedReturnState === "missing-source"
                        ? "enter source yield"
                        : modelUpdating
                          ? "a year · updating"
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

      </section>

      <section
        aria-labelledby="day-v3-models-heading"
        className="flex flex-col gap-3"
        data-accountant-source="runDayTargetScenario-and-buildDayExplainerMetrics"
      >
        <div className="flex flex-col gap-1">
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

          <DayV3ModelAccordion>
                <DayV3ModelGroup
                  id="day-v3-capital-models"
                  index={1}
                  preview={
                    protectionView.status === "missing-goal" &&
                    exitView.status === "missing-goal"
                      ? "Complete Senior protection and the exit terms above to size Junior and SLP capital."
                      : `${protectedDrawdownPct === null ? "Protection pending" : `${protectedDrawdownPct.toFixed(1)}% source drawdown`} + ${immediateExitSharePct === null ? "exit pending" : `$${immediateExitSharePct.toFixed(1)} exit`} → ${!protectionEnabled ? "$0 Junior" : `$${model.balances.jt.toFixed(1)} Junior`} + ${!exitEnabled ? "$0 SLP" : exitView.slpPer100 === null ? "SLP basis unavailable" : `$${exitView.slpPer100.toFixed(1)} SLP`}`
                  }
                  title="Capital stack"
                >
                  <DayV3CapitalStack
                    defaults={defaults}
                    poolSeniorWeight={model.pool.seniorWeight}
                    balances={model.balances}
                    coverage={resolved.coverage}
                    liquidityPending={exitEnabled && exitView.slpPer100 === null}
                    minLiquidity={resolved.minLiquidity}
                    targetUtilization={DAY_TARGET_UTILIZATION}
                    unit={returnUnit}
                  />
                </DayV3ModelGroup>

                <DayV3ModelGroup
                  disabledLabel={
                    protectionDisabled ? "off" : "no model"
                  }
                  disabledReason={
                    protectionDisabled
                      ? "Protection is off. No Junior is funded, so there is no loss waterfall to draw — Senior absorbs source losses from the first dollar."
                      : model.coverageExplainer === null
                        // Deliberately names no cause. This branch was written
                        // when the payout floor really did break the boundary
                        // stack, and it told the reader to lower it. That was
                        // fixed by taking Junior to the boundary and leaving the
                        // pool on its opening stack; measured after the fix, all
                        // 13 markets build at every floor from $100 to $50. The
                        // guard stays as a backstop, but a backstop that has no
                        // known trigger cannot name a remedy.
                        ? "No protection model exists at these terms. The loss path is drawn at the 100%-utilized boundary, and this stack cannot be built there. Every other result on this page is unaffected; change the coverage or the payout floor to move off it."
                        : null
                  }
                  id="day-v3-risk-models"
                  index={2}
                  preview={
                    protectedDrawdownPct === null
                      ? "Choose Senior protection above to model the loss path."
                      : `Junior absorbs a ${protectedDrawdownPct.toFixed(1)}% source fall before Senior loses value.`
                  }
                  title="Senior protection"
                >
                  {model.coverageExplainer === null ? null : (
                    <DayV3LossWaterfall
                      metrics={model.coverageExplainer}
                      unit={returnUnit}
                    />
                  )}
                </DayV3ModelGroup>

                <DayV3ModelGroup
                  disabledReason={
                    exitDisabled
                      ? "Immediate exit is off. No SLP is funded, so there is no pool, no execution curve, and no refill economics to model."
                      : null
                  }
                  id="day-v3-exit-models"
                  index={3}
                  preview={
                    exitView.status === "missing-goal"
                        ? "Complete the required input highlighted above to model capacity, proceeds, and pool depth."
                        : exitView.status === "infeasible"
                          ? "No feasible pool at the current exit size, payout floor, timing, and external spread assumption."
                            : exitView.status === "unresolved" ||
                                exitView.status === "resolving"
                              ? `${immediateExitSharePct === null ? "Exit pending" : `$${immediateExitSharePct.toFixed(2)} selected sale`} → ${exitView.slpPer100 === null ? "illustrative SLP unavailable" : `$${exitView.slpPer100.toFixed(2)} illustrative SLP`}`
                              : `${immediateExitSharePct === null ? "Exit pending" : `$${immediateExitSharePct.toFixed(2)} selected sale`} → ${exitView.proceeds === null ? "proceeds unavailable" : `$${exitView.proceeds.toFixed(2)} proceeds`} → ${exitView.slpPer100 === null ? "SLP basis unavailable" : `$${exitView.slpPer100.toFixed(2)} SLP`}`
                  }
                  title="Senior exit and pool depth"
                >
                  {/* Full width, not paired. Halving these cards to 541px
                      pushes their own two-column interiors below the width
                      their content needs, and the refill check grew from 700px
                      to 889px for the privilege. */}
                  <div
                    className="flex min-w-0 flex-col gap-3"
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
                          <CardTitle className="text-[13.5px]">
                            Complete the exit setup above
                          </CardTitle>
                          <CardNote>
                            {exitView.status === "infeasible"
                              ? "These exit terms do not produce a deployable pool. Change the inputs identified in the Senior exit section to redraw the curve."
                              : "Finish the Senior exit section and resolve its live template. The one-trade curve will appear here; V3 does not fill this space with dashes or a fallback pool."}
                          </CardNote>
                        </CardHeader>
                      </Card>
                    )}
                  </div>
                </DayV3ModelGroup>

                {/* Its own section, not a third card inside the exit group.
                    "What one exit costs" and "does the pool come back" are two
                    questions, and stacked they ran to 1,639px of scroll before
                    a reader could reach the returns. */}
                <DayV3ModelGroup
                  disabledReason={
                    exitDisabled
                      ? "Immediate exit is off. With no pool there is no discount for anyone to arbitrage."
                      : null
                  }
                  id="day-v3-restock-models"
                  index={4}
                  preview={
                    restockView.check === null ||
                    restockView.check.status === "unavailable"
                      ? "Describe an arbitrageur's cost of capital and redemption wait to test whether a refill pays."
                      : `${(restockView.check.worstCaseMarginBps ?? 0) >= 0 ? "Worth doing" : "Not worth doing"} · up to ${(restockView.check.worstCaseDiscountBps ?? 0).toFixed(0)} bps on offer against a ${(restockView.hurdle?.hurdleBps ?? 0).toFixed(0)} bps break-even`
                  }
                  title="Will arbitrage refill the pool?"
                >
                  <DayV3RestockCheck
                    costOfCapitalPct={marketMakerCostOfCapitalPct}
                    onCostOfCapitalPct={setMarketMakerCostOfCapitalPct}
                    onRedemptionDays={setRedemptionDays}
                    redemptionDays={redemptionDays}
                    view={restockView}
                  />
                </DayV3ModelGroup>

            <DayV3ModelGroup
              id="day-v3-return-models"
              index={5}
              preview={
                sourceApyPct === null
                  ? "Enter the source yield above to calculate Senior, Junior, and SLP APYs."
                  : displayedReturnState !== "ready"
                    ? "Complete the exit choices or retry market validation to inspect growth, composition, and premium curves."
                    : `${sourceApyPct.toFixed(1)}% source → Senior ${pct(scenario.seniorApy)} · Junior ${!protectionEnabled ? "not funded" : pct(scenario.juniorApy)} · SLP ${!exitEnabled ? "not funded" : pct(scenario.liquidityApy)}.`
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
                    <CardNote>
                      Enter the custom source&apos;s net annual yield to
                      calculate return projections and their split across
                      Senior, Junior, and SLP.
                    </CardNote>
                  </CardHeader>
                </Card>
              ) : displayedReturnState !== "ready" ? (
                <Card data-model-state={displayedReturnState} weight="quiet">
                  <CardHeader>
                    <CardTitle>Return models are waiting for market terms</CardTitle>
                    <CardNote>
                      Complete or revise the Senior exit above. Return charts do not use fallback fees or pool parameters.
                    </CardNote>
                  </CardHeader>
                </Card>
              ) : (
                // The growth chart was 272px beside a 468px table, leaving a
                // 200px hole under it. Stacking both charts in the left column
                // was tried and is worse — the two premium curves go vertical
                // at 541px and the column runs to 783px. The chart is simply
                // taller instead, which fills the row with signal.
                <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
                  <Card weight="quiet">
                    <CardHeader>
                      <CardTitle>Growth over a year</CardTitle>
                      <CardNote>
                        Compounded from the scenario annual rates above.
                      </CardNote>
                    </CardHeader>
                    <CardContent>
                      <DayV3Chart data={chartData} unit={returnUnit} />
                    </CardContent>
                  </Card>
                  <DayV3Comparison
                    poolCarry={model.poolCarry}
                    poolEconomics={{
                      exitAssetLabel: quoteAssetLabel,
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
              index={6}
              preview={
                market.series.length >= 3
                  ? `${market.series.length.toLocaleString()} dated observations · ${market.series[0]?.date} to ${market.series[market.series.length - 1]?.date}`
                  : "No dated history yet · add it under Yield source."
              }
              title="Historical backtest"
            >
              <DayV3Backtest
                bandPct={inputs.bandPct}
                coveragePct={inputs.coveragePct}
                customSource={customSource}
                liqSharePct={resolved.liquidityYieldShare * 100}
                liqY0Pct={resolved.liqY0 * 100}
                liqY100Pct={resolved.liqY100 * 100}
                liquidityPct={inputs.liquidityPct}
                maintainCoverage={maintainCoverage}
                market={market}
                observationDays={inputs.observationDays}
                onMaintainCoverage={setMaintainCoverage}
                poolConfigOverrides={backtestConfigOverrides}
                poolTurnoverPerYear={inputs.poolTurnoverPerYear}
                quoteAssetYieldPct={inputs.quoteAssetYieldPct}
                riskSharePct={resolved.riskYieldShare * 100}
                riskY0Pct={resolved.y0 * 100}
                riskY100Pct={resolved.y100 * 100}
                sourceApyPct={inputs.sourceApyPct}
              />
            </DayV3ModelGroup>

          </DayV3ModelAccordion>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-4">
          <div className="min-w-0">
            <strong className="text-[13px] font-semibold">
              Finish in Royco Deploy
            </strong>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--secondary)]">
              Royco Deploy collects final contract settings and revalidates the
              live market before deployment.
            </p>
          </div>
          <a
            className={dayV3ButtonVariants({ size: "lg", variant: "primary" })}
            href="https://www.royco.org/deploy-market"
            rel="noreferrer"
            target="_blank"
          >
            Open Royco Deploy
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
