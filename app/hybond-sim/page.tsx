import type { Metadata } from 'next';
import SimulatorPageShell from '@/components/simulator/SimulatorPageShell';
import HybondSimulator from './HybondSimulator';

export const metadata: Metadata = {
  title: 'HYBond Sim',
};

export default async function HybondSimPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The permalink is read HERE, on the server, and handed to the simulator as a prop.
  // Reading searchParams is itself what opts this route into dynamic rendering, so no
  // `export const dynamic` is needed. The client component deliberately does not call
  // useSearchParams: that hook suspends, and a suspended boundary keeps its server HTML
  // without ever attaching React fibers, which shipped a dead page.
  const sp = await searchParams;

  return (
    <SimulatorPageShell>
      <HybondSimulator initialQuery={sp} />
    </SimulatorPageShell>
  );
}
