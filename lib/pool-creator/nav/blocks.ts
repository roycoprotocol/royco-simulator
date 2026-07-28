// =============================================================================
// Date → closing block resolution. SERVER ONLY.
// -----------------------------------------------------------------------------
// Ported from `blocksAtOrBefore` in `scripts/data/extract-day-nav.mjs`: two
// Blockscout anchors, linear interpolation between them, then bounded
// refinement rounds over `eth_getBlockByNumber`.
//
// The script refines until every date lands on the exact last block before
// midnight UTC. Inside a request we cap the rounds and accept the interpolated
// block for any stragglers — a NAV moves far more slowly than a block, so the
// price is identical either way, and the response flags that it happened rather
// than quietly presenting an estimate as exact.
// =============================================================================

import { blockCache } from "@/lib/pool-creator/nav/cache";
import {
  CHAINS,
  UpstreamError,
  decodeUint,
  hexBlock,
  nextId,
  rpcBatch,
  sleep,
} from "@/lib/pool-creator/nav/rpc";
import type { ChainId } from "@/lib/pool-creator/nav/types";

const MAX_REFINEMENT_ROUNDS = 5;

export type DateBlock = { date: string; blockNumber: number; targetTimestamp: number };

/** Midnight-close for a date, never in the future. */
export function dayEndTimestamp(date: string): number {
  const end = Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000);
  return Math.min(end, Math.floor(Date.now() / 1000));
}

export function enumerateDates(startDate: string, endDate: string, stepDays: number): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (
    let timestamp = Date.parse(`${startDate}T00:00:00Z`);
    timestamp <= end;
    timestamp += stepDays * 86_400_000
  ) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  // Always include the final date so the window ends where the user asked.
  const last = new Date(end).toISOString().slice(0, 10);
  if (dates[dates.length - 1] !== last) dates.push(last);
  return dates;
}

async function blockAtOrBeforeTimestamp(chain: ChainId, timestamp: number): Promise<number> {
  const url = new URL(CHAINS[chain].blockscoutUrl);
  url.searchParams.set("module", "block");
  url.searchParams.set("action", "getblocknobytime");
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("closest", "before");

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const body = await response.json();
      const blockNumber = Number(body?.result?.blockNumber ?? body?.result);
      if (!Number.isSafeInteger(blockNumber) || blockNumber <= 0) {
        throw new Error("unexpected block-lookup response");
      }
      return blockNumber;
    } catch (error) {
      lastError = error as Error;
      if (attempt < 3) await sleep(500 * attempt);
    }
  }
  throw new UpstreamError(`Could not resolve a block for ${chain}: ${lastError?.message}`);
}

async function blockTimestamps(chain: ChainId, blockNumbers: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)].filter((n) => n > 0);
  if (unique.length === 0) return new Map();

  const idToBlock = new Map<number, number>();
  const requests = unique.map((blockNumber) => {
    const id = nextId();
    idToBlock.set(id, blockNumber);
    return {
      jsonrpc: "2.0" as const,
      id,
      method: "eth_getBlockByNumber",
      params: [hexBlock(blockNumber), false] as unknown[],
    };
  });

  const responses = await rpcBatch(chain, requests);
  const out = new Map<number, number>();
  for (const response of responses) {
    const blockNumber = idToBlock.get(response.id);
    if (blockNumber === undefined) continue;
    const result = response.result;
    if (!result || typeof result === "string" || !result.timestamp) continue;
    out.set(blockNumber, Number(decodeUint(result.timestamp)));
  }
  return out;
}

/**
 * Resolve every date to the last block at or before its midnight close.
 * Returns the blocks plus whether any were left on an interpolated estimate.
 */
export async function resolveDateBlocks(
  chain: ChainId,
  dates: string[],
): Promise<{ blocks: DateBlock[]; approximate: boolean }> {
  const targets = dates.map((date) => ({ date, targetTimestamp: dayEndTimestamp(date) }));

  // Serve whatever the shared block cache already knows.
  const cached = new Map<string, number>();
  for (const { date } of targets) {
    const hit = blockCache.get(`${chain}:${date}`);
    if (hit !== undefined) cached.set(date, hit);
  }
  const pending = targets.filter((t) => !cached.has(t.date));

  if (pending.length === 0) {
    return {
      blocks: targets.map((t) => ({ ...t, blockNumber: cached.get(t.date)! })),
      approximate: false,
    };
  }

  const firstTarget = pending[0].targetTimestamp;
  const lastTarget = pending[pending.length - 1].targetTimestamp;
  const firstBlock = await blockAtOrBeforeTimestamp(chain, firstTarget);
  const lastBlock =
    pending.length === 1 ? firstBlock : await blockAtOrBeforeTimestamp(chain, lastTarget);

  const anchors = await blockTimestamps(chain, [firstBlock, lastBlock]);
  const firstTs = anchors.get(firstBlock);
  const lastTs = anchors.get(lastBlock);
  if (firstTs === undefined || lastTs === undefined) {
    throw new UpstreamError("Could not read anchor block timestamps");
  }
  const secondsPerBlock =
    lastBlock === firstBlock ? 12 : (lastTs - firstTs) / (lastBlock - firstBlock);

  const states = pending.map(({ date, targetTimestamp }) => ({
    date,
    targetTimestamp,
    blockNumber: Math.max(
      firstBlock,
      Math.min(
        lastBlock,
        Math.round(firstBlock + (targetTimestamp - firstTs) / (secondsPerBlock || 12)),
      ),
    ),
    resolved: false,
  }));

  for (
    let round = 0;
    round < MAX_REFINEMENT_ROUNDS && states.some((s) => !s.resolved);
    round += 1
  ) {
    const unresolved = states.filter((s) => !s.resolved);
    const timestamps = await blockTimestamps(
      chain,
      unresolved.flatMap((s) => [s.blockNumber, s.blockNumber + 1]),
    );
    for (const state of unresolved) {
      const current = timestamps.get(state.blockNumber);
      const next = timestamps.get(state.blockNumber + 1);
      if (current === undefined || next === undefined) {
        // Past the chain head: clamp and take it.
        state.resolved = true;
        continue;
      }
      if (current <= state.targetTimestamp && next > state.targetTimestamp) {
        state.resolved = true;
        continue;
      }
      state.blockNumber =
        current > state.targetTimestamp
          ? state.blockNumber -
            Math.max(1, Math.ceil((current - state.targetTimestamp) / (secondsPerBlock || 12)))
          : state.blockNumber +
            Math.max(1, Math.floor((state.targetTimestamp - next) / (secondsPerBlock || 12)) + 1);
      state.blockNumber = Math.max(firstBlock, Math.min(lastBlock, state.blockNumber));
    }
  }

  const approximate = states.some((s) => !s.resolved);
  for (const state of states) {
    if (state.resolved) blockCache.set(`${chain}:${state.date}`, state.blockNumber);
    cached.set(state.date, state.blockNumber);
  }

  return {
    blocks: targets.map((t) => ({ ...t, blockNumber: cached.get(t.date)! })),
    approximate,
  };
}
