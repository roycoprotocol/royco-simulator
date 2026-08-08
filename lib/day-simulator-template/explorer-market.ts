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
    // Drafts cover JBBB and every user import. JBBB's real history draws down
    // 10.8%, and an imported source's risk is unknown, so both want a deep Jr
    // buffer. Premiums follow Variant B: Jr = 1x coverage, SLP = 0.5x liquidity.
    coverage: 0.2,
    minLiquidity: 0.1,
    liquidationUtilization: 1.5,
    observationDays: 30,
    exitBufferPct: 66.67,
    linkJuniorToFirstLoss: true,
    maintainCoverage: true,
    riskYDM: { mode: "static", y0: 0.1, yTarget: 0.2, y100: 0.6 },
    liqYDM: { mode: "static", y0: 0.01, yTarget: 0.05, y100: 0.15 },
    selfLiquidationBonus: 0.02,
    stProtocolFee: 0,
    jtProtocolFee: 0,
    jtYieldShareProtocolFee: 0,
    ltYieldShareProtocolFee: 0,
    stableYield: 0.035,
    swapFeeBps: 10,
    poolTurnoverPerYear: 8,
    eclpBandWidth: 0.01,
    reinvestLiquidityPremium: true,
    initialST: 40_000_000,
    initialJT: 40_000_000 * (0.2 / (0.9 - 0.2)),
    initialLT: 40_000_000 * (0.1 / 0.9),
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
  id?: string;
  label: string;
  source?: string;
  provider: string;
  sourceUrl: string;
  series: DaySeriesPoint[];
  cadence: "daily" | "monthly" | "irregular";
  priceType: DayMarketManifest["provenance"]["priceType"];
  feesIncluded?: DayMarketManifest["provenance"]["feesIncluded"];
  retrievedAt?: string;
  supportingSources?: DayMarketManifest["provenance"]["supportingSources"];
};

export type DayYieldDraftSource = {
  label: string;
  sourceApy: number;
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
    id: source.id ?? "day-explorer-draft",
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
      source: source.source ?? source.label,
      sourceUrl: source.sourceUrl,
      sourceProvider: source.provider,
      dataMode: "historical-series",
      dataCadence: source.cadence,
      priceType: source.priceType,
      feesIncluded: source.feesIncluded ?? true,
      observationCount: source.series.length,
      firstDate: first?.date ?? "unknown",
      lastDate: last?.date ?? "unknown",
      ...(source.retrievedAt ? { retrievedAt: source.retrievedAt } : {}),
      ...(source.supportingSources ? { supportingSources: source.supportingSources } : {}),
    },
  };
  return dayMarketFromManifest(manifest, source.series);
}

export function buildDayYieldDraftMarket(source: DayYieldDraftSource): DayMarket {
  if (!Number.isFinite(source.sourceApy) || source.sourceApy <= -1) {
    throw new Error("Net source APY must be a finite percentage greater than -100%.");
  }
  const label = source.label.trim() || "Custom yield source";
  const manifest: DayMarketManifest = {
    ...DAY_EXPLORER_TEMPLATE_MANIFEST,
    id: "day-explorer-yield-draft",
    identity: {
      ...DAY_EXPLORER_TEMPLATE_MANIFEST.identity,
      marketName: label,
      displayAssetName: label,
      underlyingAsset: `the modeled ${label} yield source`,
    },
    defaults: {
      ...DAY_EXPLORER_TEMPLATE_MANIFEST.defaults,
      // A yield-only model has no risk history to justify a deep buffer, so it
      // opens on the minimal structure. Historical drafts and imports keep the
      // conservative template defaults, where the risk is simply unknown.
      coverage: 0.05,
      minLiquidity: 0.1,
      initialJT: DAY_EXPLORER_TEMPLATE_MANIFEST.defaults.initialST * (0.05 / (0.9 - 0.05)),
      initialLT: DAY_EXPLORER_TEMPLATE_MANIFEST.defaults.initialST * (0.1 / 0.9),
      riskYDM: { mode: "static", y0: 0.02, yTarget: 0.05, y100: 0.15 },
      liqYDM: { mode: "static", y0: 0.01, yTarget: 0.05, y100: 0.15 },
      sourceApy: source.sourceApy,
    },
    certification: {
      intakeConfirmed: false,
    },
    customization: {
      explicitlyAuthorized: true,
      authorizationNote: "The Explorer yield-only path intentionally omits historical analysis because no dated series was supplied.",
      hiddenSections: ["backtest"],
      copyOverrides: {},
    },
    provenance: {
      source: `${label} net APY`,
      sourceUrl: "",
      sourceProvider: "User input",
      dataMode: "published-apy-forward",
      dataCadence: "none",
      priceType: "published-apy",
      feesIncluded: true,
      observationCount: 0,
      firstDate: "unknown",
      lastDate: "unknown",
      publishedApy: source.sourceApy,
    },
  };
  return dayMarketFromManifest(manifest, []);
}
