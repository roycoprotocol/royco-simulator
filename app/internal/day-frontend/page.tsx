'use client';
import { useState } from 'react';
import DaySimulator from '../../DaySimulator';
import DaySimulatorSidebar from '../../DaySimulatorSidebar';

export default function DayFrontendPage() {
  const [layout, setLayout] = useState<'stacked' | 'sidebar'>('sidebar');
  return (
    <div style={{ fontFamily: 'var(--font-inter)', background: 'var(--foundation)', color: 'var(--theme-foreground)' }} className="min-h-screen">
      {/* thin top bar: layout toggle */}
      <div className="border-b border-[var(--theme-border)] px-6 py-3 flex items-center justify-end">
        <div className="inline-flex rounded-full bg-[var(--muted)] border border-[var(--theme-border)] p-0.5">
          {([['stacked','Stacked'],['sidebar','Sidebar']] as const).map(([v,l]) => (
            <button key={v} onClick={() => setLayout(v)}
              className={layout === v
                ? 'text-[11px] tracking-wide uppercase rounded-full px-3 py-1 bg-[var(--accent-background)] text-[var(--accent)]'
                : 'text-[11px] tracking-wide uppercase rounded-full px-3 py-1 text-[var(--muted-foreground)] hover:text-[var(--theme-foreground)] transition-colors'}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {/* the live frontend */}
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8 py-8">
        {layout === 'sidebar' ? <DaySimulatorSidebar /> : <DaySimulator />}
      </div>
    </div>
  );
}
