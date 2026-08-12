import type { Metadata } from "next";
import DayV2Summary from "@/components/day-v2/DayV2Summary";
import { readDayV2UrlState } from "@/components/day-v2/url-state";
import { DAY_MARKETS, DEFAULT_DAY_EXPLORER_MARKET } from "@/lib/day-markets/registry";

export const metadata: Metadata = {
  title: "Royco Day · v2",
  description:
    "Model Senior, Junior, and Senior LP positions from any yield source.",
};

export default async function DayV2Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const linked = readDayV2UrlState(params.toString());
  const market = DAY_MARKETS.find((candidate) => candidate.id === linked.market);
  return (
    <DayV2Summary
      initialMarket={market ?? DEFAULT_DAY_EXPLORER_MARKET}
      initialState={linked}
      markets={DAY_MARKETS}
    />
  );
}
