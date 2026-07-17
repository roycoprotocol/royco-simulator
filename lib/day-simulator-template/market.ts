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

export type DayMarketManifest = {
  id: string;
  route: string;
  copy: {
    eyebrow: string;
    title: string;
    description: string;
    disclosure: string;
  };
  defaults: DaySimulatorDefaults;
  targets?: {
    seniorApyMin: number;
    seniorApyMax: number;
    juniorApyMin: number;
    juniorApyMax: number;
  };
  provenance: {
    source: string;
    sourceUrl: string;
    seriesPath?: string;
    priceType: "nav" | "price" | "total-return-index";
    feesIncluded: boolean;
    observationCount: number;
    firstDate: string;
    lastDate: string;
  };
};

export type DaySeriesPoint = { date: string; price: number };

export type DayMarket = DayMarketManifest & {
  series: DaySeriesPoint[];
};
