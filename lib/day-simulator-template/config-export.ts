import type { DayIssuerPresetId } from "@/lib/day-simulator-template/issuer-presets";
import { DAY_ISSUER_PRESETS } from "@/lib/day-simulator-template/issuer-presets";
import { DAY_ECLP_SIMULATION_LAMBDA } from "@/lib/day/engine/engine";

export const DAY_CONFIG_EXPORT_SCHEMA_VERSION = 5;

export type DayDeploymentCompatibilityInput = {
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  riskY0Pct: number;
  riskSharePct: number;
  riskY100Pct: number;
  liqY0Pct: number;
  liqSharePct: number;
  liqY100Pct: number;
  protectedExitRemainingCoveragePct: number;
  selfLiquidationBonusPct: number;
};

export function dayDeploymentCompatibility(
  values: DayDeploymentCompatibilityInput,
): {
  modeledTermsCompatible: boolean;
  issues: string[];
} {
  const coverageEnabled = values.coveragePct > 0;
  const discountBps = values.eclpBandWidthPct * 100;
  // Both yield models are initialized on every market, whatever its
  // requirements are: the deployment validation rejects empty initialization
  // data for either side, and StaticCurveYDM then requires a positive target
  // share unconditionally — the clause does not consult minimum coverage or
  // minimum liquidity. So a 0/0/0 curve is undeployable even on a side whose
  // requirement is zero, and the check cannot be skipped when the requirement
  // is off. A zero requirement still pays a zero premium, because the curve is
  // read at zero utilization; it just cannot be *initialized* at zero.
  const orderedCurve = (
    y0: number,
    yTarget: number,
    y100: number,
  ) => yTarget > 0 && y0 <= yTarget && yTarget <= y100;
  const riskCap = Math.max(
    values.riskY0Pct,
    values.riskSharePct,
    values.riskY100Pct,
  );
  const liquidityCap = Math.max(
    values.liqY0Pct,
    values.liqSharePct,
    values.liqY100Pct,
  );
  const issues = [
    ...(discountBps < 50 || discountBps > 500
      ? ["Maximum discount must be 50–500 bps."]
      : []),
    ...(!orderedCurve(
      values.riskY0Pct,
      values.riskSharePct,
      values.riskY100Pct,
    )
      ? ["Jr static curve must satisfy Y0 ≤ YT ≤ Y100 with a positive YT, even at 0% coverage."]
      : []),
    ...(!orderedCurve(
      values.liqY0Pct,
      values.liqSharePct,
      values.liqY100Pct,
    )
      ? ["SLP static curve must satisfy Y0 ≤ YT ≤ Y100 with a positive YT, even at 0% minimum liquidity."]
      : []),
    ...(riskCap + liquidityCap > 100 + 1e-9
      ? ["The Jr and SLP curve caps must sum to 100% or less."]
      : []),
    ...(coverageEnabled &&
    (values.protectedExitRemainingCoveragePct <= 0 ||
      values.protectedExitRemainingCoveragePct >= values.coveragePct ||
      values.selfLiquidationBonusPct > values.protectedExitRemainingCoveragePct)
      ? [
          "Protected Exit defaults need confirmation: remaining coverage must be below minimum coverage and at least as large as the bonus.",
        ]
      : []),
  ];
  return { modeledTermsCompatible: issues.length === 0, issues };
}

