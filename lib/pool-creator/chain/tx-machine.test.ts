// Run: npx tsx lib/pool-creator/chain/tx-machine.test.ts

import {
  deployReducer,
  initialDeployState,
  stepStatus,
  type DeployPlan,
  type DeployState,
} from "@/lib/pool-creator/chain/tx-machine";
import { DAY_DEPLOYMENTS, deployAvailability } from "@/lib/pool-creator/chain/registry";
import { buildSeedSteps, SEED_PER_TRANCHE_USD } from "@/lib/pool-creator/chain/deploy";
import { readFileSync } from "node:fs";

let failures = 0;
let checks = 0;
const ok = (c: boolean, label: string, detail = "") => {
  checks += 1;
  if (!c) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const step = (id: DeployPlan["steps"][number]["id"], skipped = false) => ({
  id,
  phase: "deploy" as const,
  title: id,
  explanation: "",
  to: "0x0000000000000000000000000000000000000001" as const,
  data: "0x" as const,
  skipped,
});

const PLAN: DeployPlan = {
  chainId: 1,
  steps: [step("approve-junior"), step("deploy-market"), step("seed-junior")],
};

const run = (events: Parameters<typeof deployReducer>[1][], from: DeployState = initialDeployState) =>
  events.reduce(deployReducer, from);

// ---------------------------------------------------------------------------
console.log("\n1. The happy path");
// ---------------------------------------------------------------------------
{
  let state = run([
    { type: "connect" },
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: PLAN },
  ]);
  ok(state.tag === "simulating", "planning simulates before signing", state.tag);

  state = deployReducer(state, { type: "simulated" });
  ok(state.tag === "ready", "simulation success arms the first step", state.tag);

  for (let i = 0; i < PLAN.steps.length; i += 1) {
    state = deployReducer(state, { type: "sign" });
    ok(state.tag === "awaiting-signature", `step ${i}: awaiting signature`, state.tag);
    state = deployReducer(state, { type: "sent", hash: `0xhash${i}` });
    ok(state.tag === "pending", `step ${i}: pending`, state.tag);
    state = deployReducer(state, { type: "mined", status: "success" });
  }
  ok(state.tag === "complete", "all steps mined completes the deploy", state.tag);
  ok("hashes" in state && state.hashes.length === 3, "every hash is retained");

  state = deployReducer(state, { type: "market-address", address: "0xmarket" });
  ok(state.tag === "complete" && state.marketAddress === "0xmarket", "market address attaches");
}

// ---------------------------------------------------------------------------
console.log("2. A rejection is calm and resumable, not a failure");
// ---------------------------------------------------------------------------
{
  let state = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: PLAN },
    { type: "simulated" },
    { type: "sign" },
    { type: "user-rejected" },
  ]);
  ok(state.tag === "rejected", "rejection has its own state", state.tag);
  ok("cursor" in state && state.cursor === 0, "the cursor does not move");
  ok("plan" in state && state.plan === PLAN, "the plan is NOT rebuilt");

  // Signing again resumes exactly where it was.
  state = deployReducer(state, { type: "sign" });
  ok(state.tag === "awaiting-signature", "signing again resumes", state.tag);

  // Retry from rejected also works, and lands back on ready.
  const viaRetry = deployReducer(
    run([
      { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
      { type: "plan" },
      { type: "planned", plan: PLAN },
      { type: "simulated" },
      { type: "sign" },
      { type: "user-rejected" },
    ]),
    { type: "retry" },
  );
  ok(viaRetry.tag === "ready", "retry from rejected re-arms", viaRetry.tag);
}

// ---------------------------------------------------------------------------
console.log("3. A timeout never reports a possibly-mined transaction as lost");
// ---------------------------------------------------------------------------
{
  let state = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: PLAN },
    { type: "simulated" },
    { type: "sign" },
    { type: "sent", hash: "0xslow" },
    { type: "timeout" },
  ]);
  ok(state.tag === "timed-out", "timeout is its own state, not a failure", state.tag);
  ok("hash" in state && state.hash === "0xslow", "the hash is kept so it can be checked");

  state = deployReducer(state, { type: "retry" });
  ok(state.tag === "pending", "retry resumes polling the same hash", state.tag);
  ok("hash" in state && state.hash === "0xslow", "the same transaction, not a new one");

  // And it can still mine successfully afterwards.
  state = deployReducer(state, { type: "mined", status: "success" });
  ok(state.tag === "ready", "a late mine advances normally", state.tag);
}

