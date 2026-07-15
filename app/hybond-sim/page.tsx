import type { Metadata } from 'next';
import HybondSimulator from './HybondSimulator';

export const metadata: Metadata = {
  title: 'HYBond Sim',
};

export default function HybondSimPage() {
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
          <HybondSimulator />
        </div>
      </div>
    </div>
  );
}