export const DAY_DEPLOYMENT_INPUT_IDS = [
  "tokenContractSource",
  "tokenContractAddress",
  "chain",
  "adaptationSpeed",
  // Liquidity venue — required by the deploy flow, not modeled by the accountant.
  "exitAsset",
  "exitAssetStatic",
  "exitLiquidity",
  "navUpdateCadence",
  "redemptionDelay",
  "restockHurdle",
  "maximumDiscount",
  "maximumPremium",
  "depthAtNav",
  "reinvestmentSlippageTolerance",
  // Accountant economics the flow requires and the simulator did not collect.
  // The grace period is entered alongside the observation period on the real
  // flow's coverage step and a market cannot deploy with coverage on without
  // it (step-4-economics.tsx gates Continue on it).
  "observationGracePeriod",
  // The contract derives each cap from the peak of its own curve when omitted,
  // so a market whose curve peaks above its intended cap is unrepresentable
  // until both are declared (MarketDeploymentValidationLogic: the two caps must
  // sum to at most 1e18).
  "juniorYieldShareCap",
  "seniorLpYieldShareCap",
  // EntryPoint settlement queues. Market-level in the real flow: one value each,
  // applied to Senior, Junior and Senior LP alike.
  "gateByPriceUpdates",
  "depositSettlementDelay",
  "depositExpiry",
  "withdrawalSettlementDelay",
  "withdrawalExpiry",
  // Pool sizing the real flow's step 6 collects and the simulator did not.
  "poolLambda",
  "exitAssetYield",
  // The premium curve shape, one per side. The flow offers four registered
  // YDM shapes and preselects the shifting adaptive curve on both sides
  // (step-5-yield.tsx:907), so a design that never names a shape arrives at
  // the flow already disagreeing with it. This page prices the static shape
  // and says so; the choice still has to travel.
  "jrCurveModel",
  "slpCurveModel",
  // The oracle's staleness bound, step 3's "Max Time Between NAV Updates".
  // Distinct from the publication cadence above: the cadence is how often the
  // asset posts, this is how long a posted price stays usable. It is also one
  // of the two inputs the flow derives the request expiries from
  // (constants.ts derivedDefaultExpirySeconds), so without it neither expiry
  // default can be computed.
  "navStalenessBound",
  // The NAV unit every value in the market is measured in. The flow makes this
  // an explicit declaration rather than a detection (types.ts VALUATION_UNITS).
  "valuationUnit",
  // Genesis liquidity. The flow's seed section takes the quote amount only:
  // the collateral side is forced empty and minLPTAssetsOut is pinned to 0
  // (seed-liquidity-section.tsx:295).
  "genesisSeedQuote",
] as const;

export const DAY_DEPLOYMENT_TERM_IDS = [
  "yieldShareAtFullUtilization",
  "protectedExitThreshold",
  "selfLiquidationBonus",
] as const;

export type DayDeploymentInputId = (typeof DAY_DEPLOYMENT_INPUT_IDS)[number];

export type DayDeploymentTermId = (typeof DAY_DEPLOYMENT_TERM_IDS)[number];

export type DayDeploymentFieldId = DayDeploymentInputId | DayDeploymentTermId;

export type DayDeploymentInputValues = Record<DayDeploymentInputId, string>;

export type DayDeploymentFieldValues = Record<DayDeploymentFieldId, string>;

export const EMPTY_DAY_DEPLOYMENT_INPUTS: DayDeploymentInputValues = {
  tokenContractSource: "",
  tokenContractAddress: "",
  chain: "",
  adaptationSpeed: "",
  exitAsset: "",
  exitAssetStatic: "",
  exitLiquidity: "",
  navUpdateCadence: "",
  redemptionDelay: "",
  restockHurdle: "",
  maximumDiscount: "",
  maximumPremium: "",
  depthAtNav: "",
  reinvestmentSlippageTolerance: "",
  observationGracePeriod: "",
  juniorYieldShareCap: "",
  seniorLpYieldShareCap: "",
  gateByPriceUpdates: "",
  depositSettlementDelay: "",
  depositExpiry: "",
  withdrawalSettlementDelay: "",
  withdrawalExpiry: "",
  poolLambda: "",
  exitAssetYield: "",
  jrCurveModel: "",
  slpCurveModel: "",
  navStalenessBound: "",
  valuationUnit: "",
  genesisSeedQuote: "",
};

export const EMPTY_DAY_DEPLOYMENT_FIELDS: DayDeploymentFieldValues = {
  ...EMPTY_DAY_DEPLOYMENT_INPUTS,
  yieldShareAtFullUtilization: "",
  protectedExitThreshold: "",
  selfLiquidationBonus: "",
};

