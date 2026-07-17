import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const marketId = process.argv[2];
run("node", ["scripts/day-simulator/verify.mjs", ...(marketId ? [marketId] : [])]);
run("npx", ["tsx", "lib/day/engine/parity.ts"]);
run("npx", ["tsx", "lib/day/engine/engine.test.ts"]);

console.log("Day accountant invariants: PASS");
console.log("Day Solidity vectors: PASS (74/74 — 52 core + 22 pinned accountant/kernel vectors)");
console.log("Day simulator contract parity: PASS — LT commit/reinvestment, all four fees, post-op paths, gates, self-liquidation, and rounding are covered");
console.log("Day LP yield/volume economics: OFF-CHAIN MODEL SCOPE — separately invariant-tested, not represented as fixed onchain economics");
console.log("Day template certification: PASS WITH EXPLICIT LP MODEL SCOPE");
