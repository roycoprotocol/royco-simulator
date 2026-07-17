import type { YDMConfig } from "@/lib/day/engine/types";

export type DaySimulatorDefaults = {
  sourceApy: number;
  coverage: number;
  minLiquidity: number;
  liquidationUtilization: number;
  riskYDM: YDMConfig;
  liqYDM: YDMConfig;
  selfLiquidationBonus: number;
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
