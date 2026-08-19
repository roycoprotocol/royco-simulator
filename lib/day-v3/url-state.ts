import type {
  DayV3DeploymentTarget,
  DayV3ExpiryPolicy,
  DayV3GoalDraft,
  DayV3Overrides,
} from "@/lib/day-v3/types";
import { dayV3MarketDefaults } from "@/lib/day-v3/market-defaults";
import { validateDayV3YieldCurveDesign } from "@/lib/day-v3/yield-curves";

export type DayV3Mode = "simulate" | "deploy";

export interface DayV3UrlState extends DayV3GoalDraft {
  market: string | null;
  mode: DayV3Mode | null;
  sourceApyPct: number | null;
  /** What Senior is sold for. A label for the reader, not a token address. */
  quoteAssetLabel: string | null;
  /** The issuer's answer for what that asset earns while the SLP holds it. */
  quoteAssetYieldPct: number | null;
  /** Annual swap volume as a multiple of pool value. Zero means no forecast. */
  poolTurnoverPerYear: number | null;
  /**
   * The pool's trading fee. `null` is the honest default: it means the live
   * template's own fee decides, and the market's declared fee stands in until
   * that template resolves. A number here is the issuer's own fee policy.
   */
  swapFeeBps: number | null;
  /**
   * The pool's balance point, carried as the maximum premium in bps that sets
   * it. `null` leaves the curve solved for the simulator's own resting weight.
   * Beta is `1 + premium`, so this is the whole of the balance point: a wider
   * premium band rests on more Senior inventory and less exit depth.
   */
  poolPremiumBps: number | null;
  /** An outside desk's annual cost of capital, for the pool-refill check. */
  marketMakerCostOfCapitalPct: number | null;
  /** Days from buying discounted Senior to receiving the underlying at NAV. */
  redemptionDays: number | null;
  incentiveBudgetPer100: number | null;
  depositDelaySeconds: number | null;
  depositExpirySeconds: DayV3ExpiryPolicy | null;
  withdrawalExpirySeconds: DayV3ExpiryPolicy | null;
  gateByOracleUpdate: boolean | null;
  maxReinvestmentSlippageBps: number | null;
  overrides: DayV3Overrides;
}

/**
 * Visible, editable starter values. The four issuer goals make every source's
 * Simulate view useful immediately. Source and operational defaults apply only
 * to Custom because listed markets must retain their own facts and terms.
 * Nothing here is a source fact or deployment recommendation.
 */
export const DAY_V3_STARTER_DEFAULTS = {
  market: "custom",
  sourceApyPct: 8,
  protectedDrawdownPct: 15,
  recoveryDays: 0,
  immediateExitSharePct: 10,
  minimumProceedsPer100: 95,
  entryPointSettlementDays: 90,
  collateralToExitDays: 0,
  collateralToExitCostBps: 50,
  fixedTermGraceDays: 14,
  navUpdateDays: 1,
  depositDelaySeconds: 300,
  gateByOracleUpdate: true,
  incentiveBudgetPer100: 0,
  target: { chainId: 1, templateId: "balancer-v3-eclp" },
} as const;

export type DayV3StarterDefaultField =
  | "source"
  | "drawdown"
  | "recovery"
  | "exit-amount"
  | "payout"
  | "settlement"
  | "conversion-days"
  | "conversion-cost"
  | "grace"
  | "nav"
  | "deposit-delay"
  | "price-gate"
  | "incentive"
  | "target";

const DAY_V3_STARTER_DEFAULT_FIELDS = new Set<DayV3StarterDefaultField>([
  "source",
  "drawdown",
  "recovery",
  "exit-amount",
  "payout",
  "settlement",
  "conversion-days",
  "conversion-cost",
  "grace",
  "nav",
  "deposit-delay",
  "price-gate",
  "incentive",
  "target",
]);

function readStarterFields(
  params: URLSearchParams,
): DayV3StarterDefaultField[] {
  const seen = new Set<DayV3StarterDefaultField>();
  for (const candidate of params.get("starter")?.split(",") ?? []) {
    if (DAY_V3_STARTER_DEFAULT_FIELDS.has(candidate as DayV3StarterDefaultField)) {
      seen.add(candidate as DayV3StarterDefaultField);
    }
  }
  return [...seen];
}

