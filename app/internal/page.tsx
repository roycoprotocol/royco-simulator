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

          {/* Try card */}
          <Link
            href="/internal/try"
            className="group block bg-[#0a0c10] border border-[#1f242c] rounded-lg p-6 hover:border-[#9b8cff] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-[#9b8cff]">
                try
              </span>
              <span className="text-[#9b8cff] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </div>
            <h2 className="text-base font-medium text-[#e5e7eb] mb-1">
              srwiTRY Market Builder
            </h2>
            <p className="text-xs text-[#6b7280]">
              Fast path for market creators — pick Senior/Junior terms and check the historical tradeoff.
            </p>
          </Link>

          {/* Tenbin card — route handler, not a page, so a plain anchor */}
          <a
            href="/tenbin-sims"
            className="group block bg-[#0a0c10] border border-[#1f242c] rounded-lg p-6 hover:border-[#6bb3f0] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-[#6bb3f0]">
                tenbin
              </span>
              <span className="text-[#6bb3f0] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </div>
            <h2 className="text-base font-medium text-[#e5e7eb] mb-1">
              Dawn Market Builder
            </h2>
            <p className="text-xs text-[#6b7280]">
              Historical Senior/Junior tradeoff across market terms — observation periods, erased claims &amp; loss events.
            </p>
          </a>

          {/* Market Intake card — route handler, not a page, so a plain anchor */}
          <a
            href="/internal/intake"
            className="group block bg-[#0a0c10] border border-[#1f242c] rounded-lg p-6 hover:border-[#FF7A33] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-[#FF7A33]">
                intake
              </span>
              <span className="text-[#FF7A33] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </div>
            <h2 className="text-base font-medium text-[#e5e7eb] mb-1">
              New Market Setup
            </h2>
            <p className="text-xs text-[#6b7280]">
              Partner-facing intake form — curve, coverage &amp; recovery terms, exported as a pool config.
            </p>
          </a>
        </div>
      </main>
    </div>
  );
}
