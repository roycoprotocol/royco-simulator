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
run("npx", ["tsx", "lib/day/engine/engine.test.ts"]);

console.log("Day accountant invariants: PASS");
console.log("Day contract parity: NOT CERTIFIED — authoritative contract vectors are not present in this repository");
console.log("Day template certification: PASS WITH DISCLOSED PARITY GAP");
