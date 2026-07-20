import SimulatorPageShell from "@/components/simulator/SimulatorPageShell";
import DayMarketSimulator from "@/components/day-simulator/DayMarketSimulator";
import type { DayMarket } from "@/lib/day-simulator-template/market";

export type DaySimulatorVariant = "standard" | "guided" | "executive";

export default function DaySimulatorPageShell({
  market,
  variant = "standard",
}: {
  market?: DayMarket;
  variant?: DaySimulatorVariant;
}) {
  return (
    <SimulatorPageShell>
      <DayMarketSimulator market={market} variant={variant} />
    </SimulatorPageShell>
  );
}
