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
        <div className="flex flex-col justify-center px-6 py-6 sm:px-8 sm:py-7 lg:px-9 lg:py-7">
          <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#999990]">
            Royco Day · Market simulator
          </span>
          <h1
            className="mt-2.5 max-w-[28ch] text-balance text-[clamp(25px,2.5vw,35px)] font-semibold leading-[1.06]"
            style={{ fontFamily: ROYCO_DISPLAY_FONT }}
          >
            Design the yield split, protection, and immediate exit in one
            workflow.
          </h1>
          <p className="mt-2.5 max-w-[68ch] text-[12px] leading-relaxed text-[#b7b7b0] sm:text-[12.5px]">
            Set how Senior yield is shared with Junior and SLP, choose the loss
            Senior should survive, and define the immediate exit. Then inspect
            returns, capital requirements, and exit outcomes.
          </p>
        </div>

        <dl className="hidden grid-cols-3 border-t border-white/12 sm:grid lg:border-l lg:border-t-0">
          {MARKET_ROLES.map((role, index) => (
            <div
              className={`flex min-h-[92px] flex-col justify-center px-3 py-3 sm:min-h-[118px] sm:px-4 sm:py-4 lg:min-h-0 ${
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
              <dd className="mt-1 hidden text-[10px] leading-snug text-[#999990] xl:block">{role.description}</dd>
            </div>
          ))}
        </dl>
      </div>

    </header>
  );
}
