// =============================================================================
// Pool creator — manifest emission
// -----------------------------------------------------------------------------
// Turns a finished draft into the three files a Day market is made of:
// `market.json`, `series.json` and `market.ts`.
//
// The point is that a wizard-built pool is *certifiable* — the emitted manifest
// must satisfy every invariant `scripts/day-simulator/verify.mjs` enforces, so
// it can go straight through `day-sim:verify` → `day-sim:calibrate` →
// `day-sim:certify` without hand-editing. `validate.ts` mirrors those rules so
// the UI can say so before the user downloads anything.
// =============================================================================

import { annualizedSeriesApy } from "@/lib/day-simulator-template/series";
import type {
  DayMarketManifest,
  DaySeriesPoint,
  DaySimulatorDefaults,
} from "@/lib/day-simulator-template/market";
import { shapeYdmAnchors, type PoolBase } from "@/lib/pool-creator/config";
import { slugify, type PoolDraft } from "@/lib/pool-creator/draft";
import type { SolvedTerms } from "@/lib/pool-creator/solver";

/**
 * The simulator template requires a 7–194 day observation period, so a
 * perpetual pool (`recoveryDays = 0`) cannot be published as a simulator page
 * even though the accountant and the live contracts both support it. Rather
 * than silently substituting a number, `validate.ts` reports it and the UI
 * offers to set a window.
 */
export const MIN_PUBLISHABLE_OBSERVATION_DAYS = 7;
export const MAX_PUBLISHABLE_OBSERVATION_DAYS = 194;

export const marketIdFor = (draft: PoolDraft): string =>
  slugify(draft.identity.slug || draft.identity.marketName || "day-market") || "day-market";

export const routeFor = (draft: PoolDraft): string => `/${marketIdFor(draft)}`;

/** `weekly` is not a `dataCadence` the manifest recognises; it is irregular. */
function cadenceFor(draft: PoolDraft): DayMarketManifest["provenance"]["dataCadence"] {
  if (draft.source?.kind !== "series") return "none";
  const cadence = draft.source.origin.cadence;
  if (cadence === "daily") return "daily";
  if (cadence === "monthly") return "monthly";
  return "irregular";
}

export function deriveSeries(draft: PoolDraft, series: DaySeriesPoint[]): DaySeriesPoint[] {
  // Strictly increasing dates and positive prices, which verify.mjs checks row
  // by row. The sources already satisfy this; the guard is cheap insurance.
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.filter(
    (point, index) =>
      point.price > 0 && (index === 0 || point.date > sorted[index - 1].date),
  );
}

export function deriveDefaults(
  base: PoolBase,
  solved: SolvedTerms,
  series: DaySeriesPoint[],
): DaySimulatorDefaults {
  const { riskYDM, liqYDM } = shapeYdmAnchors(
    solved.riskYieldShare,
    solved.liquidityYieldShare,
    base.ydmMode,
    base.ydmSpread,
  );
  const initialST = base.initialSeniorSize;

  return {
    // Must equal the annualized series to 1e-12. Using the same function
    // verify.mjs derives with makes that true by construction rather than by
    // rounding luck.
    sourceApy: annualizedSeriesApy(series),
    coverage: solved.coverage,
    minLiquidity: solved.minLiquidity,
    liquidationUtilization: 100 / base.exitBufferPct,
    observationDays: solved.recoveryDays,
    exitBufferPct: base.exitBufferPct,
    linkJuniorToFirstLoss: true,
    maintainCoverage: base.maintainCoverage,
    riskYDM,
    liqYDM,
    selfLiquidationBonus: base.selfLiquidationBonus,
    stProtocolFee: base.stProtocolFee,
    jtProtocolFee: base.jtProtocolFee,
    jtYieldShareProtocolFee: base.jtYieldShareProtocolFee,
    ltYieldShareProtocolFee: base.ltYieldShareProtocolFee,
    stableYield: base.stableYield,
    swapFeeBps: base.swapFeeBps,
    poolTurnoverPerYear: base.poolTurnoverPerYear,
    eclpBandWidth: base.eclpBandWidth,
    reinvestLiquidityPremium: base.reinvestLiquidityPremium,
    initialST,
    // Exactly the relations verify.mjs asserts, to 1e-9.
    initialJT: (initialST * solved.coverage) / (0.9 - solved.coverage),
    initialLT: (initialST * solved.minLiquidity) / 0.9,
  };
}

/**
 * Target bands are set around the solved point, which makes
 * `verify-runtime.ts`'s "accountant APY sits inside the configured range"
 * assertion pass by construction rather than by guesswork.
 */
function deriveTargets(solved: SolvedTerms): DayMarketManifest["targets"] {
  const band = (value: number, pad: number) => ({
    min: Number.isFinite(value) ? value - pad : 0,
    max: Number.isFinite(value) ? value + pad : 0,
  });
  const senior = band(solved.seniorApy, 0.005);
  const junior = band(solved.juniorApy, 0.01);
  const liquidity = band(solved.liquidityApy, 0.01);
  return {
    seniorApyMin: senior.min,
    seniorApyMax: senior.max,
    juniorApyMin: junior.min,
    juniorApyMax: junior.max,
    liquidityApyMin: liquidity.min,
    liquidityApyMax: liquidity.max,
  };
}

