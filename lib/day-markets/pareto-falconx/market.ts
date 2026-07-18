import manifest from "./market.json";
import series from "@/lib/markets/pareto-falconx/series.json";
import type { DayMarket, DayMarketManifest } from "@/lib/day-simulator-template/market";

export const PARETO_FALCONX_DAY_MARKET: DayMarket = {
  ...(manifest as DayMarketManifest),
  series,
};
