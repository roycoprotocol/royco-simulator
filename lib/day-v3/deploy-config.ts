import type { DayCurveModel } from "@/lib/day-simulator-template/deploy-fields";
import { percentToWad } from "@/lib/day-v3/handoff";
import type { DayV3YieldCurveDesign } from "@/lib/day-v3/yield-curves";

/**
 * The Royco Deploy market config: the deploy flow's own draft (DraftV1 in
 * royco-rwa-frontend/lib/deploy-market/types.ts) in the envelope the flow's
 * own download uses, so the file restores through its Import with no
 * converter. Modeled terms are filled; every deployment-only field is left
 * the way a fresh draft starts, so the flow asks for it instead of adopting
 * a value the issuer never decided. Slices the flow's restore migrations
 * back-fill (presentation, blacklist) are omitted. A new DraftV1 slice the
 * flow's structural check requires must be added here.
 */
export interface DayV3DeployConfigInput {
  exportedAt: string;
  /** Blank for a custom source: the flow derives a name from the asset. */
  marketName: string;
  /** The canonical pool design's chain, null until one resolves. */
  chainId: number | null;
  sourceApyPct: number | null;
  exitAssetYieldPct: number | null;
  /** 0 when Senior protection is off. */
  coveragePct: number | null;
  /** 0 when immediate exit is off. */
  minimumLiquidityPct: number | null;
  /** The recovery window in days, 0 for none. */
  observationDays: number;
  curveModels: { junior: DayCurveModel; slp: DayCurveModel };
  curves: DayV3YieldCurveDesign;
  maximumDiscountBps: number | null;
  maximumPremiumBps: number | null;
  lambda: number | null;
  swapFeeBps: number | null;
  redemptionDelayDays: number | null;
}

export type DayV3DeployConfig = ReturnType<typeof buildDayV3DeployConfig>;

// Mirrors of royco-rwa-frontend/lib/deploy-market/constants.ts.
const COVERAGE_DISABLED_LIQ_UTIL_WAD = (2n ** 256n - 1n).toString();
const UINT32_MAX = 4_294_967_295;
// deriveDustTolerance(8), re-derived by the flow once the pricing route is known.
const DEFAULT_DUST_TOLERANCE_NAV_WEI = "50000000000";
const settlementQueueConfig = () => ({
  enabled: true,
  depositDelaySeconds: 300,
  depositExpirySeconds: UINT32_MAX,
  redemptionDelaySeconds: 86_400,
  redemptionExpirySeconds: UINT32_MAX,
  gateByOracleUpdate: true,
});

const text = (value: number | null) => (value === null ? "" : String(value));

type Anchors = DayV3YieldCurveDesign["junior"];

// Param keys per shape (the flow's YDM_CURVE_PARAM_KEYS). The V2 "discount"
// key carries the absolute share at 0% utilization; the contract derives its
// stored discount from it (AdaptiveCurveYDM_V2.sol:424).
function ydmSelection(model: DayCurveModel, enabled: boolean, curve: Anchors) {
  if (!enabled) {
    return { ydmType: "FIXED", curveParams: { fixedYieldShareWAD: "0" } };
  }
  const zero = percentToWad(curve.y0Pct);
  const target = percentToWad(curve.yTargetPct);
  const full = percentToWad(curve.y100Pct);
  const curveParams = {
    STATIC_CURVE: {
      zeroUtilizationYieldShareWAD: zero,
      targetUtilizationYieldShareWAD: target,
      fullUtilizationYieldShareWAD: full,
    },
    ADAPTIVE_CURVE_V1: {
      targetUtilizationYieldShareWAD: target,
      fullUtilizationYieldShareWAD: full,
    },
    ADAPTIVE_CURVE_V2: {
      zeroUtilizationDiscountWAD: zero,
      targetUtilizationYieldShareWAD: target,
      fullUtilizationYieldShareWAD: full,
    },
    FIXED: { fixedYieldShareWAD: target },
  }[model];
  return { ydmType: model, curveParams };
}

