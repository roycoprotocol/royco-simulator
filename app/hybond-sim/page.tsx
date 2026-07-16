import type { Metadata } from 'next';
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
    <div
      className="min-h-screen"
      style={{
        background: '#FBFAF7',
        color: '#171511',
        fontFamily:
          "-apple-system, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div className="max-w-[1120px] mx-auto px-6 py-8">
        <div className="mt-6">
          <HybondSimulator initialQuery={sp} />
        </div>
      </div>
    </div>
  );
}
