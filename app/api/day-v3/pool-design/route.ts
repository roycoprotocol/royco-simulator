import { NextResponse } from "next/server";

import {
  acquireDayV3ApiRequest,
  DayV3ApiError,
  dayV3ClientIp,
  dayV3ServiceProxyHeaders,
  readBoundedDayV3Body,
} from "@/lib/day-v3/request-guard";
import { dayV3InventoryProxyCached } from "@/lib/day-v3/pool-proxy-cache";
import {
  DAY_V3_POOL_DESIGN_MODEL,
  DAY_V3_POOL_DESIGN_SCHEMA,
} from "@/lib/day-v3/pool-design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_PATH = "/api/deploy-market/pool-design/v1";
const MAX_UPSTREAM_BYTES = 512 * 1024;

function serviceUrl(): URL | null {
  const configured = process.env.DAY_V3_POOL_DESIGN_SERVICE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
        return null;
      return url;
    } catch {
      return null;
    }
  }

  // The companion RWA frontend runs separately in local development. There is
  // deliberately no production default: a missing canonical service must leave
  // the recommendation unresolved rather than switching to local pool math.
  return process.env.NODE_ENV === "development"
    ? new URL(`http://127.0.0.1:3002${API_PATH}`)
    : null;
}

async function boundedUpstreamText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPSTREAM_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("The canonical service returned an oversized response.");
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

function unresolved(message: string, status = 503) {
  return NextResponse.json(
    {
      schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
      modelVersion: DAY_V3_POOL_DESIGN_MODEL,
      status: "unresolved",
      recommendation: null,
      issues: [{ code: "POOL_DESIGN_SERVICE_UNAVAILABLE", message }],
    },
    {
      status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

async function forward(request: Request, method: "GET" | "POST") {
  const url = serviceUrl();
  if (!url) {
    return unresolved(
      "The canonical RWA pool-design service is not configured. No fee or pool parameters were assumed.",
    );
  }

  let release: (() => void) | undefined;
  try {
    release = acquireDayV3ApiRequest(dayV3ClientIp(request));
    const body =
      method === "POST" ? await readBoundedDayV3Body(request) : undefined;
    const load = async () => {
      const upstream = await fetch(url, {
        method,
        body,
        headers: {
          ...dayV3ServiceProxyHeaders(request),
          ...(method === "POST"
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(
                  new TextEncoder().encode(body).byteLength,
                ),
              }
            : {}),
        },
        cache: "no-store",
        // The canonical solver validates a discrete E-CLP search and can take
        // longer than 20 seconds for an infeasible boundary case. Cutting it
        // off early incorrectly turns a valid infeasible answer into a service
        // outage, so the proxy allows the solver's bounded search to finish.
        signal: AbortSignal.timeout(60_000),
      });
      return {
        status: upstream.status,
        body: await boundedUpstreamText(upstream),
        contentType: upstream.headers.get("content-type") ?? "application/json",
      };
    };
    const result =
      method === "GET" ? await dayV3InventoryProxyCached(load) : await load();
    return new Response(result.body, {
      status: result.status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": result.contentType,
      },
    });
  } catch (error) {
    if (error instanceof DayV3ApiError) {
      return unresolved(error.message, error.status);
    }
    return unresolved(
      "The canonical RWA pool-design service could not be reached. No fee or pool parameters were assumed.",
    );
  } finally {
    release?.();
  }
}

export async function GET(request: Request) {
  return forward(request, "GET");
}

export async function POST(request: Request) {
  return forward(request, "POST");
}
