// =============================================================================
// GET /create/nav — read-only on-chain NAV reader for the pool creator.
// -----------------------------------------------------------------------------
//   ?mode=probe&chain=ethereum&address=0x…
//   ?mode=series&chain=…&address=…&start=YYYY-MM-DD&end=YYYY-MM-DD&cadence=weekly
//
// GET-only so the response is CDN-cacheable and a repeated pull of the same
// vault costs nothing. Read-only throughout: `eth_call` and
// `eth_getBlockByNumber`, nothing else. No key material, no writes.
//
// This is an unauthenticated proxy onto public RPC endpoints, so it is capped
// in three ways: hard window/observation limits (`extract.ts`), a per-instance
// token bucket, and a probe-before-series handshake that makes drive-by
// scraping cost two round trips instead of one.
// =============================================================================

import { probeCache, seriesCache, takeToken, clientKey } from "@/lib/pool-creator/nav/cache";
import {
  clampWindow,
  extractSeries,
  MIN_MEANINGFUL_DAYS,
} from "@/lib/pool-creator/nav/extract";
import { describeProbe, isReadable, probeContract, type NavCall } from "@/lib/pool-creator/nav/probe";
import { UpstreamError, isAddressShape, normalizeAddress } from "@/lib/pool-creator/nav/rpc";
import type {
  ChainId,
  NavCadence,
  NavError,
  NavErrorCode,
  NavProbeResponse,
  NavSeriesResponse,
} from "@/lib/pool-creator/nav/types";
import { seriesApy } from "@/lib/pool-creator/preview";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CHAINS: ChainId[] = ["ethereum", "arbitrum"];

const STATUS: Record<NavErrorCode, number> = {
  BAD_ADDRESS: 400,
  UNSUPPORTED_CHAIN: 400,
  BAD_REQUEST: 400,
  NOT_A_VAULT: 422,
  NO_HISTORY: 422,
  TOO_YOUNG: 422,
  NEEDS_PROBE_FIRST: 409,
  CLIENT_RATE_LIMIT: 429,
  UPSTREAM_RATE_LIMIT: 503,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
};

function fail(code: NavErrorCode, message: string, retryAfterSeconds?: number): Response {
  const body: NavError = { ok: false, code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : null) };
  return Response.json(body, {
    status: STATUS[code],
    headers: {
      "cache-control": "no-store",
      ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : null),
    },
  });
}

/** Successful reads are shared: same vault + window is a CDN hit for everyone. */
const CACHEABLE = "public, s-maxage=21600, stale-while-revalidate=604800";

const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

type ProbeEntry = { probe: Awaited<ReturnType<typeof probeContract>>["probe"]; navCall: NavCall | null };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "probe";
  const chain = url.searchParams.get("chain") ?? "";
  const rawAddress = (url.searchParams.get("address") ?? "").trim();

  if (!CHAINS.includes(chain as ChainId)) {
    return fail("UNSUPPORTED_CHAIN", `We can read Ethereum and Arbitrum. "${chain}" isn't supported yet.`);
  }
  if (!isAddressShape(rawAddress)) {
    return fail("BAD_ADDRESS", "That doesn't look like a contract address. It should be 0x followed by 40 hex characters.");
  }

  const chainId = chain as ChainId;
  const address = normalizeAddress(rawAddress);
  const bucketKey = `${clientKey(request)}:${mode}`;

  const limit = takeToken(
    bucketKey,
    mode === "series" ? { capacity: 3, refillPerMinute: 4 } : { capacity: 5, refillPerMinute: 10 },
  );
  if (!limit.allowed) {
    return fail(
      "CLIENT_RATE_LIMIT",
      `That's a lot of lookups. Try again in ${limit.retryAfterSeconds}s.`,
      limit.retryAfterSeconds,
    );
  }

  try {
    return mode === "series"
      ? await handleSeries(request, url, chainId, address)
      : await handleProbe(chainId, address);
  } catch (error) {
    if (error instanceof UpstreamError) {
      return error.rateLimited
        ? fail("UPSTREAM_RATE_LIMIT", "The public RPC endpoint is rate-limiting us. Try again shortly.", error.retryAfterSeconds ?? 20)
        : fail("UPSTREAM_ERROR", `We couldn't reach the ${chainId} RPC endpoint: ${error.message}`);
    }
    return fail("UPSTREAM_ERROR", (error as Error).message || "Something went wrong reading that contract.");
  }
}

