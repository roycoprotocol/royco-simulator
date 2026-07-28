// =============================================================================
// Read-only JSON-RPC, ported from `scripts/data/extract-day-nav.mjs`.
// -----------------------------------------------------------------------------
// SERVER ONLY. Never import this from a client component.
//
// The script is the source of truth for this logic — it is what produced the
// NAV histories in `data/day-nav-provenance/`. It is a CLI with a top-level
// `await main()` and no exports, so it cannot be imported; this is a port.
// Keep the selectors, batch size and retry behaviour in sync with it.
//
// Two deliberate departures from the script, both forced by running inside a
// request rather than a terminal:
//   - the 1s inter-chunk sleep drops to 120ms, or a 105-date pull would spend
//     most of a minute asleep;
//   - the `/tmp` block cache is replaced by an in-memory one (see `cache.ts`),
//     because serverless instances do not share a filesystem.
// =============================================================================

import type { ChainId } from "@/lib/pool-creator/nav/types";

export const SELECTORS = {
  accountingToken: "0xda68cf8b",
  asset: "0x38d52e0f",
  convertToAssets: "0x07a2d13a",
  decimals: "0x313ce567",
  latestRoundData: "0xfeaf968c",
  shareToken: "0x6c9fa59e",
  // Not in the script; used only to prefill the pool's identity fields.
  symbol: "0x95d89b41",
  name: "0x06fdde03",
} as const;

export const CHAINS: Record<ChainId, { chainId: number; rpcUrl: string; blockscoutUrl: string }> = {
  ethereum: {
    chainId: 1,
    rpcUrl: process.env.ETHEREUM_RPC_URL ?? "https://eth-mainnet.public.blastapi.io",
    blockscoutUrl: "https://eth.blockscout.com/api",
  },
  arbitrum: {
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL ?? "https://arbitrum-one.public.blastapi.io",
    blockscoutUrl: "https://arbitrum.blockscout.com/api",
  },
};

const BATCH_SIZE = 20;
const INTER_CHUNK_DELAY_MS = 120;
const MAX_ATTEMPTS = 4;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly rateLimited: boolean = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const chunk = <T,>(values: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

export type RpcRequest = { jsonrpc: "2.0"; id: number; method: string; params: unknown[] };
export type RpcResponse = { id: number; result?: string | { timestamp: string }; error?: { message: string } };

let requestId = 0;
export const nextId = (): number => (requestId += 1);

/** Batched POST with retry, honouring `retry-after`. */
export async function rpcBatch(chain: ChainId, requests: RpcRequest[]): Promise<RpcResponse[]> {
  const { rpcUrl } = CHAINS[chain];
  const responses: RpcResponse[] = [];
  const requestChunks = chunk(requests, BATCH_SIZE);

  for (let index = 0; index < requestChunks.length; index += 1) {
    let lastError: UpstreamError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestChunks[index]),
          cache: "no-store",
        });
        if (!response.ok) {
          const retryAfter = Number(response.headers.get("retry-after") ?? 0);
          throw new UpstreamError(
            `${response.status} ${response.statusText}`,
            response.status === 429,
            retryAfter > 0 ? retryAfter : undefined,
          );
        }
        const body = await response.json();
        if (!Array.isArray(body)) {
          throw new UpstreamError(`RPC returned a non-array batch response`);
        }
        responses.push(...body);
        lastError = null;
        break;
      } catch (error) {
        lastError =
          error instanceof UpstreamError
            ? error
            : new UpstreamError((error as Error).message ?? "network error");
        if (attempt < MAX_ATTEMPTS) {
          await sleep(lastError.retryAfterSeconds ? lastError.retryAfterSeconds * 1000 : 600 * attempt);
        }
      }
    }
    if (lastError) throw lastError;
    if (index < requestChunks.length - 1) await sleep(INTER_CHUNK_DELAY_MS);
  }
  return responses;
}

/** A single call. Returns `null` when the call reverts, rather than throwing. */
export async function ethCall(
  chain: ChainId,
  to: string,
  data: string,
  block: string = "latest",
): Promise<string | null> {
  const [response] = await rpcBatch(chain, [
    { jsonrpc: "2.0", id: nextId(), method: "eth_call", params: [{ to, data }, block] },
  ]);
  if (!response || response.error) return null;
  const result = response.result;
  if (typeof result !== "string" || result === "0x") return null;
  return result;
}

// ---------------------------------------------------------------------------
// Minimal ABI decoding — only the shapes these six selectors return.
// ---------------------------------------------------------------------------

export const hexBlock = (blockNumber: number): string => `0x${blockNumber.toString(16)}`;
export const decodeUint = (hex: string): bigint => BigInt(hex);
export const decodeWord = (hex: string, index: number): bigint =>
  BigInt(`0x${hex.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
export const decodeAddress = (hex: string): `0x${string}` =>
  `0x${hex.slice(-40)}` as `0x${string}`;
export const encodeUintCall = (selector: string, value: bigint): string =>
  `${selector}${value.toString(16).padStart(64, "0")}`;
export const toDecimal = (value: bigint, decimals: number): number =>
  Number(value) / 10 ** decimals;

/**
 * Decode a `string` return. Handles both the ABI-encoded dynamic form and the
 * fixed `bytes32` form some older tokens (MKR and friends) still use.
 */
export function decodeString(hex: string | null): string {
  if (!hex || hex === "0x") return "";
  const body = hex.slice(2);
  try {
    if (body.length >= 128) {
      const offset = Number(BigInt(`0x${body.slice(0, 64)}`));
      if (offset === 32) {
        const length = Number(BigInt(`0x${body.slice(64, 128)}`));
        if (length > 0 && length <= 256 && body.length >= 128 + length * 2) {
          const bytes = body.slice(128, 128 + length * 2);
          return hexToUtf8(bytes);
        }
      }
    }
    // bytes32: trailing zero padding.
    return hexToUtf8(body.slice(0, 64)).replace(/\0+$/, "");
  } catch {
    return "";
  }
}

function hexToUtf8(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder()
    .decode(bytes)
    .replace(/\0/g, "")
    .trim();
}

/** Loose EIP-55-agnostic shape check. We do not checksum-validate. */
export const isAddressShape = (value: string): value is `0x${string}` =>
  /^0x[0-9a-fA-F]{40}$/.test(value);

export const normalizeAddress = (address: string): `0x${string}` =>
  address.toLowerCase() as `0x${string}`;

export { sleep };