// ---------------------------------------------------------------------------
console.log("4. Reverts");
// ---------------------------------------------------------------------------
{
  const simFailed = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: PLAN },
    { type: "simulation-failed", step: "deploy-market", reason: "AccessManagedUnauthorized" },
  ]);
  ok(simFailed.tag === "simulation-failed", "simulation failure has its own state");
  ok(
    "reason" in simFailed && simFailed.reason === "AccessManagedUnauthorized",
    "the revert reason is carried through for display",
  );
  ok("hashes" in simFailed === false, "nothing was signed, so there are no hashes");

  const onChainRevert = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: PLAN },
    { type: "simulated" },
    { type: "sign" },
    { type: "sent", hash: "0xrev" },
    { type: "mined", status: "reverted" },
  ]);
  ok(onChainRevert.tag === "step-failed", "a mined revert fails the step", onChainRevert.tag);
  ok("hashes" in onChainRevert && onChainRevert.hashes.includes("0xrev"),
    "the reverted hash is still recorded so it can be inspected");
  ok(deployReducer(onChainRevert, { type: "retry" }).tag === "ready", "a failed step can be retried");

  // A wallet that tries and fails is NOT a cancellation.
  const sendFailed = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: PLAN },
    { type: "simulated" },
    { type: "sign" },
    { type: "send-failed", reason: "insufficient funds for gas" },
  ]);
  ok(sendFailed.tag === "step-failed", "a send failure is a failure, not a rejection", sendFailed.tag);
  ok(
    "reason" in sendFailed && sendFailed.reason === "insufficient funds for gas",
    "and reports what the wallet said",
  );
  ok(deployReducer(sendFailed, { type: "retry" }).tag === "ready", "and is retryable");
}

// ---------------------------------------------------------------------------
console.log("5. Satisfied steps are skipped, not re-sent");
// ---------------------------------------------------------------------------
{
  const withSkips: DeployPlan = {
    chainId: 1,
    steps: [step("approve-junior", true), step("deploy-market"), step("seed-junior", true)],
  };
  let state = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: withSkips },
  ]);
  ok("cursor" in state && state.cursor === 1, "a satisfied first step is skipped", JSON.stringify(state));

  state = run([{ type: "simulated" }, { type: "sign" }, { type: "sent", hash: "0x1" }, { type: "mined", status: "success" }], state);
  ok(state.tag === "complete", "skipping the trailing step completes the deploy", state.tag);
  ok("hashes" in state && state.hashes.length === 1, "only the one real transaction was sent");

  // Everything already satisfied → nothing to do at all.
  const allSkipped = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: { chainId: 1, steps: [step("approve-junior", true)] } },
  ]);
  ok(allSkipped.tag === "complete", "a fully satisfied plan completes immediately", allSkipped.tag);
}

// ---------------------------------------------------------------------------
console.log("6. Network and availability guards");
// ---------------------------------------------------------------------------
{
  const wrong = deployReducer(initialDeployState, {
    type: "wrong-network",
    account: "0xabc",
    have: 42161,
    want: 1,
  });
  ok(wrong.tag === "wrong-network", "wrong network is caught before planning");
  ok(deployReducer(wrong, { type: "switch", want: 1 }).tag === "switching", "switching is a state");

  const unavailable = deployReducer(initialDeployState, {
    type: "unavailable",
    reason: "r",
    detail: "d",
  });
  ok(unavailable.tag === "unavailable", "unavailability short-circuits everything");

  // Out-of-order events are ignored rather than corrupting state.
  ok(deployReducer(initialDeployState, { type: "sign" }).tag === "idle", "sign from idle is ignored");
  ok(deployReducer(initialDeployState, { type: "mined", status: "success" }).tag === "idle",
    "mined from idle is ignored");
  ok(deployReducer(initialDeployState, { type: "simulated" }).tag === "idle",
    "simulated from idle is ignored");
  ok(deployReducer(wrong, { type: "reset" }).tag === "idle", "reset returns to idle");
}

// ---------------------------------------------------------------------------
console.log("7. Checklist status derivation");
// ---------------------------------------------------------------------------
{
  const state = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: PLAN },
    { type: "simulated" },
    { type: "sign" },
    { type: "sent", hash: "0x1" },
    { type: "mined", status: "success" },
  ]);
  ok(stepStatus(state, 0) === "done", "completed step reads done");
  ok(stepStatus(state, 1) === "active", "current step reads active");
  ok(stepStatus(state, 2) === "pending", "later step reads pending");

  const skipPlan: DeployPlan = { chainId: 1, steps: [step("approve-junior", true), step("deploy-market")] };
  const skipState = run([
    { type: "connected", account: "0xabc", chainId: 1, canDeploy: true },
    { type: "plan" },
    { type: "planned", plan: skipPlan },
  ]);
  ok(stepStatus(skipState, 0) === "skipped", "a satisfied step reads skipped");
}