/**
 * Percent-unit bounds for the deployment-checklist terms that feed the accountant.
 * protectedExitThreshold mirrors the 1-99.91% exitBufferPct range enforced for markets.
 *
 * Note the unit. These bounds are in the ENGINE's unit, a percentage of the
 * coverage requirement, which is what `runDayTargetScenario` takes as
 * `exitBufferPct` and what the root simulator's box collects. The deploy
 * flow's field of the same name is an absolute coverage level whose ceiling is
 * the coverage requirement itself, so it cannot carry a static bound and is
 * validated against the live coverage setting instead. /v2 collects the flow's
 * unit and converts; see `dayExitBufferPctFromAbsolute` in `deploy-fields.ts`.
 */
export const DAY_DEPLOYMENT_TERM_BOUNDS: Record<
  DayDeploymentTermId,
  { min: number; max: number }
> = {
  yieldShareAtFullUtilization: { min: 0, max: 100 },
  protectedExitThreshold: { min: 1, max: 99.91 },
  selfLiquidationBonus: { min: 0, max: 50 },
};

/** Blank or unparseable input keeps the simulation on its current value; anything else is clamped. */
export function parseDayDeploymentTerm(
  raw: string,
  fallbackPct: number,
  bounds: { min: number; max: number },
): number {
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(parsed)) return fallbackPct;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}

export type DayConfigExportInput = {
  exportedAt: string;
  market: {
    id: string;
    name: string;
    asset: string;
    variant: string;
  };
  presetId: DayIssuerPresetId | null;
  terms: {
    coveragePct: number;
    minLiquidityPct: number;
    eclpBandWidthPct: number;
    riskSharePct: number;
    liqSharePct: number;
    riskY0Pct?: number;
    riskY100Pct?: number;
    liqY0Pct?: number;
    liqY100Pct?: number;
    observationDays: number;
    sourceApyPct: number;
    maintainCoverage: boolean;
    y100SharePct: number;
    exitBufferPct: number;
    selfLiquidationBonusPct: number;
    fixedTermGracePeriodDays?: number;
    poolConcentration?: number;
    poolSeniorWeightPct?: number;
    maxJTYieldSharePct?: number;
    maxLTYieldSharePct?: number;
    riskYDMMode?: "static" | "adaptive";
    liqYDMMode?: "static" | "adaptive";
    riskAdaptationSpeedPerYear?: number;
    liqAdaptationSpeedPerYear?: number;
    riskMinYTargetPct?: number;
    riskMaxYTargetPct?: number;
    liqMinYTargetPct?: number;
    liqMaxYTargetPct?: number;
  };
  // Conditions the modeled outcomes were produced under. Kept out of `terms`
  // because a hypothetical shock is not a deployable market parameter — but it
  // must travel with the export, or `modeled` misattributes shocked results to
  // unshocked terms.
  scenario: {
    hasHistoricalSeries: boolean;
    sourceStressPct: number;
  };
  modeled: {
    seniorApy: number;
    juniorApy: number;
    liquidityApy: number;
    coverageLossLimit: number;
    referenceSellShareOfSenior: number;
    boundarySellShareOfSenior: number;
  };
};