export function applyDayV3StarterDefaults(
  state: DayV3UrlState,
  search: string,
): {
  applied: boolean;
  appliedFields: DayV3StarterDefaultField[];
  state: DayV3UrlState;
} {
  const params = new URLSearchParams(search);
  const customSource = !params.has("m") || state.market === "custom";
  const marketDefaults = dayV3MarketDefaults(state.market);

  // Legacy links may carry a `starter` marker. Continue honoring it when links
  // are read, even though the canonical writer no longer serializes UI-only
  // provenance or hidden starter fields.
  const appliedFields = readStarterFields(params);
  const whenAbsent = <T>(
    field: DayV3StarterDefaultField,
    keys: string[],
    current: T | null,
    fallback: T,
  ): T | null => {
    if (keys.some((key) => params.has(key))) return current;
    if (current !== null) return current;
    if (!appliedFields.includes(field)) appliedFields.push(field);
    return fallback;
  };
  const marketValueWhenAbsent = <T>(
    keys: string[],
    current: T | null,
    fallback: T | undefined,
  ): T | null => {
    if (keys.some((key) => params.has(key)) || fallback === undefined) {
      return current;
    }
    return current ?? fallback;
  };
  const hasCurveParameter = ["jr0", "jr90", "jr100", "slp0", "slp90", "slp100"].some(
    (key) => params.has(key),
  );

  const nextState: DayV3UrlState = {
    ...state,
    market: customSource
      ? (state.market ?? DAY_V3_STARTER_DEFAULTS.market)
      : state.market,
    sourceApyPct: customSource
      ? whenAbsent(
          "source",
          ["apy"],
          state.sourceApyPct,
          DAY_V3_STARTER_DEFAULTS.sourceApyPct,
        )
      : state.sourceApyPct,
    quoteAssetLabel: marketValueWhenAbsent(
      ["quote"],
      state.quoteAssetLabel,
      marketDefaults?.quoteAssetLabel,
    ),
    quoteAssetYieldPct: marketValueWhenAbsent(
      ["quoteApy"],
      state.quoteAssetYieldPct,
      marketDefaults?.quoteAssetYieldPct,
    ),
    poolTurnoverPerYear: marketValueWhenAbsent(
      ["turnover"],
      state.poolTurnoverPerYear,
      marketDefaults?.poolTurnoverPerYear,
    ),
    swapFeeBps: marketValueWhenAbsent(
      ["fee"],
      state.swapFeeBps,
      marketDefaults?.swapFeeBps,
    ),
    marketMakerCostOfCapitalPct: marketValueWhenAbsent(
      ["mmCost"],
      state.marketMakerCostOfCapitalPct,
      marketDefaults?.marketMakerCostOfCapitalPct,
    ),
    redemptionDays: marketValueWhenAbsent(
      ["mmDays"],
      state.redemptionDays,
      marketDefaults?.redemptionDays,
    ),
    protectedDrawdownPct: whenAbsent(
      "drawdown",
      ["protect"],
      state.protectedDrawdownPct,
      marketDefaults?.protectedDrawdownPct ??
        DAY_V3_STARTER_DEFAULTS.protectedDrawdownPct,
    ),
    recoveryDays: whenAbsent(
      "recovery",
      ["recover"],
      state.recoveryDays,
      marketDefaults?.recoveryDays ?? DAY_V3_STARTER_DEFAULTS.recoveryDays,
    ),
    immediateExitSharePct: whenAbsent(
      "exit-amount",
      ["exit"],
      state.immediateExitSharePct,
      marketDefaults?.immediateExitSharePct ??
        DAY_V3_STARTER_DEFAULTS.immediateExitSharePct,
    ),
    minimumProceedsPer100: whenAbsent(
      "payout",
      ["receive"],
      state.minimumProceedsPer100,
      marketDefaults?.minimumProceedsPer100 ??
        DAY_V3_STARTER_DEFAULTS.minimumProceedsPer100,
    ),
    entryPointSettlementDays: customSource
      ? whenAbsent(
          "settlement",
          ["settle", "redeem"],
          state.entryPointSettlementDays,
          DAY_V3_STARTER_DEFAULTS.entryPointSettlementDays,
        )
      : state.entryPointSettlementDays,
    collateralToExitDays: customSource
      ? whenAbsent(
          "conversion-days",
          ["convert"],
          state.collateralToExitDays,
          DAY_V3_STARTER_DEFAULTS.collateralToExitDays,
        )
      : state.collateralToExitDays,
    collateralToExitCostBps: customSource
      ? whenAbsent(
          "conversion-cost",
          ["convertCost"],
          state.collateralToExitCostBps,
          DAY_V3_STARTER_DEFAULTS.collateralToExitCostBps,
        )
      : state.collateralToExitCostBps,
    fixedTermGraceDays: customSource
      ? whenAbsent(
          "grace",
          ["grace"],
          state.fixedTermGraceDays,
          DAY_V3_STARTER_DEFAULTS.fixedTermGraceDays,
        )
      : state.fixedTermGraceDays,
    navUpdateDays: customSource
      ? whenAbsent(
          "nav",
          ["nav"],
          state.navUpdateDays,
          DAY_V3_STARTER_DEFAULTS.navUpdateDays,
        )
      : state.navUpdateDays,
    depositDelaySeconds: customSource
      ? whenAbsent(
          "deposit-delay",
          ["depDelay"],
          state.depositDelaySeconds,
          DAY_V3_STARTER_DEFAULTS.depositDelaySeconds,
        )
      : state.depositDelaySeconds,
    gateByOracleUpdate: customSource
      ? whenAbsent(
          "price-gate",
          ["priceGate"],
          state.gateByOracleUpdate,
          DAY_V3_STARTER_DEFAULTS.gateByOracleUpdate,
        )
      : state.gateByOracleUpdate,
    incentiveBudgetPer100: customSource
      ? whenAbsent(
          "incentive",
          ["incentive"],
          state.incentiveBudgetPer100,
          DAY_V3_STARTER_DEFAULTS.incentiveBudgetPer100,
        )
      : state.incentiveBudgetPer100,
    // V3 currently supports one certified deployment template, so retain it
    // in the URL and handoff without showing a one-option issuer question.
    target: whenAbsent(
      "target",
      ["target"],
      state.target,
      DAY_V3_STARTER_DEFAULTS.target,
    ),
    overrides:
      marketDefaults && !hasCurveParameter
        ? { ...state.overrides, ...marketDefaults.overrides }
        : state.overrides,
  };
  return {
    applied: appliedFields.length > 0,
    appliedFields,
    state: nextState,
  };
}