// ---------------------------------------------------------------------------
console.log("7b. Post-deployment seeding: $10 into every tranche, in a safe order");
// ---------------------------------------------------------------------------
{
  const tranches = {
    senior: "0x1111111111111111111111111111111111111111" as const,
    junior: "0x2222222222222222222222222222222222222222" as const,
    liquidity: "0x3333333333333333333333333333333333333333" as const,
  };
  const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as const;
  const seeds = buildSeedSteps(tranches, usdc, 6, "0x7c405bbd131e42af506d14e752f2e59b19d49997");

  ok(SEED_PER_TRANCHE_USD === 10, "seeds $10 per tranche");
  ok(seeds.length === 6, "an approval and a deposit for each of the three tranches", String(seeds.length));
  ok(seeds.every((s) => s.phase === "seed"), "all belong to the seeding phase");

  // ORDER IS THE POINT. Verified against the accountant: a Senior deposit is
  // rejected until BOTH the cushion and the exit pool exist. Seeding Junior
  // first is not sufficient on its own.
  const depositOrder = seeds.filter((s) => s.id.startsWith("seed-")).map((s) => s.id);
  ok(
    depositOrder.join(" → ") === "seed-junior → seed-liquidity → seed-senior",
    "Junior → exit pool → Senior",
    depositOrder.join(" → "),
  );
  ok(
    depositOrder.indexOf("seed-senior") === depositOrder.length - 1,
    "Senior is always last",
  );

  // Each approval immediately precedes its own deposit, and targets the token.
  for (let i = 0; i < seeds.length; i += 2) {
    ok(seeds[i].id.startsWith("approve-"), `step ${i} is an approval`);
    ok(seeds[i].to === usdc, `approval ${i} targets the quote asset, not the tranche`);
    ok(seeds[i + 1].id.startsWith("seed-"), `step ${i + 1} is the matching deposit`);
  }
  ok(seeds[1].to === tranches.junior, "the Junior deposit goes to the Junior tranche");
  ok(seeds[3].to === tranches.liquidity, "the exit-pool deposit goes to the exit pool");
  ok(seeds[5].to === tranches.senior, "the Senior deposit goes to Senior");

  // $10 at 6 decimals is 10_000_000 — the amount must respect token decimals.
  ok(seeds[1].data.includes((10_000_000).toString(16)), "amount is scaled to the token's decimals");
  const eighteen = buildSeedSteps(tranches, usdc, 18, "0x7c405bbd131e42af506d14e752f2e59b19d49997");
  ok(
    eighteen[1].data !== seeds[1].data,
    "an 18-decimal token encodes a different amount than a 6-decimal one",
  );

  // A sufficient existing allowance skips only that approval.
  const partly = buildSeedSteps(tranches, usdc, 6, "0x7c405bbd131e42af506d14e752f2e59b19d49997", {
    senior: 0n,
    junior: 10_000_000n,
    liquidity: 0n,
  });
  ok(partly[0].skipped === true, "an already-approved tranche skips its approval");
  ok(partly[2].skipped === false, "the others still approve");
  ok(partly[1].skipped !== true, "the deposit itself is never skipped");
}

// ---------------------------------------------------------------------------
console.log("8. The registry ships no invented addresses");
// ---------------------------------------------------------------------------
{
  ok(Object.keys(DAY_DEPLOYMENTS).length === 0, "no deployments are configured yet");
  const availability = deployAvailability(1);
  ok(availability.available === false, "mainnet reports unavailable");
  ok(
    availability.available === false && availability.detail.includes("haven't been published"),
    "and says why, plainly",
  );

  // Tripwire: the only 40-hex literals in the registry must be the four
  // documented public infrastructure addresses. A placeholder would be worse
  // than no address at all — it would send a real transaction to nowhere.
  const source = readFileSync("lib/pool-creator/chain/registry.ts", "utf8");
  const literals = source.match(/0x[0-9a-fA-F]{40}/g) ?? [];
  ok(literals.length === 4, `exactly 4 documented infrastructure addresses`, `found ${literals.length}`);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
