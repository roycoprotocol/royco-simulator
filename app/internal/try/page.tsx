'use client';

import TrySimulator from './TrySimulator';

export default function TryPage() {
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
        <TrySimulator />
      </div>
    </div>
  );
}