const finite = (
  raw: string | null,
  min: number,
  max: number,
): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
};

const integer = (
  raw: string | null,
  min: number,
  max: number,
): number | null => {
  const value = finite(raw, min, max);
  return value !== null && Number.isInteger(value) ? value : null;
};

const text = (raw: string | null): string | null => {
  const value = raw?.trim() ?? "";
  return value ? value : null;
};

/**
 * A short display name a reader typed. Bounded and stripped of control
 * characters, because it is the only free text this contract carries and it is
 * rendered straight back into the page.
 */
const label = (raw: string | null): string | null => {
  const value = (raw ?? "").replace(/[^\p{L}\p{N} ._+-]/gu, "").trim();
  return value ? value.slice(0, 24) : null;
};

const expiry = (raw: string | null): DayV3ExpiryPolicy | null => {
  if (raw === "none") return "no-expiry";
  // UINT32_MAX is reserved for the explicit no-expiry sentinel. Numeric
  // execution windows must be positive and below it.
  return integer(raw, 1, 4_294_967_294);
};

const booleanFlag = (raw: string | null): boolean | null =>
  raw === "1" ? true : raw === "0" ? false : null;

function readTarget(raw: string | null): DayV3DeploymentTarget | null {
  if (!raw) return null;
  const separator = raw.indexOf(":");
  if (separator <= 0) return null;
  const chainId = Number(raw.slice(0, separator));
  const templateId = raw.slice(separator + 1).trim();
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !templateId)
    return null;
  return { chainId, templateId };
}

