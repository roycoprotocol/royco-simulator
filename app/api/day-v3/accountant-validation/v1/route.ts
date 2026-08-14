import { NextResponse } from "next/server";

import {
  DAY_V3_ACCOUNTANT_VALIDATION_MODEL,
  DAY_V3_ACCOUNTANT_VALIDATION_SCHEMA,
  parseDayV3AccountantValidationRequest,
  rejectedDayV3AccountantValidation,
  validateDayV3AccountantTerms,
} from "@/lib/day-v3/accountant-validation";
import {
  acquireDayV3ApiRequest,
  DayV3ApiError,
  dayV3ClientIp,
  readBoundedDayV3Json,
} from "@/lib/day-v3/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 15_000;
const CACHE_LIMIT = 128;
type Cached = { expiresAt: number; body: Record<string, unknown> };
const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<Record<string, unknown>>>();

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function transportRejection(error: DayV3ApiError) {
  return response(
    rejectedDayV3AccountantValidation([
      { code: error.code, path: "request", message: error.message },
    ]),
    error.status,
  );
}

function cacheResult(key: string, body: Record<string, unknown>) {
  const now = Date.now();
  for (const [cachedKey, item] of cache) {
    if (item.expiresAt <= now) cache.delete(cachedKey);
  }
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (typeof oldest === "string") cache.delete(oldest);
  }
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, body });
}

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    release = acquireDayV3ApiRequest(dayV3ClientIp(request));
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new DayV3ApiError(
        400,
        "INVALID_CONTENT_TYPE",
        "Content-Type must be application/json.",
      );
    }
    const parsed = parseDayV3AccountantValidationRequest(
      await readBoundedDayV3Json(request),
    );
    if (!parsed.ok) {
      return response(rejectedDayV3AccountantValidation(parsed.issues), 400);
    }

    // Only a fully schema-validated request reaches dedupe or the short cache.
    // Malformed input can never occupy cache or in-flight capacity.
    const key = stableJson(parsed.request);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return response(
        cached.body,
        cached.body.status === "validated" ? 200 : 400,
      );
    }
    let pending = inFlight.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() =>
        validateDayV3AccountantTerms(parsed.request),
      );
      inFlight.set(key, pending);
    }
    try {
      const body = await pending;
      cacheResult(key, body);
      return response(body, body.status === "validated" ? 200 : 400);
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    }
  } catch (error) {
    if (error instanceof DayV3ApiError) return transportRejection(error);
    return response(
      rejectedDayV3AccountantValidation([
        {
          code: "VALIDATION_UNAVAILABLE",
          path: "request",
          message: "The shared accountant could not complete validation.",
        },
      ]),
      503,
    );
  } finally {
    release?.();
  }
}

// Keep version constants present in this route's compiled boundary.
void DAY_V3_ACCOUNTANT_VALIDATION_SCHEMA;
void DAY_V3_ACCOUNTANT_VALIDATION_MODEL;
