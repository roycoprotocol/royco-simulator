import assert from "node:assert/strict";

import { POST } from "./route";
import {
  acquireDayV3ApiRequest,
  DAY_V3_API_MAX_BODY_BYTES,
  DAY_V3_API_MAX_CONCURRENT_GLOBAL,
  DAY_V3_API_MAX_REQUESTS_PER_IP,
  resetDayV3ApiGuardForTests,
} from "@/lib/day-v3/request-guard";

const valid = {
  schemaVersion: "1.1",
  source: { marketId: "custom", name: "Custom source", sourceApyPct: 12 },
  features: { seniorProtection: "enabled", immediateExit: "enabled" },
  goals: {
    protectedDrawdownPct: 5,
    recoveryDays: 30,
    immediateExitSharePct: 10,
    minimumProceedsPer100: 95,
    entryPointSettlementDays: 7,
    collateralToExitDays: 2,
    collateralToExitCostBps: 50,
    fixedTermGraceDays: 14,
    navUpdateDays: 1,
    target: { chainId: 1, templateId: "balancer-v3-eclp" },
  },
  canonicalPool: { poolFundingPer100Senior: 11.12 },
  handoffTerms: {
    minimumCoveragePct: 5,
    minimumLiquidityPct: 10.01,
    protectedExitThresholdPct: 1,
    protectedExitBonusPct: 0,
  },
  proposedTerms: {
    minimumCoveragePct: 5,
    minimumLiquidityPct: 10.01,
    protectedExitThresholdPct: 1,
    protectedExitBonusPct: 0,
  },
};

let ipSequence = 1;
function requestFor(
  value: unknown,
  options: { declared?: number; ip?: string; raw?: string } = {},
) {
  const requestBody = options.raw ?? JSON.stringify(value);
  return new Request("http://localhost/api/day-v3/accountant-validation/v1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(
        options.declared ?? Buffer.byteLength(requestBody),
      ),
      "x-forwarded-for": options.ip ?? `203.0.113.${ipSequence++}`,
    },
    body: requestBody,
  });
}

const parse = (response: Response) =>
  response.json() as Promise<Record<string, unknown>>;
const reset = () => {
  resetDayV3ApiGuardForTests();
};

