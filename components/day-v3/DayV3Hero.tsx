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

/**
 * V3 owns this copy of the main simulator hero so its experimental runtime
 * never crosses into components/day-v2. It introduces the three market roles
 * before the page reveals the issuer inputs and resulting market models.
 */
export default function DayV3Hero() {
  return (
    <header className="overflow-hidden rounded-2xl border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] shadow-[0_12px_36px_-28px_rgba(23,25,31,0.75)]">
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)]">
        <div className="flex flex-col justify-center px-6 py-6">
          <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#999990]">
            Royco Day · Market simulator
          </span>
          <h1
            className="mt-2 max-w-[30ch] text-balance text-[clamp(20px,1.9vw,26px)] font-semibold leading-[1.08]"
            style={{ fontFamily: ROYCO_DISPLAY_FONT }}
          >
            Design the yield split, protection, and immediate exit in one
            workflow.
          </h1>
          <p className="mt-2 max-w-[70ch] text-[11.5px] leading-relaxed text-[#b7b7b0]">
            Set how Senior yield is shared with Junior and SLP, choose the loss
            Senior should survive, and define the immediate exit. Then inspect
            returns, capital requirements, and exit outcomes.
          </p>
        </div>

        <dl className="hidden grid-cols-3 border-t border-white/12 sm:grid lg:border-l lg:border-t-0">
          {MARKET_ROLES.map((role, index) => (
            <div
              className={`flex flex-col justify-center px-4 py-4 ${
                index === 0 ? "" : "border-l border-white/12"
              }`}
              key={role.label}
            >
              <dt className="text-[8.5px] font-medium uppercase tracking-[0.14em] text-[#8f8f87]">
                {role.label}
              </dt>
              <dd className="mt-1.5 text-[12px] font-semibold text-[#f5f3ee]">
                {role.title}
              </dd>
              <dd className="mt-0.5 hidden text-[9.5px] leading-snug text-[#999990] lg:block">
                {role.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>

    </header>
  );
}
