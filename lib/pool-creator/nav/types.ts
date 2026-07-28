// Types for the read-only NAV reader. Shared by the route handler and the UI,
// so this file must stay free of server-only imports.

import type { DaySeriesPoint } from "@/lib/day-simulator-template/market";

export type ChainId = "ethereum" | "arbitrum";

export const CHAIN_LABELS: Record<ChainId, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
};

/**
 * What a contract turned out to be. Discovered by trying calls, never guessed
 * from a name or a heuristic — an unrecognised contract reports `unknown` and
 * the attempted selectors rather than a plausible-looking fabrication.
 */
export type NavProbe =
  | {
      kind: "erc4626";
      symbol: string;
      name: string;
      shareDecimals: number;
      baseAsset: `0x${string}`;
      assetDecimals: number;
      probeShares: string;
    }
  | {
      kind: "makina";
      symbol: string;
      name: string;
      shareToken: `0x${string}`;
      shareDecimals: number;
      accountingToken: `0x${string}`;
      accountingDecimals: number;
      probeShares: string;
    }
  | {
      kind: "chainlink";
      symbol: string;
      name: string;
      decimals: number;
    }
  | {
      /** A token, but nothing whose value per share moves. Not tranche-able. */
      kind: "erc20-only";
      symbol: string;
      name: string;
      decimals: number;
    }
  | {
      kind: "unknown";
      attempted: string[];
    };

export type NavErrorCode =
  | "BAD_ADDRESS"
  | "UNSUPPORTED_CHAIN"
  | "BAD_REQUEST"
  | "NOT_A_VAULT"
  | "NO_HISTORY"
  | "TOO_YOUNG"
  | "NEEDS_PROBE_FIRST"
  | "CLIENT_RATE_LIMIT"
  | "UPSTREAM_RATE_LIMIT"
  | "UPSTREAM_ERROR"
  | "TIMEOUT";

export type NavError = {
  ok: false;
  code: NavErrorCode;
  /** Plain English, safe to render verbatim. */
  message: string;
  retryAfterSeconds?: number;
};

export type NavProbeResponse =
  | {
      ok: true;
      chain: ChainId;
      address: `0x${string}`;
      probe: NavProbe;
      /** Whether a NAV history can be read at all. */
      readable: boolean;
      /** One sentence describing what was found, for the UI to show as-is. */
      summary: string;
    }
  | NavError;

export type NavCadence = "daily" | "weekly";

export type NavSeriesResponse =
  | {
      ok: true;
      chain: ChainId;
      address: `0x${string}`;
      probe: NavProbe;
      series: DaySeriesPoint[];
      annualizedApy: number;
      cadence: NavCadence;
      firstDate: string;
      lastDate: string;
      blockRange: [number, number];
      retrievedAt: string;
      /**
       * True when some closing blocks were taken from interpolation rather than
       * refined to the exact last block of the day. NAV moves far slower than a
       * block, so this is immaterial to the numbers — but it is recorded rather
       * than hidden.
       */
      approximateBlocks: boolean;
      /** Set when the window is too short for a backtest to mean anything. */
      warning?: string;
    }
  | NavError;
