// =============================================================================
// Pool creator — starting shapes
// -----------------------------------------------------------------------------
// Two ways to start: pick an archetype, or copy the terms of a market that
// already exists. The second is worth far more than it costs — "start from
// Pareto FalconX" is the highest-trust content on the page, because those
// numbers are real and certified.
//
// Archetypes are expressed as GOALS, never as parameters. That keeps the preset
// layer on the same side of the abstraction as the wizard itself: picking
// "Balanced" answers the questions in steps 2–4, it doesn't reach past them.
// =============================================================================

import type { PoolGoals } from "@/lib/pool-creator/draft";

import acred from "@/lib/day-markets/acred/market.json";
import blockhouse from "@/lib/day-markets/blockhouse/market.json";
import paretoFalconx from "@/lib/day-markets/pareto-falconx/market.json";
import reusde from "@/lib/day-markets/reusde/market.json";
import susdai from "@/lib/day-markets/susdai/market.json";

export type Archetype = {
  id: string;
  label: string;
  /** The Uniswap-style plain-English caption: who is this for? */
  caption: string;
  goals: Pick<
    PoolGoals,
    "protectedDrawdown" | "exitShareOfSenior" | "recoveryDays" | "exitBufferPct"
  > & {
    /** Senior's share of the base strategy yield, before we know what the base is. */
    seniorYieldRetention: number;
    liquidityApy: number;
  };
};

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: "steady",
    label: "Steady",
    caption:
      "For a stablecoin or low-volatility strategy that rarely falls. A thin cushion, and no recovery window at all.",
    goals: {
      protectedDrawdown: 0.02,
      exitShareOfSenior: 0.02,
      recoveryDays: 0,
      exitBufferPct: 99.91,
      // Senior cannot retain much above ~0.85 of the base once the 10% Senior
      // protocol fee and the liquidity premium are taken, so aiming higher
      // would open the wizard on a "clamped" warning.
      seniorYieldRetention: 0.82,
      liquidityApy: 0.09,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    caption:
      "The most common setup. A real cushion, a week to recover, and a premium worth earning on both sides.",
    goals: {
      protectedDrawdown: 0.04,
      exitShareOfSenior: 0.03,
      recoveryDays: 7,
      exitBufferPct: 1,
      seniorYieldRetention: 0.72,
      liquidityApy: 0.12,
    },
  },
  {
    id: "high-yield",
    label: "Deep cover",
    // Named for what it does, not what it sounds like. A deeper cushion means
    // MORE Junior capital sharing the same premium, so Junior's rate is
    // actually lower here than under Balanced — calling this "high-yield"
    // promised the opposite of what it delivers.
    caption:
      "For a strategy with genuine drawdown history. A deep cushion and a month to recover, which Senior pays for in yield.",
    goals: {
      protectedDrawdown: 0.12,
      exitShareOfSenior: 0.04,
      recoveryDays: 30,
      exitBufferPct: 1,
      seniorYieldRetention: 0.55,
      liquidityApy: 0.14,
    },
  },
];

/**
 * Turn an archetype into concrete goals once the base strategy APY is known.
 * Senior's target is expressed as a share of the base yield rather than an
 * absolute number, so "Balanced" means the same thing on a 4% strategy and a
 * 17% one.
 */
export function archetypeToGoals(
  archetype: Archetype,
  sourceApy: number,
  initialSeniorSize: number,
): PoolGoals {
  return {
    protectedDrawdown: archetype.goals.protectedDrawdown,
    exitShareOfSenior: archetype.goals.exitShareOfSenior,
    seniorApy: Math.max(0, sourceApy * archetype.goals.seniorYieldRetention),
    liquidityApy: archetype.goals.liquidityApy,
    recoveryDays: archetype.goals.recoveryDays,
    exitBufferPct: archetype.goals.exitBufferPct,
    initialSeniorSize,
  };
}

// ---------------------------------------------------------------------------
// Real markets, for "copy an existing pool" and for the ⓘ benchmark reveals
// ---------------------------------------------------------------------------

export type ReferenceMarket = {
  id: string;
  name: string;
  asset: string;
  sourceApy: number;
  coverage: number;
  minLiquidity: number;
  observationDays: number;
  exitBufferPct: number;
  seniorApyMin: number;
  seniorApyMax: number;
  juniorApyMin: number;
  juniorApyMax: number;
};

type RawManifest = {
  id: string;
  identity: { marketName: string; underlyingAsset: string };
  defaults: {
    sourceApy: number;
    coverage: number;
    minLiquidity: number;
    observationDays: number;
    exitBufferPct: number;
  };
  targets: {
    seniorApyMin: number;
    seniorApyMax: number;
    juniorApyMin: number;
    juniorApyMax: number;
  };
};

const toReference = (raw: unknown): ReferenceMarket => {
  const m = raw as RawManifest;
  return {
    id: m.id,
    name: m.identity.marketName,
    asset: m.identity.underlyingAsset,
    sourceApy: m.defaults.sourceApy,
    coverage: m.defaults.coverage,
    minLiquidity: m.defaults.minLiquidity,
    observationDays: m.defaults.observationDays,
    exitBufferPct: m.defaults.exitBufferPct,
    seniorApyMin: m.targets.seniorApyMin,
    seniorApyMax: m.targets.seniorApyMax,
    juniorApyMin: m.targets.juniorApyMin,
    juniorApyMax: m.targets.juniorApyMax,
  };
};

/**
 * A representative slice of the live book rather than all twelve — enough to
 * show the range without shipping every manifest into the client bundle.
 */
export const REFERENCE_MARKETS: readonly ReferenceMarket[] = [
  toReference(paretoFalconx),
  toReference(susdai),
  toReference(acred),
  toReference(reusde),
  toReference(blockhouse),
];

/**
 * The most of a base yield Senior can retain here.
 *
 * The twelve markets in this repo are modelled with ZERO protocol fees, so
 * some of their published Senior targets are unreachable once this wizard's
 * production defaults (10% on Senior's kept yield, 45% on the risk premium)
 * are applied. Solving each reference market against production fees puts the
 * binding case at 0.743 retention, so copying one clamps here rather than
 * opening on a "cannot reach that" warning about a market that plainly exists.
 */
const MAX_COPIED_RETENTION = 0.73;

/**
 * Turn a live market into goals, so "show me what Apollo's looks like" is one
 * click rather than a form. The coverage on file is the accountant parameter;
 * the wizard asks in terms of the drawdown it absorbs, hence the /0.9.
 */
export function referenceToGoals(
  market: ReferenceMarket,
  initialSeniorSize: number,
): PoolGoals {
  const publishedMid = (market.seniorApyMin + market.seniorApyMax) / 2;
  const retention = Math.min(publishedMid / market.sourceApy, MAX_COPIED_RETENTION);
  return {
    protectedDrawdown: market.coverage / 0.9,
    exitShareOfSenior: 0.03,
    seniorApy: market.sourceApy * retention,
    liquidityApy: 0.12,
    recoveryDays: market.observationDays,
    exitBufferPct: market.exitBufferPct,
    initialSeniorSize,
  };
}

/** "Live markets run 3%–18%, median 10%" — the ⓘ benchmark line. */
export function referenceRange(
  field: "coverage" | "minLiquidity" | "observationDays" | "exitBufferPct",
): { min: number; max: number; median: number } {
  const values = REFERENCE_MARKETS.map((m) => m[field]).sort((a, b) => a - b);
  return {
    min: values[0],
    max: values[values.length - 1],
    median: values[Math.floor(values.length / 2)],
  };
}