export function deriveManifest(
  draft: PoolDraft,
  base: PoolBase,
  solved: SolvedTerms,
  rawSeries: DaySeriesPoint[],
): { manifest: DayMarketManifest; series: DaySeriesPoint[] } {
  const id = marketIdFor(draft);
  const origin = draft.source?.kind === "series" ? draft.source.origin : null;
  const described = draft.source?.kind === "described" ? draft.source : null;

  /**
   * A modelled strategy has no history, and must not claim one.
   *
   * The wizard synthesises a path so the cushion diagram and the backtest have
   * something to work with, but publishing that as `historical-series` would
   * present synthetic points to depositors as real observations. The manifest
   * already has the honest representation for this — `published-apy-forward`
   * with zero observations, which is what Blockhouse, DualMint and Muga use.
   */
  const isModelled = described !== null;
  const series = isModelled ? [] : deriveSeries(draft, rawSeries);

  const manifest: DayMarketManifest = {
    id,
    route: routeFor(draft),
    identity: {
      marketName: draft.identity.marketName,
      displayAssetName: draft.identity.displayAssetName || draft.identity.marketName,
      underlyingAsset: draft.identity.underlyingAsset || draft.identity.marketName,
      seniorName: draft.identity.seniorName,
      seniorSymbol: draft.identity.seniorSymbol,
      juniorName: draft.identity.juniorName,
      juniorSymbol: draft.identity.juniorSymbol,
    },
    defaults: {
      ...deriveDefaults(base, solved, series),
      // For a modelled market the published APY *is* the source APY, and both
      // must match to 1e-12.
      ...(isModelled ? { sourceApy: described.expectedApy } : null),
    },
    targets: deriveTargets(solved),
    // Set by completing the step-5 checklist, not by a box labelled
    // "certification" — the user confirms consequences, not paperwork.
    certification: { intakeConfirmed: Object.values(draft.acknowledged).filter(Boolean).length >= 3 },
    // The wizard never emits a presentation deviation, so
    // `validateDayMarketCustomization` returns zero issues.
    customization: {
      explicitlyAuthorized: false,
      authorizationNote: "",
      hiddenSections: [],
      copyOverrides: {},
    },
    provenance: {
      source: origin
        ? origin.kind === "onchain"
          ? `On-chain value per share read from ${origin.label || "the vault"}`
          : `Price history supplied by ${origin.provider || "the issuer"}`
        : `Modelled forward path at a ${((described?.expectedApy ?? 0) * 100).toFixed(2)}% target yield`,
      sourceUrl: origin?.sourceUrl || "https://royco.org",
      sourceProvider: origin?.provider || draft.identity.marketName || "Issuer",
      seriesPath: `lib/day-markets/${id}/series.json`,
      dataMode: isModelled ? "published-apy-forward" : "historical-series",
      dataCadence: isModelled ? "none" : cadenceFor(draft),
      priceType: isModelled ? "published-apy" : (origin?.priceType ?? "nav"),
      feesIncluded: origin?.feesIncluded ?? "unknown",
      observationCount: series.length,
      // The sentinel the existing forward markets use, since there is no series
      // to take dates from.
      firstDate: isModelled ? "not-applicable" : (series[0]?.date ?? ""),
      lastDate: isModelled ? "not-applicable" : (series[series.length - 1]?.date ?? ""),
      ...(isModelled ? { publishedApy: described.expectedApy } : null),
      retrievedAt: new Date().toISOString(),
    },
  };

  return { manifest, series };
}

/**
 * The five-line `market.ts` the factory emits. verify.mjs greps this file for
 * the three factory contracts below, and rejects it if it contains `function `,
 * `<` or `defaultConfig` — no logic is permitted in a market module.
 */
export function marketModuleSource(): string {
  // Byte-for-byte the shape the existing markets use. verify.mjs greps for the
  // three factory contracts, so the inline `type DayMarketManifest` import is
  // load-bearing — a separate `import type { … }` line does not contain that
  // substring and fails the check.
  return `import manifest from "./market.json";
import series from "./series.json";
import { dayMarketFromManifest, type DayMarketManifest } from "@/lib/day-simulator-template/market";

export const MARKET = dayMarketFromManifest(manifest as DayMarketManifest, series);
`;
}

/** The generated route: the strict shell, with no design overrides. */
export function routeSource(id: string, manifest: DayMarketManifest): string {
  return `import type { Metadata } from "next";
import { StrictDaySimulatorPageShell } from "@/components/day-simulator/DaySimulatorPageShell";
import { MARKET } from "@/lib/day-markets/${id}/market";

export const metadata: Metadata = {
  title: "${manifest.identity.marketName} Day Simulator",
  description: "Explore a hypothetical three-tranche Royco Day market over ${manifest.identity.underlyingAsset}.",
};

export default function Page() {
  return <StrictDaySimulatorPageShell market={MARKET} />;
}
`;
}
