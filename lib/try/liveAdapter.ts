// ---------------------------------------------------------------------------
// liveAdapter.ts — typed data adapter for LIVE mode (real-time market state).
//
// STATUS: STUB. The backtest mode is fully wired to the validated engine; live
// mode needs a real data source for a DEPLOYED TRY market. This file defines
// the exact shape the UI consumes and lists every endpoint / contract call an
// implementation must provide, so wiring is a drop-in once the market is live
// and its address/chain are known (see OPEN-QUESTIONS Q8).
//
// The UI must treat this as the single source of live numbers; it does NOT run
// the engine in live mode (the chain is the source of truth there). The engine
// is for the deterministic backtest/projection only.
// ---------------------------------------------------------------------------
import type { MarketState } from "./engine";

/** A live snapshot of a deployed 2-tranche TRY market. All monetary values in USD. */
export interface LiveMarketSnapshot {
  asOf: string; // ISO timestamp of the read
  marketState: MarketState; // PERPETUAL | FIXED_TERM (observation)
  fixedTermEndsAt: string | null; // when the current observation period ends, if any

  strategyPrice: number; // current wiTRY / strategy NAV (per unit)
  strategyApy: number; // current annualized strategy yield (fraction)

  tvlUsd: number; // total pool TVL
  senior: TrancheSnapshot;
  junior: TrancheSnapshot;

  coverageUtilization: number; // fraction (WAD/1e18)
  juniorCoverageImpermanentLoss: number; // outstanding IL, USD
}

export interface TrancheSnapshot {
  nav: number; // effective NAV, USD
  sharePrice: number; // NAV per share
  totalShares: number;
  apy: number; // trailing/annualized tranche APY (fraction)
  capacityUsd: number; // remaining deposit capacity (from maxSTDeposit-style bound)
}

/** What a live implementation must fetch. Documented for handoff, not yet implemented. */
export const REQUIRED_LIVE_SOURCES = {
  // Preferred: a subgraph indexing the market's sync events + tranche shares.
  subgraph: [
    "market(id) { marketState, fixedTermEndTimestamp, coverageUtilizationWAD, lastJTCoverageImpermanentLoss }",
    "tranche(id: ST|JT) { effectiveNAV, totalSupply, sharePrice }",
    "strategy { price, apyWad } // wiTRY oracle mark + source APY",
  ],
  // Fallback: direct contract reads (needs deployed addresses — OPEN-QUESTIONS Q8).
  contractReads: [
    "RoycoDayAccountant.getState() -> {lastMarketState, fixedTermEndTimestamp, coverageUtilizationWAD, lastST/JTEffectiveNAV, lastJTCoverageImpermanentLoss}",
    "RoycoDayAccountant.previewSyncTrancheAccounting(stRawNAV, jtRawNAV) [view] for a fresh mark",
    "RoycoSeniorTranche.totalSupply() / convertToAssets(1e18)  (share price)",
    "RoycoJuniorTranche.totalSupply() / convertToAssets(1e18)",
    "RoycoDayKernel quoter: _getSeniorTrancheRawNAV / _getJuniorTrancheRawNAV (ERC4626 × Chainlink) for strategyPrice",
    "RoycoDayAccountant.maxSTDeposit() / maxJTWithdrawal() for capacity",
  ],
  // The oracle feeding strategyPrice on-chain (per MECHANISM-SPEC §7).
  oracle: "ERC4626.convertToAssets × Chainlink(base/USD) — or the wiTRY price feed for TRY",
} as const;

export interface LiveAdapter {
  /** Fetch a current snapshot. */
  getSnapshot(marketId: string): Promise<LiveMarketSnapshot>;
  /** Optional: subscribe to updates (subgraph poll or ws). */
  subscribe?(marketId: string, cb: (s: LiveMarketSnapshot) => void): () => void;
}

/**
 * Stub adapter — returns a clearly-marked placeholder so the UI's live mode
 * renders its layout without pretending to have real data. Replace with a
 * subgraph/contract-read implementation once a TRY market is deployed.
 */
export function createStubLiveAdapter(): LiveAdapter {
  return {
    async getSnapshot(): Promise<LiveMarketSnapshot> {
      throw new LiveDataUnavailableError(
        "Live mode is not yet connected. Deploy a TRY market and implement liveAdapter against REQUIRED_LIVE_SOURCES (see OPEN-QUESTIONS Q8).",
      );
    },
  };
}

export class LiveDataUnavailableError extends Error {
  readonly code = "LIVE_DATA_UNAVAILABLE";
}
