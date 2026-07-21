import type { Metadata } from 'next';
import { StrictDaySimulatorPageShell } from '@/components/day-simulator/DaySimulatorPageShell';
import { PARETO_FALCONX_DAY_MARKET } from '@/lib/day-markets/pareto-falconx/market';

export const metadata: Metadata = {
  title: PARETO_FALCONX_DAY_MARKET.copy.title,
  description: PARETO_FALCONX_DAY_MARKET.copy.description,
};

export default function Page() {
  return <StrictDaySimulatorPageShell market={PARETO_FALCONX_DAY_MARKET} />;
}
