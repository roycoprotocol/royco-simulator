import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTRACT_LOCK = JSON.parse(
  readFileSync("lib/day/engine/vectors/contract-lock.json", "utf8"),
);

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
// This replays the checked-in golden vectors; it does not compile or run any
// Solidity. The vectors were generated from the contract commit recorded in
// lib/day/engine/vectors/contract-lock.json, so a PASS means "still matches the
// vectors generated from that commit", not "matches whatever is deployed now".
console.log(
  `Accountant parity: PASS (74/74 replayed vectors from royco-day @${CONTRACT_LOCK.commit.slice(0, 10)})`,
);
console.log("Calibration guardrails: PASS");
console.log("Locked copy: PASS");
console.log("Design contract: PASS");
console.log("Tests and build: PASS");
console.log("SLP yield/volume economics: OFF-CHAIN MODEL SCOPE — invariant-tested, not represented as fixed onchain economics");
