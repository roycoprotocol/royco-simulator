const ROYCO_DISPLAY_FONT =
  '"Shippori Mincho B1", "Iowan Old Style", Baskerville, "Times New Roman", serif';

const MARKET_ROLES = [
  {
    label: "Source",
    title: "Underlying yield",
    description: "The strategy return entering the market.",
  },
  {
    label: "Junior",
    title: "First-loss buffer",
    description: "Capital positioned ahead of Senior losses.",
  },
  {
    label: "SLP",
    title: "Exit liquidity",
    description: "The standing pool available for Senior exits.",
  },
] as const;

export default function DayV2Hero() {
  return (
    <header className="overflow-hidden rounded-2xl border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] shadow-[0_12px_36px_-28px_rgba(23,25,31,0.75)]">
      <div className="grid lg:grid-cols-[minmax(0,1.18fr)_minmax(450px,0.82fr)]">
        <div className="flex flex-col justify-center px-6 py-9 sm:px-9 sm:py-11 lg:px-10 lg:py-12">
          <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#999990]">
            Royco Day · Market simulator
          </span>
          <h1
            className="mt-5 max-w-[18ch] text-balance text-[clamp(38px,4.2vw,58px)] font-semibold leading-[1.05]"
            style={{ fontFamily: ROYCO_DISPLAY_FONT }}
          >
            Design liquidity and drawdown protection around one yield source.
          </h1>
          <p className="mt-5 max-w-[64ch] text-[13.5px] leading-relaxed text-[#b7b7b0] sm:text-[14px]">
            Set how much Junior capital stands in front of Senior and how much
            exit liquidity SLP supplies. Review the structure before deciding
            whether it is ready to deploy.
          </p>
        </div>

        <dl className="grid grid-cols-3 border-t border-white/12 lg:border-l lg:border-t-0">
          {MARKET_ROLES.map((role, index) => (
            <div
              className={`flex min-h-[120px] flex-col justify-end px-3 py-4 sm:min-h-[180px] sm:px-5 sm:py-6 lg:min-h-0 lg:py-8 ${
                index === 0 ? "" : "border-l border-white/12"
              }`}
              key={role.label}
            >
              <dt className="text-[8.5px] font-medium uppercase tracking-[0.14em] text-[#8f8f87]">
                {role.label}
              </dt>
              <dd className="mt-2 text-[13px] font-semibold text-[#f5f3ee]">
                {role.title}
              </dd>
              <dd className="mt-2 hidden text-[10.5px] leading-relaxed text-[#999990] sm:block">
                {role.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-white/12 px-6 py-4 text-[11.5px] leading-relaxed text-[#b7b7b0] sm:flex-row sm:items-center sm:gap-3 sm:px-9 lg:px-10">
        <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8f8f87]">
          How the structure works
        </span>
        <span className="hidden text-[#66665f] sm:inline" aria-hidden="true">
          ·
        </span>
        <span>
          Junior absorbs losses first · SLP supports exits · Senior retains
          payment priority
        </span>
      </div>
    </header>
  );
}
