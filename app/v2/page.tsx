import type { Metadata } from "next";
import DayV2Summary from "@/components/day-v2/DayV2Summary";
import { StrictDaySimulatorPageShell } from "@/components/day-simulator/DaySimulatorPageShell";
import { DAY_MARKETS, DEFAULT_DAY_EXPLORER_MARKET } from "@/lib/day-markets/registry";

export const metadata: Metadata = {
  title: "Royco Day · v2",
  description:
    "Model Senior, Junior, and Senior LP positions from any yield source.",
};

// v2 composes the shipping simulator rather than reimplementing it, so it has
// every feature the root route has by construction: nothing can be missed in a
// port because there is no port. The summary above it is the new layer, an
// at-a-glance read of the same engine, and the token wrapper restyles what it
// can reach. Restyling the simulator's own inline palette is the work that
// remains; it does not affect what the page can do.
export default async function DayV2Page({
  searchParams,
}: {
  searchParams: Promise<{ market?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedMarket = Array.isArray(params.market)
    ? params.market[0]
    : params.market;
  return (
    <div className="royco-v2">
      <DayV2Summary market={DEFAULT_DAY_EXPLORER_MARKET} />
      <div className="mx-auto max-w-[1180px] px-5 pb-10 sm:px-8">
        <div
          className="mb-4 border-t pt-6"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--tertiary)]">
            Full simulator
          </p>
          <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--secondary)]">
            Every control, chart, backtest, and deployment term from the main
            route, unchanged.
          </p>
        </div>
        <StrictDaySimulatorPageShell
          initialMarketId={requestedMarket}
          market={DEFAULT_DAY_EXPLORER_MARKET}
          markets={DAY_MARKETS}
        />
      </div>
    </div>
  );
}