/** The cap the contract would derive from the curve's own peak. */
const yieldShareCap = (enabled: boolean, model: DayCurveModel, curve: Anchors) =>
  !enabled
    ? "0"
    : percentToWad(
        model === "FIXED"
          ? curve.yTargetPct
          : Math.max(curve.y0Pct, curve.yTargetPct, curve.y100Pct),
      );

export function buildDayV3DeployConfig(input: DayV3DeployConfigInput) {
  const now = Date.parse(input.exportedAt);
  const coveragePct = input.coveragePct ?? 0;
  const liquidityPct = input.minimumLiquidityPct ?? 0;
  const protection = coveragePct > 0;
  const exit = liquidityPct > 0;
  const { junior, slp } = input.curveModels;
  return {
    format: "royco-day-market-config",
    version: 1,
    source: "royco-day-simulator",
    exportedAt: input.exportedAt,
    draft: {
      version: 1,
      createdAt: now,
      updatedAt: now,
      chainId: input.chainId ?? 1,
      intendedDeployer: null,
      furthestStep: 0,
      identity: {
        marketName: input.marketName,
        st: { name: "", symbol: "" },
        jt: { name: "", symbol: "" },
        lpt: { name: "", symbol: "" },
        pool: { name: "", symbol: "" },
      },
      assets: {
        collateralAsset: "",
        quoteMode: "custom",
        quoteAsset: "",
        quoteAssetRateProvider: "",
        quoteAssetRateProviderDeployment: null,
        quoteYieldBearing: true,
      },
      oracle: {
        mode: "deploy",
        valuationUnit: "USD",
        existingAddress: "",
        recipe: null,
        deployedAddress: null,
        deployTxHash: null,
        deployDeployer: null,
      },
      economics: {
        minCoverageWAD: protection ? percentToWad(coveragePct) : "0",
        coverageLiquidationUtilizationWAD: COVERAGE_DISABLED_LIQ_UTIL_WAD,
        minLiquidityWAD: exit ? percentToWad(liquidityPct) : "0",
        fixedTermDurationSeconds: protection
          ? Math.round(input.observationDays * 86_400)
          : 0,
        fixedTermGracePeriodSeconds: 0,
        stSelfLiquidationBonusWAD: "0",
        dustTolerance: DEFAULT_DUST_TOLERANCE_NAV_WEI,
        maxJTYieldShareWAD: yieldShareCap(protection, junior, input.curves.junior),
        maxLPTYieldShareWAD: yieldShareCap(exit, slp, input.curves.slp),
      },
      yield: {
        jt: ydmSelection(junior, protection, input.curves.junior),
        lpt: ydmSelection(slp, exit, input.curves.slp),
      },
      poolSizing: {
        assetYieldPct: text(input.sourceApyPct),
        exitLiquidityTvl: "",
        maxDiscountBps:
          input.maximumDiscountBps === null
            ? ""
            : String(Math.round(input.maximumDiscountBps)),
        maxPremiumBps: text(input.maximumPremiumBps),
        redemptionDelayDays: text(input.redemptionDelayDays),
        navUpdateCadenceHours: "",
        exitFeeBps: text(input.swapFeeBps),
        lambda: text(input.lambda),
        stablecoinYieldPct: text(input.exitAssetYieldPct),
      },
      poolParams: null,
      seed: { collateralAmount: "", quoteAmount: "", minLPTAssetsOut: "0" },
      kernel: {
        sequencerUptimeFeed: null,
        gracePeriodSeconds: 0,
        maxReinvestmentSlippageWAD: "",
      },
      entryPoint: {
        st: settlementQueueConfig(),
        jt: settlementQueueConfig(),
        lpt: settlementQueueConfig(),
      },
      mining: {
        seed: null,
        minedMarketId: null,
        paramsHash: null,
        predictedAddresses: null,
      },
      execution: {
        approvals: {},
        deployTxHash: null,
        result: null,
        deployerAddress: null,
        factoryAddress: null,
        templateAddress: null,
        encodedParameters: null,
        configurationSnapshot: null,
        backendRecordStatus: "idle",
      },
    },
  };
}

/** The same name the flow's own download uses. */
export function dayV3DeployConfigFilename(marketName: string): string {
  const slug = marketName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `royco-day-market-${slug || "config"}.json`;
}
