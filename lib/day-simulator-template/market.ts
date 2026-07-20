import type { YDMConfig } from "@/lib/day/engine/types";

export type DaySimulatorDefaults = {
  sourceApy: number;
  coverage: number;
  minLiquidity: number;
  liquidationUtilization: number;
  observationDays: number;
  exitBufferPct: number;
  linkJuniorToFirstLoss: boolean;
  maintainCoverage: boolean;
  riskYDM: YDMConfig;
  liqYDM: YDMConfig;
  selfLiquidationBonus: number;
  stProtocolFee: number;
  jtProtocolFee: number;
  jtYieldShareProtocolFee: number;
  ltYieldShareProtocolFee: number;
  stableYield: number;
  swapFeeBps: number;
  poolTurnoverPerYear: number;
  eclpBandWidth: number;
  reinvestLiquidityPremium: boolean;
  initialST: number;
  initialJT: number;
  initialLT: number;
};

export type DayMarketIdentity = {
  marketName: string;
  displayAssetName: string;
  underlyingAsset: string;
  seniorName: string;
  seniorSymbol: string;
  juniorName: string;
  juniorSymbol: string;
};

export type DayMarketCopy = {
  eyebrow: string;
  title: string;
  description: string;
  disclosure: string;
};

export type DayMarketManifest = {
  id: string;
  route: string;
  identity: DayMarketIdentity;
  defaults: DaySimulatorDefaults;
  targets: {
    seniorApyMin: number;
    seniorApyMax: number;
    juniorApyMin: number;
    juniorApyMax: number;
  };
  certification: {
    intakeConfirmed: boolean;
    templateExceptions: string[];
  };
  provenance: {
    source: string;
    sourceUrl: string;
    sourceProvider: string;
    seriesPath?: string;
    dataCadence: "daily" | "monthly" | "irregular";
    priceType: "nav" | "price" | "total-return-index" | "unknown";
    feesIncluded: boolean | "unknown";
    observationCount: number;
    firstDate: string;
    lastDate: string;
    retrievedAt?: string;
  };
};

export type DaySeriesPoint = { date: string; price: number };

export type DayMarket = DayMarketManifest & {
  copy: DayMarketCopy;
  series: DaySeriesPoint[];
};

const percentage = (value: number): string => {
  const percent = value * 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
};

const priceTypeLabel = (priceType: DayMarketManifest["provenance"]["priceType"]): string => {
  if (priceType === "nav") return "NAV";
  if (priceType === "total-return-index") return "total-return";
  if (priceType === "price") return "price";
  return "price/NAV";
};

export function buildDayMarketCopy(manifest: DayMarketManifest): DayMarketCopy {
  const feeTreatment = manifest.provenance.feesIncluded === true
    ? "fee-inclusive"
    : manifest.provenance.feesIncluded === false
      ? "fee-exclusive"
      : "fee-treatment-unknown";
  return {
    eyebrow: `ROYCO DAY · ${manifest.identity.marketName.toUpperCase()} MARKET`,
    title: `${manifest.identity.marketName} Day Simulator`,
    description: `Explore a hypothetical three-tranche Royco Day market over ${manifest.identity.underlyingAsset}. Senior receives first-loss coverage from Junior, while a ${percentage(manifest.defaults.minLiquidity)}% minimum liquidity requirement supports secondary-market exits.`,
    disclosure: `The source APY is derived from ${manifest.provenance.observationCount} ${feeTreatment} ${manifest.provenance.dataCadence} ${priceTypeLabel(manifest.provenance.priceType)} observations supplied by ${manifest.provenance.sourceProvider}. Simulator outputs are mechanism simulations, not historical backtests, forecasts, or an announced product.`,
  };
}

export function dayMarketFromManifest(
  manifest: DayMarketManifest,
  series: DaySeriesPoint[],
): DayMarket {
  return {
    ...manifest,
    copy: buildDayMarketCopy(manifest),
    series,
  };
}
