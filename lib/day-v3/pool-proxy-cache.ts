export const DAY_V3_INVENTORY_PROXY_CACHE_TTL_MS = 10_000;

export type DayV3ProxyResponse = {
  status: number;
  body: string;
  contentType: string;
};

let cached: (DayV3ProxyResponse & { expiresAt: number }) | undefined;
let inFlight: Promise<DayV3ProxyResponse> | undefined;
const simulationInFlight = new Map<string, Promise<DayV3ProxyResponse>>();

export async function dayV3InventoryProxyCached(
  load: () => Promise<DayV3ProxyResponse>,
  now = Date.now(),
): Promise<DayV3ProxyResponse> {
  if (cached && cached.expiresAt > now) return cached;
  inFlight ??= load();
  try {
    const result = await inFlight;
    if (result.status === 200) {
      cached = {
        ...result,
        expiresAt: now + DAY_V3_INVENTORY_PROXY_CACHE_TTL_MS,
      };
    }
    return result;
  } finally {
    inFlight = undefined;
  }
}

export function resetDayV3InventoryProxyCacheForTests(): void {
  cached = undefined;
  inFlight = undefined;
}

/**
 * Multiple V3 tabs commonly ask for the same simulation at once. Share that
 * one upstream request instead of letting identical work trip the per-client
 * concurrency guard. Results are never cached: every later request still
 * refreshes the live policy.
 */
export async function dayV3SimulationProxyInFlight(
  key: string,
  load: () => Promise<DayV3ProxyResponse>,
): Promise<DayV3ProxyResponse> {
  const existing = simulationInFlight.get(key);
  if (existing) return existing;
  const request = load();
  simulationInFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (simulationInFlight.get(key) === request) {
      simulationInFlight.delete(key);
    }
  }
}

export function resetDayV3SimulationProxyForTests(): void {
  simulationInFlight.clear();
}
