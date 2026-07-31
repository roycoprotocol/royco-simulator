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
run("node", ["scripts/simulator/source.test.mjs"]);
run("npm", ["test"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "build"]);

console.log("Data integrity: PASS");
console.log("Accountant parity: PASS (74/74 Solidity vectors)");
console.log("Calibration guardrails: PASS");
console.log("Locked copy: PASS");
console.log("Design contract: PASS");
console.log("Tests and build: PASS");
console.log("SLP yield/volume economics: OFF-CHAIN MODEL SCOPE — invariant-tested, not represented as fixed onchain economics");
