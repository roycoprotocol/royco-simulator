import type { Metadata } from "next";
import DayV2Summary from "@/components/day-v2/DayV2Summary";
import { DAY_MARKETS, DEFAULT_DAY_EXPLORER_MARKET } from "@/lib/day-markets/registry";

export const metadata: Metadata = {
  title: "Royco Day · v2",
  description:
    "Model Senior, Junior, and Senior LP positions from any yield source.",
};

export default function DayV2Page() {
  return (
    <DayV2Summary
      initialMarket={DEFAULT_DAY_EXPLORER_MARKET}
      markets={DAY_MARKETS}
    />
  );
}