/** Parse the independent V3 address-bar contract. Invalid input stays unresolved. */
export function readDayV3UrlState(search: string): DayV3UrlState {
  const params = new URLSearchParams(search);
  const rawMode = params.get("mode");
  const curveOverrides = {
    jrYieldShareAtZeroPct: finite(params.get("jr0"), 0, 100),
    jrYieldShareAtTargetPct: finite(params.get("jr90"), 0, 100),
    jrYieldShareAtFullPct: finite(params.get("jr100"), 0, 100),
    slpYieldShareAtZeroPct: finite(params.get("slp0"), 0, 100),
    slpYieldShareAtTargetPct: finite(params.get("slp90"), 0, 100),
    slpYieldShareAtFullPct: finite(params.get("slp100"), 0, 100),
  };
  const curveValues = Object.values(curveOverrides);
  const hasAnyCurveOverride = curveValues.some((value) => value !== null);
  const hasCompleteCurveOverride = curveValues.every((value) => value !== null);
  const protectedDrawdownPct = finite(params.get("protect"), 0, 95);
  const immediateExitSharePct = finite(params.get("exit"), 0, 100);
  // Deliberately NOT "both targets must be present when both tranches are on".
  // The writer only serializes a target the reader actually overrode, so moving
  // the Junior slider alone on a market with an exit produced a link carrying
  // `jr90` and no `slp90` — which that rule rejected, dropping the one override
  // the link existed to carry. A tranche with no target in the link keeps its
  // default, which is what an absent parameter has always meant everywhere else
  // in this contract.
  const hasTargetOnlyCurveOverride =
    (curveOverrides.jrYieldShareAtTargetPct !== null ||
      curveOverrides.slpYieldShareAtTargetPct !== null) &&
    curveOverrides.jrYieldShareAtZeroPct === null &&
    curveOverrides.jrYieldShareAtFullPct === null &&
    curveOverrides.slpYieldShareAtZeroPct === null &&
    curveOverrides.slpYieldShareAtFullPct === null &&
    (curveOverrides.jrYieldShareAtTargetPct ?? 0) +
      (curveOverrides.slpYieldShareAtTargetPct ?? 0) <=
      100;
  const validCurveOverride =
    hasCompleteCurveOverride &&
    validateDayV3YieldCurveDesign({
      junior: {
        y0Pct: curveOverrides.jrYieldShareAtZeroPct as number,
        yTargetPct: curveOverrides.jrYieldShareAtTargetPct as number,
        y100Pct: curveOverrides.jrYieldShareAtFullPct as number,
      },
      slp: {
        y0Pct: curveOverrides.slpYieldShareAtZeroPct as number,
        yTargetPct: curveOverrides.slpYieldShareAtTargetPct as number,
        y100Pct: curveOverrides.slpYieldShareAtFullPct as number,
      },
    }).valid;
  // Older links may carry only the two target shares. The six-anchor editor
  // writes a complete curve, which is accepted only when its ordering and
  // shared Senior-yield budget are valid. Every other partial, inverted, or
  // over-budget curve is rejected as a unit.
  const acceptedCurveOverrides =
    !hasAnyCurveOverride ||
    (!validCurveOverride && !hasTargetOnlyCurveOverride)
      ? {
          jrYieldShareAtZeroPct: null,
          jrYieldShareAtTargetPct: null,
          jrYieldShareAtFullPct: null,
          slpYieldShareAtZeroPct: null,
          slpYieldShareAtTargetPct: null,
          slpYieldShareAtFullPct: null,
        }
      : hasTargetOnlyCurveOverride
        ? {
            jrYieldShareAtZeroPct: null,
            jrYieldShareAtTargetPct:
              curveOverrides.jrYieldShareAtTargetPct,
            jrYieldShareAtFullPct: null,
            slpYieldShareAtZeroPct: null,
            slpYieldShareAtTargetPct:
              curveOverrides.slpYieldShareAtTargetPct,
            slpYieldShareAtFullPct: null,
          }
        : curveOverrides;
  return {
    market: text(params.get("m")),
    mode: rawMode === "simulate" || rawMode === "deploy" ? rawMode : null,
    sourceApyPct: finite(params.get("apy"), 0, 30),
    quoteAssetLabel: label(params.get("quote")),
    quoteAssetYieldPct: finite(params.get("quoteApy"), 0, 30),
    poolTurnoverPerYear: finite(params.get("turnover"), 0, 100),
    // `previewSecondarySell` throws outside 0–10000 bps, inside a render-time
    // memo with no error boundary above it, so this bound is what keeps a
    // hand-edited link from crashing the page rather than a cosmetic range.
    // Matches the field's own bound. A link is a way into the app, not a way
    // around it: 10000 bps arrived here and compounded modeled fee income past
    // what the engine can hold, taking the backtest down.
    swapFeeBps: finite(params.get("fee"), 0.01, 1_000),
    // The pool's balance point, carried as the premium that sets it — the same
    // quantity the deployment interface takes, in the range it accepts
    // (`PREMIUM_BP = { min: 0, max: 50 }`). A link that carried a premium the
    // deploy step would reject would describe a market nobody can ship.
    poolPremiumBps: finite(params.get("premiumBps"), 0.01, 50),
    marketMakerCostOfCapitalPct: finite(params.get("mmCost"), 0, 100),
    redemptionDays: integer(params.get("mmDays"), 0, 365),
    protectedDrawdownPct,
    recoveryDays: integer(params.get("recover"), 0, 194),
    // `0` is an explicit product choice: no immediate pool exit and no SLP.
    // `null` remains the unresolved/malformed state.
    immediateExitSharePct,
    minimumProceedsPer100: finite(params.get("receive"), 0, 100),
    entryPointSettlementDays: integer(
      params.get("settle") ?? params.get("redeem"),
      1,
      194,
    ),
    collateralToExitDays: integer(params.get("convert"), 0, 365),
    collateralToExitCostBps: finite(params.get("convertCost"), 0, 9_999),
    fixedTermGraceDays: integer(params.get("grace"), 0, 194),
    navUpdateDays: integer(params.get("nav"), 1, 365),
    depositDelaySeconds: integer(params.get("depDelay"), 0, 16_777_215),
    depositExpirySeconds: expiry(params.get("depExpiry")),
    withdrawalExpirySeconds: expiry(params.get("wdExpiry")),
    gateByOracleUpdate: booleanFlag(params.get("priceGate")),
    maxReinvestmentSlippageBps: finite(
      params.get("reinvestSlip"),
      0,
      9_999.9999,
    ),
    incentiveBudgetPer100: finite(params.get("incentive"), 0, 99.99),
    target: readTarget(params.get("target")),
    overrides: {
      coveragePct: finite(params.get("cov"), 0, 89.99),
      minimumLiquidityPct: finite(params.get("liq"), 0, 99.99),
      maximumDiscountPct: finite(params.get("discount"), 0.5, 5),
      depthAtNav: integer(params.get("lambda"), 100, 1_000),
      maximumPremiumPct: finite(params.get("premium"), 0, 0.5),
      protectedExitThresholdPct: finite(params.get("pexit"), 0, 99.99),
      protectedExitBonusPct: finite(params.get("bonus"), 0, 99.99),
      poolCapitalPer100: finite(params.get("pool"), 0, 10_000),
      ...acceptedCurveOverrides,
    },
  };
}

