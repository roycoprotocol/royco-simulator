import { createHmac, timingSafeEqual } from "node:crypto";

export const DAY_V3_API_MAX_BODY_BYTES = 32 * 1024;
export const DAY_V3_API_RATE_WINDOW_MS = 60_000;
export const DAY_V3_API_MAX_REQUESTS_PER_IP = 30;
export const DAY_V3_API_MAX_CONCURRENT_PER_IP = 2;
export const DAY_V3_API_MAX_CONCURRENT_GLOBAL = 6;
export const DAY_V3_API_MAX_TRACKED_IPS = 10_000;

type GuardState = {
  rateByIp: Map<string, number[]>;
  activeByIp: Map<string, number>;
  activeGlobal: number;
};
const state: GuardState = {
  rateByIp: new Map(),
  activeByIp: new Map(),
  activeGlobal: 0,
};

export class DayV3ApiError extends Error {
  constructor(
    public readonly status: 400 | 411 | 413 | 429 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DayV3ApiError";
  }
}

export function dayV3ClientIp(request: Request): string {
  const secret = process.env.DAWN_RWA_PROXY_SHARED_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const clientKey = request.headers.get("x-royco-rwa-client-key")?.trim();
  if (
    secret &&
    authorization &&
    clientKey &&
    /^[a-f0-9]{64}$/.test(clientKey)
  ) {
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authorization);
    if (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    ) {
      return `rwa:${clientKey}`;
    }
  }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Best-effort instance guard. Production infrastructure must also rate-limit. */
export function acquireDayV3ApiRequest(
  ip: string,
  now = Date.now(),
): () => void {
  const cutoff = now - DAY_V3_API_RATE_WINDOW_MS;
  if (
    !state.rateByIp.has(ip) &&
    state.rateByIp.size >= DAY_V3_API_MAX_TRACKED_IPS
  ) {
    for (const [trackedIp, entries] of state.rateByIp) {
      if (entries.every((entry) => entry <= cutoff))
        state.rateByIp.delete(trackedIp);
    }
    if (state.rateByIp.size >= DAY_V3_API_MAX_TRACKED_IPS) {
      const oldest = state.rateByIp.keys().next().value;
      if (typeof oldest === "string") state.rateByIp.delete(oldest);
    }
  }
  const recent = (state.rateByIp.get(ip) ?? []).filter(
    (entry) => entry > cutoff,
  );
  if (recent.length >= DAY_V3_API_MAX_REQUESTS_PER_IP) {
    throw new DayV3ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests. Retry after the rate-limit window.",
    );
  }
  const active = state.activeByIp.get(ip) ?? 0;
  if (active >= DAY_V3_API_MAX_CONCURRENT_PER_IP) {
    throw new DayV3ApiError(
      429,
      "IP_CONCURRENCY_LIMITED",
      "Too many requests are already running for this client.",
    );
  }
  if (state.activeGlobal >= DAY_V3_API_MAX_CONCURRENT_GLOBAL) {
    throw new DayV3ApiError(
      503,
      "SERVICE_BUSY",
      "The service is busy. Retry shortly.",
    );
  }
  recent.push(now);
  state.rateByIp.set(ip, recent);
  state.activeByIp.set(ip, active + 1);
  state.activeGlobal += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.activeGlobal = Math.max(0, state.activeGlobal - 1);
    const next = Math.max(0, (state.activeByIp.get(ip) ?? 1) - 1);
    if (next === 0) state.activeByIp.delete(ip);
    else state.activeByIp.set(ip, next);
  };
}

export function dayV3ServiceProxyHeaders(request: Request): HeadersInit {
  const secret = process.env.DAWN_RWA_PROXY_SHARED_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DAWN_RWA_PROXY_SHARED_SECRET is required in production.",
      );
    }
    return {};
  }
  const clientKey = createHmac("sha256", secret)
    .update(dayV3ClientIp(request))
    .digest("hex");
  return {
    authorization: `Bearer ${secret}`,
    "x-royco-rwa-client-key": clientKey,
  };
}

export async function readBoundedDayV3Body(request: Request): Promise<string> {
  const rawLength = request.headers.get("content-length");
  if (rawLength === null) {
    throw new DayV3ApiError(
      411,
      "CONTENT_LENGTH_REQUIRED",
      "Content-Length is required.",
    );
  }
  if (!/^\d+$/.test(rawLength)) {
    throw new DayV3ApiError(
      400,
      "INVALID_CONTENT_LENGTH",
      "Content-Length must be a non-negative integer.",
    );
  }
  const declared = Number(rawLength);
  if (!Number.isSafeInteger(declared) || declared > DAY_V3_API_MAX_BODY_BYTES) {
    throw new DayV3ApiError(
      413,
      "BODY_TOO_LARGE",
      `Requests are limited to ${DAY_V3_API_MAX_BODY_BYTES} bytes.`,
    );
  }
  if (declared === 0 || request.body === null) {
    throw new DayV3ApiError(400, "EMPTY_BODY", "The request body is empty.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > DAY_V3_API_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new DayV3ApiError(
        413,
        "BODY_TOO_LARGE",
        `Requests are limited to ${DAY_V3_API_MAX_BODY_BYTES} bytes.`,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readBoundedDayV3Json(request: Request): Promise<unknown> {
  const text = await readBoundedDayV3Body(request);
  try {
    return JSON.parse(text);
  } catch {
    throw new DayV3ApiError(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }
}

export function resetDayV3ApiGuardForTests(): void {
  state.rateByIp.clear();
  state.activeByIp.clear();
  state.activeGlobal = 0;
}
