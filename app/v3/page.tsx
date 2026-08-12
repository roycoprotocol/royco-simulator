import type { Metadata } from "next";

import DayV3Summary from "@/components/day-v3/DayV3Summary";
import {
  DAY_MARKETS,
  DEFAULT_DAY_EXPLORER_MARKET,
} from "@/lib/day-markets/registry";
import { readDayV3UrlState } from "@/lib/day-v3";

export const metadata: Metadata = {
  title: "Royco Day · v3",
  description:
    "Design Senior protection and exit liquidity from issuer outcome goals.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function DayV3Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }

  const linked = readDayV3UrlState(params.toString());
  const market = DAY_MARKETS.find((candidate) => candidate.id === linked.market);

  return (
    <DayV3Summary
      initialMarket={market ?? DEFAULT_DAY_EXPLORER_MARKET}
      initialState={linked}
      markets={DAY_MARKETS}
    />
  );
}