export type DayV3UrlWriteState = DayV3UrlState & {
  starterFields?: readonly DayV3StarterDefaultField[];
};

const rounded = (value: number): string =>
  String(Math.round(value * 10_000) / 10_000);

/** Operational durations in legacy links are deployment whole-day fields. */
export const roundDayV3WholeDays = (value: number): number => Math.round(value);

/**
 * Write the smallest shareable model contract. Hidden operational facts,
 * deployment policy, historical state, Protected Exit settings, derived pool
 * fields, full curve anchors, and starter provenance remain readable from old
 * links but are never added to a new canonical URL.
 */
export function buildDayV3Query(state: DayV3UrlWriteState): string {
  const params = new URLSearchParams();
  if (state.market) params.set("m", state.market);

  const setNumber = (key: string, value: number | null) => {
    if (value !== null && Number.isFinite(value))
      params.set(key, rounded(value));
  };
  const setWholeDays = (key: string, value: number | null) => {
    if (value !== null && Number.isFinite(value)) {
      params.set(key, String(roundDayV3WholeDays(value)));
    }
  };
  setNumber("apy", state.sourceApyPct);
  setNumber("protect", state.protectedDrawdownPct);
  setNumber("exit", state.immediateExitSharePct);
  if (state.immediateExitSharePct === 0) params.set("receive", "0");
  else setNumber("receive", state.minimumProceedsPer100);

  // The quote asset and its yield are modeled inputs: they move SLP carry and
  // the position comparison, so a shared link that dropped them would describe
  // a different market. The refill-check terms travel with them because they
  // are the reader's stated assumption about who resets the pool.
  if (state.immediateExitSharePct !== 0) {
    if (state.quoteAssetLabel) params.set("quote", state.quoteAssetLabel);
    setNumber("quoteApy", state.quoteAssetYieldPct);
    setNumber("turnover", state.poolTurnoverPerYear);
    // Only a hand-set fee is written. A null fee means the live template's own
    // fee decides, and serializing a placeholder for it would turn an inherited
    // policy into a stated one the moment a link was shared.
    setNumber("fee", state.swapFeeBps);
    setNumber("premiumBps", state.poolPremiumBps);
    setNumber("mmCost", state.marketMakerCostOfCapitalPct);
    setWholeDays("mmDays", state.redemptionDays);
  }

  // These visible exit inputs drive the canonical restock hurdle. They belong
  // to the unified simulator and no longer depend on a legacy view mode.
  if (state.immediateExitSharePct !== 0) {
    setWholeDays("settle", state.entryPointSettlementDays);
    setWholeDays("convert", state.collateralToExitDays);
    setNumber("convertCost", state.collateralToExitCostBps);
  }

  // Zero is a deliberate "realize immediately" observation choice, not an
  // unresolved value.
  if (state.protectedDrawdownPct !== 0) {
    setWholeDays("recover", state.recoveryDays);
  }

  // `protect=0` and `exit=0&receive=0` are the existing feature-off
  // sentinels. Do not serialize any removed launch-policy fields.
  if (state.protectedDrawdownPct === 0) {
    params.set("recover", "0");
  }

  const hasCurveShapeOverride = [
    state.overrides.jrYieldShareAtZeroPct,
    state.overrides.jrYieldShareAtFullPct,
    state.overrides.slpYieldShareAtZeroPct,
    state.overrides.slpYieldShareAtFullPct,
  ].some((value) => value !== null);
  const hasActiveYieldCurve =
    state.protectedDrawdownPct !== 0 || state.immediateExitSharePct !== 0;
  if (hasCurveShapeOverride && hasActiveYieldCurve) {
    // A shaped curve is one atomic contract policy. Serialize all six anchors,
    // including zeros for a disabled tranche, so the strict reader can reject
    // malformed partial curves instead of silently modeling a different one.
    setNumber("jr0", state.overrides.jrYieldShareAtZeroPct);
    setNumber("jr90", state.overrides.jrYieldShareAtTargetPct);
    setNumber("jr100", state.overrides.jrYieldShareAtFullPct);
    setNumber("slp0", state.overrides.slpYieldShareAtZeroPct);
    setNumber("slp90", state.overrides.slpYieldShareAtTargetPct);
    setNumber("slp100", state.overrides.slpYieldShareAtFullPct);
  } else {
    // Preserve compact target-only links produced by older versions.
    if (state.protectedDrawdownPct !== 0) {
      setNumber("jr90", state.overrides.jrYieldShareAtTargetPct);
    }
    if (state.immediateExitSharePct !== 0) {
      setNumber("slp90", state.overrides.slpYieldShareAtTargetPct);
    }
  }
  return params.toString();
}
