import type { Metadata } from "next";
import { StrictDaySimulatorPageShell } from "@/components/day-simulator/DaySimulatorPageShell";
import {
  DAY_MARKETS,
  DEFAULT_DAY_EXPLORER_MARKET,
} from "@/lib/day-markets/registry";

export const metadata: Metadata = {
  title: "Royco Day Explorer",
  description: "Model Senior Tranche (ST), Junior Tranche (JT), and Senior Liquidity Provider (SLP) positions from any yield source.",
};

export default async function DaySimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedMarket = Array.isArray(params.market)
    ? params.market[0]
    : params.market;
  return (
    <StrictDaySimulatorPageShell
      initialMarketId={requestedMarket}
      market={DEFAULT_DAY_EXPLORER_MARKET}
      markets={DAY_MARKETS}
    />
  );
}
