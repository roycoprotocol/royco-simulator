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
        color: '#171511',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: 14,
        lineHeight: 1.45,
        borderTop: '6px solid #11100E',
        backgroundColor: '#FBFAF7',
        backgroundImage:
          'linear-gradient(rgba(150,119,86,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(150,119,86,.055) 1px,transparent 1px)',
        backgroundSize: '42px 42px',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1180, padding: '18px 20px 48px' }}>
        <div className="mt-6">
          <HybondSimulator initialQuery={sp} />
        </div>
      </div>
    </div>
  );
}
