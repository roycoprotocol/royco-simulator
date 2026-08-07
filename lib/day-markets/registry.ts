import { MARKET as ACRED_MARKET } from "@/lib/day-markets/acred/market";
import { MARKET as BLOCKHOUSE_MARKET } from "@/lib/day-markets/blockhouse/market";
import { MARKET as DUALMINT_MARKET } from "@/lib/day-markets/dualmint/market";
import { MARKET as INFINIFI_MARKET } from "@/lib/day-markets/infinifi/market";
import { MARKET as MAKINA_DBIT_MARKET } from "@/lib/day-markets/makina-dbit/market";
import { MARKET as MAKINA_DETH_MARKET } from "@/lib/day-markets/makina-deth/market";
import { MARKET as MAKINA_DUSD_MARKET } from "@/lib/day-markets/makina-dusd/market";
import { MARKET as MAKINA_USDSHFMK_MARKET } from "@/lib/day-markets/makina-usdshfmk/market";
import { MARKET as MUGA_MARKET } from "@/lib/day-markets/muga/market";
import { PARETO_FALCONX_DAY_MARKET } from "@/lib/day-markets/pareto-falconx/market";
import { MARKET as REUSDE_MARKET } from "@/lib/day-markets/reusde/market";
import { MARKET as SUSDAI_MARKET } from "@/lib/day-markets/susdai/market";
import { JBBB_SAMPLE_MARKET } from "@/lib/day-sample-sources/jbbb/market";
import type { DayMarket } from "@/lib/day-simulator-template/market";

export const DAY_MARKETS: readonly DayMarket[] = [
  PARETO_FALCONX_DAY_MARKET,
  JBBB_SAMPLE_MARKET,
  SUSDAI_MARKET,
  REUSDE_MARKET,
  INFINIFI_MARKET,
  ACRED_MARKET,
  MAKINA_DUSD_MARKET,
  MAKINA_DETH_MARKET,
  MAKINA_DBIT_MARKET,
  MAKINA_USDSHFMK_MARKET,
  DUALMINT_MARKET,
  BLOCKHOUSE_MARKET,
  MUGA_MARKET,
];

export const DEFAULT_DAY_EXPLORER_MARKET = PARETO_FALCONX_DAY_MARKET;
