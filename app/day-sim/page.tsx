import type { Metadata } from "next";
import DaySimulatorPageShell from "@/components/day-simulator/DaySimulatorPageShell";

export const metadata: Metadata = {
  title: "Royco Day Simulator",
  description: "Three-tranche Royco Day mechanism simulator.",
};

export default function DaySimulatorPage() {
  return <DaySimulatorPageShell />;
}
