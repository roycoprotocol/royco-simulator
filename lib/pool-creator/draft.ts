// =============================================================================
// Pool creator — the draft model
// -----------------------------------------------------------------------------
// `PoolDraft` is the single piece of wizard state. Everything the user chooses
// lives here; everything derived from it is recomputed (never stored), so the
// draft stays small enough to round-trip through a URL and localStorage.
//
// The draft is stated in *outcomes* ("protect Senior from the first 4%"), not
// in accountant parameters. `config.ts` turns it into a `MarketConfig` and
// `solver.ts` does the inversion. No accounting math lives in this file.
// =============================================================================

import type { DaySeriesPoint } from "@/lib/day-simulator-template/market";

export const DRAFT_VERSION = 1;

// ---------------------------------------------------------------------------
// Yield source
// ---------------------------------------------------------------------------

/** How volatile the strategy is, when the user has no history to import. */
export type RiskProfile = "steady" | "mild" | "choppy" | "credit";

export const RISK_PROFILES: ReadonlyArray<{
  id: RiskProfile;
  label: string;
  caption: string;
}> = [
  { id: "steady", label: "Very steady", caption: "Accrues almost linearly. A T-bill or fully-hedged basis strategy." },
  { id: "mild", label: "Mildly bumpy", caption: "Small wobbles, no real drawdowns. Most lending strategies." },
  { id: "choppy", label: "Choppy", caption: "Visible drawdowns of a few percent. Basis trades, LP positions." },
  { id: "credit", label: "Credit risk", caption: "Long calm stretches punctuated by a sharp loss. Private credit." },
];

export type SeriesOrigin = {
  /** How we got the series — drives the provenance block. */
  kind: "upload" | "onchain" | "sample";
  /** Display name for the strategy, e.g. "sUSDai". */
  label: string;
  /** Who publishes the numbers. Asked, because it can't be inferred. */
  provider: string;
  sourceUrl: string;
  priceType: "nav" | "price" | "total-return-index";
  cadence: "daily" | "weekly" | "monthly" | "irregular";
  /** `null` until the user answers. Never guessed — the docs forbid it. */
  feesIncluded: boolean | null;
};

export type YieldSource =
  | { kind: "series"; series: DaySeriesPoint[]; origin: SeriesOrigin }
  | {
      kind: "described";
      label: string;
      expectedApy: number;
      risk: RiskProfile;
      anchorDate: string;
    };

// ---------------------------------------------------------------------------
// Goals — what the user actually chooses
// ---------------------------------------------------------------------------

export type PoolGoals = {
  /** Strategy drawdown Senior should not feel at all. Solves `coverage`. */
  protectedDrawdown: number;
  /** Share of a Senior position sellable at ≤1% discount. Solves `minLiquidity`. */
  exitShareOfSenior: number;
  /** Target Senior APY. Solves `riskYieldShare`. */
  seniorApy: number;
  /** Target LP APY. Solves `liquidityYieldShare`. */
  liquidityApy: number;
  /** Recovery window. `0` means a perpetual market with no window at all. */
  recoveryDays: number;
  /**
   * Junior buffer remaining (%) when Senior's protected exit opens.
   * Same field and range the Dawn Market Builder exposes: 1 → opens only when
   * the cushion is nearly gone; 99.91 → opens as soon as it is touched.
   */
  exitBufferPct: number;
  /** Opening Senior size. Junior and LP sizes derive from it. */
  initialSeniorSize: number;
};

// ---------------------------------------------------------------------------
// Advanced overrides — empty on the default path
// ---------------------------------------------------------------------------

export type PoolOverrides = Partial<{
  coverage: number;
  minLiquidity: number;
  riskYieldShare: number;
  liquidityYieldShare: number;
  ydmMode: "static" | "adaptive";
  ydmSpread: number;
  selfLiquidationBonus: number;
  maintainCoverage: boolean;
  stProtocolFee: number;
  jtProtocolFee: number;
  jtYieldShareProtocolFee: number;
  ltYieldShareProtocolFee: number;
  stableYield: number;
  swapFeeBps: number;
  poolTurnoverPerYear: number;
  eclpBandWidth: number;
  reinvestLiquidityPremium: boolean;
  initialJT: number;
  initialLT: number;
}>;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type PoolIdentity = {
  marketName: string;
  displayAssetName: string;
  underlyingAsset: string;
  seniorName: string;
  seniorSymbol: string;
  juniorName: string;
  juniorSymbol: string;
  slug: string;
};

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export type StepId = 1 | 2 | 3 | 4 | 5 | 6;

