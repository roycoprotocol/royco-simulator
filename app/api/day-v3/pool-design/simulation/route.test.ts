import assert from "node:assert/strict";

import { POST } from "./route";
import {
  DAY_V3_API_MAX_BODY_BYTES,
  resetDayV3ApiGuardForTests,
} from "@/lib/day-v3/request-guard";
import { resetDayV3SimulationProxyForTests } from "@/lib/day-v3/pool-proxy-cache";

const requestBody = JSON.stringify({
  schemaVersion: "1.1",
  goals: {
    protectedDrawdownPct: 15,
    recoveryDays: 20,
    immediateExitSharePct: 10,
    minimumProceedsPer100: 95,
  },
  context: { sourceApyPct: 6, swapFeeBps: 10 },
});

function request(body = requestBody, declaredLength?: number) {
  return new Request("http://localhost/api/day-v3/pool-design/simulation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(
        declaredLength ?? new TextEncoder().encode(body).byteLength,
      ),
      "x-forwarded-for": "203.0.113.44",
    },
    body,
  });
}

async function main() {
  const mutableEnv = process.env as unknown as Record<
    string,
    string | undefined
  >;
  const previous = {
    simulation: process.env.DAY_V3_POOL_DESIGN_SIMULATION_SERVICE_URL,
    deployment: process.env.DAY_V3_POOL_DESIGN_SERVICE_URL,
    secret: process.env.DAWN_RWA_PROXY_SHARED_SECRET,
    nodeEnv: process.env.NODE_ENV,
  };
  const originalFetch = globalThis.fetch;

  try {
    process.env.DAY_V3_POOL_DESIGN_SIMULATION_SERVICE_URL = "not-a-url";
    delete process.env.DAY_V3_POOL_DESIGN_SERVICE_URL;
    let response = await POST(request());
    let body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.mode, "simulation");
    assert.equal(body.status, "unresolved");
    assert.equal(body.policy, null);
    assert.equal(body.recommendation, null);
    assert.equal(JSON.stringify(body).includes("swapFee"), false);
    assert.match(
      body.issues[0].message,
      /No fee or pool parameters were assumed/,
    );

    delete process.env.DAY_V3_POOL_DESIGN_SIMULATION_SERVICE_URL;
    process.env.DAY_V3_POOL_DESIGN_SERVICE_URL =
      "http://rwa.example.test/api/deploy-market/pool-design/v1";
    mutableEnv.NODE_ENV = "production";
    response = await POST(request());
    assert.equal(
      response.status,
      503,
      "production must reject an HTTP service",
    );

    mutableEnv.NODE_ENV = "test";
    process.env.DAY_V3_POOL_DESIGN_SERVICE_URL =
      "https://rwa.example.test/api/deploy-market/pool-design/v1?ignored=yes";
    process.env.DAWN_RWA_PROXY_SHARED_SECRET = "shared-test-secret";
    resetDayV3ApiGuardForTests();
    let upstreamCalls = 0;
    globalThis.fetch = async (input, init) => {
      upstreamCalls += 1;
      assert.equal(
        String(input),
        "https://rwa.example.test/api/deploy-market/pool-design/simulation/v1",
      );
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, requestBody);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("content-type"), "application/json");
      assert.equal(
        headers.get("content-length"),
        String(new TextEncoder().encode(requestBody).byteLength),
      );
      assert.equal(headers.get("authorization"), "Bearer shared-test-secret");
      assert.match(
        headers.get("x-royco-rwa-client-key") ?? "",
        /^[a-f0-9]{64}$/,
      );
      return new Response(
        JSON.stringify({
          schemaVersion: "1.1",
          modelVersion: "day-v3-eclp-goal-solver-1.2.0",
          mode: "simulation",
          status: "infeasible",
          recommendation: null,
          issues: [
            { code: "NO_FEASIBLE_DESIGN", message: "Reduce exit size." },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal((await response.json()).mode, "simulation");
    assert.equal(upstreamCalls, 1);

    // Six V3 tabs can mount with the same goals at once. They must share one
    // canonical request instead of tripping the per-client concurrency guard.
    resetDayV3ApiGuardForTests();
    resetDayV3SimulationProxyForTests();
    upstreamCalls = 0;
    let releaseUpstream: (() => void) | undefined;
    const heldUpstream = new Promise<void>((resolve) => {
      releaseUpstream = resolve;
    });
    globalThis.fetch = async () => {
      upstreamCalls += 1;
      await heldUpstream;
      return new Response(
        JSON.stringify({
          schemaVersion: "1.1",
          modelVersion: "day-v3-eclp-goal-solver-1.2.0",
          mode: "simulation",
          status: "infeasible",
          recommendation: null,
          issues: [
            { code: "NO_FEASIBLE_DESIGN", message: "Reduce exit size." },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const simultaneous = Array.from({ length: 6 }, () => POST(request()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseUpstream?.();
    const simultaneousResponses = await Promise.all(simultaneous);
    assert.deepEqual(
      simultaneousResponses.map((item) => item.status),
      [200, 200, 200, 200, 200, 200],
    );
    assert.equal(upstreamCalls, 1, "identical simulations should be coalesced");

    process.env.DAY_V3_POOL_DESIGN_SIMULATION_SERVICE_URL =
      "https://simulation.example.test/custom/v1";
    globalThis.fetch = async (input) => {
      assert.equal(String(input), "https://simulation.example.test/custom/v1");
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    resetDayV3ApiGuardForTests();
    resetDayV3SimulationProxyForTests();
    assert.equal((await POST(request())).status, 200);

    globalThis.fetch = async () =>
      new Response("x".repeat(512 * 1024 + 1), { status: 200 });
    resetDayV3ApiGuardForTests();
    resetDayV3SimulationProxyForTests();
    response = await POST(request());
    assert.equal(response.status, 503);
    body = await response.json();
    assert.equal(body.policy, null);
    assert.match(body.issues[0].message, /could not be reached/);

    resetDayV3ApiGuardForTests();
    response = await POST(request("{}", DAY_V3_API_MAX_BODY_BYTES + 1));
    assert.equal(response.status, 413);
    body = await response.json();
    assert.equal(body.recommendation, null);
    assert.equal(body.policy, null);
  } finally {
    globalThis.fetch = originalFetch;
    resetDayV3ApiGuardForTests();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete mutableEnv[key];
      else mutableEnv[key] = value;
    };
    restore("DAY_V3_POOL_DESIGN_SIMULATION_SERVICE_URL", previous.simulation);
    restore("DAY_V3_POOL_DESIGN_SERVICE_URL", previous.deployment);
    restore("DAWN_RWA_PROXY_SHARED_SECRET", previous.secret);
    restore("NODE_ENV", previous.nodeEnv);
  }

  console.log(
    "Day V3 simulation proxy is isolated, bounded, authenticated, and has no parameter fallback: PASS",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
