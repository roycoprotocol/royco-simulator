import Link from 'next/link';

type Item = {
  name: string;
  desc: string;
  href: string;
  accent: string;
  /** short nickname for the underlying build/engine this sim runs on */
  build: string;
  /** route.ts handlers / external routes render as a plain anchor, not a Link */
  route?: boolean;
};

type Group = {
  title: string;
  blurb: string;
  accent: string;
  defaultOpen?: boolean;
  items: Item[];
};

const GROUPS: Group[] = [
  {
    title: 'Engine & Tooling',
    blurb: 'The reusable Day engine, its frontends, and cross-market tools.',
    accent: '#5BC8AF',
    defaultOpen: true,
    items: [
      {
        name: 'Day Simulator',
        desc: 'Full day-cycle engine with intraday event sequencing and runner output.',
        href: '/internal/day',
        build: 'day-lab',
        accent: '#5BC8AF',
      },
      {
        name: 'Day Frontend',
        desc: 'Public-facing redesigned Day simulator — dark / Inter UI, stacked & sidebar layouts.',
        href: '/internal/day-frontend',
        build: 'day-frontend',
        accent: '#feb901',
      },
      {
        name: 'Dusk Simulator',
        desc: 'ECLP-aware senior/junior tranche engine (v2 predecessor) with balance-point NAVs.',
        href: '/internal/dusk',
        build: 'dusk-v2',
        accent: '#C8873E',
      },
      {
        name: 'New Market Setup',
        desc: 'Partner-facing intake form — curve, coverage & recovery terms, exported as a pool config.',
        href: '/internal/intake',
        build: 'static',
        accent: '#FF7A33',
        route: true,
      },
      {
        name: 'Yield Share over Time',
        desc: "How the Junior's yield share re-rates as utilization moves — on the deployed AdaptiveCurve_V2.",
        href: '/internal/yield-share',
        build: 'static',
        accent: '#9B8AFB',
        route: true,
      },
    ],
  },
  {
    title: 'Partner Markets',
    blurb: 'Asset-specific senior/junior tranche simulators.',
    accent: '#6bb3f0',
    defaultOpen: true,
    items: [
      {
        name: 'Pareto FalconX',
        desc: 'FalconX credit market.',
        href: '/falconx',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'Makina',
        desc: 'DUSD · DETH · usdSHFmk · DBIT tranche markets.',
        href: '/makina',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'DualMint',
        desc: 'Staked Boring Index Vault.',
        href: '/dualmint',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'Blockhouse',
        desc: 'Bedrock strategies.',
        href: '/blockhouse',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'USDai',
        desc: 'sUSDai market.',
        href: '/susdai',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'Re',
        desc: 'reUSDe market.',
        href: '/reusde',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'Apollo Diversified Credit',
        desc: 'ACRED — business-first Day market overview.',
        href: '/internal/acred',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'InfiniFi',
        desc: 'liUSD-13w market.',
        href: '/infinifi',
        build: 'day-shell',
        accent: '#6bb3f0',
      },
      {
        name: 'RiseX XLP',
        desc: 'Senior/Junior on the RiseX XLP perps vault — live share history, coverage terms & what each side earns.',
        href: '/internal/risex',
        build: 'static',
        accent: '#5CC8A0',
        route: true,
      },
      {
        name: 'Axis',
        desc: 'Axis track record 2018–2024 and the live sUSDx feed side by side — with a selectable launch month.',
        href: '/internal/axis',
        build: 'static',
        accent: '#C8873E',
        route: true,
      },
      {
        name: 'srwiTRY',
        desc: 'Turkish-lira market builder — pick Senior/Junior terms and check the historical tradeoff.',
        href: '/internal/try',
        build: 'try',
        accent: '#9b8cff',
      },
      {
        name: 'Dawn Market Builder',
        desc: 'Historical Senior/Junior tradeoff across market terms — observation periods, erased claims & loss events.',
        href: '/tenbin-sims',
        build: 'static',
        accent: '#6bb3f0',
        route: true,
      },
    ],
  },
];

function Row({ item }: { item: Item }) {
  const inner = (
    <div className="group flex items-center gap-4 border-t border-[#1f242c] py-4 pl-5 pr-5 transition-colors first:border-t-0 hover:bg-[#0d0f14]">
      <span
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: item.accent }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#e5e7eb]">{item.name}</span>
          <span
            className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
            style={{
              color: item.accent,
              borderColor: `${item.accent}44`,
              backgroundColor: `${item.accent}14`,
            }}
            title="underlying build / engine"
          >
            {item.build}
          </span>
        </div>
        <div className="truncate text-xs text-[#6b7280]">{item.desc}</div>
      </div>
      <span className="hidden shrink-0 font-mono text-[10px] text-[#4b5563] sm:block">
        {item.href}
      </span>
      <span
        className="shrink-0 text-sm opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: item.accent }}
      >
        →
      </span>
    </div>
  );

  if (item.route) {
    return (
      <a href={item.href} className="block">
        {inner}
      </a>
    );
  }
  return (
    <Link href={item.href} className="block">
      {inner}
    </Link>
  );
}

export default function InternalPage() {
  return (
    <div className="min-h-screen bg-[#0f1115] text-[#e5e7eb]">
      {/* Header bar */}
      <header className="border-b border-[#1f242c] bg-[#0a0c10] px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#3a2810] bg-[#1a1208] px-2.5 py-1 text-[10px] uppercase tracking-widest text-[#C8873E]">
              Internal
            </span>
            <span className="text-sm font-medium text-[#e5e7eb]">
              Royco Risk Desk
            </span>
          </div>
          <Link
            href="/"
            className="text-xs text-[#6b7280] transition-colors hover:text-[#e5e7eb]"
          >
            ← Dawn (public)
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-10">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-[#e5e7eb]">
            Royco Internal Simulators
          </h1>
          <p className="text-sm text-[#6b7280]">
            Internal tooling — not for public distribution.
          </p>
        </div>

        <div className="space-y-4">
          {GROUPS.map((group) => (
            <details
              key={group.title}
              open={group.defaultOpen}
              className="group overflow-hidden rounded-lg border border-[#1f242c] bg-[#0a0c10]"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition-colors hover:bg-[#0d0f14] [&::-webkit-details-marker]:hidden">
                <span
                  className="text-[#6b7280] transition-transform group-open:rotate-90"
                  aria-hidden
                >
                  ▶
                </span>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: group.accent }}
                  aria-hidden
                />
                <span className="text-sm font-medium text-[#e5e7eb]">
                  {group.title}
                </span>
                <span className="text-xs text-[#4b5563]">
                  {group.blurb}
                </span>
                <span className="ml-auto rounded-full bg-[#12151b] px-2 py-0.5 text-[10px] text-[#6b7280]">
                  {group.items.length}
                </span>
              </summary>
              <div className="border-t border-[#1f242c]">
                {group.items.map((item) => (
                  <Row key={item.href} item={item} />
                ))}
              </div>
            </details>
          ))}
        </div>
      </main>
    </div>
  );
}
