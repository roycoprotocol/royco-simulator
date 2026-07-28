// Run: npx tsx lib/pool-creator/permalink.test.ts

import {
  draftToQuery,
  draftToSearch,
  queryToDraft,
  queryFromSearchParams,
  timeAgo,
  PERMALINK_VERSION,
} from "@/lib/pool-creator/permalink";
import { createEmptyDraft, suggestIdentity, type PoolDraft } from "@/lib/pool-creator/draft";
import { buildSyntheticSeries } from "@/lib/pool-creator/synthetic";

let failures = 0;
let checks = 0;
const ok = (c: boolean, label: string, detail = "") => {
  checks += 1;
  if (!c) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const near = (a: number, e: number, tol: number, label: string) =>
  ok(Math.abs(a - e) <= tol, label, `got ${a}, want ${e}`);

const roundTrip = (draft: PoolDraft) => queryToDraft(draftToQuery(draft));

// ---------------------------------------------------------------------------
console.log("\n1. Goals survive a round trip");
// ---------------------------------------------------------------------------
{
  const draft: PoolDraft = {
    ...createEmptyDraft(),
    step: 4,
    presetId: "high-yield",
    identity: suggestIdentity("sUSDai"),
    identityTouched: true,
    goals: {
      protectedDrawdown: 0.087,
      exitShareOfSenior: 0.024,
      seniorApy: 0.0713,
      liquidityApy: 0.1355,
      recoveryDays: 30,
      exitBufferPct: 99.91,
      initialSeniorSize: 2_500_000,
    },
  };

  const decoded = roundTrip(draft);
  ok(decoded !== null, "a permalink decodes");
  if (decoded) {
    const g = decoded.draft.goals;
    near(g.protectedDrawdown, 0.087, 1e-6, "protectedDrawdown");
    near(g.exitShareOfSenior, 0.024, 1e-6, "exitShareOfSenior");
    near(g.seniorApy, 0.0713, 1e-6, "seniorApy");
    near(g.liquidityApy, 0.1355, 1e-6, "liquidityApy");
    ok(g.recoveryDays === 30, "recoveryDays");
    near(g.exitBufferPct, 99.91, 1e-6, "exitBufferPct");
    ok(g.initialSeniorSize === 2_500_000, "initialSeniorSize");
    ok(decoded.draft.step === 4, "step");
    ok(decoded.draft.presetId === "high-yield", "presetId");
    ok(decoded.draft.identity.marketName === "sUSDai", "market name");
    ok(decoded.draft.identity.seniorSymbol === "srRoysUSDai", "tranche symbols re-derive");
  }
}

// ---------------------------------------------------------------------------
console.log("2. A perpetual pool round-trips (recoveryDays 0 is not falsy-dropped)");
// ---------------------------------------------------------------------------
{
  const draft = { ...createEmptyDraft(), goals: { ...createEmptyDraft().goals, recoveryDays: 0 } };
  const decoded = roundTrip(draft);
  ok(decoded?.draft.goals.recoveryDays === 0, "recoveryDays 0 survives", String(decoded?.draft.goals.recoveryDays));
}

// ---------------------------------------------------------------------------
console.log("3. A described strategy carries its shape");
// ---------------------------------------------------------------------------
{
  const draft: PoolDraft = {
    ...createEmptyDraft(),
    source: { kind: "described", label: "Cap Finance", expectedApy: 0.121, risk: "credit", anchorDate: "2026-07-01" },
  };
  const decoded = roundTrip(draft);
  ok(decoded?.draft.source?.kind === "described", "still described");
  if (decoded?.draft.source?.kind === "described") {
    near(decoded.draft.source.expectedApy, 0.121, 1e-6, "expected APY");
    ok(decoded.draft.source.risk === "credit", "risk profile");
    ok(decoded.draft.source.label === "Cap Finance", "label");
  }
  ok(decoded?.needsReimport === false, "a modelled strategy needs no re-import");
}

// ---------------------------------------------------------------------------
console.log("4. An imported history is flagged rather than silently lost");
// ---------------------------------------------------------------------------
{
  const series = buildSyntheticSeries({ expectedApy: 0.08, risk: "mild", anchorDate: "2026-07-01" });
  const draft: PoolDraft = {
    ...createEmptyDraft(),
    source: {
      kind: "series",
      series,
      origin: {
        kind: "onchain",
        label: "sUSDai",
        provider: "USD.AI",
        sourceUrl: "https://arbiscan.io/address/0x0b2b",
        priceType: "nav",
        cadence: "weekly",
        feesIncluded: true,
      },
    },
  };

  const search = draftToSearch(draft);
  ok(!search.includes("price"), "the series is NOT put in the URL");
  ok(search.length < 400, "the link stays short", `${search.length} chars`);

  const decoded = roundTrip(draft);
  ok(decoded?.needsReimport === true, "the recipient is told the history is missing");
  ok(decoded?.reimportHint?.label === "sUSDai", "and what to re-import");
  ok(decoded?.reimportHint?.sourceUrl.includes("arbiscan") === true, "and where from");
  // It must still open with usable numbers rather than an empty state.
  ok(decoded?.draft.source !== null, "the page still has a strategy to model");
}

// ---------------------------------------------------------------------------
console.log("5. Hostile and malformed input degrades safely");
// ---------------------------------------------------------------------------
{
  ok(queryToDraft({}) === null, "no version means no permalink");
  ok(queryToDraft({ v: "999" }) === null, "an unknown version is discarded, not guessed at");

  const junk = queryToDraft({
    v: String(PERMALINK_VERSION),
    pd: "not-a-number",
    ex: "-5",
    sr: "1e9",
    rd: "99999",
    eb: "0",
    st: "-1",
    step: "42",
    risk: "nonsense",
  });
  ok(junk !== null, "junk still yields a usable draft");
  if (junk) {
    const g = junk.draft.goals;
    ok(Number.isFinite(g.protectedDrawdown), "unparseable falls back to the default");
    ok(g.exitShareOfSenior >= 0.001, "negatives are clamped");
    ok(g.seniorApy <= 2, "absurd highs are clamped");
    ok(g.recoveryDays <= 194, "recoveryDays clamped to the template range");
    ok(g.exitBufferPct >= 1, "exitBufferPct clamped to its floor");
    ok(g.initialSeniorSize >= 0, "size cannot be negative");
    ok(junk.draft.step >= 1 && junk.draft.step <= 6, "step clamped into range", String(junk.draft.step));
    ok(junk.draft.source?.kind === "described", "an unknown risk profile falls back");
  }
}

// ---------------------------------------------------------------------------
console.log("6. searchParams shape and helpers");
// ---------------------------------------------------------------------------
{
  const q = queryFromSearchParams({ v: "1", pd: ["0.05", "0.09"], missing: undefined });
  ok(q.v === "1", "scalar param");
  ok(q.pd === "0.05", "a repeated param takes the first value");
  ok(q.missing === undefined, "absent stays absent");

  ok(timeAgo(new Date().toISOString()) === "just now", "just now");
  ok(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString()) === "5 minutes ago", "minutes");
  ok(timeAgo(new Date(Date.now() - 3 * 3_600_000).toISOString()) === "3 hours ago", "hours");
  ok(timeAgo(new Date(Date.now() - 2 * 86_400_000).toISOString()) === "2 days ago", "days");
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
