import type { Metadata } from 'next';
import DaySimulatorPageShell from '@/components/day-simulator/DaySimulatorPageShell';
import { PARETO_FALCONX_DAY_MARKET } from '@/lib/day-markets/pareto-falconx/market';

export const metadata: Metadata = {
  title: `${PARETO_FALCONX_DAY_MARKET.copy.title} — Guided`,
  description: 'A guided view of the Pareto FalconX Day simulator.',
};

export default function Page() {
  return <DaySimulatorPageShell market={PARETO_FALCONX_DAY_MARKET} variant="guided" />;
}
