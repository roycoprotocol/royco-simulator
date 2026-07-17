import DaySimulatorSidebar from "@/app/DaySimulatorSidebar";
import { DAY_LOCKED_COPY } from "@/lib/day-simulator-template/locked-copy";
import type { DayMarketManifest } from "@/lib/day-simulator-template/market";

export default function DaySimulatorPageShell({
  market,
}: {
  market?: DayMarketManifest;
}) {
  const copy = market?.copy ?? DAY_LOCKED_COPY;

  return (
    <main
      className="min-h-screen bg-[var(--foundation)] text-[var(--theme-foreground)]"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      <header className="border-b border-[var(--theme-border)] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-[1500px]">
          <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-[var(--tertiary-text)]">
            {copy.eyebrow}
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            {copy.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--secondary-text)] sm:text-base">
            {copy.description}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <DaySimulatorSidebar defaults={market?.defaults} />
        <p className="mt-8 border-t border-[var(--theme-border)] pt-4 text-[11px] text-[var(--tertiary-text)]">
          {copy.disclosure}
        </p>
      </div>
    </main>
  );
}
