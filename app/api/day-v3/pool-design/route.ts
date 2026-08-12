import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_PATH = "/api/deploy-market/pool-design/v1";

function serviceUrl(): URL | null {
  const configured = process.env.DAY_V3_POOL_DESIGN_SERVICE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
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

function unresolved(message: string, status = 503) {
  return NextResponse.json(
    {
      schemaVersion: "1.0",
      modelVersion: "day-v3-eclp-goal-solver-1.0.0",
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

  try {
    const upstream = await fetch(url, {
      method,
      body: method === "POST" ? await request.text() : undefined,
      headers:
        method === "POST" ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return unresolved(
      "The canonical RWA pool-design service could not be reached. No fee or pool parameters were assumed.",
    );
  }
}

export async function GET(request: Request) {
  return forward(request, "GET");
}

export async function POST(request: Request) {
  return forward(request, "POST");
}
