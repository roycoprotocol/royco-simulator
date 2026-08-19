import { JBBB_V3_DEFAULTS } from "@/lib/day-sample-sources/jbbb/v3-defaults";
import type { DayV3Overrides } from "@/lib/day-v3/types";

type YieldCurveOverrides = Pick<
  DayV3Overrides,
  | "jrYieldShareAtZeroPct"
  | "jrYieldShareAtTargetPct"
  | "jrYieldShareAtFullPct"
  | "slpYieldShareAtZeroPct"
  | "slpYieldShareAtTargetPct"
  | "slpYieldShareAtFullPct"
>;

export type DayV3MarketDefaults = {
  protectedDrawdownPct: number;
  recoveryDays: number;
  immediateExitSharePct: number;
  minimumProceedsPer100: number;
  quoteAssetLabel: string;
  quoteAssetYieldPct: number;
  poolTurnoverPerYear: number;
  swapFeeBps: number;
  marketMakerCostOfCapitalPct: number;
  redemptionDays: number;
  backtestWindowOption: {
    id: string;
    label: string;
    from: string;
    to: string;
  };
  overrides: YieldCurveOverrides;
};

/** Market-specific issuer inputs. Unlisted markets retain shared starters. */
export function dayV3MarketDefaults(
  marketId: string | null | undefined,
): DayV3MarketDefaults | null {
  return marketId === "jbbb" ? JBBB_V3_DEFAULTS : null;
}
