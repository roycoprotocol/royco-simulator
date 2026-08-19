import series from "./series.json";

import { buildDayDraftMarket } from "@/lib/day-simulator-template/explorer-market";

export const JBBB_SAMPLE_MARKET = buildDayDraftMarket({
  id: "jbbb",
  label: "JBBB · Janus Henderson B-BBB CLO ETF",
  source: "JBBB forward yield uses Janus Henderson's published 30-day SEC yield. Its historical backtest uses a total-return index reconstructed from Nasdaq daily closing prices and Janus Henderson's official cash distributions.",
  provider: "Janus Henderson + Nasdaq",
  sourceUrl: "https://www.janushenderson.com/en-us/advisor/product/jbbb-b-bbb-clo-etf/",
  publishedApy: 0.0597,
  series,
  cadence: "daily",
  priceType: "total-return-index",
  feesIncluded: true,
  retrievedAt: "2026-08-19",
  supportingSources: [
    {
      label: "Janus Henderson JBBB 30-day SEC yield (5.97% as of 2026-07-31)",
      url: "https://www.janushenderson.com/en-us/advisor/product/jbbb-b-bbb-clo-etf/",
    },
    {
      label: "Nasdaq JBBB historical closing prices",
      url: "https://api.nasdaq.com/api/quote/JBBB/historical?assetclass=etf&fromdate=2022-01-12&todate=2026-08-05&limit=5000",
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
