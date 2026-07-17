import DaySimulatorSidebar from "@/app/DaySimulatorSidebar";
import { DAY_LOCKED_COPY } from "@/lib/day-simulator-template/locked-copy";

export default function DaySimulatorPageShell() {
  return (
    <main
      className="min-h-screen bg-[var(--foundation)] text-[var(--theme-foreground)]"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      <header className="border-b border-[var(--theme-border)] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-[1500px]">
          <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-[var(--tertiary-text)]">
            {DAY_LOCKED_COPY.eyebrow}
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            {DAY_LOCKED_COPY.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--secondary-text)] sm:text-base">
            {DAY_LOCKED_COPY.description}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <DaySimulatorSidebar />
        <p className="mt-8 border-t border-[var(--theme-border)] pt-4 text-[11px] text-[var(--tertiary-text)]">
          {DAY_LOCKED_COPY.disclosure}
        </p>
      </div>
    </main>
  );
}
