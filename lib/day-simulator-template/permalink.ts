// A Day design is worth sending to someone. The explorer already carries the
// market in the query string; this carries the tranching design alongside it, so
// a tuned configuration survives a copied link instead of living only in the
// session that produced it.
//
// Every value is clamped on read: a link is untrusted input, and the accountant
// must never be handed a term outside the range it accepts.

export type DayDesignParams = {
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  riskSharePct: number;
  liqSharePct: number;
  observationDays: number;
  sourceApyPct: number;
  stressDepthPct: number;
  maintainCoverage: boolean;
};

type Spec = {
  key: string;
  min: number;
  max: number;
  step?: number;
};

// Short keys keep a shared link readable. Bounds mirror the control ranges.
const SPECS: Record<Exclude<keyof DayDesignParams, "maintainCoverage">, Spec> = {
  coveragePct: { key: "cov", min: 0, max: 25 },
  minLiquidityPct: { key: "liq", min: 0, max: 25 },
  eclpBandWidthPct: { key: "band", min: 0.25, max: 20 },
  riskSharePct: { key: "jrp", min: 0, max: 80 },
  liqSharePct: { key: "slpp", min: 0, max: 80 },
  observationDays: { key: "obs", min: 7, max: 194, step: 1 },
  sourceApyPct: { key: "apy", min: 0, max: 30 },
  stressDepthPct: { key: "stress", min: 0, max: 60 },
};

const MAINTAIN_KEY = "restore";

const round = (value: number) => Math.round(value * 100) / 100;

const clamp = (raw: string | null, spec: Spec): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const bounded = Math.min(spec.max, Math.max(spec.min, parsed));
  return spec.step === 1 ? Math.round(bounded) : round(bounded);
};

/** Serialize a design into query parameters, omitting nothing so a link is complete. */
export function encodeDayDesign(design: DayDesignParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, spec] of Object.entries(SPECS) as [
    Exclude<keyof DayDesignParams, "maintainCoverage">,
    Spec,
  ][]) {
    params.set(spec.key, String(round(design[field])));
  }
  params.set(MAINTAIN_KEY, design.maintainCoverage ? "1" : "0");
  return params;
}

/**
 * Read whatever of a design is present and valid. Returns only the fields the
 * link actually carried, so callers can fall back to market defaults for the
 * rest rather than being handed zeroes.
 */
export function decodeDayDesign(
  search: string | URLSearchParams,
): Partial<DayDesignParams> {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const design: Partial<DayDesignParams> = {};
  for (const [field, spec] of Object.entries(SPECS) as [
    Exclude<keyof DayDesignParams, "maintainCoverage">,
    Spec,
  ][]) {
    const value = clamp(params.get(spec.key), spec);
    if (value !== null) design[field] = value;
  }
  const restore = params.get(MAINTAIN_KEY);
  if (restore === "1" || restore === "0") design.maintainCoverage = restore === "1";
  return design;
}

/** True when a link carries any design at all, so defaults are not overridden by an empty one. */
export function hasDayDesign(search: string | URLSearchParams): boolean {
  return Object.keys(decodeDayDesign(search)).length > 0;
}
