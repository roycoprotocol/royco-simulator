// =============================================================================
// Historical NAV extraction. SERVER ONLY.
// -----------------------------------------------------------------------------
// Ported from `extractAsset` in `scripts/data/extract-day-nav.mjs`: one
// `eth_call` per date at that date's closing block, decoded per contract kind.
// =============================================================================

import { resolveDateBlocks, enumerateDates, type DateBlock } from "@/lib/pool-creator/nav/blocks";
import {
  decodeUint,
  decodeWord,
  hexBlock,
  nextId,
  rpcBatch,
  toDecimal,
} from "@/lib/pool-creator/nav/rpc";
import type { NavCall } from "@/lib/pool-creator/nav/probe";
import type { ChainId, NavCadence } from "@/lib/pool-creator/nav/types";
import type { DaySeriesPoint } from "@/lib/day-simulator-template/market";

/**
 * Hard caps. A 2-year weekly pull is ~105 dates, which is comfortably inside a
 * request budget and loses nothing: the engine handles irregular spacing
 * natively (`dtSec` comes from date deltas), so weekly costs no fidelity while
 * daily over the same window would cost 7× the upstream calls.
 */
export const MAX_OBSERVATIONS = 400;
export const MAX_LOOKBACK_DAYS = 730;
/** Below this a backtest is not evidence of anything, and we say so. */
export const MIN_MEANINGFUL_DAYS = 60;

export const cadenceStepDays = (cadence: NavCadence): number => (cadence === "daily" ? 1 : 7);

export type ExtractResult = {
  series: DaySeriesPoint[];
  blockRange: [number, number];
  approximateBlocks: boolean;
};

export async function extractSeries(
  chain: ChainId,
  address: `0x${string}`,
  navCall: NavCall,
  startDate: string,
  endDate: string,
  cadence: NavCadence,
): Promise<ExtractResult> {
  const dates = enumerateDates(startDate, endDate, cadenceStepDays(cadence));
  if (dates.length > MAX_OBSERVATIONS) {
    throw new Error(
      `That window needs ${dates.length} reads; the limit is ${MAX_OBSERVATIONS}. Try a weekly cadence or a shorter window.`,
    );
  }

  const { blocks, approximate } = await resolveDateBlocks(chain, dates);
  const rows = await batchCalls(chain, address, navCall.callData, blocks);

  const series: DaySeriesPoint[] = [];
  for (const row of rows) {
    if (!row.result || row.result === "0x") continue;
    try {
      if (navCall.kind === "chainlink") {
        const answer = decodeWord(row.result, 1);
        const updatedAt = Number(decodeWord(row.result, 3));
        if (answer <= 0n || updatedAt === 0) continue;
        series.push({ date: row.date, price: toDecimal(answer, navCall.outputDecimals) });
      } else {
        const answer = decodeUint(row.result);
        if (answer <= 0n) continue;
        series.push({ date: row.date, price: toDecimal(answer, navCall.outputDecimals) });
      }
    } catch {
      // Calls before deployment or initialisation return non-standard data.
      // The script omits these too rather than inventing a value.
    }
  }

  series.sort((a, b) => a.date.localeCompare(b.date));
  const deduped = series.filter((p, i) => i === 0 || p.date !== series[i - 1].date);

  const used = blocks.map((b) => b.blockNumber);
  return {
    series: deduped,
    blockRange: [Math.min(...used), Math.max(...used)],
    approximateBlocks: approximate,
  };
}

type CallRow = { date: string; blockNumber: number; result?: string };

async function batchCalls(
  chain: ChainId,
  contract: string,
  callData: string,
  dateBlocks: DateBlock[],
): Promise<CallRow[]> {
  const idToMeta = new Map<number, { date: string; blockNumber: number }>();
  const requests = dateBlocks.map(({ date, blockNumber }) => {
    const id = nextId();
    idToMeta.set(id, { date, blockNumber });
    return {
      jsonrpc: "2.0" as const,
      id,
      method: "eth_call",
      params: [{ to: contract, data: callData }, hexBlock(blockNumber)] as unknown[],
    };
  });

  const responses = await rpcBatch(chain, requests);
  const rows: CallRow[] = [];
  for (const response of responses) {
    const meta = idToMeta.get(response.id);
    if (!meta) continue;
    rows.push({
      ...meta,
      result: typeof response.result === "string" ? response.result : undefined,
    });
  }
  return rows;
}

/** Clamp a requested window to the caps, returning what will actually be read. */
export function clampWindow(
  startDate: string,
  endDate: string,
  cadence: NavCadence,
): { startDate: string; endDate: string; cadence: NavCadence } {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const start = Math.max(
    Date.parse(`${startDate}T00:00:00Z`),
    end - MAX_LOOKBACK_DAYS * 86_400_000,
  );
  const spanDays = Math.round((end - start) / 86_400_000);

  // Step up to weekly when daily would blow the observation cap.
  const effective: NavCadence =
    cadence === "daily" && spanDays > MAX_OBSERVATIONS ? "weekly" : cadence;

  return {
    startDate: new Date(start).toISOString().slice(0, 10),
    endDate: new Date(end).toISOString().slice(0, 10),
    cadence: effective,
  };
}
