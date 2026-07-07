'use client';

import Link from 'next/link';
import TrySimulator from './TrySimulator';

export default function TryPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: 'var(--font-inter)',
        background: 'var(--foundation)',
        color: 'var(--theme-foreground)',
      }}
    >
      {/* Thin top bar */}
      <div
        className="border-b"
        style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-background)' }}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center gap-4">
          <Link
            href="/internal"
            className="text-xs hover:underline"
            style={{ color: 'var(--secondary-text)' }}
          >
            ← Internal
          </Link>
          <span className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
            TRY Tranche Simulator
          </span>
          <span
            className="ml-auto text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--tertiary-text)' }}
          >
            internal · accountant-accurate
          </span>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <TrySimulator />
      </div>
    </div>
  );
}
