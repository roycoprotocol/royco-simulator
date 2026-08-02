import type { Metadata } from "next";

import DayExplorer from "@/components/day-simulator/DayExplorer";
import SimulatorPageShell from "@/components/simulator/SimulatorPageShell";
import {
  DAY_MARKETS,
  DEFAULT_DAY_EXPLORER_MARKET,
} from "@/lib/day-markets/registry";

export const metadata: Metadata = {
  title: "Royco Day Learning Lab",
  description: "An experimental guided interface for learning how Royco Day market parameters change protection, liquidity, and rewards.",
  robots: { index: false, follow: false },
};

export default async function DayLearningLabPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedMarket = Array.isArray(params.market)
    ? params.market[0]
    : params.market;
  const initialMarket = DAY_MARKETS.find(
    (market) => market.id === requestedMarket,
  ) ?? DEFAULT_DAY_EXPLORER_MARKET;

  return (
    <SimulatorPageShell>
      <DayExplorer
        experience="learning"
        initialMarket={initialMarket}
        markets={DAY_MARKETS}
        routePath="/internal/day-lab"
      />
    </SimulatorPageShell>
  );
}
