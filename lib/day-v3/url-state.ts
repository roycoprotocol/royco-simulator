import type {
  DayV3DeploymentTarget,
  DayV3ExpiryPolicy,
  DayV3GoalDraft,
  DayV3Overrides,
} from "@/lib/day-v3/types";
import { validateDayV3YieldCurveDesign } from "@/lib/day-v3/yield-curves";

export type DayV3Mode = "simulate" | "deploy";

export interface DayV3UrlState extends DayV3GoalDraft {
  market: string | null;
  mode: DayV3Mode | null;
  sourceApyPct: number | null;
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

  // `replaceState` writes the visible starter numbers into the address bar.
  // Persist their origin separately so a refresh cannot turn an illustrative
  // value into an issuer-approved deployment input merely because its key is
  // now present in the URL.
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
    protectedDrawdownPct: whenAbsent(
      "drawdown",
      ["protect"],
      state.protectedDrawdownPct,
      DAY_V3_STARTER_DEFAULTS.protectedDrawdownPct,
    ),
    recoveryDays: whenAbsent(
      "recovery",
      ["recover"],
      state.recoveryDays,
      DAY_V3_STARTER_DEFAULTS.recoveryDays,
    ),
    immediateExitSharePct: whenAbsent(
      "exit-amount",
      ["exit"],
      state.immediateExitSharePct,
      DAY_V3_STARTER_DEFAULTS.immediateExitSharePct,
    ),
    minimumProceedsPer100: whenAbsent(
      "payout",
      ["receive"],
      state.minimumProceedsPer100,
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
    target: customSource
      ? whenAbsent(
          "target",
          ["target"],
          state.target,
          DAY_V3_STARTER_DEFAULTS.target,
        )
      : state.target,
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

export function toggleDayV3Mode(mode: DayV3Mode): DayV3Mode {
  return mode === "simulate" ? "deploy" : "simulate";
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
  // The six anchors form one atomic model input. A partial, inverted, or
  // over-budget hand-edited URL is rejected as a unit rather than normalized
  // into a different curve while the address bar continues to claim the raw
  // values.
  const acceptedCurveOverrides =
    !hasAnyCurveOverride || !validCurveOverride
      ? {
          jrYieldShareAtZeroPct: null,
          jrYieldShareAtTargetPct: null,
          jrYieldShareAtFullPct: null,
          slpYieldShareAtZeroPct: null,
          slpYieldShareAtTargetPct: null,
          slpYieldShareAtFullPct: null,
        }
      : curveOverrides;
  return {
    market: text(params.get("m")),
    mode: rawMode === "simulate" || rawMode === "deploy" ? rawMode : null,
    sourceApyPct: finite(params.get("apy"), 0, 30),
    protectedDrawdownPct: finite(params.get("protect"), 0, 95),
    recoveryDays: integer(params.get("recover"), 0, 194),
    // `0` is an explicit product choice: no immediate pool exit and no SLP.
    // `null` remains the unresolved/malformed state.
    immediateExitSharePct: finite(params.get("exit"), 0, 100),
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

/** Operational durations are deployment whole-day fields. */
export const roundDayV3WholeDays = (value: number): number => Math.round(value);

/**
 * Derived values are absent by construction unless supplied in `overrides`,
 * which represents an explicit manual override in V3 state.
 */
export function buildDayV3Query(state: DayV3UrlWriteState): string {
  const params = new URLSearchParams();
  if (state.market) params.set("m", state.market);
  if (state.mode === "deploy") params.set("mode", "deploy");

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
  setWholeDays("recover", state.recoveryDays);
  setNumber("exit", state.immediateExitSharePct);
  setNumber("receive", state.minimumProceedsPer100);
  setWholeDays("settle", state.entryPointSettlementDays);
  setWholeDays("convert", state.collateralToExitDays);
  setNumber("convertCost", state.collateralToExitCostBps);
  setWholeDays("grace", state.fixedTermGraceDays);
  setWholeDays("nav", state.navUpdateDays);
  setNumber("depDelay", state.depositDelaySeconds);
  const setExpiry = (key: string, value: DayV3ExpiryPolicy | null) => {
    if (value === "no-expiry") params.set(key, "none");
    else setNumber(key, value);
  };
  setExpiry("depExpiry", state.depositExpirySeconds);
  setExpiry("wdExpiry", state.withdrawalExpirySeconds);
  if (state.gateByOracleUpdate !== null) {
    params.set("priceGate", state.gateByOracleUpdate ? "1" : "0");
  }
  setNumber("reinvestSlip", state.maxReinvestmentSlippageBps);
  setNumber("incentive", state.incentiveBudgetPer100);
  if (state.target) {
    params.set("target", `${state.target.chainId}:${state.target.templateId}`);
  }

  setNumber("cov", state.overrides.coveragePct);
  setNumber("liq", state.overrides.minimumLiquidityPct);
  setNumber("discount", state.overrides.maximumDiscountPct);
  setNumber("lambda", state.overrides.depthAtNav);
  setNumber("premium", state.overrides.maximumPremiumPct);
  setNumber("pexit", state.overrides.protectedExitThresholdPct);
  setNumber("bonus", state.overrides.protectedExitBonusPct);
  setNumber("pool", state.overrides.poolCapitalPer100);
  setNumber("jr0", state.overrides.jrYieldShareAtZeroPct);
  setNumber("jr90", state.overrides.jrYieldShareAtTargetPct);
  setNumber("jr100", state.overrides.jrYieldShareAtFullPct);
  setNumber("slp0", state.overrides.slpYieldShareAtZeroPct);
  setNumber("slp90", state.overrides.slpYieldShareAtTargetPct);
  setNumber("slp100", state.overrides.slpYieldShareAtFullPct);
  const starterFields = [
    ...new Set(
      (state.starterFields ?? []).filter((field) =>
        DAY_V3_STARTER_DEFAULT_FIELDS.has(field),
      ),
    ),
  ];
  if (starterFields.length > 0) {
    params.set("starter", starterFields.join(","));
  }
  return params.toString();
}
