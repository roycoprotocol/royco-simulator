import Link from 'next/link';

// Internal index — a directory of accountant-accurate market tools. Each entry
// is a nav card linking into an /internal/* simulator.
type NavCard = {
  href: string;
  badge: string;
  title: string;
  desc: string;
};

const CARDS: NavCard[] = [
  {
    href: '/internal/try',
    badge: 'markets',
    title: 'TRY Tranche Simulator',
    desc: 'Accountant-accurate backtest of the srwiTRY senior/junior tranche market.',
  },
];

export default function InternalIndex() {
  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: 'var(--font-inter)',
        background: 'var(--foundation)',
        color: 'var(--theme-foreground)',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--primary-text)' }}>
            Internal
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--secondary-text)' }}>
            Accountant-accurate market tools. For internal review, not marketing.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="block rounded-xl border p-5 transition-colors"
              style={{
                background: 'var(--theme-background)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <span
                className="inline-block text-[10px] uppercase tracking-wide rounded-full px-2.5 py-1 mb-3 border"
                style={{ color: 'var(--info)', borderColor: 'var(--theme-border)' }}
              >
                {c.badge}
              </span>
              <h2 className="text-base font-semibold" style={{ color: 'var(--primary-text)' }}>
                {c.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--secondary-text)' }}>
                {c.desc}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