async function main() {
  reset();
  for (const recoveryDays of [0, 194]) {
    const response = await POST(
      requestFor({ ...valid, goals: { ...valid.goals, recoveryDays } }),
    );
    const result = await parse(response);
    assert.equal(response.status, 200);
    assert.equal(result.status, "validated");
    assert.deepEqual(
      (
        result.scenarios as { items: { redeemedSeniorPct: number }[] }
      ).items.map((item) => item.redeemedSeniorPct),
      [25, 50, 100],
    );
    assert.equal(
      (result.provenance as { historyValidation: { status: string } })
        .historyValidation.status,
      "not-validated",
    );
  }

  const protectionDisabled = {
    ...valid,
    features: { ...valid.features, seniorProtection: "disabled" },
    goals: {
      ...valid.goals,
      protectedDrawdownPct: 0,
      recoveryDays: 0,
      fixedTermGraceDays: 0,
    },
    handoffTerms: {
      ...valid.handoffTerms,
      minimumCoveragePct: 0,
      protectedExitThresholdPct: 0,
      protectedExitBonusPct: 0,
    },
    proposedTerms: {
      ...valid.proposedTerms,
      minimumCoveragePct: 0,
      protectedExitThresholdPct: 0,
      protectedExitBonusPct: 0,
    },
  };
  const protectionDisabledResponse = await POST(
    requestFor(protectionDisabled),
  );
  const protectionDisabledBody = await parse(protectionDisabledResponse);
  assert.equal(protectionDisabledResponse.status, 200);
  assert.equal(protectionDisabledBody.status, "validated");
  assert.equal(
    (protectionDisabledBody.scenarios as { status: string }).status,
    "disabled",
  );

  const exitDisabled = {
    ...valid,
    features: { ...valid.features, immediateExit: "disabled" },
    goals: {
      ...valid.goals,
      immediateExitSharePct: 0,
      minimumProceedsPer100: 0,
      collateralToExitDays: null,
      collateralToExitCostBps: null,
    },
    canonicalPool: { poolFundingPer100Senior: 0 },
    handoffTerms: { ...valid.handoffTerms, minimumLiquidityPct: 0 },
    proposedTerms: { ...valid.proposedTerms, minimumLiquidityPct: 0 },
  };
  const exitDisabledResponse = await POST(requestFor(exitDisabled));
  const exitDisabledBody = await parse(exitDisabledResponse);
  assert.equal(exitDisabledResponse.status, 200);
  assert.equal(exitDisabledBody.status, "validated");
  assert.equal(
    (exitDisabledBody.canonical as { minimumLiquidityPct: number })
      .minimumLiquidityPct,
    0,
  );
  for (const inconsistent of [
    {
      ...protectionDisabled,
      handoffTerms: valid.handoffTerms,
      proposedTerms: valid.proposedTerms,
    },
    { ...exitDisabled, canonicalPool: { poolFundingPer100Senior: 1 } },
    {
      ...valid,
      goals: { ...valid.goals, immediateExitSharePct: 0 },
    },
  ]) {
    const response = await POST(requestFor(inconsistent));
    assert.equal(response.status, 400);
    assert.equal((await parse(response)).status, "rejected");
  }

  for (const key of [
    "minimumCoveragePct",
    "minimumLiquidityPct",
    "protectedExitThresholdPct",
    "protectedExitBonusPct",
  ] as const) {
    const response = await POST(
      requestFor({
        ...valid,
        proposedTerms: {
          ...valid.proposedTerms,
          [key]: valid.proposedTerms[key] + 0.01,
        },
      }),
    );
    const result = await parse(response);
    assert.equal(response.status, 400, key);
    assert.equal(result.status, "rejected", key);
    assert.match(JSON.stringify(result.issues), /TERM_CHANGED|TERM_MISMATCH/);
  }

  const listedSource = {
    ...valid,
    source: {
      marketId: "jbbb",
      name: "JBBB · Janus Henderson B-BBB CLO ETF",
      sourceApyPct: 5.824989705346417,
    },
  };
  for (const source of [
    { ...listedSource.source, name: "Impostor" },
    {
      ...listedSource.source,
      sourceApyPct: listedSource.source.sourceApyPct + 0.01,
    },
  ]) {
    const response = await POST(requestFor({ ...listedSource, source }));
    assert.equal(response.status, 400);
    assert.match(
      JSON.stringify(await parse(response)),
      /SOURCE_IDENTITY_MISMATCH/,
    );
  }

  const extra = await POST(requestFor({ ...valid, surprise: true }));
  assert.equal(extra.status, 400);
  assert.equal((await parse(extra)).normalizedRequest, null);
  assert.equal((await POST(requestFor(null, { raw: "{" }))).status, 400);
  assert.equal(
    (await POST(requestFor({}, { declared: DAY_V3_API_MAX_BODY_BYTES + 1 })))
      .status,
    413,
  );
  const oversized = JSON.stringify({
    padding: "x".repeat(DAY_V3_API_MAX_BODY_BYTES),
  });
  assert.equal(
    (await POST(requestFor(null, { raw: oversized, declared: 2 }))).status,
    413,
  );

  reset();
  const rateIp = "198.51.100.10";
  for (let index = 0; index < DAY_V3_API_MAX_REQUESTS_PER_IP; index += 1) {
    assert.equal((await POST(requestFor(valid, { ip: rateIp }))).status, 200);
  }
  const limited = await POST(requestFor(valid, { ip: rateIp }));
  assert.equal(limited.status, 429);
  assert.match(JSON.stringify(await parse(limited)), /RATE_LIMITED/);

  reset();
  const releases = Array.from(
    { length: DAY_V3_API_MAX_CONCURRENT_GLOBAL },
    (_, index) => acquireDayV3ApiRequest(`192.0.2.${index + 1}`),
  );
  try {
    const busy = await POST(requestFor(valid, { ip: "192.0.2.250" }));
    assert.equal(busy.status, 503);
    assert.match(JSON.stringify(await parse(busy)), /SERVICE_BUSY/);
  } finally {
    releases.forEach((release) => release());
  }

  reset();
  const first = await POST(requestFor(valid));
  const firstBody = await parse(first);
  const second = await POST(requestFor(valid));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await parse(second), firstBody);

  console.log(
    "Day V3 accountant validation route: PASS (success, disabled mechanisms, tamper, 0/194 days, strict schema, body caps, rate/concurrency, cache)",
  );
}

void main();
