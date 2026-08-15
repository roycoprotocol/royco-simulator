import type { Metadata } from "next";

import DayV4TwoPane from "@/components/day-v4/DayV4TwoPane";
import {
  DAY_MARKETS,
  DEFAULT_DAY_EXPLORER_MARKET,
} from "@/lib/day-markets/registry";
import { applyDayV3StarterDefaults, readDayV3UrlState } from "@/lib/day-v3";

export const metadata: Metadata = {
  title: "Royco Day · v4",
  description:
    "The Day V3 simulator in a two-pane layout: inputs left, results right.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

/**
 * Deliberately the same server shim as `app/v3/page.tsx`, calling the same
 * `readDayV3UrlState` / `applyDayV3StarterDefaults` from `lib/day-v3`. The
 * query contract is therefore one implementation shared by both routes, and a
 * link works on either: `DayV3Summary` writes the query back with
 * `window.location.pathname`, so /v4 rewrites /v4 and /v3 rewrites /v3 off the
 * identical `buildDayV3Query` output.
 */
export default async function DayV4Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }

  const starter = applyDayV3StarterDefaults(
    readDayV3UrlState(params.toString()),
    params.toString(),
  );
  const linked = starter.state;
  const market = DAY_MARKETS.find(
    (candidate) => candidate.id === linked.market,
  );

  return (
    <DayV4TwoPane
      initialMarket={market ?? DEFAULT_DAY_EXPLORER_MARKET}
      initialState={linked}
      markets={DAY_MARKETS}
      starterDefaultFields={starter.appliedFields}
    />
  );
}
