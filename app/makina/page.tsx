import type { Metadata } from "next";
import { StrictDaySimulatorPageShell } from "@/components/day-simulator/DaySimulatorPageShell";
import { MARKET as DBIT_MARKET } from "@/lib/day-markets/makina-dbit/market";
import { MARKET as DETH_MARKET } from "@/lib/day-markets/makina-deth/market";
import { MARKET as DUSD_MARKET } from "@/lib/day-markets/makina-dusd/market";
import { MARKET as USDSHFMK_MARKET } from "@/lib/day-markets/makina-usdshfmk/market";

const MARKETS = [DUSD_MARKET, DETH_MARKET, USDSHFMK_MARKET, DBIT_MARKET];

export const metadata: Metadata = {
  title: `${DUSD_MARKET.copy.title} — Business overview`,
  description: `A business-first overview of the ${DUSD_MARKET.identity.marketName} Day markets.`,
};

export default function Page() {
  return <StrictDaySimulatorPageShell market={DUSD_MARKET} markets={MARKETS} />;
}
