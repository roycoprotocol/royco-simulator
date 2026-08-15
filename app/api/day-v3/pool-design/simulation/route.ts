import { NextResponse } from "next/server";

import { DAY_V3_POOL_DESIGN_MODEL } from "@/lib/day-v3/pool-design";
import { DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA } from "@/lib/day-v3/simulation-pool-design";
import {
  acquireDayV3ApiRequest,
  DayV3ApiError,
  dayV3ClientIp,
  dayV3ServiceProxyHeaders,
  readBoundedDayV3Body,
} from "@/lib/day-v3/request-guard";
import { dayV3SimulationProxyInFlight } from "@/lib/day-v3/pool-proxy-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIMULATION_API_PATH = "/api/deploy-market/pool-design/simulation/v1";
const MAX_UPSTREAM_BYTES = 512 * 1024;

function validatedServiceUrl(configured: string): URL | null {
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

function serviceUrl(): URL | null {
  const simulation =
    process.env.DAY_V3_POOL_DESIGN_SIMULATION_SERVICE_URL?.trim();
  if (simulation) return validatedServiceUrl(simulation);

  const deployment = process.env.DAY_V3_POOL_DESIGN_SERVICE_URL?.trim();
  if (deployment) {
    const url = validatedServiceUrl(deployment);
    if (!url) return null;
    url.pathname = SIMULATION_API_PATH;
    url.search = "";
    url.hash = "";
    return url;
  }

  return process.env.NODE_ENV === "development"
    ? new URL(`http://127.0.0.1:3002${SIMULATION_API_PATH}`)
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
      schemaVersion: DAY_V3_SIMULATION_POOL_DESIGN_SCHEMA,
      modelVersion: DAY_V3_POOL_DESIGN_MODEL,
      mode: "simulation",
      status: "unresolved",
      policy: null,
      deployment: null,
      recommendation: null,
      issues: [{ code: "POOL_DESIGN_SERVICE_UNAVAILABLE", message }],
    },
    {
      status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

export async function POST(request: Request) {
  const url = serviceUrl();
  if (!url) {
    return unresolved(
      "The canonical RWA simulation service is not configured. No fee or pool parameters were assumed.",
    );
  }

  let release: (() => void) | undefined;
  try {
    const body = await readBoundedDayV3Body(request);
    const clientIp = dayV3ClientIp(request);
    const key = `${clientIp}\n${url.toString()}\n${body}`;
    const result = await dayV3SimulationProxyInFlight(key, async () => {
      release = acquireDayV3ApiRequest(clientIp);
      try {
        const upstream = await fetch(url, {
          method: "POST",
          body,
          headers: {
            ...dayV3ServiceProxyHeaders(request),
            "Content-Type": "application/json",
            "Content-Length": String(new TextEncoder().encode(body).byteLength),
          },
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        return {
          status: upstream.status,
          body: await boundedUpstreamText(upstream),
          contentType:
            upstream.headers.get("content-type") ?? "application/json",
        };
      } finally {
        release?.();
        release = undefined;
      }
    });
    return new Response(result.body, {
      status: result.status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": result.contentType,
        ...(result.status === 429 || result.status >= 500
          ? { "Retry-After": "1" }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof DayV3ApiError) {
      return unresolved(error.message, error.status);
    }
    return unresolved(
      "The canonical RWA simulation service could not be reached. No fee or pool parameters were assumed.",
    );
  } finally {
    release?.();
  }
}
