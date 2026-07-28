// =============================================================================
// In-memory caches and rate limiting. SERVER ONLY.
// -----------------------------------------------------------------------------
// The extractor script caches resolved blocks to `/tmp`; that does not port to
// serverless, where instances share no filesystem. These live at module scope,
// so they survive warm invocations and are lost on a cold start — which is the
// correct trade here: a miss costs latency, never correctness.
//
// The rate limiter is per-instance and therefore SOFT. It raises the cost of
// casual scraping; it is not a security control. Anything stronger needs a
// shared store (Vercel KV / Edge Config).
// =============================================================================

type Entry<T> = { value: T; expiresAt: number };

class Lru<T> {
  private readonly map = new Map<string, Entry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }
}

/** Probe results, keyed `chain:address`. */
export const probeCache = new Lru<unknown>(300, 6 * 60 * 60 * 1000);

/** Full series pulls, keyed `chain:address:start:end:cadence`. */
export const seriesCache = new Lru<unknown>(120, 6 * 60 * 60 * 1000);

/**
 * Resolved closing blocks, keyed `chain:date`. Kept separate because block
 * lookups are the slowest upstream and are shared across every vault on a
 * chain — one user's pull warms the next user's.
 */
export const blockCache = new Lru<number>(4000, 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Token bucket
// ---------------------------------------------------------------------------

type Bucket = { tokens: number; lastRefill: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function takeToken(
  key: string,
  { capacity, refillPerMinute }: { capacity: number; refillPerMinute: number },
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: now };
  const elapsedMinutes = (now - bucket.lastRefill) / 60_000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedMinutes * refillPerMinute);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const secondsToNext = Math.ceil(((1 - bucket.tokens) / refillPerMinute) * 60);
    return { allowed: false, retryAfterSeconds: Math.max(1, secondsToNext) };
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  // Keep the map from growing without bound on a long-lived instance.
  if (buckets.size > 5000) buckets.clear();
  return { allowed: true };
}

export const clientKey = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  request.headers.get("x-real-ip") ??
  "unknown";
