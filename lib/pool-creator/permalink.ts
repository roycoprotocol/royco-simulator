// =============================================================================
// Pool creator — permalinks and persistence.
// -----------------------------------------------------------------------------
// Two ways a draft survives: a short URL that reproduces a configuration, and a
// localStorage autosave that survives a refresh.
//
// Only the user's *choices* travel. Everything derived — coverage, the yield
// shares, balances, the backtest — is recomputed from them, so a link stays
// short and can never disagree with the engine.
//
// An imported price history is NOT put in the URL: a 400-point series would
// blow past every practical URL limit. A shared link carries the goals and the
// shape of the strategy, and says plainly that the history needs re-importing.
// =============================================================================

import {
  createEmptyDraft,
  RISK_PROFILES,
  suggestIdentity,
  type PoolDraft,
  type RiskProfile,
  type StepId,
} from "@/lib/pool-creator/draft";
import { clamp } from "@/lib/pool-creator/format";

export const PERMALINK_VERSION = 1;

/** Compact keys: a permalink should be readable and short. */
type Query = Record<string, string | undefined>;

const num = (value: number, digits = 4): string =>
  Number.isFinite(value) ? String(Number(value.toFixed(digits))) : "";

function readNumber(query: Query, key: string, fallback: number, lo: number, hi: number): number {
  const raw = query[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clamp(parsed, lo, hi) : fallback;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

export function draftToQuery(draft: PoolDraft): Record<string, string> {
  const q: Record<string, string> = { v: String(PERMALINK_VERSION) };
  const g = draft.goals;

  q.pd = num(g.protectedDrawdown);
  q.ex = num(g.exitShareOfSenior);
  q.sr = num(g.seniorApy);
  q.lp = num(g.liquidityApy);
  q.rd = String(g.recoveryDays);
  q.eb = num(g.exitBufferPct, 2);
  q.st = String(Math.round(g.initialSeniorSize));
  q.step = String(draft.step);

  if (draft.presetId) q.p = draft.presetId;
  if (draft.identity.marketName) q.n = draft.identity.marketName;

  if (draft.source?.kind === "described") {
    q.k = "d";
    q.apy = num(draft.source.expectedApy);
    q.risk = draft.source.risk;
    // Carried separately from the pool name: a strategy can be named before the
    // pool is, and losing it would blank the rail on the other end.
    if (draft.source.label) q.lbl = draft.source.label;
  } else if (draft.source?.kind === "series") {
    // The series itself is far too large for a URL. Record where it came from
    // so the recipient can re-import it in one click.
    q.k = draft.source.origin.kind === "onchain" ? "c" : "u";
    if (draft.source.origin.label) q.lbl = draft.source.origin.label;
    if (draft.source.origin.sourceUrl) q.src = draft.source.origin.sourceUrl;
  }

  return q;
}

export function draftToSearch(draft: PoolDraft): string {
  return new URLSearchParams(draftToQuery(draft)).toString();
}

/** The full shareable URL, for a copy button. */
export function permalinkFor(draft: PoolDraft, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/create?${draftToSearch(draft)}`;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

export type DecodedPermalink = {
  draft: PoolDraft;
  /** True when a link referenced an imported history we cannot restore. */
  needsReimport: boolean;
  /** Where that history came from, so the UI can offer to fetch it again. */
  reimportHint: { label: string; sourceUrl: string } | null;
};

export function queryToDraft(query: Query): DecodedPermalink | null {
  // No version means no permalink — a bare visit, not a corrupt one.
  if (!query.v) return null;
  if (Number(query.v) !== PERMALINK_VERSION) return null;

  const base = createEmptyDraft();
  const risk = RISK_PROFILES.some((p) => p.id === query.risk)
    ? (query.risk as RiskProfile)
    : "mild";

  const goals: PoolDraft["goals"] = {
    protectedDrawdown: readNumber(query, "pd", base.goals.protectedDrawdown, 0.001, 0.6),
    exitShareOfSenior: readNumber(query, "ex", base.goals.exitShareOfSenior, 0.001, 0.6),
    seniorApy: readNumber(query, "sr", base.goals.seniorApy, 0, 2),
    liquidityApy: readNumber(query, "lp", base.goals.liquidityApy, 0, 2),
    recoveryDays: Math.round(readNumber(query, "rd", base.goals.recoveryDays, 0, 194)),
    exitBufferPct: readNumber(query, "eb", base.goals.exitBufferPct, 1, 99.91),
    initialSeniorSize: Math.round(readNumber(query, "st", base.goals.initialSeniorSize, 0, 1e12)),
  };

  const step = clamp(Math.round(Number(query.step ?? 1)), 1, 6) as StepId;
  const name = query.n?.trim() ?? "";
  const label = query.lbl?.trim() ?? name;

  const kind = query.k;
  const needsReimport = kind === "c" || kind === "u";

  // A link always restores as a modelled strategy: either it was one, or its
  // history is too large to travel and has to be re-imported. Either way the
  // page opens with live numbers rather than an empty state, and
  // `needsReimport` tells the UI to offer fetching the real history back.
  const source: PoolDraft["source"] = {
    kind: "described",
    label,
    expectedApy: readNumber(query, "apy", 0.09, -0.99, 5),
    risk,
    anchorDate: "2026-07-01",
  };

  return {
    draft: {
      ...base,
      step,
      presetId: query.p ?? null,
      goals,
      source,
      identity: name ? { ...suggestIdentity(name) } : base.identity,
      identityTouched: Boolean(name),
    },
    needsReimport,
    reimportHint: needsReimport
      ? { label, sourceUrl: query.src ?? "" }
      : null,
  };
}

/** Next's `searchParams` shape → a flat query record. */
export function queryFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): Query {
  const out: Query = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "royco.pool-creator.draft.v1";

type Stored = {
  version: number;
  savedAt: string;
  draft: PoolDraft;
};

/**
 * Autosave. The whole draft goes in, including an imported series — that is
 * the difference between localStorage and a URL, and it is why a refresh keeps
 * a 400-point history that a shared link cannot.
 */
export function saveDraft(draft: PoolDraft): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Stored = {
      version: PERMALINK_VERSION,
      savedAt: new Date().toISOString(),
      draft,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing, quota, or a disabled store. Autosave is a convenience,
    // never a requirement — failing to save must not break the page.
  }
}

export type RestoredDraft = { draft: PoolDraft; savedAt: string };

export function loadDraft(): RestoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    // A version bump discards rather than migrating: a half-understood old
    // draft is worse than a clean start.
    if (parsed?.version !== PERMALINK_VERSION || !parsed.draft?.goals) return null;
    return { draft: { ...createEmptyDraft(), ...parsed.draft }, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** "3 minutes ago" — for the restore prompt. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
