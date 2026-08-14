"use client";

import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";

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

export type DayV3HeroMode = "simulate" | "deploy";

/**
 * V3 owns this copy of the main simulator hero so its experimental runtime
 * never crosses into components/day-v2. The geometry and type treatment match
 * origin/main; only the explanatory sentence reflects V3's goal-driven flow.
 */
export default function DayV3Hero({
  mode,
  onModeChange,
}: {
  mode: DayV3HeroMode;
  onModeChange: (mode: DayV3HeroMode) => void;
}) {
  const deploying = mode === "deploy";

  return (
    <header className="overflow-hidden rounded-2xl border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] shadow-[0_12px_36px_-28px_rgba(23,25,31,0.75)]">
      <div className="grid lg:grid-cols-[minmax(0,1.18fr)_minmax(450px,0.82fr)]">
        <div className="flex flex-col justify-center px-6 py-8 sm:px-9 sm:py-9 lg:px-10 lg:py-10">
          <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#999990]">
            Royco Day · Market simulator
          </span>
          <h1
            className="mt-4 max-w-[20ch] text-balance text-[clamp(27px,2.8vw,39px)] font-semibold leading-[1.05]"
            style={{ fontFamily: ROYCO_DISPLAY_FONT }}
          >
            Design liquidity and drawdown protection around one yield source.
          </h1>
          <p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-[#b7b7b0] sm:text-[13.5px]">
            Choose the drawdown Senior should withstand and the exit it should
            offer. V3 derives the Junior and SLP requirements per $100 Senior,
            then lets you review them before deployment.
          </p>
        </div>

        <dl className="hidden grid-cols-3 border-t border-white/12 sm:grid lg:border-l lg:border-t-0">
          {MARKET_ROLES.map((role, index) => (
            <div
              className={`flex min-h-[110px] flex-col justify-end px-3 py-4 sm:min-h-[155px] sm:px-5 sm:py-6 lg:min-h-0 lg:py-7 ${
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

      <div className="flex flex-col gap-4 border-t border-white/12 px-6 py-4 sm:px-9 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex min-w-0 flex-col gap-1.5 text-[11.5px] leading-relaxed text-[#b7b7b0] sm:flex-row sm:items-center sm:gap-3">
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

        <div className="flex w-full shrink-0 flex-col gap-1.5 lg:w-[380px]">
          <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8f8f87]">
            {deploying
              ? "Finalize a market design"
              : "Explore how the protocol works"}
          </span>
          <DayV3SegmentedControl
            ariaLabel="Simulation mode"
            className="w-full"
            onValueChange={onModeChange}
            options={[
              { label: "Simulate", value: "simulate" },
              { label: "Deploy", value: "deploy" },
            ]}
            size="lg"
            toggleOnSelected
            value={mode}
          />
          <span className="text-[10px] leading-snug text-[#999990]">
            Click either side to switch views. Your terms stay in place.
          </span>
        </div>
      </div>
    </header>
  );
}
