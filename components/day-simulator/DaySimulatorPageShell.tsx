"use client";

import { useMemo, useState } from "react";
import SimulatorPageShell from "@/components/simulator/SimulatorPageShell";
import DayMarketSimulator from "@/components/day-simulator/DayMarketSimulator";
import type { DayMarket } from "@/lib/day-simulator-template/market";

export type DaySimulatorVariant = "standard" | "guided" | "executive";

export function StrictDaySimulatorPageShell({
  market,
  markets,
}: {
  market: DayMarket;
  markets?: readonly DayMarket[];
}) {
  const availableMarkets = useMemo(() => {
    const group = market.customization.vaultTabs?.group;
    if (!group || !markets?.length) return [market];
    const groupedMarkets = markets.filter(
      (candidate) => candidate.customization.vaultTabs?.group === group,
    );
    return groupedMarkets.length ? groupedMarkets : [market];
  }, [market, markets]);
  const [activeMarketId, setActiveMarketId] = useState(market.id);
  const activeMarket = availableMarkets.find(
    (candidate) => candidate.id === activeMarketId,
  ) ?? availableMarkets[0];

  return (
    <SimulatorPageShell>
      {availableMarkets.length > 1 && (
        <nav
          aria-label={`${activeMarket.identity.marketName} vaults`}
          className="mb-3 flex w-fit max-w-full flex-wrap items-center gap-1 p-1"
          role="tablist"
          style={{
            background: "#F1EDE6",
            border: "1px solid #E8E2D8",
            borderRadius: 9999,
          }}
        >
          {availableMarkets.map((candidate) => {
            const selected = candidate.id === activeMarket.id;
            return (
              <button
                aria-selected={selected}
                key={candidate.id}
                onClick={() => setActiveMarketId(candidate.id)}
                role="tab"
                type="button"
                style={{
                  background: selected ? "#FFFDF9" : "transparent",
                  border: selected ? "1px solid #D9D1C5" : "1px solid transparent",
                  borderRadius: 9999,
                  boxShadow: selected ? "0 2px 8px rgba(60,45,28,.08)" : "none",
                  color: selected ? "#171511" : "#6D6860",
                  cursor: "pointer",
                  fontFamily: '"SFMono-Regular", Consolas, monospace',
                  fontSize: 10.5,
                  fontWeight: selected ? 700 : 600,
                  letterSpacing: "0.06em",
                  padding: "7px 12px",
                  textTransform: "uppercase",
                }}
              >
                {candidate.customization.vaultTabs?.label
                  ?? candidate.identity.displayAssetName}
              </button>
            );
          })}
        </nav>
      )}
      <DayMarketSimulator key={activeMarket.id} market={activeMarket} variant="executive" />
    </SimulatorPageShell>
  );
}

export default function DaySimulatorPageShell({
  market,
  variant = "standard",
}: {
  market?: DayMarket;
  variant?: DaySimulatorVariant;
}) {
  return (
    <SimulatorPageShell>
      <DayMarketSimulator market={market} variant={variant} />
    </SimulatorPageShell>
  );
}
