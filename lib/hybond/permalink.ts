// ---------------------------------------------------------------------------
// permalink.ts — the HYBond simulator's URL state codec.
//
// Extracted from the component so it is a PURE, headlessly testable pair: the
// round-trip property (state -> query -> state is a fixed point) is the whole
// contract, and it can only be asserted against the real implementation if that
// implementation does not require React to instantiate.
//
// The invariant: every piece of state the controls own must round-trip. Emitting
// only the mechanism params (and not the funding: deposits + the first-loss link)
// silently reset a shared link's deposits to the defaults, so a recipient saw
// different numbers than the sender under the same URL.
// ---------------------------------------------------------------------------
import {
  HYBOND_DEFAULT_PARAMS,
  HYBOND_NAV_SERIES,
  OBSERVATION_DAYS_MAX,
  OBSERVATION_DAYS_MIN,
  PRESETS,
  juniorFromFirstLossPct,
  type HybondParams,
} from "./scenarios";
import { normalizeRange, type IndexRange } from "./timeframe";

/** The minimal read surface shared by URLSearchParams and Next's searchParams record. */
export interface Query {
  get(key: string): string | null;
}

/** What a server page hands down from its own `searchParams`. */
export type InitialQuery = Record<string, string | string[] | undefined>;

/** Record → Query. Repeated keys (`?obs=1&obs=2`) read as the first one, as URLSearchParams does. */
export const queryFromRecord = (record: InitialQuery): Query => ({
  get: (key) => {
    const raw = record[key];
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw ?? null;
  },
});

export interface PermalinkState {
  params: HybondParams;
  maintain: boolean;
  range: IndexRange;
}

const FULL_RANGE: IndexRange = { a: 0, b: HYBOND_NAV_SERIES.length - 1 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Control ranges, kept next to the codec so the reader clamps to exactly what the UI allows. */
const ST_MIN = 100;
const ST_MAX = 10000;
const ST_STEP = 100;
const JT_MIN = 50;
const JT_MAX = 10000;
const JT_STEP = 50;

const snap = (v: number, step: number, lo: number, hi: number): number =>
  clamp(Math.round(v / step) * step, lo, hi);

/**
 * Permalink → state. Every value is clamped to its control's own range, so a
 * hand-edited URL can never push the engine outside a configuration the UI can express.
 */
export function stateFromQuery(q: Query): PermalinkState {
  const preset = PRESETS.find((p) => p.id === q.get("preset"));
  let params: HybondParams = preset ? { ...preset.params } : { ...HYBOND_DEFAULT_PARAMS };

  const num = (key: string): number | null => {
    const raw = q.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const coverage = num("coverage");
  if (coverage !== null) params.minCoveragePct = clamp(Math.round(coverage), 8, 65);
  const obs = num("obs");
  if (obs !== null) {
    params.observationDays = clamp(Math.round(obs), OBSERVATION_DAYS_MIN, OBSERVATION_DAYS_MAX);
  }
  const yieldShare = num("yieldShare");
  if (yieldShare !== null) params.seniorShareToJuniorPct = clamp(Math.round(yieldShare), 20, 80);
  const exitBuffer = num("exitBuffer");
  if (exitBuffer !== null) params.exitBufferPct = clamp(exitBuffer, 1, 99.91);

  // Funding state, clamped/stepped to the same ranges the controls enforce.
  const st = num("st");
  if (st !== null) params.depositST = snap(st, ST_STEP, ST_MIN, ST_MAX);
  const link = q.get("link");
  if (link !== null) params.linkJuniorToFirstLoss = link !== "0";

  // Junior is only read from the URL when it is NOT derived: while the link is on it is a
  // function of (depositST, minCoveragePct), so an emitted `jt` could contradict `coverage`.
  // Re-derive it in that case and ignore any `jt` in the query.
  if (params.linkJuniorToFirstLoss) {
    params = {
      ...params,
      depositJT: juniorFromFirstLossPct(params.depositST, params.minCoveragePct),
    };
  } else {
    const jt = num("jt");
    // Once Junior is manually controlled, even a missing or malformed value must fall
    // on the slider's range/step. The linked default can be fractional because it is a
    // derived read-only value, not a value selected by that control.
    params.depositJT = snap(jt ?? params.depositJT, JT_STEP, JT_MIN, JT_MAX);
  }

  const indexForDate = (date: string | null, fallback: number): number => {
    if (date === null) return fallback;
    const index = HYBOND_NAV_SERIES.findIndex((point) => point.date === date);
    return index >= 0 ? index : fallback;
  };
  const range = normalizeRange(
    indexForDate(q.get("from"), FULL_RANGE.a),
    indexForDate(q.get("to"), FULL_RANGE.b),
    FULL_RANGE.b,
  );

  return { params, maintain: q.get("maintain") !== "0", range };
}

/** Which preset (if any) exactly matches these params. Also drives the ladder's active styling. */
export function findPreset(params: HybondParams) {
  return PRESETS.find(
    (p) =>
      p.params.depositST === params.depositST &&
      p.params.depositJT === params.depositJT &&
      p.params.seniorShareToJuniorPct === params.seniorShareToJuniorPct &&
      p.params.observationDays === params.observationDays &&
      p.params.minCoveragePct === params.minCoveragePct &&
      p.params.exitBufferPct === params.exitBufferPct,
  );
}

/** State → query string (no origin/path). The exact inverse of stateFromQuery. */
export function queryFromState(
  params: HybondParams,
  maintain: boolean,
  range: IndexRange = FULL_RANGE,
): string {
  const legalRange = normalizeRange(range.a, range.b, FULL_RANGE.b);
  const q = new URLSearchParams({
    preset: findPreset(params)?.id ?? "custom",
    coverage: String(params.minCoveragePct),
    obs: String(params.observationDays),
    yieldShare: String(params.seniorShareToJuniorPct),
    exitBuffer: String(params.exitBufferPct),
    maintain: maintain ? "1" : "0",
    st: String(params.depositST),
    link: params.linkJuniorToFirstLoss ? "1" : "0",
    from: HYBOND_NAV_SERIES[legalRange.a].date,
    to: HYBOND_NAV_SERIES[legalRange.b].date,
  });
  // Junior is derived while the link is on, so emitting it would be redundant at best and
  // contradict `coverage` at worst. The reader re-derives it from the same inputs instead.
  if (!params.linkJuniorToFirstLoss) q.set("jt", String(params.depositJT));
  return q.toString();
}
