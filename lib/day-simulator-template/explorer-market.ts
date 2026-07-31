import {
  dayMarketFromManifest,
  type DayMarket,
  type DayMarketManifest,
  type DaySeriesPoint,
} from "@/lib/day-simulator-template/market";
import { annualizedSeriesApy } from "@/lib/day-simulator-template/series";

export const DAY_EXPLORER_TEMPLATE_MANIFEST: DayMarketManifest = {
  id: "day",
  route: "/day-sim",
  identity: {
    marketName: "Royco Day",
    displayAssetName: "Template strategy",
    underlyingAsset: "the template strategy",
    seniorName: "Senior",
    seniorSymbol: "ST",
    juniorName: "Junior",
    juniorSymbol: "JT",
  },
  defaults: {
    sourceApy: 0.12,
    coverage: 0.2,
    minLiquidity: 0.12,
    liquidationUtilization: 1.5,
    observationDays: 30,
    exitBufferPct: 66.67,
    linkJuniorToFirstLoss: true,
    maintainCoverage: true,
    riskYDM: { mode: "static", y0: 0.25, yTarget: 0.35, y100: 0.55 },
    liqYDM: { mode: "static", y0: 0.08, yTarget: 0.12, y100: 0.2 },
    selfLiquidationBonus: 0.02,
    stProtocolFee: 0,
    jtProtocolFee: 0,
    jtYieldShareProtocolFee: 0,
    ltYieldShareProtocolFee: 0,
    stableYield: 0.035,
    swapFeeBps: 10,
    poolTurnoverPerYear: 8,
    eclpBandWidth: 0.1,
    reinvestLiquidityPremium: true,
    initialST: 40_000_000,
    initialJT: 10_000_000,
    initialLT: 6_000_000,
  },
  targets: {
    seniorApyMin: 0,
    seniorApyMax: 1,
    juniorApyMin: 0,
    juniorApyMax: 10,
  },
  certification: {
    intakeConfirmed: true,
  },
  customization: {
    explicitlyAuthorized: false,
    authorizationNote: "",
    hiddenSections: [],
    copyOverrides: {},
  },
  provenance: {
    source: "Deterministic one-year template path",
    sourceUrl: "https://github.com/roycoprotocol/dawn-simulator",
    sourceProvider: "Royco",
    dataMode: "historical-series",
    dataCadence: "monthly",
    priceType: "nav",
    feesIncluded: true,
    observationCount: 13,
    firstDate: "2025-01-01",
    lastDate: "2026-01-01",
  },
};

export const DAY_EXPLORER_TEMPLATE_SERIES: DaySeriesPoint[] = Array.from(
  { length: 13 },
  (_, index) => ({
    date: new Date(Date.UTC(2025, index, 1)).toISOString().slice(0, 10),
    price: Math.pow(1.12, index / 12),
  }),
);

export const DAY_EXPLORER_TEMPLATE_MARKET = dayMarketFromManifest(
  DAY_EXPLORER_TEMPLATE_MANIFEST,
  DAY_EXPLORER_TEMPLATE_SERIES,
);

export type DayDraftSource = {
  label: string;
  provider: string;
  sourceUrl: string;
  series: DaySeriesPoint[];
  cadence: "daily" | "monthly" | "irregular";
  priceType: DayMarketManifest["provenance"]["priceType"];
  feesIncluded: DayMarketManifest["provenance"]["feesIncluded"];
};

export function buildDayDraftMarket(source: DayDraftSource): DayMarket {
  if (source.series.length < 3) {
    throw new Error("A draft source needs at least three dated observations.");
  }
  const sourceApy = annualizedSeriesApy(source.series);
  if (!Number.isFinite(sourceApy) || sourceApy <= -1) {
    throw new Error("The imported history does not produce a valid annualized return.");
  }
  const first = source.series[0];
  const last = source.series.at(-1);
  const manifest: DayMarketManifest = {
    ...DAY_EXPLORER_TEMPLATE_MANIFEST,
    id: "day-explorer-draft",
    identity: {
      ...DAY_EXPLORER_TEMPLATE_MANIFEST.identity,
      marketName: source.label,
      displayAssetName: source.label,
      underlyingAsset: `the imported ${source.label} yield source`,
    },
    defaults: {
      ...DAY_EXPLORER_TEMPLATE_MANIFEST.defaults,
      sourceApy,
    },
    certification: {
      intakeConfirmed: false,
    },
    provenance: {
      source: source.label,
      sourceUrl: source.sourceUrl,
      sourceProvider: source.provider,
      dataMode: "historical-series",
      dataCadence: source.cadence,
      priceType: source.priceType,
      feesIncluded: source.feesIncluded,
      observationCount: source.series.length,
      firstDate: first?.date ?? "unknown",
      lastDate: last?.date ?? "unknown",
    },
  };
  return dayMarketFromManifest(manifest, source.series);
}