export type DayConfigExportPayload = {
  schemaVersion: number;
  source: "day-simulator";
  exportedAt: string;
  market: DayConfigExportInput["market"];
  preset: { id: DayIssuerPresetId | null; label: string };
  terms: {
    coverage: number;
    minLiquidity: number;
    eclpBandWidth: number;
    riskYieldShare: number;
    liquidityYieldShare: number;
    observationDays: number;
    fixedTermDurationSec: number;
    fixedTermGracePeriodSec: number;
    sourceApy: number;
    riskYieldShareAtFullUtilization: number;
    exitBufferPct: number;
    selfLiquidationBonus: number;
  };
  termsPct: {
    coveragePct: number;
    minLiquidityPct: number;
    eclpBandWidthPct: number;
    riskSharePct: number;
    liqSharePct: number;
    observationDays: number;
    fixedTermGracePeriodDays: number;
    sourceApyPct: number;
    y100SharePct: number;
    exitBufferPct: number;
    selfLiquidationBonusPct: number;
  };
  scenario: {
    hasHistoricalSeries: boolean;
    sourceStressPct: number;
    sourceStressApplied: boolean;
    coverageRestoration: boolean;
    note: string;
  };
  modeled: DayConfigExportInput["modeled"];
  // The protected exit threshold stated in both of the units that describe it,
  // because they are not interchangeable and the two consumers want different
  // ones. `terms.exitBufferPct` is the engine's unit, a percentage OF the
  // coverage requirement, and the deploy flow's field of the same name is an
  // absolute coverage level bounded by that requirement. They differ by a
  // factor of the coverage setting, so a file carrying only one of them is a
  // file a reader can transcribe into the wrong box. Both are derived here
  // from `terms.exitBufferPct` and `terms.coveragePct`, which are unambiguous,
  // so this block reads correctly whichever route wrote the file.
  protectedExit: {
    /** The engine's unit: how much of the requirement is left standing. */
    remainingAsShareOfRequirementPct: number;
    /** The deploy flow's unit: the absolute coverage level the exit arms at. */
    remainingCoveragePct: number;
    note: string;
  };
  deploymentBrief: {
    coverage: {
      enabled: boolean;
      minimumCoveragePct: number;
      observationPeriodSeconds: number;
      gracePeriodSeconds: number;
      protectedExitRemainingCoveragePct: number;
      selfLiquidationBonusPct: number;
    };
    liquidity: {
      enabled: boolean;
      minimumLiquidityPct: number;
    };
    yieldModels: {
      targetUtilizationPct: 90;
      junior: {
        model: "STATIC_CURVE" | "ADAPTIVE_CURVE_V2";
        y0Pct: number;
        yTargetPct: number;
        y100Pct: number;
        capPct: number;
        adaptationSpeedPerYear?: number;
        minYTargetPct?: number;
        maxYTargetPct?: number;
      };
      seniorLp: {
        model: "STATIC_CURVE" | "ADAPTIVE_CURVE_V2";
        y0Pct: number;
        yTargetPct: number;
        y100Pct: number;
        capPct: number;
        adaptationSpeedPerYear?: number;
        minYTargetPct?: number;
        maxYTargetPct?: number;
      };
    };
    exitPool: {
      pegCompositionPct: { exitAsset: number; senior: number };
      maximumDiscountBps: number;
      maximumDiscountWithinDeployRange: boolean;
      simulationConcentration: number;
      deploymentDefaultConcentration: number;
      maximumPremium: "derived in deploy flow";
    };
    settlementDefaults: {
      gateByPriceUpdates: true;
      depositDelaySeconds: 300;
      withdrawalDelaySeconds: 86400;
      expiryRule: string;
    };
    stillRequiredInFlow: string[];
    compatibility: ReturnType<typeof dayDeploymentCompatibility>;
  };
};

