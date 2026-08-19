import type { DayV3Overrides } from "@/lib/day-v3/types";

/**
 * Issuer-design defaults explicitly agreed for the JBBB simulation.
 *
 * These are inputs to the shared Day runtime, not independently calculated
 * tranche outputs. JBBB's source APY continues to come from its total-return
 * series rather than being duplicated here.
 */
export const JBBB_V3_DEFAULTS = {
  protectedDrawdownPct: 15,
  recoveryDays: 90,
  immediateExitSharePct: 0,
  minimumProceedsPer100: 95,
  quoteAssetLabel: "sr-srRoyUSDC",
  quoteAssetYieldPct: 4,
  poolTurnoverPerYear: 2,
  swapFeeBps: 5,
  marketMakerCostOfCapitalPct: 12,
  redemptionDays: 7,
  backtestWindowOption: {
    id: "2023-2024",
    label: "2023–2024",
    from: "2023-01-01",
    to: "2024-12-31",
  },
  overrides: {
    jrYieldShareAtZeroPct: 7.5,
    jrYieldShareAtTargetPct: 14.8801,
    jrYieldShareAtFullPct: 45,
    slpYieldShareAtZeroPct: 0,
    slpYieldShareAtTargetPct: 0,
    slpYieldShareAtFullPct: 0,
  } satisfies Pick<
    DayV3Overrides,
    | "jrYieldShareAtZeroPct"
    | "jrYieldShareAtTargetPct"
    | "jrYieldShareAtFullPct"
    | "slpYieldShareAtZeroPct"
    | "slpYieldShareAtTargetPct"
    | "slpYieldShareAtFullPct"
  >,
} as const;
