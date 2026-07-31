"use client";

import { useMemo, useState } from "react";
import SimulatorPageShell from "@/components/simulator/SimulatorPageShell";
import DayExplorer from "@/components/day-simulator/DayExplorer";
import DayMarketSimulator from "@/components/day-simulator/DayMarketSimulator";
import type { DayMarket } from "@/lib/day-simulator-template/market";

export type DaySimulatorVariant = "standard" | "guided" | "executive";

export function StrictDaySimulatorPageShell({
  market,
  markets,
  initialMarketId,
}: {
  market: DayMarket;
  markets?: readonly DayMarket[];
  initialMarketId?: string;
}) {
  const vaultGroup = market.customization.vaultTabs?.group;
  const isVaultGroup = Boolean(
    vaultGroup
    && markets?.length
    && markets.every(
      (candidate) => candidate.customization.vaultTabs?.group === vaultGroup,
    ),
  );
  const isExplorerRegistry = Boolean(markets?.length && !isVaultGroup);
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
  const initialExplorerMarket = markets?.find(
    (candidate) => candidate.id === initialMarketId,
  ) ?? market;

  if (isExplorerRegistry && markets) {
    return (
      <SimulatorPageShell>
        <DayExplorer
          initialMarket={initialExplorerMarket}
          markets={markets}
        />
      </SimulatorPageShell>
    );
  }

  return (
    <SimulatorPageShell>
      {availableMarkets.length > 1 && (
        <nav
          aria-label={`${activeMarket.identity.marketName} vaults`}
          className="mb-3 flex w-fit max-w-full flex-wrap items-center gap-1 p-1"
          role="tablist"
          style={{
            background: "#EAE9E4",
            border: "1px solid #DEDDD7",
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
                  background: selected ? "#FFFFFF" : "transparent",
                  border: selected ? "1px solid #D6D4CD" : "1px solid transparent",
                  borderRadius: 9999,
                  boxShadow: selected ? "0 1px 2px rgba(29,28,25,.06)" : "none",
                  color: selected ? "#1D1C19" : "#68665F",
                  cursor: "pointer",
                  fontFamily: "var(--font-inter), Inter, sans-serif",
                  fontSize: 12,
                  fontWeight: selected ? 600 : 500,
                  padding: "7px 13px",
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