// ---------------------------------------------------------------------------

async function handleProbe(chain: ChainId, address: `0x${string}`): Promise<Response> {
  const key = `${chain}:${address}`;
  let entry = probeCache.get(key) as ProbeEntry | undefined;
  if (!entry) {
    entry = await probeContract(chain, address);
    probeCache.set(key, entry);
  }

  const body: NavProbeResponse = {
    ok: true,
    chain,
    address,
    probe: entry.probe,
    readable: isReadable(entry.probe),
    summary: describeProbe(entry.probe),
  };
  // A probe is cheap and its answer is stable; cache it hard.
  return Response.json(body, { headers: { "cache-control": CACHEABLE } });
}

async function handleSeries(
  request: Request,
  url: URL,
  chain: ChainId,
  address: `0x${string}`,
): Promise<Response> {
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const cadenceParam = (url.searchParams.get("cadence") ?? "weekly") as NavCadence;

  if (!isIsoDate(start) || !isIsoDate(end)) {
    return fail("BAD_REQUEST", "Both start and end need to be YYYY-MM-DD dates.");
  }
  if (Date.parse(`${start}T00:00:00Z`) >= Date.parse(`${end}T00:00:00Z`)) {
    return fail("BAD_REQUEST", "The start date has to come before the end date.");
  }
  if (cadenceParam !== "daily" && cadenceParam !== "weekly") {
    return fail("BAD_REQUEST", "Cadence must be daily or weekly.");
  }

  // The handshake: a series pull is only served for a contract already probed
  // on this instance, so scraping costs two round trips rather than one.
  const probeKey = `${chain}:${address}`;
  const probed = probeCache.get(probeKey) as ProbeEntry | undefined;
  if (!probed) {
    return fail("NEEDS_PROBE_FIRST", "Check the address first, then pull its history.");
  }
  if (!probed.navCall) {
    return fail(
      "NOT_A_VAULT",
      describeProbe(probed.probe),
    );
  }

  const window = clampWindow(start, end, cadenceParam);
  const cacheKey = `${chain}:${address}:${window.startDate}:${window.endDate}:${window.cadence}`;
  const cached = seriesCache.get(cacheKey) as NavSeriesResponse | undefined;
  if (cached) {
    return Response.json(cached, { headers: { "cache-control": CACHEABLE } });
  }

  const { series, blockRange, approximateBlocks } = await extractSeries(
    chain,
    address,
    probed.navCall,
    window.startDate,
    window.endDate,
    window.cadence,
  );

  if (series.length < 2) {
    return fail(
      "NO_HISTORY",
      "We reached the contract but it returned no usable values over that window. It may not have existed yet — try a later start date.",
    );
  }

  const spanDays = Math.round(
    (Date.parse(`${series[series.length - 1].date}T00:00:00Z`) -
      Date.parse(`${series[0].date}T00:00:00Z`)) /
      86_400_000,
  );

  const body: NavSeriesResponse = {
    ok: true,
    chain,
    address,
    probe: probed.probe,
    series,
    annualizedApy: seriesApy(series),
    cadence: window.cadence,
    firstDate: series[0].date,
    lastDate: series[series.length - 1].date,
    blockRange,
    retrievedAt: new Date().toISOString(),
    approximateBlocks,
    ...(spanDays < MIN_MEANINGFUL_DAYS
      ? {
          warning:
            `This history covers only ${spanDays} days. A backtest over a window this short is not evidence of how the strategy behaves.`,
        }
      : null),
  };

  seriesCache.set(cacheKey, body);
  return Response.json(body, { headers: { "cache-control": CACHEABLE } });
}