export function buildDayConfigExport(
  input: DayConfigExportInput,
): DayConfigExportPayload {
  const preset = DAY_ISSUER_PRESETS.find(
    (candidate) => candidate.id === input.presetId,
  );
  const riskY0Pct = input.terms.riskY0Pct ?? input.terms.riskSharePct;
  const riskY100Pct = input.terms.riskY100Pct ?? input.terms.y100SharePct;
  const liqY0Pct = input.terms.liqY0Pct ?? input.terms.liqSharePct;
  const liqY100Pct = input.terms.liqY100Pct ?? input.terms.liqSharePct;
  const coverageEnabled = input.terms.coveragePct > 0;
  const protectedExitRemainingCoveragePct = coverageEnabled
    ? (input.terms.exitBufferPct / 100) * input.terms.coveragePct
    : 0;
  const selfLiquidationBonusPct = coverageEnabled
    ? input.terms.selfLiquidationBonusPct
    : 0;
  const compatibility = dayDeploymentCompatibility({
    coveragePct: input.terms.coveragePct,
    eclpBandWidthPct: input.terms.eclpBandWidthPct,
    liqSharePct: input.terms.liqSharePct,
    liqY0Pct,
    liqY100Pct,
    minLiquidityPct: input.terms.minLiquidityPct,
    protectedExitRemainingCoveragePct,
    riskSharePct: input.terms.riskSharePct,
    riskY0Pct,
    riskY100Pct,
    selfLiquidationBonusPct,
  });
  const poolSeniorWeightPct = input.terms.poolSeniorWeightPct ?? 10;
  return {
    schemaVersion: DAY_CONFIG_EXPORT_SCHEMA_VERSION,
    source: "day-simulator",
    exportedAt: input.exportedAt,
    market: { ...input.market },
    preset: { id: preset?.id ?? null, label: preset?.label ?? "Custom" },
    terms: {
      coverage: input.terms.coveragePct / 100,
      minLiquidity: input.terms.minLiquidityPct / 100,
      eclpBandWidth: input.terms.eclpBandWidthPct / 100,
      riskYieldShare: input.terms.riskSharePct / 100,
      liquidityYieldShare: input.terms.liqSharePct / 100,
      observationDays: coverageEnabled ? input.terms.observationDays : 0,
      fixedTermDurationSec: coverageEnabled
        ? input.terms.observationDays * 86_400
        : 0,
      fixedTermGracePeriodSec: coverageEnabled
        ? (input.terms.fixedTermGracePeriodDays ?? 0) * 86_400
        : 0,
      sourceApy: input.terms.sourceApyPct / 100,
      riskYieldShareAtFullUtilization: input.terms.y100SharePct / 100,
      exitBufferPct: coverageEnabled ? input.terms.exitBufferPct : 0,
      selfLiquidationBonus: selfLiquidationBonusPct / 100,
    },
    termsPct: {
      coveragePct: input.terms.coveragePct,
      minLiquidityPct: input.terms.minLiquidityPct,
      eclpBandWidthPct: input.terms.eclpBandWidthPct,
      riskSharePct: input.terms.riskSharePct,
      liqSharePct: input.terms.liqSharePct,
      observationDays: coverageEnabled ? input.terms.observationDays : 0,
      fixedTermGracePeriodDays: coverageEnabled
        ? input.terms.fixedTermGracePeriodDays ?? 0
        : 0,
      sourceApyPct: input.terms.sourceApyPct,
      y100SharePct: input.terms.y100SharePct,
      exitBufferPct: coverageEnabled ? input.terms.exitBufferPct : 0,
      selfLiquidationBonusPct,
    },
    scenario: {
      hasHistoricalSeries: input.scenario.hasHistoricalSeries,
      sourceStressPct: input.scenario.sourceStressPct,
      sourceStressApplied: input.scenario.sourceStressPct > 0,
      coverageRestoration: coverageEnabled && input.terms.maintainCoverage,
      note:
        input.scenario.sourceStressPct > 0
          ? `Modeled outcomes include a hypothetical ${input.scenario.sourceStressPct}% source drawdown and recovery overlaid on the source history. This shock is not part of the source data and is not a market term.`
          : input.scenario.hasHistoricalSeries
            ? "Historical modeled outcomes use the source history as-is, with no hypothetical shock."
            : "No dated source history was available; modeled outcomes are forward projections rather than a historical backtest.",
    },
    modeled: { ...input.modeled },
    protectedExit: {
      remainingAsShareOfRequirementPct: coverageEnabled
        ? input.terms.exitBufferPct
        : 0,
      remainingCoveragePct: protectedExitRemainingCoveragePct,
      note: "The deploy flow asks for remainingCoveragePct, an absolute coverage level bounded by the coverage requirement. The simulator engine takes remainingAsShareOfRequirementPct. Both describe the same trigger.",
    },
    deploymentBrief: {
      coverage: {
        enabled: input.terms.coveragePct > 0,
        minimumCoveragePct: input.terms.coveragePct,
        observationPeriodSeconds: coverageEnabled
          ? input.terms.observationDays * 86_400
          : 0,
        gracePeriodSeconds: coverageEnabled
          ? (input.terms.fixedTermGracePeriodDays ?? 0) * 86_400
          : 0,
        protectedExitRemainingCoveragePct,
        selfLiquidationBonusPct,
      },
      liquidity: {
        enabled: input.terms.minLiquidityPct > 0,
        minimumLiquidityPct: input.terms.minLiquidityPct,
      },
      yieldModels: {
        targetUtilizationPct: 90,
        junior: {
          model: input.terms.riskYDMMode === "adaptive"
            ? "ADAPTIVE_CURVE_V2"
            : "STATIC_CURVE",
          y0Pct: riskY0Pct,
          yTargetPct: input.terms.riskSharePct,
          y100Pct: riskY100Pct,
          capPct: input.terms.maxJTYieldSharePct ?? Math.max(
            riskY0Pct,
            input.terms.riskSharePct,
            riskY100Pct,
          ),
          ...(input.terms.riskYDMMode === "adaptive"
            ? {
                adaptationSpeedPerYear:
                  input.terms.riskAdaptationSpeedPerYear ?? 100,
                minYTargetPct: input.terms.riskMinYTargetPct ?? 0.01,
                maxYTargetPct: input.terms.riskMaxYTargetPct ?? 100,
              }
            : {}),
        },
        seniorLp: {
          model: input.terms.liqYDMMode === "adaptive"
            ? "ADAPTIVE_CURVE_V2"
            : "STATIC_CURVE",
          y0Pct: liqY0Pct,
          yTargetPct: input.terms.liqSharePct,
          y100Pct: liqY100Pct,
          capPct: input.terms.maxLTYieldSharePct ?? Math.max(
            liqY0Pct,
            input.terms.liqSharePct,
            liqY100Pct,
          ),
          ...(input.terms.liqYDMMode === "adaptive"
            ? {
                adaptationSpeedPerYear:
                  input.terms.liqAdaptationSpeedPerYear ?? 100,
                minYTargetPct: input.terms.liqMinYTargetPct ?? 0.01,
                maxYTargetPct: input.terms.liqMaxYTargetPct ?? 100,
              }
            : {}),
        },
      },
      exitPool: {
        pegCompositionPct: {
          exitAsset: 100 - poolSeniorWeightPct,
          senior: poolSeniorWeightPct,
        },
        maximumDiscountBps: input.terms.eclpBandWidthPct * 100,
        maximumDiscountWithinDeployRange:
          input.terms.eclpBandWidthPct * 100 >= 50 &&
          input.terms.eclpBandWidthPct * 100 <= 500,
        simulationConcentration:
          input.terms.poolConcentration ?? DAY_ECLP_SIMULATION_LAMBDA,
        deploymentDefaultConcentration: DAY_ECLP_SIMULATION_LAMBDA,
        maximumPremium: "derived in deploy flow",
      },
      settlementDefaults: {
        gateByPriceUpdates: true,
        depositDelaySeconds: 300,
        withdrawalDelaySeconds: 86_400,
        expiryRule:
          "max(oracle NAV staleness, observation period) + 604800 seconds",
      },
      stillRequiredInFlow: [
        "Asset contract, chain, token metadata, and market listing details",
        "Collateral oracle recipe or compatible deployed oracle address",
        "Exit asset and conditional rate-provider address",
        "Pool concentration if different from the deployment default",
        "Reinvestment slippage tolerance and genesis exit-asset seed",
        "Final settlement expiries after oracle staleness is known",
      ],
      compatibility,
    },
  };
}

export function dayConfigExportSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function dayConfigExportFilename(
  name: string,
  exportedAt: string,
): string {
  const slug = dayConfigExportSlug(name) || "day-market";
  return `day-market-config_${slug}_${exportedAt.slice(0, 10)}.json`;
}
