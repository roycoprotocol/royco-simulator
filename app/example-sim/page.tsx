import type { Metadata } from 'next';
import MarketSimulator from '@/components/simulator/MarketSimulator';
import SimulatorPageShell from '@/components/simulator/SimulatorPageShell';
import { MARKET } from '@/lib/markets/example/market';
import type { InitialQuery } from '@/lib/simulator-template/permalink';

export const metadata: Metadata = { title: MARKET.copy.title };

export default async function Page({ searchParams }: { searchParams: Promise<InitialQuery> }) {
  const query = await searchParams;
  return (
    <SimulatorPageShell>
      <MarketSimulator initialQuery={query} market={MARKET} />
    </SimulatorPageShell>
  );
}
