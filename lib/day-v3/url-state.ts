import type {
  DayV3DeploymentTarget,
  DayV3GoalDraft,
  DayV3Overrides,
} from "@/lib/day-v3/types";

export type DayV3Mode = "simulate" | "deploy";

export interface DayV3UrlState extends DayV3GoalDraft {
  market: string | null;
  mode: DayV3Mode | null;
  sourceApyPct: number | null;
  overrides: DayV3Overrides;
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

function readTarget(raw: string | null): DayV3DeploymentTarget | null {
  if (!raw) return null;
  const separator = raw.indexOf(":");
  if (separator <= 0) return null;
  const chainId = Number(raw.slice(0, separator));
  const templateId = raw.slice(separator + 1).trim();
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !templateId) return null;
  return { chainId, templateId };
}

export function toggleDayV3Mode(mode: DayV3Mode): DayV3Mode {
  return mode === "simulate" ? "deploy" : "simulate";
}

/** Parse the independent V3 address-bar contract. Invalid input stays unresolved. */
export function readDayV3UrlState(search: string): DayV3UrlState {
  const params = new URLSearchParams(search);
  const rawMode = params.get("mode");
  return {
    market: text(params.get("m")),
    mode: rawMode === "simulate" || rawMode === "deploy" ? rawMode : null,
    sourceApyPct: finite(params.get("apy"), 0, 30),
    protectedDrawdownPct: finite(params.get("protect"), 0, 95),
    recoveryDays: integer(params.get("recover"), 0, 194),
    immediateExitSharePct: finite(params.get("exit"), 0, 100),
    minimumProceedsPer100: finite(params.get("receive"), 0, 100),
    redemptionDays: integer(params.get("redeem"), 0, 365),
    navUpdateDays: integer(params.get("nav"), 1, 365),
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
    },
  };
}

export type DayV3UrlWriteState = DayV3UrlState;

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
    if (value !== null && Number.isFinite(value)) params.set(key, rounded(value));
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
  setWholeDays("redeem", state.redemptionDays);
  setWholeDays("nav", state.navUpdateDays);
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
  return params.toString();
}
