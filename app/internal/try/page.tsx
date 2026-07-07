'use client';

import Link from 'next/link';
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
        <Link
          href="/internal"
          className="hover:underline"
          style={{ color: '#967756', fontSize: 11 }}
        >
          ← Internal
        </Link>
        <div className="mt-6">
          <TrySimulator />
        </div>
      </div>
    </div>
  );
}
