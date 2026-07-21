import type { Metadata } from "next";
import { StrictDaySimulatorPageShell } from "@/components/day-simulator/DaySimulatorPageShell";
import { MARKET } from "@/lib/day-markets/muga/market";

export const metadata: Metadata = {
  title: `${MARKET.copy.title} — Business overview`,
  description: `A business-first overview of the ${MARKET.identity.marketName} Day market.`,
};

export default function Page() {
  return <StrictDaySimulatorPageShell market={MARKET} />;
}