export type PoolDraft = {
  version: typeof DRAFT_VERSION;
  step: StepId;
  /** Which archetype seeded this draft; `null` once the user edits away from it. */
  presetId: string | null;
  source: YieldSource | null;
  goals: PoolGoals;
  identity: PoolIdentity;
  /**
   * Set once the user edits a name themselves. Until then the identity keeps
   * tracking the strategy label, so typing "sUSDai" in step 1 flows through to
   * the pool name and both tranche tickers.
   */
  identityTouched: boolean;
  overrides: PoolOverrides;
  /** The step-5 confirmations, keyed by id. */
  acknowledged: Record<string, boolean>;
};

export const EMPTY_IDENTITY: PoolIdentity = {
  marketName: "",
  displayAssetName: "",
  underlyingAsset: "",
  seniorName: "",
  seniorSymbol: "",
  juniorName: "",
  juniorSymbol: "",
  slug: "",
};

/**
 * A draft opens with a described strategy already in place rather than an empty
 * `source`. The rail can then show real, moving APYs from the first paint —
 * which is the thing that pulls someone through the flow. Continuing still
 * requires naming the strategy; see the blocker in `PoolCreator`.
 */
export function createEmptyDraft(): PoolDraft {
  return {
    version: DRAFT_VERSION,
    step: 1,
    presetId: "balanced",
    source: {
      kind: "described",
      label: "",
      expectedApy: 0.09,
      risk: "mild",
      // Fixed rather than "today" so a server render and the first client
      // render agree; the user is choosing a shape, not a date.
      anchorDate: "2026-07-01",
    },
    // The "Balanced" archetype at the 9% default base yield, so the preset
    // chip shown as active genuinely matches the goals below it.
    goals: {
      protectedDrawdown: 0.04,
      exitShareOfSenior: 0.03,
      seniorApy: 0.0648,
      liquidityApy: 0.12,
      recoveryDays: 7,
      exitBufferPct: 1,
      initialSeniorSize: 1_000_000,
    },
    identity: { ...EMPTY_IDENTITY },
    identityTouched: false,
    overrides: {},
    acknowledged: {},
  };
}

// ---------------------------------------------------------------------------
// Derived helpers that are pure bookkeeping (no accounting)
// ---------------------------------------------------------------------------

/** A URL/route-safe slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** `sUSDai` → `srRoysUSDAI` / `jrRoysUSDAI`, matching the existing convention. */
export function suggestTrancheSymbols(assetSymbol: string): {
  seniorSymbol: string;
  juniorSymbol: string;
} {
  const core = assetSymbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  return {
    seniorSymbol: `srRoy${core}`,
    juniorSymbol: `jrRoy${core}`,
  };
}

/** Fill the identity block from a strategy label. Empty label → empty identity. */
export function suggestIdentity(label: string): PoolIdentity {
  const clean = label.trim();
  if (!clean) return { ...EMPTY_IDENTITY };
  const { seniorSymbol, juniorSymbol } = suggestTrancheSymbols(clean);
  return {
    marketName: clean,
    displayAssetName: clean,
    underlyingAsset: clean,
    seniorName: `Senior ${clean}`,
    seniorSymbol,
    juniorName: `Junior ${clean}`,
    juniorSymbol,
    slug: slugify(clean),
  };
}

/** The strategy's display name, or a neutral stand-in before it is named. */
export const sourceLabel = (source: YieldSource | null): string => {
  const named = !source ? "" : source.kind === "series" ? source.origin.label : source.label;
  return named.trim() || "your strategy";
};

/** True once the strategy has been named — required before leaving step 1. */
export const isSourceNamed = (source: YieldSource | null): boolean =>
  Boolean(!source ? false : source.kind === "series" ? source.origin.label.trim() : source.label.trim());

/** The confirmations gating deploy. Copy lives with the step that shows them. */
export const ACKNOWLEDGEMENT_IDS = ["erasure", "immutable", "seeding"] as const;
