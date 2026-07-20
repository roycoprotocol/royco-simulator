import manifest from "./market.json";
import series from "./series.json";
import { dayMarketFromManifest, type DayMarketManifest } from "@/lib/day-simulator-template/market";

export const MARKET = dayMarketFromManifest(manifest as DayMarketManifest, series);
