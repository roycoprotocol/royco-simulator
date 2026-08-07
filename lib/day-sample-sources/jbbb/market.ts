import series from "./series.json";

import { buildDayDraftMarket } from "@/lib/day-simulator-template/explorer-market";

export const JBBB_SAMPLE_MARKET = buildDayDraftMarket({
  id: "jbbb",
  label: "JBBB · Janus Henderson B-BBB CLO ETF",
  source: "JBBB total-return index reconstructed from Nasdaq daily closing prices and Janus Henderson's official cash distribution history. The result was cross-checked against Janus Henderson's reported NAV return.",
  provider: "Nasdaq + Janus Henderson",
  sourceUrl: "https://api.nasdaq.com/api/quote/JBBB/historical?assetclass=etf&fromdate=2022-01-12&todate=2026-08-05&limit=5000",
  series,
  cadence: "daily",
  priceType: "total-return-index",
  feesIncluded: true,
  retrievedAt: "2026-08-06",
  supportingSources: [
    {
      label: "Janus Henderson JBBB product and NAV reporting",
      url: "https://www.janushenderson.com/en-us/investor/product/jbbb-b-bbb-clo-etf/?identifier=US47103U7533",
    },
    {
      label: "Janus Henderson official ETF distribution history",
      url: "https://www.janushenderson.com/en-us/institutional/annual-distributions-supplemental-tax-documents-etf/",
    },
    {
      label: "Nasdaq Trader JBBB listing circular",
      url: "https://www.nasdaqtrader.com/content/newsalerts/2022/infocircular/JBBB%20Circular.pdf",
    },
  ],
});
