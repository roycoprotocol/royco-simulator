import SimulatorPageShell from "@/components/simulator/SimulatorPageShell";
import DayMarketSimulator from "@/components/day-simulator/DayMarketSimulator";
import type { DayMarket } from "@/lib/day-simulator-template/market";

export default function DaySimulatorPageShell({ market }: { market?: DayMarket }) {
  return (
    <SimulatorPageShell>
      <DayMarketSimulator market={market} />
    </SimulatorPageShell>
  );
}
