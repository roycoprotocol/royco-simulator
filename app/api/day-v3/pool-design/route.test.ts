import assert from "node:assert/strict";

import { GET, POST } from "./route";
import {
  DAY_V3_API_MAX_BODY_BYTES,
  dayV3ClientIp,
  resetDayV3ApiGuardForTests,
} from "@/lib/day-v3/request-guard";
import { resetDayV3InventoryProxyCacheForTests } from "@/lib/day-v3/pool-proxy-cache";
import {
  DAY_V3_POOL_DESIGN_MODEL,
  DAY_V3_POOL_DESIGN_SCHEMA,
  isDayV3PoolDesignInventory,
} from "@/lib/day-v3/pool-design";

async function main() {
  const mutableEnv = process.env as unknown as Record<
    string,
    string | undefined
  >;
  const previous = process.env.DAY_V3_POOL_DESIGN_SERVICE_URL;
  const previousSecret = process.env.DAWN_RWA_PROXY_SHARED_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  const originalFetch = globalThis.fetch;
  process.env.DAY_V3_POOL_DESIGN_SERVICE_URL = "not-a-valid-url";
  try {
    const response = await GET(
      new Request("http://localhost/api/day-v3/pool-design"),
    );
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, "unresolved");
    assert.equal(body.recommendation, null);
    assert.equal("policy" in body, false);
    assert.equal(JSON.stringify(body).includes("swapFee"), false);
    assert.match(
      body.issues[0].message,
      /No fee or pool parameters were assumed/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.DAY_V3_POOL_DESIGN_SERVICE_URL;
    } else {
      process.env.DAY_V3_POOL_DESIGN_SERVICE_URL = previous;
    }
  }

  mutableEnv.NODE_ENV = "production";
  process.env.DAY_V3_POOL_DESIGN_SERVICE_URL =
    "http://rwa.example.test/api/deploy-market/pool-design/v1";
  try {
    const response = await GET(
      new Request("http://localhost/api/day-v3/pool-design"),
    );
    assert.equal(response.status, 503);
    assert.match(
      JSON.stringify(await response.json()),
      /not configured|No fee or pool parameters were assumed/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previous === undefined) {
      delete process.env.DAY_V3_POOL_DESIGN_SERVICE_URL;
    } else {
      process.env.DAY_V3_POOL_DESIGN_SERVICE_URL = previous;
    }
  }

  resetDayV3ApiGuardForTests();
  resetDayV3InventoryProxyCacheForTests();
  process.env.DAY_V3_POOL_DESIGN_SERVICE_URL =
    "https://rwa.example.test/api/deploy-market/pool-design/v1";
  process.env.DAWN_RWA_PROXY_SHARED_SECRET = "shared-test-secret";
  let upstreamCalls = 0;
  const liveInventory = {
    schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
    modelVersion: DAY_V3_POOL_DESIGN_MODEL,
    status: "resolved",
    targets: [
      {
        chainId: 1,
        chainName: "Ethereum",
        templateId: "balancer-v3-eclp",
        templateName: "Balancer V3 ECLP",
        templateAddress: "0x1111111111111111111111111111111111111111",
        yieldModels: {
          source: "template-registry",
          jt: {
            STATIC_CURVE: "0x2222222222222222222222222222222222222222",
            ADAPTIVE_CURVE_V1: null,
            ADAPTIVE_CURVE_V2: null,
            FIXED: "0x3333333333333333333333333333333333333333",
          },
          lpt: {
            STATIC_CURVE: "0x4444444444444444444444444444444444444444",
            ADAPTIVE_CURVE_V1: null,
            ADAPTIVE_CURVE_V2: null,
            FIXED: "0x5555555555555555555555555555555555555555",
          },
          blockNumber: "123",
          resolvedAt: "2026-08-13T00:00:00.000Z",
        },
      },
    ],
    issues: [],
  };
  globalThis.fetch = async (_input, init) => {
    upstreamCalls += 1;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer shared-test-secret");
    assert.match(headers.get("x-royco-rwa-client-key") ?? "", /^[a-f0-9]{64}$/);
    return new Response(JSON.stringify(liveInventory), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const proxiedRequest = () =>
      new Request("http://localhost/api/day-v3/pool-design", {
        headers: { "x-forwarded-for": "203.0.113.44" },
      });
    const [first, duplicate] = await Promise.all([
      GET(proxiedRequest()),
      GET(proxiedRequest()),
    ]);
    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    const proxiedInventory = await first.json();
    assert.equal(isDayV3PoolDesignInventory(proxiedInventory), true);
    assert.equal(
      proxiedInventory.targets[0].yieldModels.jt.STATIC_CURVE,
      "0x2222222222222222222222222222222222222222",
    );
    assert.equal((await GET(proxiedRequest())).status, 200);
    assert.equal(upstreamCalls, 1, "inventory requests should be deduplicated");

    resetDayV3InventoryProxyCacheForTests();
    globalThis.fetch = async () =>
      new Response("x".repeat(512 * 1024 + 1), { status: 200 });
    const oversizedUpstream = await GET(proxiedRequest());
    assert.equal(oversizedUpstream.status, 503);
    assert.match(
      JSON.stringify(await oversizedUpstream.json()),
      /could not be reached|No fee or pool parameters were assumed/,
    );

    const key = "a".repeat(64);
    assert.equal(
      dayV3ClientIp(
        new Request("http://localhost", {
          headers: {
            authorization: "Bearer shared-test-secret",
            "x-royco-rwa-client-key": key,
            "x-forwarded-for": "198.51.100.8",
          },
        }),
      ),
      `rwa:${key}`,
    );
    assert.equal(
      dayV3ClientIp(
        new Request("http://localhost", {
          headers: {
            authorization: "Bearer wrong-secret",
            "x-royco-rwa-client-key": key,
            "x-forwarded-for": "198.51.100.8",
          },
        }),
      ),
      "198.51.100.8",
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetDayV3ApiGuardForTests();
    resetDayV3InventoryProxyCacheForTests();
    if (previousSecret === undefined) {
      delete process.env.DAWN_RWA_PROXY_SHARED_SECRET;
    } else {
      process.env.DAWN_RWA_PROXY_SHARED_SECRET = previousSecret;
    }
    if (previous === undefined) {
      delete process.env.DAY_V3_POOL_DESIGN_SERVICE_URL;
    } else {
      process.env.DAY_V3_POOL_DESIGN_SERVICE_URL = previous;
    }
  }

  // The Dawn proxy must enforce its own byte cap before reading or forwarding;
  // the companion service's guard cannot protect memory already consumed here.
  process.env.DAY_V3_POOL_DESIGN_SERVICE_URL =
    "http://127.0.0.1:9/api/deploy-market/pool-design/v1";
  try {
    const declared = await POST(
      new Request("http://localhost/api/day-v3/pool-design", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(DAY_V3_API_MAX_BODY_BYTES + 1),
        },
        body: "{}",
      }),
    );
    assert.equal(declared.status, 413);

    const oversizedBody = JSON.stringify({
      padding: "x".repeat(DAY_V3_API_MAX_BODY_BYTES),
    });
    const actual = await POST(
      new Request("http://localhost/api/day-v3/pool-design", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2",
        },
        body: oversizedBody,
      }),
    );
    assert.equal(actual.status, 413);
  } finally {
    if (previous === undefined) {
      delete process.env.DAY_V3_POOL_DESIGN_SERVICE_URL;
    } else {
      process.env.DAY_V3_POOL_DESIGN_SERVICE_URL = previous;
    }
  }

  console.log(
    "Day V3 pool-design proxy has no fallback, enforces body caps, authenticates callers, and deduplicates inventory: PASS",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
