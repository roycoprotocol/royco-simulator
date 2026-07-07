import Link from 'next/link';

export default function InternalPage() {
  return (
    <div className="min-h-screen bg-[#0f1115] text-[#e5e7eb]">
      {/* Header bar */}
      <header className="bg-[#0a0c10] border-b border-[#1f242c] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-widest uppercase text-[#C8873E] bg-[#1a1208] border border-[#3a2810] rounded-full px-2.5 py-1">
              Internal
            </span>
            <span className="text-sm font-medium text-[#e5e7eb]">
              Royco Risk Desk
            </span>
          </div>
          <Link
            href="/"
            className="text-xs text-[#6b7280] hover:text-[#e5e7eb] transition-colors"
          >
            ← Dawn (public)
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold text-[#e5e7eb] mb-2 tracking-tight">
            Royco Internal Simulators
          </h1>
          <p className="text-sm text-[#6b7280]">
            Internal tooling — not for public distribution.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Dusk card */}
          <Link
            href="/internal/dusk"
            className="group block bg-[#0a0c10] border border-[#1f242c] rounded-lg p-6 hover:border-[#C8873E] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-[#C8873E]">
                v2
              </span>
              <span className="text-[#C8873E] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </div>
            <h2 className="text-base font-medium text-[#e5e7eb] mb-1">
              Dusk Simulator
            </h2>
            <p className="text-xs text-[#6b7280]">
              ECLP-aware senior/junior tranche simulator with balance-point NAVs.
            </p>
          </Link>

          {/* Day card */}
          <Link
            href="/internal/day"
            className="group block bg-[#0a0c10] border border-[#1f242c] rounded-lg p-6 hover:border-[#5BC8AF] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-[#5BC8AF]">
                v3
              </span>
              <span className="text-[#5BC8AF] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </div>
            <h2 className="text-base font-medium text-[#e5e7eb] mb-1">
              Day Simulator
            </h2>
            <p className="text-xs text-[#6b7280]">
              Full day-cycle engine with intraday event sequencing and runner output.
            </p>
          </Link>

          {/* Day Frontend card */}
          <Link
            href="/internal/day-frontend"
            className="group block bg-[#0a0c10] border border-[#1f242c] rounded-lg p-6 hover:border-[#feb901] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-[#feb901]">
                frontend
              </span>
              <span className="text-[#feb901] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </div>
            <h2 className="text-base font-medium text-[#e5e7eb] mb-1">
              Day Frontend (v3)
            </h2>
            <p className="text-xs text-[#6b7280]">
              Public-facing redesigned Day simulator — dark / Inter UI, stacked &amp; sidebar layouts.
            </p>
          </Link>

          {/* TRY Tranche Simulator card */}
          <Link
            href="/internal/try"
            className="group block bg-[#0a0c10] border border-[#1f242c] rounded-lg p-6 hover:border-[#6ea8fe] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-[#6ea8fe]">
                markets
              </span>
              <span className="text-[#6ea8fe] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </div>
            <h2 className="text-base font-medium text-[#e5e7eb] mb-1">
              TRY Tranche Simulator
            </h2>
            <p className="text-xs text-[#6b7280]">
              Accountant-accurate backtest of the srwiTRY senior / junior tranche market.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
