/**
 * The design, in the address bar.
 *
 * A page whose whole purpose is "I configured this market" has to be sendable,
 * and the deploy flow should receive the design rather than a blank form. Every
 * term the page can set is encoded, and nothing else: an imported source is a
 * file in someone's browser, not a value, so a link never claims to carry one.
 *
 * Values are read defensively. A link is user input and may be old, truncated,
 * or hand-edited, and a bad number must leave the default standing rather than
 * put NaN into the engine.
 */
export type DayV2UrlState = {
  market: string | null;
  mode: "simulate" | "deploy" | null;
  coveragePct: number | null;
  liquidityPct: number | null;
  sourceApyPct: number | null;
  observationDays: number | null;
  bandPct: number | null;
  maintainCoverage: boolean | null;
  riskSharePct: number | null;
  liqSharePct: number | null;
};

const number = (raw: string | null, min: number, max: number): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
};

export function readDayV2UrlState(search: string): DayV2UrlState {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const maintain = params.get("restore");
  return {
    market: params.get("m"),
    mode: mode === "simulate" || mode === "deploy" ? mode : null,
    coveragePct: number(params.get("cov"), 0, 25),
    liquidityPct: number(params.get("liq"), 0, 25),
    sourceApyPct: number(params.get("apy"), 0, 30),
    observationDays: number(params.get("obs"), 7, 194),
    bandPct: number(params.get("band"), 0.25, 20),
    maintainCoverage: maintain === "1" ? true : maintain === "0" ? false : null,
    // Shares are optional: absent means "follow the requirement", which is the
    // page's own rule, so a link only carries them when they were overridden.
    riskSharePct: number(params.get("jr"), 0, 80),
    liqSharePct: number(params.get("slp"), 0, 80),
  };
}

export function buildDayV2Query(state: {
  market: string;
  mode: "simulate" | "deploy";
  coveragePct: number;
  liquidityPct: number;
  sourceApyPct: number;
  observationDays: number;
  bandPct: number;
  maintainCoverage: boolean;
  riskSharePct: number | null;
  liqSharePct: number | null;
}): string {
  const params = new URLSearchParams();
  params.set("m", state.market);
  if (state.mode === "deploy") params.set("mode", "deploy");
  params.set("cov", String(round(state.coveragePct)));
  params.set("liq", String(round(state.liquidityPct)));
  params.set("apy", String(round(state.sourceApyPct)));
  params.set("obs", String(Math.round(state.observationDays)));
  params.set("band", String(round(state.bandPct)));
  params.set("restore", state.maintainCoverage ? "1" : "0");
  if (state.riskSharePct !== null) params.set("jr", String(round(state.riskSharePct)));
  if (state.liqSharePct !== null) params.set("slp", String(round(state.liqSharePct)));
  return params.toString();
}

/** Two decimals is finer than any control's step, and keeps links readable. */
const round = (value: number) => Math.round(value * 100) / 100;
